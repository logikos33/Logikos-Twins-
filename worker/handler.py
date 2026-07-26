"""Handler do worker — o processo que roda no RunPod Serverless (e no local-worker).

Contrato de entrada (payload do /run): {scan_id, video_url, params:{fps}}.
Contrato de saída: {scan_id, outputs:{...chaves}, metrics:{...}} — o mesmo formato que
o sósia emite e que o webhook da web valida.

Em erro, a exceção sobe: o RunPod marca FAILED e o webhook/reconciliação levam o scan
a `error` com a mensagem.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}',
)
log = logging.getLogger("worker")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    from pipeline import infer, normalize, npz_to_artifacts, transfer

    inp = job["input"]
    scan_id: str = inp["scan_id"]
    video_url: str = inp["video_url"]
    fps: int = int(inp.get("params", {}).get("fps", 8))

    t0 = time.monotonic()
    log.info(f"scan {scan_id}: iniciando (fps={fps})")

    with tempfile.TemporaryDirectory(prefix=f"scan-{scan_id[:8]}-") as tmp:
        work = Path(tmp)

        # 1. Download do vídeo bruto (URL presignada).
        raw = transfer.download_video(video_url, work / "raw_video")

        # 2. Normalização: container unificado, rotação materializada, ÁUDIO FORA
        #    (decisão 8) — e o objeto bruto no storage é substituído pela versão
        #    sem trilha.
        video = normalize.normalize(raw, work / "video.mp4")
        duration = normalize.video_duration_s(video)
        video_key = transfer.replace_raw_video(scan_id, video)

        # 3. Inferência 3D (motor real na GPU; fixtures no dev).
        npz_dir, infer_s = infer.run_inference(video, work / "out", fps)

        # 4. NPZs → artefatos do produto (ADR-0006).
        artifacts = npz_to_artifacts.convert(
            npz_dir,
            work / "artifacts",
            fps=fps,
            versions={
                "engine_commit": os.environ.get("ENGINE_COMMIT", "unknown"),
                "checkpoint": os.environ.get("MODEL_PATH", "none"),
                "worker_mode": os.environ.get("WORKER_MODE", "real"),
            },
        )

        # 5. Upload dos artefatos.
        outputs = transfer.upload_artifacts(scan_id, work / "artifacts")
        # A normalização pode ter trocado a extensão do bruto (webm→mp4); quem
        # consome (retenção da D7) precisa da chave REAL, não da original.
        outputs["video_key"] = video_key

        total_s = time.monotonic() - t0
        metrics = {
            **artifacts.metrics,
            "infer_s": round(infer_s, 2),
            "total_s": round(total_s, 2),
            "duration_s": round(duration, 2),
            # Custo estimado: só faz sentido com GPU real; o plug-in preenche a
            # tarifa via env. Zero honesto até lá.
            "cost_usd_est": round(
                (total_s / 3600) * float(os.environ.get("GPU_USD_PER_HOUR", "0")), 4
            ),
        }
        log.info(f"scan {scan_id}: concluído em {total_s:.1f}s — {json.dumps(metrics)}")

        return {"scan_id": scan_id, "outputs": outputs, "metrics": metrics}


if __name__ == "__main__":
    # No RunPod, o SDK gerencia o loop de jobs. Import adiado: o modo local-worker
    # importa `handler` diretamente e não precisa do SDK.
    import runpod

    runpod.serverless.start({"handler": handler})
