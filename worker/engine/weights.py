"""Pesos do worker — R2 é a fonte da verdade; o network volume é só CACHE.

`ensure_weights()` roda no cold start (modo real): arquivo ausente ou sem o
marker de verificação → baixa do R2 (`models/<nome>/<sha256>/<nome>`), confere
o sha256 e grava atômico. Com marker presente, o custo é um punhado de stat().

Os hashes congelados abaixo são os MESMOS de `scripts/populate_volume.py`
(TOFU do download oficial); um teste garante que as duas cópias não divergem.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from collections.abc import Callable
from pathlib import Path

log = logging.getLogger("worker.weights")

EXPECTED_SHA256 = {
    "lingbot-map.pt": "ee665103348e07e6b826d529b8e61de8f413d5432a4f2e84970d6c8fd2e1cd72",
    "yolox_s.onnx": "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
    "yunet.onnx": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
}

_ENV_FOR_NAME = {
    "lingbot-map.pt": ("MODEL_PATH", "/runpod-volume/models/lingbot-map.pt"),
    "yolox_s.onnx": ("YOLOX_MODEL_PATH", "/runpod-volume/models/yolox_s.onnx"),
    "yunet.onnx": ("YUNET_MODEL_PATH", "/runpod-volume/models/yunet.onnx"),
}


def r2_key(name: str) -> str:
    return f"models/{name.rsplit('.', 1)[0]}/{EXPECTED_SHA256[name]}/{name}"


def targets() -> dict[str, Path]:
    return {
        name: Path(os.environ.get(env, default))
        for name, (env, default) in _ENV_FOR_NAME.items()
    }


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def _marker(target: Path) -> Path:
    return target.with_name(target.name + ".sha256ok")


def _download_from_r2(name: str, dst: Path) -> None:
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("S3_REGION", "auto"),
    )
    s3.download_file(os.environ["S3_BUCKET"], r2_key(name), str(dst))


def ensure_weights(download: Callable[[str, Path], None] | None = None) -> dict[str, str]:
    """Garante os 3 modelos no volume. Devolve {nome: 'cached' | 'downloaded'}.

    Verificação plena (sha256 dos 4,6 GB) só quando o marker não existe — o
    caminho quente do cold start é stat() puro. sha divergente é FATAL: pesos
    errados produzem resultado errado com cara de certo.
    """
    fetch = download or _download_from_r2
    status: dict[str, str] = {}
    for name, target in targets().items():
        expected = EXPECTED_SHA256[name]
        marker = _marker(target)
        if target.exists() and marker.exists() and marker.read_text().strip() == expected:
            status[name] = "cached"
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not marker.exists():
            # Arquivo sem marker (populate_volume antigo, ou download interrompido):
            # verifica de verdade antes de decidir baixar de novo.
            t0 = time.monotonic()
            if sha256_of(target) == expected:
                marker.write_text(expected)
                status[name] = "cached"
                log.info(
                    "%s: sha verificado em %.1fs, marker gravado", name, time.monotonic() - t0
                )
                continue
            log.warning("%s: sha DIVERGE do congelado — rebaixando do R2", name)

        t0 = time.monotonic()
        tmp = target.with_name(target.name + ".part")
        fetch(name, tmp)
        actual = sha256_of(tmp)
        if actual != expected:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(
                f"{name}: sha256 do download diverge do congelado ({actual[:12]}…) — "
                "fonte corrompida ou hash desatualizado; NÃO vou servir com peso errado"
            )
        os.replace(tmp, target)
        marker.write_text(expected)
        status[name] = "downloaded"
        log.info("%s: baixado+verificado em %.1fs", name, time.monotonic() - t0)
    return status
