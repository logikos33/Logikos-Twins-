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

        # 6. Detecção ancorada (D5) — a GPU já está paga; roda no mesmo job.
        #    Falha aqui NÃO derruba o scan: o mapa sem pins ainda é um mapa.
        detection_summary = _run_detection(scan_id, npz_dir, work / "artifacts")

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
            **detection_summary,
        }
        log.info(f"scan {scan_id}: concluído em {total_s:.1f}s — {json.dumps(metrics)}")

        return {"scan_id": scan_id, "outputs": outputs, "metrics": metrics}


def _run_detection(scan_id: str, npz_dir: Path, artifacts_dir: Path) -> dict[str, Any]:
    """Detecta nos keyframes, ancora em 3D e envia os clusters à API (rota batch).

    Melhor-esforço deliberado: detector sem pesos ou API fora do ar degradam para
    "sem pins", nunca para scan em erro.
    """
    import json as _json
    import urllib.request

    from pipeline import detect

    try:
        detector_kind = os.environ.get("DETECTOR", "yolox")
        if detector_kind == "synthetic":
            objects = detect.load_scene_objects(artifacts_dir / "meta.json")
            detector: Any = detect.SyntheticDetector(objects)
        else:
            detector_kind, detector = detect.make_detector(detector_kind)

        poses = _json.loads((artifacts_dir / "poses.json").read_text())
        _, clusters = detect.detect_over_keyframes(npz_dir, poses["keyframes"], detector)

        app_url = os.environ.get("APP_INTERNAL_URL") or os.environ.get("APP_URL")
        secret = os.environ.get("RUNPOD_WEBHOOK_SECRET")
        if app_url and secret and clusters:
            payload = _json.dumps(
                {
                    "clusters": [
                        {
                            "label": c.label,
                            "score": round(c.score, 4),
                            "count": c.count,
                            "world_pos": [round(v, 4) for v in c.center],
                            "best_frame": c.best_frame,
                        }
                        for c in clusters
                    ]
                }
            ).encode()
            req = urllib.request.Request(
                f"{app_url}/api/scans/{scan_id}/detections?token={secret}",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=30)
            log.info(f"scan {scan_id}: {len(clusters)} clusters enviados ({detector_kind})")

        return {"detector": detector_kind, "detections": len(clusters)}
    except Exception as exc:
        log.warning(f"detecção pulada: {exc}")
        return {"detector": "none", "detections": 0}


if __name__ == "__main__":
    # No RunPod, o SDK gerencia o loop de jobs. Import adiado: o modo local-worker
    # importa `handler` diretamente e não precisa do SDK.
    import runpod

    runpod.serverless.start({"handler": handler})
