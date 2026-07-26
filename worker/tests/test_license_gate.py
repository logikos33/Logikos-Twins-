"""O gate de licença precisa reprovar de verdade — não só existir.

Um gate que nunca foi visto falhando é indistinguível de um gate quebrado. Estes testes
provam as duas direções: passa no repositório como está, e reprova quando alguém
reintroduz o ultralytics.
"""

from __future__ import annotations

from pathlib import Path

import license_gate


def test_repositorio_atual_passa() -> None:
    assert license_gate.check_dependency_files() == []
    assert license_gate.check_imports() == []


def test_reprova_pacote_agpl_em_requirements(tmp_path: Path, monkeypatch) -> None:
    fake_repo = tmp_path
    (fake_repo / "worker").mkdir()
    (fake_repo / "worker" / "requirements.txt").write_text(
        "numpy==1.26.4\nultralytics==8.3.0  # tentativa de reintrodução\n"
    )
    monkeypatch.setattr(license_gate, "REPO", fake_repo)

    problems = license_gate.check_dependency_files()
    assert len(problems) == 1
    assert "ultralytics" in problems[0]
    assert "AGPL" in problems[0]


def test_reprova_import_agpl_no_codigo(tmp_path: Path, monkeypatch) -> None:
    fake_repo = tmp_path
    (fake_repo / "worker").mkdir()
    (fake_repo / "worker" / "detector.py").write_text(
        "from ultralytics import YOLO\n\nmodel = YOLO('yolov8n.pt')\n"
    )
    monkeypatch.setattr(license_gate, "REPO", fake_repo)

    problems = license_gate.check_imports()
    assert len(problems) == 1
    assert "detector.py" in problems[0]


def test_comentario_mencionando_pacote_banido_nao_reprova(tmp_path: Path, monkeypatch) -> None:
    """Citar o nome numa nota não é usar a biblioteca — o gate não pode virar folclore."""
    fake_repo = tmp_path
    (fake_repo / "worker").mkdir()
    (fake_repo / "worker" / "notas.py").write_text(
        "# Não usar ultralytics aqui: AGPL. Ver ADR-0005.\nX = 1\n"
    )
    monkeypatch.setattr(license_gate, "REPO", fake_repo)

    assert license_gate.check_imports() == []
