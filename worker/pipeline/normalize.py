"""Normalização do vídeo gravado no navegador (consequência direta do ADR-0008).

O container varia por navegador: Safari grava MP4/H.264, Chrome no Android grava
WebM/VP8-9. O OpenCV do motor lê melhor MP4/H.264 — e a decisão 8 manda DESCARTAR o
áudio. Este módulo converte tudo para MP4 H.264 sem trilha de áudio, aplicando a
rotação dos metadados (o ffmpeg autorotaciona por padrão — importante para vídeo
gravado em pé, plano §9.15).
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger("worker.normalize")


class FfmpegError(RuntimeError):
    pass


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FfmpegError(
            f"comando falhou ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}"
        )
    return proc.stdout


def probe(video: Path) -> dict[str, Any]:
    """ffprobe → streams e formato, como dict."""
    out = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(video),
        ]
    )
    result: dict[str, Any] = json.loads(out)
    return result


def video_duration_s(video: Path) -> float:
    info = probe(video)
    return float(info["format"]["duration"])


def has_audio(video: Path) -> bool:
    info = probe(video)
    return any(s.get("codec_type") == "audio" for s in info["streams"])


def normalize(src: Path, dst: Path) -> Path:
    """Converte para MP4/H.264 sem áudio, com rotação de metadados aplicada.

    Sempre re-encoda o vídeo: além de unificar o codec, é o que MATERIALIZA a
    rotação dos metadados nos pixels (um `-c copy` manteria o frame deitado e só
    carregaria a tag — e o OpenCV ignora a tag). `-an` remove a trilha de áudio:
    a decisão 8 é que áudio nunca chega ao processamento nem ao storage final.
    """
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-an",  # sem áudio — decisão 8 (LGPD)
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(dst),
        ]
    )
    log.info("normalizado %s → %s", src.name, dst.name)
    return dst
