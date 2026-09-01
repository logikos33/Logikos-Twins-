#!/usr/bin/env python3
"""Prova MECÂNICA do blur (bloco 6 do piloto, LGPD): 0 rostos nos keyframes.

Baixa os keyframes de um scan do bucket e roda o YuNet sobre cada um — os
mesmos pixels que colorem a nuvem. Qualquer detecção = a promessa de
privacidade falhou = exit 1 com a lista.

Uso: python scripts/verify_blur.py <scan_id>
Requer: .env com S3_*, e o modelo YuNet em models/yunet.onnx (fetch_yunet.py).
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import boto3

REPO = Path(__file__).resolve().parent.parent
YUNET = REPO / "models" / "yunet.onnx"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (REPO / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip()
    return env


def count_faces(image_path: Path) -> int:
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        raise RuntimeError(f"keyframe ilegível: {image_path}")
    h, w = img.shape[:2]
    det = cv2.FaceDetectorYN.create(
        str(YUNET), "", (w, h), score_threshold=0.6, nms_threshold=0.3
    )
    _, faces = det.detect(img)
    return 0 if faces is None else len(faces)


def main() -> int:
    scan_id = sys.argv[1]
    if not YUNET.exists():
        sys.stderr.write(f"modelo ausente: {YUNET} — rode scripts/fetch_yunet.py\n")
        return 2
    env = load_env()
    s3 = boto3.client(
        "s3",
        endpoint_url=env["S3_ENDPOINT"],
        aws_access_key_id=env["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=env["S3_SECRET_ACCESS_KEY"],
        region_name=env.get("S3_REGION", "auto"),
    )
    bucket = env["S3_BUCKET"]
    prefix = f"scans/{scan_id}/keyframes/"
    keys = [
        o["Key"] for o in s3.list_objects_v2(Bucket=bucket, Prefix=prefix).get("Contents", [])
    ]
    thumb = f"scans/{scan_id}/thumb.jpg"
    try:
        s3.head_object(Bucket=bucket, Key=thumb)
        keys.append(thumb)
    except Exception:  # thumb opcional
        pass
    if not keys:
        sys.stderr.write(f"nenhum keyframe em {prefix}\n")
        return 2

    total = 0
    ofensas: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for key in keys:
            local = Path(tmp) / Path(key).name
            s3.download_file(bucket, key, str(local))
            n = count_faces(local)
            total += n
            if n:
                ofensas.append(f"{key}: {n} rosto(s)")
    if total:
        sys.stderr.write("BLUR FALHOU:\n" + "\n".join(ofensas) + "\n")
        return 1
    sys.stdout.write(f"OK: 0 rostos em {len(keys)} imagem(ns) do scan {scan_id}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
