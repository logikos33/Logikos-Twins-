#!/usr/bin/env python3
"""Baixa o modelo YuNet de detecção de rostos (OpenCV Zoo, MIT — LICENSES.md).

Usado pelo blur opcional de rostos (D6). ~230 KB. Hash TOFU congelado do primeiro
download verificado.

Uso:
    python scripts/fetch_yunet.py [--out models/yunet.onnx]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
    "face_detection_yunet_2023mar.onnx"
)
# TOFU: medido no primeiro download do repositório oficial em 2026-07-26.
EXPECTED_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("models/yunet.onnx"))
    args = parser.parse_args()

    out: Path = args.out
    if out.exists() and sha256_of(out) == EXPECTED_SHA256:
        print(f"✓ {out} já existe e confere")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"→ baixando YuNet de {YUNET_URL}")
    urllib.request.urlretrieve(YUNET_URL, out)

    actual = sha256_of(out)
    if actual != EXPECTED_SHA256:
        print(f"✗ SHA-256 não confere ({actual}) — arquivo descartado")
        out.unlink()
        return 1
    print(f"✓ {out} ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
