"""Publicação dos artefatos da cena sintética no storage.

Mantém a mesma convenção de chaves usada pela web (`apps/web/src/lib/storage.ts`) e pelo
worker real. Se as duas divergirem, o viewer procura um arquivo que ninguém subiu — por
isso a convenção está escrita em um lugar de cada lado e testada nos dois.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config

log = logging.getLogger("fake-runpod.artifacts")


def _s3_client() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("S3_REGION", "auto"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def artifact_keys(scan_id: str) -> dict[str, str]:
    """Convenção de chaves — espelha `keys` em apps/web/src/lib/storage.ts."""
    prefix = f"scans/{scan_id}"
    return {
        "cloud_preview_key": f"{prefix}/cloud_preview.ply",
        "poses_key": f"{prefix}/poses.json",
        "meta_key": f"{prefix}/meta.json",
        "thumb_key": f"{prefix}/thumb.jpg",
    }


def upload_fixture_artifacts(
    scan_id: str, fixture_dir: Path
) -> tuple[dict[str, str], dict[str, Any]]:
    """Sobe os artefatos da fixture sob o prefixo do scan e devolve (outputs, metrics)."""
    if not fixture_dir.exists():
        raise FileNotFoundError(
            f"Cena sintética não encontrada em {fixture_dir}. Rode `make fixture` antes."
        )

    s3 = _s3_client()
    bucket = os.environ["S3_BUCKET"]
    keys = artifact_keys(scan_id)
    prefix = f"scans/{scan_id}"

    uploaded: dict[str, str] = {}
    for name, key in keys.items():
        local = fixture_dir / Path(key).name
        if not local.exists():
            log.warning("artefato ausente na fixture, ignorado: %s", local.name)
            continue
        content_type = mimetypes.guess_type(local.name)[0] or "application/octet-stream"
        s3.upload_file(str(local), bucket, key, ExtraArgs={"ContentType": content_type})
        uploaded[name] = key

    # A nuvem de preview é o artefato mínimo — sem ela o viewer não tem o que mostrar.
    # Completar "com sucesso" sem subir nada seria mentir para a web sobre o contrato.
    if "cloud_preview_key" not in uploaded:
        raise FileNotFoundError(
            f"Fixture incompleta em {fixture_dir}: falta cloud_preview.ply. "
            "Rode `make fixture` para gerar a cena sintética."
        )

    # Keyframes: quantidade variável, sobem como um lote sob o mesmo prefixo.
    keyframes_dir = fixture_dir / "keyframes"
    keyframe_count = 0
    if keyframes_dir.is_dir():
        for kf in sorted(keyframes_dir.glob("*.jpg")):
            s3.upload_file(
                str(kf),
                bucket,
                f"{prefix}/keyframes/{kf.name}",
                ExtraArgs={"ContentType": "image/jpeg"},
            )
            keyframe_count += 1
    uploaded["keyframes_prefix"] = f"{prefix}/keyframes/"

    metrics = _read_metrics(fixture_dir, keyframe_count)
    log.info("scan %s: %d artefatos + %d keyframes", scan_id, len(uploaded), keyframe_count)
    return uploaded, metrics


def _read_metrics(fixture_dir: Path, keyframe_count: int) -> dict[str, Any]:
    """Métricas declaradas pela fixture, com custo zerado — não houve GPU."""
    meta_path = fixture_dir / "meta.json"
    meta: dict[str, Any] = {}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())

    return {
        "infer_s": meta.get("infer_s", 0.0),
        "total_s": meta.get("total_s", 0.0),
        "points_raw": meta.get("points_raw", 0),
        "points_preview": meta.get("points_preview", 0),
        "frames": meta.get("frames", 0),
        "keyframes": keyframe_count,
        # Zero, e não uma estimativa: nenhuma GPU foi paga. Inventar um custo aqui
        # contaminaria o painel de custos da D7 com números fictícios.
        "cost_usd_est": 0.0,
        "synthetic": True,
    }
