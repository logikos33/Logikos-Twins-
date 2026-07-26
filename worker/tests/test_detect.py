"""Testes da detecção ancorada (spec D5) — com gabarito exato da cena sintética.

O critério central: a busca "onde está X?" precisa achar o objeto plantado com erro
menor que 5% do tamanho da cena. Aqui isso é um número, não uma impressão.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from pipeline import detect

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

pytestmark = pytest.mark.skipif(
    not (FIXTURES / "npz").exists(),
    reason="fixture ausente — rode `make fixture` antes",
)


@pytest.fixture(scope="module")
def scene_meta() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((FIXTURES / "meta.json").read_text())
    return loaded


@pytest.fixture(scope="module")
def anchored_and_clusters(
    scene_meta: dict[str, Any],
) -> tuple[list[detect.AnchoredDetection], list[detect.Cluster]]:
    objects = detect.load_scene_objects(FIXTURES / "meta.json")
    detector = detect.SyntheticDetector(objects)
    return detect.detect_over_keyframes(FIXTURES / "npz", scene_meta["keyframes"], detector)


def distance_to_box(point: np.ndarray, center: np.ndarray, size: np.ndarray) -> float:
    """Distância de um ponto à CAIXA do objeto (0 se dentro).

    A métrica honesta para "onde está X?": a desprojeção do centro da bbox ancora
    na SUPERFÍCIE visível do objeto, não no centroide — um armário de 2 m de altura
    visto sempre do mesmo lado ancora na face da frente, e isso é o comportamento
    certo do produto (o pin aponta o objeto). Medir contra o centroide penalizaria
    exatamente os objetos grandes que o produto mais precisa apontar bem.
    """
    half = size / 2
    delta = np.abs(point - center) - half
    return float(np.linalg.norm(np.maximum(delta, 0.0)))


class TestDesprojecao:
    def test_objetos_plantados_sao_achados_no_lugar_certo(
        self,
        anchored_and_clusters: tuple[list[detect.AnchoredDetection], list[detect.Cluster]],
        scene_meta: dict[str, Any],
    ) -> None:
        """O critério de aceite da D5: pin a < 5% do tamanho da cena DO OBJETO."""
        _, clusters = anchored_and_clusters
        room = scene_meta["room"]
        scene_size = float(np.linalg.norm([room["x"], room["y"], room["z"]]))
        tolerance = scene_size * 0.05

        found_labels = {c.label for c in clusters}
        for name, obj in scene_meta["objects"].items():
            assert name in found_labels, f"objeto plantado '{name}' não foi detectado"
            cluster = max((c for c in clusters if c.label == name), key=lambda c: c.count)
            err = distance_to_box(
                np.array(cluster.center), np.array(obj["center"]), np.array(obj["size"])
            )
            assert err < tolerance, (
                f"pin de '{name}' a {err:.3f} u do objeto (tolerância {tolerance:.3f})"
            )

    def test_centro_sem_depth_devolve_none(self) -> None:
        depth = np.zeros((10, 10), dtype=np.float32)  # tudo inválido
        K = np.eye(3, dtype=np.float32)
        c2w = np.eye(4, dtype=np.float32)[:3, :]
        assert detect.unproject_bbox_center((2, 2, 8, 8), depth, K, c2w) is None

    def test_bbox_fora_da_imagem_devolve_none(self) -> None:
        depth = np.ones((10, 10), dtype=np.float32)
        K = np.eye(3, dtype=np.float32)
        c2w = np.eye(4, dtype=np.float32)[:3, :]
        assert detect.unproject_bbox_center((50, 50, 60, 60), depth, K, c2w) is None


class TestCluster:
    def _det(
        self, label: str, pos: tuple[float, float, float], score: float = 0.9
    ) -> detect.AnchoredDetection:
        return detect.AnchoredDetection(
            frame_idx=0, label=label, score=score, bbox=(0, 0, 1, 1), world_pos=pos
        )

    def test_mesmo_objeto_em_varios_frames_vira_um_cluster(self) -> None:
        dets = [self._det("mesa", (1.0 + i * 0.01, 1.0, 0.4)) for i in range(5)]
        clusters = detect.cluster_detections(dets, radius=0.5)
        assert len(clusters) == 1
        assert clusters[0].count == 5

    def test_rotulos_diferentes_nunca_se_fundem(self) -> None:
        dets = [self._det("mesa", (1.0, 1.0, 0.4)), self._det("armario", (1.0, 1.0, 0.4))]
        clusters = detect.cluster_detections(dets, radius=1.0)
        assert len(clusters) == 2

    def test_objetos_distantes_do_mesmo_rotulo_sao_clusters_separados(self) -> None:
        dets = [self._det("cadeira", (0.0, 0.0, 0.0)), self._det("cadeira", (5.0, 0.0, 0.0))]
        clusters = detect.cluster_detections(dets, radius=0.5)
        assert len(clusters) == 2

    def test_best_frame_e_o_de_maior_score(self) -> None:
        dets = [
            detect.AnchoredDetection(1, "mesa", 0.6, (0, 0, 1, 1), (1.0, 1.0, 0.4)),
            detect.AnchoredDetection(7, "mesa", 0.95, (0, 0, 1, 1), (1.01, 1.0, 0.4)),
        ]
        clusters = detect.cluster_detections(dets, radius=0.5)
        assert clusters[0].best_frame == 7

    def test_oclusao_impede_deteccao_fantasma(self, scene_meta: dict[str, Any]) -> None:
        """O SyntheticDetector não pode 'ver' um objeto atrás de outro/parede."""
        objects = detect.load_scene_objects(FIXTURES / "meta.json")
        # Objeto fantasma FORA da sala: projetaria na imagem, mas o depth real da
        # parede na frente denuncia — não pode ser detectado.
        objects["fantasma"] = {"center": [12.0, 2.0, 1.0], "size": [0.5, 0.5, 0.5]}
        detector = detect.SyntheticDetector(objects)
        _, clusters = detect.detect_over_keyframes(
            FIXTURES / "npz", scene_meta["keyframes"], detector
        )
        assert "fantasma" not in {c.label for c in clusters}
