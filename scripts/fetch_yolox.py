#!/usr/bin/env python3
"""Baixa os pesos YOLOX-s ONNX oficiais (Megvii, Apache-2.0) com verificação.

Download público, sem conta nem chave — permitido pelas regras (o que é proibido é
credencial). O arquivo (~35 MB) fica fora do git (models/ está no .gitignore).

Uso:
    python scripts/fetch_yolox.py [--out models/yolox_s.onnx]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

# Release oficial pinada por versão — mesma disciplina do commit do motor.
YOLOX_URL = (
    "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx"
)
# TOFU (trust-on-first-use): hash medido no primeiro download do release oficial
# em 2026-07-26 e congelado — download futuro divergente é recusado.
EXPECTED_SHA256 = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("models/yolox_s.onnx"))
    args = parser.parse_args()

    out: Path = args.out
    if out.exists():
        actual = sha256_of(out)
        if EXPECTED_SHA256 and actual == EXPECTED_SHA256:
            print(f"✓ {out} já existe e confere ({actual[:12]}…)")
            return 0
        print(f"→ {out} existe mas o hash difere — baixando de novo")

    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"→ baixando yolox_s.onnx de {YOLOX_URL}")
    urllib.request.urlretrieve(YOLOX_URL, out)

    actual = sha256_of(out)
    if EXPECTED_SHA256 and actual != EXPECTED_SHA256:
        print(f"✗ SHA-256 não confere!\n  esperado: {EXPECTED_SHA256}\n  obtido:   {actual}")
        print("  O arquivo NÃO será usado. Verifique a URL/release.")
        out.unlink()
        return 1

    size_mb = out.stat().st_size / 1024 / 1024
    print(f"✓ {out} ({size_mb:.1f} MB, sha256 {actual[:12]}…)")
    if not EXPECTED_SHA256:
        print(f'  Registre no script: EXPECTED_SHA256 = "{actual}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
