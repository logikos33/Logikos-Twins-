"""Extração de frames do vídeo normalizado — o worker é dono do sampling.

Antes o motor extraía os frames internamente (`--video_path --fps`); agora a
extração acontece AQUI para que o blur de rostos rode ANTES da inferência —
a cor da nuvem tem que nascer de frame já borrado (bloco 1 do piloto, LGPD).
"""

from __future__ import annotations

import logging
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

log = logging.getLogger("worker.frames")


class FrameExtractionError(RuntimeError):
    pass


def extract_frames(video: Path, out_dir: Path, fps: int) -> list[Path]:
    """MP4 normalizado → frame_%06d.jpg a `fps` (q=2: quase-lossless, 10× menor
    que PNG — o motor recorta para 518px de qualquer forma)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps}",
        "-q:v",
        "2",
        str(out_dir / "frame_%06d.jpg"),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FrameExtractionError(f"ffmpeg falhou ({proc.returncode}):\n{proc.stderr[-2000:]}")
    paths = sorted(out_dir.glob("frame_*.jpg"))
    if not paths:
        raise FrameExtractionError(f"extração terminou mas não há frames em {out_dir}")
    log.info("%d frames extraídos a %d fps", len(paths), fps)
    return paths


def prepare_frames(
    video: Path,
    out_dir: Path,
    fps: int,
    blur: bool,
    _extract: Callable[[Path, Path, int], list[Path]] | None = None,
    _blur_dir: Callable[[Path], int] | None = None,
) -> tuple[Path, dict[str, float]]:
    """extração → blur, NESTA ordem — é a garantia de que nenhum pixel de rosto
    chega ao motor. Falha de blur é fatal de propósito (mesma política da D6).

    Os hooks _extract/_blur_dir existem só para o teste de ordem; produção usa
    os defaults.
    """
    timings: dict[str, float] = {}
    extract = _extract or extract_frames

    t0 = time.monotonic()
    extract(video, out_dir, fps)
    timings["extract_s"] = round(time.monotonic() - t0, 2)

    if blur:
        from pipeline import blur_faces

        blur_dir = _blur_dir or blur_faces.blur_frames_dir
        t0 = time.monotonic()
        n = blur_dir(out_dir)
        timings["blur_s"] = round(time.monotonic() - t0, 2)
        log.info("blur ANTES do motor: %d rosto(s) borrados", n)

    return out_dir, timings
