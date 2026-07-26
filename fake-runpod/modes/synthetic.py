"""Modo ``synthetic`` — devolve os artefatos da cena sintética.

Este é o modo padrão e o que a CI usa. Ele não roda modelo nenhum: sobe ao storage os
artefatos pré-gerados por ``scripts/make_fixture.py`` e responde no mesmo formato do
worker real.

O ponto sutil: os artefatos da cena sintética são **geometricamente honestos** — uma sala
de dimensões conhecidas por construção. É isso que permite testar medição e desprojeção
de verdade, com número esperado, em vez de só verificar que "um arquivo apareceu".

D0 entrega o esqueleto e o contrato; a fixture chega na D2.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger("fake-runpod.synthetic")

FIXTURE_DIR = Path(os.environ.get("FIXTURE_DIR", "/fixtures"))


async def run_synthetic(payload: dict[str, Any], process_seconds: float) -> dict[str, Any]:
    """Simula o processamento e devolve o mesmo formato de saída do worker real."""
    scan_id = payload.get("scan_id")
    if not scan_id:
        raise ValueError("payload sem scan_id")

    # O atraso não é enfeite: sem ele, o job termina antes de a página de status
    # renderizar, e os estados intermediários nunca seriam exercitados.
    await asyncio.sleep(process_seconds)

    from artifacts import upload_fixture_artifacts

    outputs, metrics = await asyncio.to_thread(
        upload_fixture_artifacts, str(scan_id), FIXTURE_DIR
    )
    log.info("artefatos sintéticos publicados para o scan %s", scan_id)

    return {"scan_id": scan_id, "outputs": outputs, "metrics": metrics}
