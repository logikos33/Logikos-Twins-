#!/usr/bin/env python3
"""Confere que a etapa em curso tem spec escrita.

"Spec antes de código" é gate, não sugestão (PROMPT-EXECUCAO.md § Governança). Sem uma
verificação automática, a regra sobrevive exatamente até a primeira sexta-feira apertada.

A etapa em curso é declarada em STATUS.md, numa linha do tipo `**Etapa atual:** D3`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
STATUS = REPO / "STATUS.md"
SPECS = REPO / "docs" / "specs"


def current_stage() -> str | None:
    if not STATUS.exists():
        return None
    match = re.search(r"\*\*Etapa atual:\*\*\s*(D\d+(?:\.\d+)?)", STATUS.read_text())
    return match.group(1) if match else None


def main() -> int:
    stage = current_stage()
    if stage is None:
        print("✗ STATUS.md não declara a etapa atual (esperado: '**Etapa atual:** D<N>').")
        return 1

    matches = sorted(SPECS.glob(f"{stage}-*.md"))
    if not matches:
        print(f"✗ Etapa {stage} em curso, mas não existe docs/specs/{stage}-*.md.")
        print("  Escreva a spec antes de continuar o código. Modelo: docs/specs/_template.md")
        return 1

    names = ", ".join(m.name for m in matches)
    print(f"✓ Etapa {stage} tem spec: {names}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
