#!/usr/bin/env python3
"""Gate de licença — reprova AGPL e copyleft forte no caminho servido.

A regra de ouro 3 do PROMPT-EXECUCAO.md não é uma preferência: é o que permite entregar
este produto a um cliente sem obrigá-lo a abrir o próprio código. O caso concreto que
motiva o gate é o **ultralytics** (YOLOv5/v8/v11, AGPL-3.0) — o detector mais óbvio do
mercado, e por isso o mais fácil de alguém instalar sem pensar.

Este script é grosseiro de propósito: casa por nome de pacote nos arquivos de dependência
e por import no código-fonte. Não tenta resolver a árvore transitiva — para isso existe a
revisão de `LICENSES.md`. O objetivo é pegar a reintrodução acidental, que é o risco real.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Pacotes banidos do caminho servido, com o motivo. O motivo aparece na mensagem de
# erro — quem tropeça no gate precisa entender por que, não só que falhou.
BANNED_PACKAGES: dict[str, str] = {
    "ultralytics": "AGPL-3.0 — usar YOLOX (Apache-2.0). Ver ADR-0005.",
    "yolov5": "AGPL-3.0 (Ultralytics).",
    "yolov8": "AGPL-3.0 (Ultralytics).",
    "super-gradients": "licença restritiva para uso comercial.",
    "detectron2": "licença Apache-2.0, mas depende de componentes com restrição — avaliar caso a caso antes de liberar.",
}

# Imports banidos no código servido.
BANNED_IMPORTS: dict[str, str] = {
    "ultralytics": "AGPL-3.0 — usar YOLOX (Apache-2.0). Ver ADR-0005.",
}

# Onde procurar. `referencias/` fica de fora: é material de apoio, não código servido.
DEPENDENCY_FILES = ["worker/requirements.txt", "fake-runpod/requirements.txt"]
SOURCE_DIRS = ["worker", "fake-runpod", "scripts"]


def check_dependency_files() -> list[str]:
    problems: list[str] = []
    for rel in DEPENDENCY_FILES:
        path = REPO / rel
        if not path.exists():
            continue
        for lineno, raw in enumerate(path.read_text().splitlines(), start=1):
            line = raw.split("#")[0].strip()
            if not line:
                continue
            name = re.split(r"[=<>!\[~;]", line)[0].strip().lower()
            if name in BANNED_PACKAGES:
                problems.append(f"{rel}:{lineno} — pacote '{name}': {BANNED_PACKAGES[name]}")
    return problems


def check_imports() -> list[str]:
    problems: list[str] = []
    for directory in SOURCE_DIRS:
        root = REPO / directory
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            if py.resolve() == Path(__file__).resolve():
                continue  # este arquivo cita os nomes banidos por definição
            for lineno, line in enumerate(py.read_text().splitlines(), start=1):
                for banned, reason in BANNED_IMPORTS.items():
                    if re.match(rf"\s*(from\s+{banned}\b|import\s+{banned}\b)", line):
                        rel = py.relative_to(REPO)
                        problems.append(f"{rel}:{lineno} — import '{banned}': {reason}")
    return problems


def main() -> int:
    problems = check_dependency_files() + check_imports()
    if problems:
        print("\n✗ Gate de licença REPROVOU — copyleft forte no caminho servido:\n")
        for p in problems:
            print(f"  · {p}")
        print(
            "\nPermitido: Apache-2.0, MIT, BSD-3. Se a única opção para algo for copyleft,"
            " pare e pergunte ao Vitor — não contorne o gate.\n"
        )
        return 1

    print("✓ Gate de licença: nenhum pacote ou import copyleft forte no caminho servido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
