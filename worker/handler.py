"""Handler do worker — o processo que roda no RunPod Serverless (e no local-worker).

Contrato de entrada (payload do /run): {scan_id, video_url, params:{fps}}.
Contrato de saída: {scan_id, outputs:{...chaves}, metrics:{...}} — o mesmo formato que
o sósia emite e que o webhook da web valida.

Em erro, a exceção sobe: o RunPod marca FAILED e o webhook/reconciliação levam o scan
a `error` com a mensagem.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}',
)
log = logging.getLogger("worker")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    from pipeline import frames, infer, normalize, npz_to_artifacts, transfer

    inp = job["input"]
    scan_id: str = inp["scan_id"]
    video_url: str = inp["video_url"]
    params = inp.get("params", {})
    fps: int = int(params.get("fps", 8))
    # Blur é PADRÃO (LGPD, bloco 6 do piloto): desligar exige pedido explícito.
    blur: bool = bool(params.get("blur_faces", True))

    t0 = time.monotonic()
    stage: dict[str, float] = {}
    log.info(f"scan {scan_id}: iniciando (fps={fps}, blur={blur})")

    with tempfile.TemporaryDirectory(prefix=f"scan-{scan_id[:8]}-") as tmp:
        work = Path(tmp)

        # 1. Download do vídeo bruto (URL presignada).
        ts = time.monotonic()
        raw = transfer.download_video(video_url, work / "raw_video")
        stage["download_s"] = round(time.monotonic() - ts, 2)

        # 2. Normalização: container unificado, rotação materializada, ÁUDIO FORA
        #    (decisão 8) — e o objeto bruto no storage é substituído pela versão
        #    sem trilha.
        ts = time.monotonic()
        video = normalize.normalize(raw, work / "video.mp4")
        duration = normalize.video_duration_s(video)
        video_key = transfer.replace_raw_video(scan_id, video)
        stage["normalize_s"] = round(time.monotonic() - ts, 2)

        # 3. Modo real: extração de frames + blur ANTES do motor — a cor da
        #    nuvem nasce de frame já borrado (bloco 1). Falha de blur é fatal
        #    de propósito: privacidade não degrada em silêncio (D6).
        frames_dir: Path | None = None
        if infer.is_real_mode():
            frames_dir, prep_timings = frames.prepare_frames(video, work / "frames", fps, blur)
            stage.update(prep_timings)

        # 4. Inferência 3D (motor residente na GPU; fixtures no dev).
        result_infer = infer.run_inference(work / "out", fps, frames_dir=frames_dir)
        npz_dir = result_infer.npz_dir
        infer_s = result_infer.seconds
        stage["infer_s"] = round(infer_s, 2)

        # 5. NPZs → artefatos do produto (ADR-0006), com proveniência completa:
        #    job sem procedência identificável não é aceitável no piloto.
        engine_prov = result_infer.provenance
        ts = time.monotonic()
        artifacts = npz_to_artifacts.convert(
            npz_dir,
            work / "artifacts",
            fps=fps,
            versions={
                "engine_commit": os.environ.get("ENGINE_COMMIT", "unknown"),
                "checkpoint": os.environ.get("MODEL_PATH", "none"),
                "worker_mode": os.environ.get("WORKER_MODE", "real"),
                "worker_commit": os.environ.get("WORKER_COMMIT", "unknown"),
                "image_sha": os.environ.get("IMAGE_SHA", "unknown"),
                "weights_sha256": str(engine_prov.get("weights_sha256", "")),
                "engine_flags": engine_prov.get("flags", {}),
            },
        )
        stage["convert_s"] = round(time.monotonic() - ts, 2)

        # 5b. Modo fixture: os NPZs são pré-prontos (não passaram pela extração),
        #     então o blur cai nos keyframes/thumb derivados — mantém o e2e do
        #     compose exercitando a promessa de privacidade.
        if blur and frames_dir is None:
            from pipeline import blur_faces

            blurred = blur_faces.blur_keyframes(work / "artifacts")
            log.info(f"scan {scan_id}: blur pós-fixture — {blurred} rosto(s)")

        # 6. Upload dos artefatos.
        ts = time.monotonic()
        outputs = transfer.upload_artifacts(scan_id, work / "artifacts")
        stage["upload_s"] = round(time.monotonic() - ts, 2)
        # A normalização pode ter trocado a extensão do bruto (webm→mp4); quem
        # consome (retenção da D7) precisa da chave REAL, não da original.
        outputs["video_key"] = video_key

        # 7. Detecção ancorada (D5) — a GPU já está paga; roda no mesmo job.
        #    Falha aqui NÃO derruba o scan: o mapa sem pins ainda é um mapa.
        detection_summary = _run_detection(scan_id, npz_dir, work / "artifacts")

        # 8. Escala automática por ArUco (D6) — melhor-esforço, como a detecção.
        scale = _run_aruco_scale(npz_dir, work / "artifacts")

        total_s = time.monotonic() - t0
        metrics = {
            **artifacts.metrics,
            "infer_s": round(infer_s, 2),
            "total_s": round(total_s, 2),
            "duration_s": round(duration, 2),
            "stage_timings": stage,
            # Custo estimado: só faz sentido com GPU real; o plug-in preenche a
            # tarifa via env. Zero honesto até lá.
            "cost_usd_est": round(
                (total_s / 3600) * float(os.environ.get("GPU_USD_PER_HOUR", "0")), 4
            ),
            **detection_summary,
        }
        # Números do motor residente (VRAM de pico, keyframes, timings internos).
        for key in ("peak_vram_mb", "n_keyframes", "engine_mode", "keyframe_interval"):
            if key in engine_prov:
                metrics[key] = engine_prov[key]
        if "engine_timings" in engine_prov:
            metrics["stage_timings"] = {**stage, **engine_prov["engine_timings"]}
        log.info(f"scan {scan_id}: concluído em {total_s:.1f}s — {json.dumps(metrics)}")

        result: dict[str, Any] = {"scan_id": scan_id, "outputs": outputs, "metrics": metrics}
        if scale:
            result["scale"] = scale
        return result


def _run_detection(scan_id: str, npz_dir: Path, artifacts_dir: Path) -> dict[str, Any]:
    """Detecta nos keyframes, ancora em 3D e envia os clusters à API (rota batch).

    Melhor-esforço deliberado: detector sem pesos ou API fora do ar degradam para
    "sem pins", nunca para scan em erro.
    """
    import json as _json
    import urllib.request

    from pipeline import detect

    try:
        detector_kind = os.environ.get("DETECTOR", "yolox")
        if detector_kind == "synthetic":
            objects = detect.load_scene_objects(artifacts_dir / "meta.json")
            detector: Any = detect.SyntheticDetector(objects)
        else:
            detector_kind, detector = detect.make_detector(detector_kind)

        poses = _json.loads((artifacts_dir / "poses.json").read_text())
        _, clusters = detect.detect_over_keyframes(npz_dir, poses["keyframes"], detector)

        app_url = os.environ.get("APP_INTERNAL_URL") or os.environ.get("APP_URL")
        secret = os.environ.get("RUNPOD_WEBHOOK_SECRET")
        if app_url and secret and clusters:
            payload = _json.dumps(
                {
                    "clusters": [
                        {
                            "label": c.label,
                            "score": round(c.score, 4),
                            "count": c.count,
                            "world_pos": [round(v, 4) for v in c.center],
                            "best_frame": c.best_frame,
                        }
                        for c in clusters
                    ]
                }
            ).encode()
            req = urllib.request.Request(
                f"{app_url}/api/scans/{scan_id}/detections?token={secret}",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=30)
            log.info(f"scan {scan_id}: {len(clusters)} clusters enviados ({detector_kind})")

        return {"detector": detector_kind, "detections": len(clusters)}
    except Exception as exc:
        log.warning(f"detecção pulada: {exc}")
        return {"detector": "none", "detections": 0}


def _run_aruco_scale(npz_dir: Path, artifacts_dir: Path) -> dict[str, Any] | None:
    """Escala automática (D6). Sem marcador ou erro → None; a manual continua valendo."""
    import json as _json

    try:
        from pipeline import aruco_scale

        poses = _json.loads((artifacts_dir / "poses.json").read_text())
        return aruco_scale.detect_scale(npz_dir, poses["keyframes"])
    except Exception as exc:
        log.warning(f"escala ArUco pulada: {exc}")
        return None


if __name__ == "__main__":
    # No RunPod, o SDK gerencia o loop de jobs. Import adiado: o modo local-worker
    # importa `handler` diretamente e não precisa do SDK.
    import runpod

    runpod.serverless.start({"handler": handler})
