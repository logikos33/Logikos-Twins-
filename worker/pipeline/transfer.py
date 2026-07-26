"""Download do vídeo e upload dos artefatos — as bordas de I/O do pipeline.

Fala S3 genérico (MinIO no dev, R2 na produção — ADR-0003) e HTTP para a URL
presignada do vídeo. A convenção de chaves espelha `apps/web/src/lib/storage.ts`.
"""

from __future__ import annotations

import contextlib
import logging
import mimetypes
import os
import urllib.request
from pathlib import Path
from typing import Any

log = logging.getLogger("worker.transfer")


def download_video(url: str, dst: Path) -> Path:
    """Baixa o vídeo da URL presignada (GET simples, sem credencial)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    log.info("baixando vídeo para %s", dst)
    # urllib em vez de requests: uma dependência a menos na imagem, e o caso de uso
    # é um GET de arquivo — nada que justifique biblioteca.
    urllib.request.urlretrieve(url, dst)
    size_mb = dst.stat().st_size / 1024 / 1024
    log.info("vídeo baixado: %.1f MB", size_mb)
    return dst


def _s3_client() -> Any:
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("S3_REGION", "auto"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def replace_raw_video(scan_id: str, video: Path, ext: str = "mp4") -> str:
    """Substitui o objeto bruto pelo vídeo normalizado SEM áudio (decisão 8).

    O objeto original (com possível trilha de áudio) deixa de existir; a partir
    daqui, o que o storage guarda até a retenção apagar é a versão sem trilha.
    """
    s3 = _s3_client()
    bucket = os.environ["S3_BUCKET"]
    key = f"videos/{scan_id}.{ext}"
    s3.upload_file(str(video), bucket, key, ExtraArgs={"ContentType": "video/mp4"})

    # Se a gravação veio com outra extensão (webm/mov), o objeto antigo é removido —
    # senão o áudio sobreviveria num objeto órfão. Não existir é o caso normal.
    for old_ext in ("webm", "mov"):
        if old_ext != ext:
            with contextlib.suppress(Exception):
                s3.delete_object(Bucket=bucket, Key=f"videos/{scan_id}.{old_ext}")
    log.info("vídeo bruto substituído por versão sem áudio: %s", key)
    return key


def upload_artifacts(scan_id: str, out_dir: Path) -> dict[str, str]:
    """Sobe os artefatos sob scans/{id}/ e devolve o mapa de chaves (contrato)."""
    s3 = _s3_client()
    bucket = os.environ["S3_BUCKET"]
    prefix = f"scans/{scan_id}"

    mapping = {
        "cloud_preview_key": out_dir / "cloud_preview.ply",
        "poses_key": out_dir / "poses.json",
        "meta_key": out_dir / "meta.json",
        "thumb_key": out_dir / "thumb.jpg",
    }
    outputs: dict[str, str] = {}
    for name, local in mapping.items():
        if not local.exists():
            raise FileNotFoundError(f"artefato obrigatório ausente: {local.name}")
        key = f"{prefix}/{local.name}"
        content_type = mimetypes.guess_type(local.name)[0] or "application/octet-stream"
        s3.upload_file(str(local), bucket, key, ExtraArgs={"ContentType": content_type})
        outputs[name] = key

    kf_dir = out_dir / "keyframes"
    for kf in sorted(kf_dir.glob("*.jpg")):
        s3.upload_file(
            str(kf),
            bucket,
            f"{prefix}/keyframes/{kf.name}",
            ExtraArgs={"ContentType": "image/jpeg"},
        )
    outputs["keyframes_prefix"] = f"{prefix}/keyframes/"

    log.info("artefatos publicados sob %s/", prefix)
    return outputs
