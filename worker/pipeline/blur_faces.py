"""Blur de rostos opcional por scan (spec D6, LGPD).

Detector: YuNet (OpenCV Zoo, MIT — verificado na fonte, LICENSES.md), via
`cv2.FaceDetectorYN` que já vem no opencv-python. Aplica-se APENAS aos
`keyframes/*.jpg` e `thumb.jpg` — o vídeo bruto morre na retenção (D7); borrar
frames que serão apagados seria custo sem benefício.

Threshold deliberadamente baixo (0.6): para privacidade, um falso positivo borrado
custa quase nada; um rosto que escapa custa muito.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger("worker.blur")

MODEL_PATH_DEFAULT = "/models/yunet.onnx"


def _detector(width: int, height: int):  # type: ignore[no-untyped-def] # cv2 sem stubs úteis
    import cv2

    model = os.environ.get("YUNET_MODEL_PATH", MODEL_PATH_DEFAULT)
    if not Path(model).exists():
        raise FileNotFoundError(
            f"modelo YuNet ausente em {model} — rode scripts/fetch_yunet.py"
        )
    return cv2.FaceDetectorYN.create(
        model, "", (width, height), score_threshold=0.6, nms_threshold=0.3
    )


def blur_faces_in_image(image_bgr: np.ndarray) -> tuple[np.ndarray, int]:
    """Borra os rostos de uma imagem BGR. Devolve (imagem, nº de rostos)."""
    import cv2

    h, w = image_bgr.shape[:2]
    det = _detector(w, h)
    _, faces = det.detect(image_bgr)
    if faces is None or len(faces) == 0:
        return image_bgr, 0

    out = image_bgr.copy()
    for face in faces:
        x, y, fw, fh = (int(v) for v in face[:4])
        # Margem de 25%: o YuNet marca o rosto justo; orelhas/queixo identificam.
        mx, my = int(fw * 0.25), int(fh * 0.25)
        x0, y0 = max(0, x - mx), max(0, y - my)
        x1, y1 = min(w, x + fw + mx), min(h, y + fh + my)
        if x1 <= x0 or y1 <= y0:
            continue
        region = out[y0:y1, x0:x1]
        # Kernel proporcional ao rosto: um blur fixo seria fraco em rostos grandes.
        k = max(9, ((x1 - x0) // 3) | 1)
        out[y0:y1, x0:x1] = cv2.GaussianBlur(region, (k, k), 0)
    return out, len(faces)


def blur_frames_dir(frames_dir: Path) -> int:
    """Borra rostos em TODOS os frames extraídos, in-place — ANTES do motor.

    É daqui que nasce a cor da nuvem e os keyframes: borrar neste ponto cobre
    tudo de uma vez (bloco 1 do piloto). q=95: estes JPEGs são entrada do
    modelo, não artefato de exibição — não degradar além do necessário.
    """
    import cv2

    targets = sorted(frames_dir.glob("frame_*.jpg"))
    if not targets:
        raise FileNotFoundError(f"nenhum frame para borrar em {frames_dir}")

    total = 0
    for path in targets:
        img = cv2.imread(str(path))
        if img is None:
            raise RuntimeError(f"frame ilegível: {path}")
        blurred, n = blur_faces_in_image(img)
        if n > 0:
            cv2.imwrite(str(path), blurred, [cv2.IMWRITE_JPEG_QUALITY, 95])
            total += n
    log.info("blur pré-motor: %d rosto(s) em %d frame(s)", total, len(targets))
    return total


def blur_keyframes(artifacts_dir: Path) -> int:
    """Borra rostos em todos os keyframes + thumb, in-place. Devolve total de rostos."""
    import cv2

    targets = sorted((artifacts_dir / "keyframes").glob("*.jpg"))
    thumb = artifacts_dir / "thumb.jpg"
    if thumb.exists():
        targets.append(thumb)

    total = 0
    for path in targets:
        img = cv2.imread(str(path))
        if img is None:
            continue
        blurred, n = blur_faces_in_image(img)
        if n > 0:
            cv2.imwrite(str(path), blurred, [cv2.IMWRITE_JPEG_QUALITY, 70])
            total += n
    log.info("blur aplicado: %d rosto(s) em %d imagem(ns)", total, len(targets))
    return total
