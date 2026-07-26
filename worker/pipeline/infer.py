"""Chamada do motor de reconstrução (LingBot-Map) — ou das fixtures, no dev.

`WORKER_MODE`:
- ``real`` — subprocess do `demo_render/batch_demo.py` com as flags do ADR-0007.
  Exige GPU, pesos (`MODEL_PATH`) e o repositório do motor na imagem.
- ``fixture`` — pula a inferência e usa os NPZs da cena sintética. É o modo do
  `local-worker` do compose: todo o resto do pipeline é o código de produção.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

log = logging.getLogger("worker.infer")

ENGINE_DIR = Path(os.environ.get("ENGINE_DIR", "/engine"))  # clone do lingbot-map


class InferenceError(RuntimeError):
    pass


def run_inference(video: Path, out_dir: Path, fps: int) -> tuple[Path, float]:
    """Roda a inferência e devolve (diretório dos NPZs, segundos gastos)."""
    mode = os.environ.get("WORKER_MODE", "real")
    t0 = time.monotonic()

    if mode == "fixture":
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
        return dst, time.monotonic() - t0

    # --- modo real (GPU) ---------------------------------------------------
    # [TESTAR no plug-in]: flags validadas contra o código do motor (plano §3.3),
    # mas só a F0 com GPU real confirma throughput, VRAM e a interação
    # --save_glb × --no_render (OPEN-QUESTIONS Q3).
    predictions_dir = out_dir / "npz"
    cmd = [
        "python3",
        str(ENGINE_DIR / "demo_render" / "batch_demo.py"),
        "--video_path",
        str(video),
        "--fps",
        str(fps),
        "--mode",
        "windowed",
        "--window_size",
        "128",
        "--keyframe_interval",
        "2",
        "--overlap_keyframes",
        "8",
        "--conf_threshold",
        "1.5",
        "--model_path",
        os.environ["MODEL_PATH"],
        "--output_folder",
        str(out_dir),
        "--no_render",
        "--save_predictions",
    ]
    log.info("inferência: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=ENGINE_DIR)
    # stdout do motor vai para o log do worker — aparece no console do RunPod.
    if proc.stdout:
        log.info("motor stdout:\n%s", proc.stdout[-4000:])
    if proc.returncode != 0:
        raise InferenceError(f"motor falhou ({proc.returncode}):\n{proc.stderr[-4000:]}")

    if not predictions_dir.exists():
        # O motor grava as predições num subdiretório do output_folder; a estrutura
        # exata pode variar por versão. [TESTAR no plug-in] e ajustar aqui.
        candidates = list(out_dir.glob("**/frame_000000.npz"))
        if not candidates:
            raise InferenceError(f"inferência terminou mas não há NPZs em {out_dir}")
        predictions_dir = candidates[0].parent

    return predictions_dir, time.monotonic() - t0
