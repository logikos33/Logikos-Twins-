#!/usr/bin/env python3
"""Sobe os pesos ao network volume do RunPod via API S3-compatível (P2 do plug-in).

Autenticação: **S3 API key** do RunPod (Settings → S3 API Keys) — a API key normal
NÃO funciona (docs storage/s3-api). Preencher no .env:
    RUNPOD_S3_ACCESS_KEY=user_…
    RUNPOD_S3_SECRET=rps_…
    RUNPOD_VOLUME_ID=…      (já preenchido)
    RUNPOD_VOLUME_DC=US-MO-2

Verificação de integridade SEM re-download: multipart com partes de 100 MB, MD5 por
parte conferido no ETag de cada UploadPart, e o ETag composto final conferido contra
o valor calculado localmente (md5 dos md5s + "-N"). SHA-256 local de cada arquivo é
registrado abaixo e conferido antes do envio.

Uso:
    .venv/bin/python scripts/populate_volume.py [--only yolox,yunet]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path

# Hashes congelados (TOFU nos fetchers; lingbot medido do download oficial do HF).
EXPECTED_SHA256 = {
    "lingbot-map.pt": "ee665103348e07e6b826d529b8e61de8f413d5432a4f2e84970d6c8fd2e1cd72",
    "yolox_s.onnx": "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
    "yunet.onnx": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
}

# A doc do RunPod (storage/s3-api) promete até 500 MB por parte, mas o GATEWAY na
# frente da API corta bem antes: sondado empiricamente em 2026-07-27 no datacenter
# US-MO-2 — 256 MB → 413 Content Too Large, 128 MB → OK. Usamos 100 MB para deixar
# margem (o teto pode variar por DC/momento) sem multiplicar demais o número de partes.
PART_SIZE = 100 * 1024 * 1024

MAX_ATTEMPTS = 5
RETRY_BACKOFF_S = (5, 10, 20, 30)  # cresce a cada tentativa; a última repete


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in Path(".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
    return env


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def upload(s3: object, bucket: str, local: Path, key: str) -> None:
    size = local.stat().st_size
    t0 = time.monotonic()

    if size <= PART_SIZE:
        body = local.read_bytes()
        md5 = hashlib.md5(body).hexdigest()
        r = s3.put_object(Bucket=bucket, Key=key, Body=body)  # type: ignore[attr-defined]
        remote = r["ETag"].strip('"')
        assert remote == md5, f"ETag {remote} != md5 local {md5}"
    else:
        mpu = s3.create_multipart_upload(Bucket=bucket, Key=key)  # type: ignore[attr-defined]
        uid = mpu["UploadId"]
        # Se der errado a partir daqui, abortamos a sessão em vez de deixá-la
        # pendurada — um multipart abandonado ocupa espaço no volume de 50 GB até
        # alguém limpar manualmente (foi o que aconteceu na primeira tentativa,
        # quando o 413 do gateway invalidou a sessão e a próxima parte veio com
        # NoSuchUpload).
        try:
            parts, md5s = [], []
            with local.open("rb") as f:
                n = 0
                while True:
                    blob = f.read(PART_SIZE)
                    if not blob:
                        break
                    n += 1
                    md5 = hashlib.md5(blob).hexdigest()
                    for attempt in range(MAX_ATTEMPTS):
                        try:
                            r = s3.upload_part(  # type: ignore[attr-defined]
                                Bucket=bucket,
                                Key=key,
                                UploadId=uid,
                                PartNumber=n,
                                Body=blob,
                            )
                            break
                        except Exception as exc:
                            if attempt == MAX_ATTEMPTS - 1:
                                raise
                            delay = RETRY_BACKOFF_S[min(attempt, len(RETRY_BACKOFF_S) - 1)]
                            print(
                                f"    parte {n} falhou ({exc}); tentando de novo em {delay}s…"
                            )
                            time.sleep(delay)
                    got = r["ETag"].strip('"')
                    assert got == md5, f"parte {n}: ETag {got} != md5 {md5}"
                    parts.append({"PartNumber": n, "ETag": r["ETag"]})
                    md5s.append(bytes.fromhex(md5))
                    done = n * PART_SIZE if n * PART_SIZE < size else size
                    mbps = done / 1024 / 1024 / max(time.monotonic() - t0, 0.001)
                    print(f"    parte {n} ok ({done // (1024 * 1024)} MB, {mbps:.1f} MB/s)")
            s3.complete_multipart_upload(  # type: ignore[attr-defined]
                Bucket=bucket, Key=key, UploadId=uid, MultipartUpload={"Parts": parts}
            )
        except Exception:
            print(f"  → abortando multipart {uid[:12]}… para não deixar sessão pendurada")
            try:
                s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=uid)  # type: ignore[attr-defined]
            except Exception as abort_exc:
                print(f"  ⚠ abort também falhou ({abort_exc}) — cheque manualmente no console")
            raise

        expected = hashlib.md5(b"".join(md5s)).hexdigest() + f"-{len(parts)}"
        head = s3.head_object(Bucket=bucket, Key=key)  # type: ignore[attr-defined]
        got = head["ETag"].strip('"')
        assert got == expected, f"ETag composto {got} != esperado {expected}"
        assert head["ContentLength"] == size

    secs = time.monotonic() - t0
    print(f"  ✓ {key} ({size // (1024 * 1024)} MB em {secs:.0f}s)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="lista separada por vírgula (ex.: yolox,yunet)")
    args = parser.parse_args()

    env = load_env()
    access = env.get("RUNPOD_S3_ACCESS_KEY", "")
    secret = env.get("RUNPOD_S3_SECRET", "")
    volume = env["RUNPOD_VOLUME_ID"]
    dc = env["RUNPOD_VOLUME_DC"].lower()
    if not access or not secret:
        print("✗ RUNPOD_S3_ACCESS_KEY/RUNPOD_S3_SECRET ausentes no .env")
        print("  Crie em: console RunPod → Settings → S3 API Keys → Create")
        return 1

    import boto3
    from botocore.config import Config

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://s3api-{dc}.runpod.io/",
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name=dc,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    files = list(EXPECTED_SHA256)
    if args.only:
        wanted = {w.strip() for w in args.only.split(",")}
        files = [f for f in files if any(w in f for w in wanted)]

    for name in files:
        local = Path("models") / name
        if not local.exists():
            print(f"✗ {local} não existe — rode o fetcher correspondente")
            return 1
        print(f"→ conferindo sha256 de {name}…")
        actual = sha256_of(local)
        if actual != EXPECTED_SHA256[name]:
            print(f"✗ {name}: sha256 local {actual} difere do congelado — NÃO enviado")
            return 1
        print(f"→ enviando {name} para o volume {volume} ({dc})")
        upload(s3, volume, local, f"models/{name}")

    print("\n✓ volume populado e verificado (ETags conferidos por parte e no composto)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
