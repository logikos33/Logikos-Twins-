"""Identidade da imagem: `python3 version.py` → JSON de proveniência.

Usado no smoke do endpoint e no aceite do piloto: worker_commit, engine_commit
e image_sha vêm dos envs gravados no build; os sha256 esperados dos pesos são
as constantes congeladas — nada aqui depende de GPU ou de rede.
"""

from __future__ import annotations

import json
import os
import sys

from engine.weights import EXPECTED_SHA256


def version_info() -> dict[str, object]:
    return {
        "worker_commit": os.environ.get("WORKER_COMMIT", "unknown"),
        "engine_commit": os.environ.get("ENGINE_COMMIT", "unknown"),
        "image_sha": os.environ.get("IMAGE_SHA", "unknown"),
        "expected_weights_sha256": EXPECTED_SHA256,
    }


if __name__ == "__main__":
    sys.stdout.write(json.dumps(version_info(), indent=2) + "\n")
