"""Sósia local do RunPod Serverless (ADR-0004).

Implementa o contrato documentado do RunPod — não um stub. A web fala HTTP de verdade,
com o mesmo payload que usará em produção, e recebe webhook de verdade, com a mesma
política de retry. No plug-in, muda-se `RUNPOD_BASE_URL` e a chave; o código da web
não muda.

Dois modos, por `FAKE_MODE`:

- ``synthetic`` (default) — devolve os artefatos da cena sintética depois de um atraso
  configurável, simulando fila e cold start. Rápido e determinístico: é o que a CI usa.
- ``local-worker`` — executa o worker real em CPU sobre as fixtures. Lento, mas prova o
  código de verdade (DoD da D3).

O que este serviço deliberadamente NÃO faz: autenticação real, cobrança, escalonamento.
Ele existe para exercitar o contrato e os modos de falha.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","svc":"fake-runpod","msg":"%(message)s"}',
)
log = logging.getLogger("fake-runpod")


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


FAKE_MODE = os.environ.get("FAKE_MODE", "synthetic")
COLD_START_S = _env_float("FAKE_COLD_START_S", 2.0)
PROCESS_S = _env_float("FAKE_PROCESS_S", 6.0)

# Política real do RunPod: exige HTTP 200, faz 2 retries espaçados de 10 s.
# Reproduzida aqui porque é justamente o que queremos exercitar — inclusive o caso
# em que o webhook falha e a reconciliação por polling precisa salvar o job.
WEBHOOK_RETRIES = int(os.environ.get("FAKE_WEBHOOK_RETRIES", "2"))
WEBHOOK_RETRY_DELAY_S = _env_float("FAKE_WEBHOOK_RETRY_DELAY_S", 10.0)

# Interruptor para testar a reconciliação: com isto ligado, o webhook nunca é chamado,
# e o job só é descoberto pelo polling da web.
DROP_WEBHOOKS = os.environ.get("FAKE_DROP_WEBHOOKS", "false").lower() == "true"


class JobStatus(StrEnum):
    IN_QUEUE = "IN_QUEUE"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass
class Job:
    id: str
    status: JobStatus = JobStatus.IN_QUEUE
    payload: dict[str, Any] = field(default_factory=dict)
    webhook: str | None = None
    output: dict[str, Any] | None = None
    error: str | None = None


JOBS: dict[str, Job] = {}


class RunRequest(BaseModel):
    """Formato do `POST /run` do RunPod."""

    input: dict[str, Any]
    webhook: str | None = None
    policy: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="fake-runpod", version="0.1.0")


# ---------------------------------------------------------------------------
# Execução do job
# ---------------------------------------------------------------------------


async def _deliver_webhook(url: str, body: dict[str, Any]) -> None:
    """Entrega o webhook com a política do RunPod: exige 200, 2 retries de 10 s."""
    if DROP_WEBHOOKS:
        log.warning("FAKE_DROP_WEBHOOKS ligado — webhook do job %s descartado", body.get("id"))
        return

    attempts = WEBHOOK_RETRIES + 1
    async with httpx.AsyncClient(timeout=10.0) as http:
        for attempt in range(1, attempts + 1):
            try:
                res = await http.post(url, json=body)
                if res.status_code == 200:
                    log.info("webhook entregue (job=%s, tentativa=%d)", body.get("id"), attempt)
                    return
                log.warning(
                    "webhook recusado com HTTP %d (job=%s, tentativa=%d/%d)",
                    res.status_code,
                    body.get("id"),
                    attempt,
                    attempts,
                )
            except httpx.HTTPError as exc:
                log.warning(
                    "webhook falhou (job=%s, tentativa=%d/%d): %s",
                    body.get("id"),
                    attempt,
                    attempts,
                    exc,
                )
            if attempt < attempts:
                await asyncio.sleep(WEBHOOK_RETRY_DELAY_S)

    # Desistir aqui é o comportamento correto e esperado: a rede de segurança é a
    # reconciliação por polling do lado da web, não mais retries daqui.
    log.error("webhook desistiu após %d tentativas (job=%s)", attempts, body.get("id"))


async def _run_job(job_id: str) -> None:
    job = JOBS[job_id]
    try:
        # Cold start: no RunPod real é a subida do container. Simulado para que a
        # página de status precise lidar com a espera de verdade.
        await asyncio.sleep(COLD_START_S)
        job.status = JobStatus.IN_PROGRESS
        log.info("job %s em execução (modo=%s)", job_id, FAKE_MODE)

        if FAKE_MODE == "local-worker":
            from modes.local_worker import run_local_worker

            job.output = await run_local_worker(job.payload)
        else:
            from modes.synthetic import run_synthetic

            job.output = await run_synthetic(job.payload, process_seconds=PROCESS_S)

        job.status = JobStatus.COMPLETED
        log.info("job %s concluído", job_id)
    # Captura ampla de propósito: a falha de um job precisa virar ESTADO consultável,
    # não derrubar o serviço nem sumir. É assim que o RunPod real se comporta.
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.error = str(exc)
        log.exception("job %s falhou", job_id)

    if job.webhook:
        await _deliver_webhook(
            job.webhook,
            {
                "id": job.id,
                "status": job.status.value,
                "output": job.output,
                "error": job.error,
            },
        )


# ---------------------------------------------------------------------------
# Rotas — espelham o contrato do RunPod
# ---------------------------------------------------------------------------


@app.post("/v2/{endpoint_id}/run")
async def run(endpoint_id: str, req: RunRequest, background: BackgroundTasks) -> dict[str, str]:
    job = Job(id=str(uuid.uuid4()), payload=req.input, webhook=req.webhook)
    JOBS[job.id] = job
    background.add_task(_run_job, job.id)
    log.info("job %s enfileirado no endpoint %s", job.id, endpoint_id)
    return {"id": job.id, "status": job.status.value}


@app.get("/v2/{endpoint_id}/status/{job_id}")
async def status(endpoint_id: str, job_id: str) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job não encontrado")
    return {
        "id": job.id,
        "status": job.status.value,
        "output": job.output,
        "error": job.error,
    }


@app.get("/v2/{endpoint_id}/health")
async def endpoint_health(endpoint_id: str) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for j in JOBS.values():
        counts[j.status.value] = counts.get(j.status.value, 0) + 1
    return {"jobs": counts, "workers": {"idle": 0, "ready": 1}}


@app.get("/health")
async def health() -> dict[str, str]:
    """Healthcheck do próprio sósia — é o que o compose observa."""
    return {"status": "ok", "mode": FAKE_MODE}
