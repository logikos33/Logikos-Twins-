"""Chamada do motor de reconstrução (LingBot-Map) — ou das fixtures, no dev.

`WORKER_MODE`:
- ``real`` — motor RESIDENTE (`engine.lingbot`), carregado uma vez por processo.
  Exige GPU, pesos (`MODEL_PATH`) e o pacote `lingbot_map` instalado — sem o
  extra [demo]/[vis] e sem processo-filho por job (bloco 1 do piloto).
- ``fixture`` — pula a inferência e usa os NPZs da cena sintética. É o modo do
  `local-worker` do compose: todo o resto do pipeline é o código de produção.
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger("worker.infer")


class InferenceError(RuntimeError):
    pass


@dataclass
class InferResult:
    npz_dir: Path
    seconds: float
    # Proveniência do motor real; vazio no modo fixture.
    provenance: dict[str, Any] = field(default_factory=dict)


def is_real_mode() -> bool:
    return os.environ.get("WORKER_MODE", "real") == "real"


def run_inference(out_dir: Path, fps: int, frames_dir: Path | None = None) -> InferResult:
    """Roda a inferência e devolve NPZs + proveniência.

    No modo real, `frames_dir` é OBRIGATÓRIO e já vem borrado (blur antes do
    motor — pipeline.frames.prepare_frames). No modo fixture é ignorado.
    """
    t0 = time.monotonic()

    if not is_real_mode():
        npz_src = Path(os.environ.get("FIXTURE_NPZ_DIR", "/fixtures/npz"))
        if not npz_src.exists():
            raise InferenceError(
                f"WORKER_MODE=fixture mas {npz_src} não existe — rode `make fixture`."
            )
        # Copia em vez de usar direto: o pipeline tem permissão de escrever no
        # out_dir, e a fixture montada é read-only no compose.
        dst = out_dir / "npz"
        shutil.copytree(npz_src, dst, dirs_exist_ok=True)
        log.info("modo fixture: NPZs copiados de %s", npz_src)
        return InferResult(npz_dir=dst, seconds=time.monotonic() - t0)

    # --- modo real (GPU, motor residente) ----------------------------------
    if frames_dir is None:
        raise InferenceError("modo real exige frames_dir (extração+blur antes do motor)")

    from dataclasses import replace

    from engine import lingbot

    # O fps efetivo é o do job (usado na extração); a proveniência registra o real.
    cfg = replace(lingbot.EngineConfig.from_env(), fps=fps)

    run = lingbot.get_engine(cfg).run(frames_dir, out_dir / "npz", cfg)
    provenance: dict[str, Any] = {
        "weights_sha256": run.weights_sha256,
        "peak_vram_mb": run.peak_vram_mb,
        "n_frames": run.n_frames,
        "n_keyframes": run.n_keyframes,
        "engine_mode": run.mode,
        "keyframe_interval": run.keyframe_interval,
        "engine_timings": run.stage_timings,
        "flags": run.flags,
    }
    return InferResult(
        npz_dir=run.npz_dir, seconds=time.monotonic() - t0, provenance=provenance
    )
