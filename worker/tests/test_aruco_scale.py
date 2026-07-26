"""Teste da escala automática por ArUco (spec D6) — com gabarito exato.

A fixture planta o marcador com lado de 0,55 u por construção. Declarando o lado
"real" como 0,15 m, o fator esperado é 0,15/0,55 = 0,272727… A margem de 2% cobre a
imprecisão de canto/depth, não a conta.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pipeline import aruco_scale

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

pytestmark = pytest.mark.skipif(
    not (FIXTURES / "npz").exists(),
    reason="fixture ausente — rode `make fixture` antes",
)


@pytest.fixture(scope="module")
def keyframes() -> list[int]:
    meta = json.loads((FIXTURES / "meta.json").read_text())
    kf: list[int] = meta["keyframes"]
    return kf


class TestEscalaAruco:
    def test_fator_correto_com_2_por_cento(self, keyframes: list[int]) -> None:
        meta = json.loads((FIXTURES / "meta.json").read_text())
        side_scene = meta["aruco"]["side_scene_units"]
        expected = 0.15 / side_scene

        result = aruco_scale.detect_scale(FIXTURES / "npz", keyframes, marker_side_m=0.15)
        assert result is not None, "marcador plantado não foi encontrado"
        assert result["method"] == "aruco"
        assert result["views"] >= 1
        assert result["factor"] == pytest.approx(expected, rel=0.02), (
            f"fator {result['factor']:.4f} vs esperado {expected:.4f}"
        )

    def test_sem_marcador_devolve_none(self, tmp_path: Path, keyframes: list[int]) -> None:
        """Diretório sem NPZs (ou cena sem marcador) → None, nunca um fator inventado."""
        assert aruco_scale.detect_scale(tmp_path, keyframes) is None
