"""Modo ``local-worker`` — executa o worker REAL em CPU.

Lento (não há GPU), mas é o modo que prova o código de verdade: o mesmo
``worker/handler.py`` que rodará no RunPod, sobre as fixtures, do download ao upload.
É o DoD da D3.

A diferença para produção está inteiramente na configuração: sem CUDA, e a etapa de
inferência do LingBot-Map é substituída pelos NPZs pré-gerados da cena sintética — o
motor de verdade exige GPU e pesos de 4,6 GB, que só entram no plug-in. Todo o resto do
pipeline (normalização com ffmpeg, strip de áudio, conversão NPZ→PLY, poses, keyframes,
upload, métricas) é exatamente o código de produção.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

log = logging.getLogger("fake-runpod.local-worker")


async def run_local_worker(payload: dict[str, Any]) -> dict[str, Any]:
    """Chama o handler do worker real numa thread separada."""
    log.info("executando o worker real em CPU (scan=%s)", payload.get("scan_id"))

    from handler import handler as worker_handler

    # O handler é síncrono e faz I/O pesado; numa thread para não travar o loop de
    # eventos do FastAPI, que ainda precisa responder ao polling de status.
    result: dict[str, Any] = await asyncio.to_thread(worker_handler, {"input": payload})
    return result
