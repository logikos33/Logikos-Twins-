#!/usr/bin/env python3
"""Sobe os pesos ao R2 (fonte da verdade) — models/<nome>/<sha256>/<nome>.

Rodado 1ª vez em 2026-08-31 (bloco 2 do piloto): os 3 objetos subiram do
checkout local com tamanho conferido por HEAD. Verifica o sha256 local contra
os hashes congelados ANTES de subir; grava o sha como metadata do objeto.
Multipart/resumo por conta do boto3 (TransferConfig). Idempotente: objeto já
presente com o tamanho certo é pulado.

Uso: python scripts/upload_weights_r2.py  (lê credenciais S3_* do .env da raiz)
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import boto3
from boto3.s3.transfer import TransferConfig
from populate_volume import EXPECTED_SHA256

REPO = Path(__file__).resolve().parent.parent


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (REPO / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip()
    return env


def main() -> int:
    env = load_env()
    s3 = boto3.client(
        "s3",
        endpoint_url=env["S3_ENDPOINT"],
        aws_access_key_id=env["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=env["S3_SECRET_ACCESS_KEY"],
        region_name=env.get("S3_REGION", "auto"),
    )
    bucket = env["S3_BUCKET"]
    cfg = TransferConfig(
        multipart_threshold=64 * 1024 * 1024,
        multipart_chunksize=64 * 1024 * 1024,
        max_concurrency=4,
    )

    for name, expected in EXPECTED_SHA256.items():
        local = REPO / "models" / name
        if not local.exists():
            sys.stderr.write(f"AUSENTE: {local}\n")
            return 1
        actual = sha256_of(local)
        if actual != expected:
            sys.stderr.write(f"SHA DIVERGE em {name}: {actual}\n")
            return 1
        key = f"models/{name.rsplit('.', 1)[0]}/{expected}/{name}"
        try:
            head = s3.head_object(Bucket=bucket, Key=key)
            if head["ContentLength"] == local.stat().st_size:
                sys.stdout.write(f"já no R2 (tamanho bate): {key}\n")
                continue
        except Exception:
            pass
        sys.stdout.write(f"subindo {name} ({local.stat().st_size} bytes) → {key}\n")
        s3.upload_file(
            str(local), bucket, key, ExtraArgs={"Metadata": {"sha256": expected}}, Config=cfg
        )
        if s3.head_object(Bucket=bucket, Key=key)["ContentLength"] != local.stat().st_size:
            sys.stderr.write(f"tamanho no R2 não confere para {key}\n")
            return 1
    sys.stdout.write("UPLOAD-R2-COMPLETO\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
