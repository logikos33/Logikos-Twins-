"""LingBot-Map residente — singleton de processo, sem viser.

Espelha o caminho de inferência do `demo.py` do pin (load_model → cast do
aggregator → inference_streaming/windowed → pose_enc → extrinsic/intrinsic),
usando SOMENTE a API pública do pacote `lingbot_map` — nada do extra
[vis]/[demo] é importado aqui, e o teste `test_no_vis_in_prod.py` garante isso.

Saída: o MESMO diretório de `frame_NNNNNN.npz` que o `batch_demo.py` gravava,
com uma correção deliberada: `images` sai uint8 0–255 (o batch_demo grava float
[0,1], e `npz_to_artifacts.load_frame` faz `.astype(np.uint8)` — cores pretas).

world_points vem por DESPROJEÇÃO de depth+pose (numpy, CPU) — o mesmo default
do viewer oficial do motor — em vez do point head (`enable_point=False`):
geometria consistente com a pose e menos VRAM. Reversível por config.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger("worker.engine")

# O RoPE de vídeo foi treinado com 320 views: a KV cache não deve armazenar mais
# que isso (README do motor, §Note on inference range).
MAX_CACHED_VIEWS = 320
# Acima disso a pose colapsa sem reset de estado → windowed (README, >3000 frames).
WINDOWED_THRESHOLD_FRAMES = 3000


@dataclass(frozen=True)
class EngineConfig:
    """Config de produção. Cada default tem uma razão — não mexa sem medir.

    - fps 10: 120 s de vídeo = 1.200 frames (teto do produto).
    - keyframe_interval 4: 1.200/4 = 300 keyframes ≤ 320 (limite do RoPE);
      non-keyframes ainda predizem, só não crescem a KV cache.
    - offload_to_cpu True: predições por frame saem da GPU durante a inferência.
    - camera_num_iterations 4: default do motor; 1 pula os 3 passes de refino.
    - num_scale_frames 8: frames de escala (fase 1, pinados na KV cache);
      2 só como fallback de OOM.
    - use_sdpa False: FlashInfer é o backend padrão do motor (paged KV cache);
      SDPA é o fallback sem dependência extra (e sem nvcc/JIT).
    - modo streaming; windowed automático acima de 3.000 frames (colapso de pose).
    - window_size/overlap: valores do ADR-0007 (window_size conta KEYFRAMES).
    """

    fps: int = 10
    keyframe_interval: int = 4
    offload_to_cpu: bool = True
    camera_num_iterations: int = 4
    num_scale_frames: int = 8
    use_sdpa: bool = False
    mode: str = "streaming"  # "streaming" | "windowed" (auto-sobe p/ windowed >3000)
    window_size: int = 128
    overlap_size: int = 16
    overlap_keyframes: int = 8
    image_size: int = 518
    patch_size: int = 14
    max_frame_num: int = 1024
    kv_cache_sliding_window: int = 64
    enable_point: bool = False  # True = point head do motor em vez de desprojeção
    model_path: str = field(default_factory=lambda: os.environ.get("MODEL_PATH", ""))

    @classmethod
    def from_env(cls) -> EngineConfig:
        """Overrides de deploy via env ENGINE_* — knobs da F0, não do payload."""

        def _int(name: str, default: int) -> int:
            return int(os.environ.get(name, default))

        def _bool(name: str, default: bool) -> bool:
            raw = os.environ.get(name)
            return default if raw is None else raw.strip().lower() in ("1", "true", "yes")

        return cls(
            fps=_int("ENGINE_FPS", cls.fps),
            keyframe_interval=_int("ENGINE_KEYFRAME_INTERVAL", cls.keyframe_interval),
            offload_to_cpu=_bool("ENGINE_OFFLOAD_TO_CPU", cls.offload_to_cpu),
            camera_num_iterations=_int("ENGINE_CAMERA_ITERS", cls.camera_num_iterations),
            num_scale_frames=_int("ENGINE_NUM_SCALE_FRAMES", cls.num_scale_frames),
            use_sdpa=_bool("ENGINE_USE_SDPA", cls.use_sdpa),
            mode=os.environ.get("ENGINE_MODE", cls.mode),
        )


@dataclass
class EngineRun:
    """Resultado de uma inferência — os números que viram proveniência do job."""

    npz_dir: Path
    n_frames: int
    n_keyframes: int  # frames que a KV cache armazenou (escala + keyframes)
    mode: str
    keyframe_interval: int
    peak_vram_mb: float
    stage_timings: dict[str, float]
    weights_sha256: str
    flags: dict[str, Any]


# ---------------------------------------------------------------------------
# Núcleo puro (testável sem torch)
# ---------------------------------------------------------------------------


def effective_keyframe_interval(n_frames: int, cfg: EngineConfig) -> int:
    """Nunca deixar a KV cache passar de ~320 views (regra do próprio demo.py)."""
    if n_frames <= MAX_CACHED_VIEWS:
        return cfg.keyframe_interval
    return max(cfg.keyframe_interval, math.ceil(n_frames / MAX_CACHED_VIEWS))


def select_mode(n_frames: int, cfg: EngineConfig) -> str:
    """Windowed automático só quando o streaming comprovadamente colapsa."""
    if cfg.mode == "windowed" or n_frames > WINDOWED_THRESHOLD_FRAMES:
        return "windowed"
    return "streaming"


def count_stored_frames(n_frames: int, keyframe_interval: int, num_scale_frames: int) -> int:
    """Quantos frames entram na KV cache (semântica do gct_stream:450)."""
    if n_frames <= num_scale_frames:
        return n_frames
    streamed = n_frames - num_scale_frames
    if keyframe_interval <= 1:
        return n_frames
    # is_keyframe quando (i - scale_frames) % interval == 0, p/ i em [scale, n)
    return num_scale_frames + math.ceil(streamed / keyframe_interval)


def model_kwargs(cfg: EngineConfig) -> dict[str, Any]:
    """kwargs do construtor GCTStream — espelho do load_model do demo.py:139-150."""
    return {
        "img_size": cfg.image_size,
        "patch_size": cfg.patch_size,
        "enable_3d_rope": True,
        "max_frame_num": cfg.max_frame_num,
        "kv_cache_sliding_window": cfg.kv_cache_sliding_window,
        "kv_cache_scale_frames": cfg.num_scale_frames,
        "kv_cache_cross_frame_special": True,
        "kv_cache_include_scale_frames": True,
        "use_sdpa": cfg.use_sdpa,
        "camera_num_iterations": cfg.camera_num_iterations,
        "enable_point": cfg.enable_point,
    }


def to_uint8_image(image: np.ndarray) -> np.ndarray:
    """(3,H,W) float [0,1] ou uint8 → uint8 0–255 (o que o pipeline consome)."""
    if image.dtype == np.uint8:
        return image
    return np.clip(np.round(image * 255.0), 0, 255).astype(np.uint8)


def write_frame_npz(
    npz_dir: Path,
    idx: int,
    world_points: np.ndarray,
    world_points_conf: np.ndarray,
    depth: np.ndarray,
    depth_conf: np.ndarray,
    image: np.ndarray,
    extrinsic_c2w: np.ndarray,
    intrinsic: np.ndarray,
) -> Path:
    """Um frame no schema que npz_to_artifacts/detect/aruco_scale consomem."""
    path = npz_dir / f"frame_{idx:06d}.npz"
    np.savez(
        path,
        world_points=world_points.astype(np.float32),
        world_points_conf=world_points_conf.astype(np.float32),
        depth=depth.astype(np.float32),
        depth_conf=depth_conf.astype(np.float32),
        images=to_uint8_image(image),
        extrinsic=extrinsic_c2w.astype(np.float32),
        intrinsic=intrinsic.astype(np.float32),
    )
    return path


def flags_for_provenance(cfg: EngineConfig, kf_interval: int, mode: str) -> dict[str, Any]:
    flags = asdict(cfg)
    flags.pop("model_path", None)  # caminho de arquivo não é flag de inferência
    flags["effective_keyframe_interval"] = kf_interval
    flags["effective_mode"] = mode
    return flags


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Singleton residente (só toca torch/lingbot_map em runtime real)
# ---------------------------------------------------------------------------

_ENGINE: LingbotEngine | None = None


def get_engine(cfg: EngineConfig) -> LingbotEngine:
    """Devolve o motor quente; reconstrói só se a config estrutural mudou."""
    global _ENGINE
    key = (select_mode_key(cfg), tuple(sorted(model_kwargs(cfg).items())), cfg.model_path)
    if _ENGINE is None or _ENGINE.key != key:
        if _ENGINE is not None:
            log.warning("config estrutural mudou — recarregando o motor")
        _ENGINE = LingbotEngine(cfg, key)
    return _ENGINE


def select_mode_key(cfg: EngineConfig) -> str:
    """Streaming e windowed são CLASSES diferentes — o singleton é por classe."""
    return "windowed" if cfg.mode == "windowed" else "streaming"


class LingbotEngine:
    """Modelo + pesos carregados uma vez; `run()` por job."""

    def __init__(self, cfg: EngineConfig, key: Any) -> None:
        import torch

        self.key = key
        self._torch = torch
        t0 = time.monotonic()

        if not cfg.model_path:
            raise RuntimeError("MODEL_PATH ausente — o motor precisa do checkpoint")
        model_file = Path(cfg.model_path)
        if not model_file.exists():
            raise FileNotFoundError(f"checkpoint ausente: {model_file}")

        # Falha RÁPIDA e legível quando o host não expõe a GPU (driver < CUDA
        # 12.8): sem isto o sintoma é o críptico "FlashInfer requires GPUs with
        # sm75 or higher" — visto 2× num host ruim em 2026-09-01. A causa se
        # corrige no ENDPOINT (allowedCudaVersions), não no código.
        if os.environ.get("WORKER_MODE", "real") == "real" and not torch.cuda.is_available():
            raise RuntimeError(
                "GPU indisponível no worker (torch.cuda.is_available()=False) — "
                "provável driver do host < CUDA 12.8; conferir allowedCudaVersions "
                "do endpoint e reciclar o worker (workersMax 0→1)"
            )

        # sha256 uma vez por processo: identifica os pesos na proveniência e
        # denuncia volume corrompido antes de gastar GPU.
        self.weights_sha256 = sha256_of(model_file)

        kwargs = model_kwargs(cfg)
        if not kwargs["use_sdpa"] and not _flashinfer_available():
            # Sem flashinfer instalado o bloco FlashInfer morreria no forward;
            # degradar para SDPA mantém o worker vivo (e fica registrado).
            log.warning("flashinfer indisponível — caindo para SDPA")
            kwargs["use_sdpa"] = True
        self._use_sdpa = bool(kwargs["use_sdpa"])

        if select_mode_key(cfg) == "windowed":
            from lingbot_map.models.gct_stream_window import GCTStream
        else:
            from lingbot_map.models.gct_stream import GCTStream

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = GCTStream(**kwargs)
        ckpt = torch.load(cfg.model_path, map_location=self.device, weights_only=False)
        state_dict = ckpt.get("model", ckpt)
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if missing or unexpected:
            log.info(
                "checkpoint: %d chaves faltando, %d inesperadas", len(missing), len(unexpected)
            )
        self.model = model.to(self.device).eval()

        # bf16 em Ampere+ (capability >= 8), fp16 abaixo, fp32 em CPU — demo.py:448-451.
        if torch.cuda.is_available():
            cap = torch.cuda.get_device_capability()[0]
            self.dtype = torch.bfloat16 if cap >= 8 else torch.float16
        else:
            self.dtype = torch.float32
        # Aggregator no dtype de inferência (~2-3 GB de VRAM a menos); heads
        # ficam fp32 por conta do autocast(enabled=False) interno — demo.py:454-460.
        if self.dtype != torch.float32 and getattr(self.model, "aggregator", None) is not None:
            self.model.aggregator = self.model.aggregator.to(dtype=self.dtype)

        log.info(
            "motor residente pronto em %.1fs (device=%s dtype=%s sdpa=%s sha=%s…)",
            time.monotonic() - t0,
            self.device,
            self.dtype,
            self._use_sdpa,
            self.weights_sha256[:12],
        )

    def run(self, frames_dir: Path, out_dir: Path, cfg: EngineConfig) -> EngineRun:
        """Inferência sobre um diretório de frames JÁ borrados (blur vem antes)."""
        torch = self._torch
        from lingbot_map.utils.geometry import (
            closed_form_inverse_se3_general,
            unproject_depth_map_to_point_map,
        )
        from lingbot_map.utils.load_fn import load_and_preprocess_images
        from lingbot_map.utils.pose_enc import pose_encoding_to_extri_intri

        timings: dict[str, float] = {}
        paths = sorted(
            p for p in frames_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")
        )
        if not paths:
            raise RuntimeError(f"nenhum frame em {frames_dir}")
        n_frames = len(paths)
        mode = select_mode(n_frames, cfg)
        kf_interval = effective_keyframe_interval(n_frames, cfg)

        t0 = time.monotonic()
        images = load_and_preprocess_images(
            [str(p) for p in paths],
            mode="crop",
            image_size=cfg.image_size,
            patch_size=cfg.patch_size,
        ).to(self.device)
        timings["preprocess_s"] = round(time.monotonic() - t0, 2)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
        output_device = torch.device("cpu") if cfg.offload_to_cpu else None

        t0 = time.monotonic()
        with torch.no_grad(), torch.amp.autocast("cuda", dtype=self.dtype):
            if mode == "streaming":
                predictions = self.model.inference_streaming(
                    images,
                    num_scale_frames=cfg.num_scale_frames,
                    keyframe_interval=kf_interval,
                    output_device=output_device,
                )
            else:
                predictions = self.model.inference_windowed(
                    images,
                    window_size=cfg.window_size,
                    overlap_size=cfg.overlap_size,
                    overlap_keyframes=cfg.overlap_keyframes,
                    num_scale_frames=cfg.num_scale_frames,
                    keyframe_interval=kf_interval,
                    output_device=output_device,
                )
        timings["infer_s"] = round(time.monotonic() - t0, 2)
        peak_vram_mb = (
            torch.cuda.max_memory_allocated() / 1e6 if torch.cuda.is_available() else 0.0
        )

        # Pose: pose_enc → w2c + K (demo.py postprocess), c2w para o NPZ.
        t0 = time.monotonic()
        h, w = int(images.shape[-2]), int(images.shape[-1])
        extri_w2c, intri = pose_encoding_to_extri_intri(predictions["pose_enc"], (h, w))
        e4 = torch.zeros(
            (*extri_w2c.shape[:-2], 4, 4), device=extri_w2c.device, dtype=extri_w2c.dtype
        )
        e4[..., :3, :4] = extri_w2c
        e4[..., 3, 3] = 1.0
        extri_c2w = closed_form_inverse_se3_general(e4)[..., :3, :4]

        images_out = predictions.get("images")
        if images_out is None:
            images_out = images
        del images
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        depth = _squeeze_batch(predictions["depth"]).float().cpu().numpy()  # (S,H,W,1)
        depth_conf = _squeeze_batch(predictions["depth_conf"]).float().cpu().numpy()  # (S,H,W)
        w2c_np = _squeeze_batch(extri_w2c).float().cpu().numpy()  # (S,3,4)
        c2w_np = _squeeze_batch(extri_c2w).float().cpu().numpy()  # (S,3,4)
        intri_np = _squeeze_batch(intri).float().cpu().numpy()  # (S,3,3)
        images_np = _squeeze_batch(images_out).float().cpu().numpy()  # (S,3,H,W) [0,1]

        if cfg.enable_point and "world_points" in predictions:
            world_points = _squeeze_batch(predictions["world_points"]).float().cpu().numpy()
            world_conf = _squeeze_batch(predictions["world_points_conf"]).float().cpu().numpy()
        else:
            # Default do viewer oficial: desprojetar depth+pose (w2c) em numpy.
            world_points = unproject_depth_map_to_point_map(depth, w2c_np, intri_np)
            world_conf = depth_conf

        out_dir.mkdir(parents=True, exist_ok=True)
        for i in range(n_frames):
            write_frame_npz(
                out_dir,
                i,
                world_points=world_points[i],
                world_points_conf=world_conf[i],
                depth=depth[i],
                depth_conf=depth_conf[i][..., None],
                image=images_np[i],
                extrinsic_c2w=c2w_np[i],
                intrinsic=intri_np[i],
            )
        timings["export_s"] = round(time.monotonic() - t0, 2)

        return EngineRun(
            npz_dir=out_dir,
            n_frames=n_frames,
            n_keyframes=count_stored_frames(n_frames, kf_interval, cfg.num_scale_frames),
            mode=mode,
            keyframe_interval=kf_interval,
            peak_vram_mb=round(peak_vram_mb, 1),
            stage_timings=timings,
            weights_sha256=self.weights_sha256,
            flags=flags_for_provenance(cfg, kf_interval, mode),
        )


def _flashinfer_available() -> bool:
    try:
        import flashinfer  # noqa: F401
    except ImportError:
        return False
    return True


def _squeeze_batch(t: Any) -> Any:
    """[1, S, ...] → [S, ...] (o demo roda sempre com batch 1)."""
    return t[0] if t.ndim >= 3 and t.shape[0] == 1 else t
