"""Teste geométrico da cena sintética — a regressão permanente do projeto.

A fixture só serve como instrumento de teste da medição (D4) e da desprojeção (D5) se a
geometria dela for exata. Estes testes provam que a sala tem as dimensões declaradas, que
os objetos estão onde foram plantados, e que os NPZs cumprem o schema do motor —
inclusive a consistência interna desprojeção(depth, K, c2w) == world_points, que é
exatamente a conta que a D5 faz para ancorar detecções.

A fixture é gerada por `make fixture`; se não existir, os testes se pulam com instrução.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

pytestmark = pytest.mark.skipif(
    not (FIXTURES / "meta.json").exists(),
    reason="fixture ausente — rode `make fixture` antes",
)


@pytest.fixture(scope="module")
def meta() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads((FIXTURES / "meta.json").read_text())
    return loaded


@pytest.fixture(scope="module")
def cloud() -> np.ndarray:
    """Lê o PLY binário de volta — valida o formato E fornece os pontos."""
    raw = (FIXTURES / "cloud_preview.ply").read_bytes()
    header_end = raw.index(b"end_header\n") + len(b"end_header\n")
    header = raw[:header_end].decode("ascii")
    assert "format binary_little_endian 1.0" in header
    n = int(
        next(
            line.split()[-1]
            for line in header.splitlines()
            if line.startswith("element vertex")
        )
    )
    record = np.frombuffer(
        raw[header_end:], dtype=[("xyz", np.float32, 3), ("rgb", np.uint8, 3)], count=n
    )
    return record["xyz"]


class TestDimensoesDaSala:
    def test_bounding_box_bate_com_o_declarado(
        self, cloud: np.ndarray, meta: dict[str, Any]
    ) -> None:
        room = meta["room"]
        mins = cloud.min(axis=0)
        maxs = cloud.max(axis=0)
        # Tolerância de 1%: amostragem aleatória nunca cai exatamente na borda.
        assert mins[0] == pytest.approx(0.0, abs=room["x"] * 0.01)
        assert maxs[0] == pytest.approx(room["x"], rel=0.01)
        assert mins[1] == pytest.approx(0.0, abs=room["y"] * 0.01)
        assert maxs[1] == pytest.approx(room["y"], rel=0.01)
        assert maxs[2] == pytest.approx(room["z"], rel=0.01)

    def test_parede_tem_6_unidades(self, cloud: np.ndarray) -> None:
        """O caso da spec: medir a parede maior tem que dar 6,0 ± 2%."""
        wall = cloud[cloud[:, 1] < 0.02]  # pontos na parede y=0
        length = wall[:, 0].max() - wall[:, 0].min()
        assert length == pytest.approx(6.0, rel=0.02)


class TestObjetosPlantados:
    def test_cada_objeto_tem_pontos_no_lugar_declarado(
        self, cloud: np.ndarray, meta: dict[str, Any]
    ) -> None:
        for name, obj in meta["objects"].items():
            center = np.array(obj["center"])
            size = np.array(obj["size"])
            half = size / 2 + 0.02
            inside = np.all(np.abs(cloud - center) <= half, axis=1)
            assert inside.sum() > 200, f"objeto '{name}' sem pontos onde foi plantado"


class TestSchemaNpz:
    """O contrato do plano §3.3 — as chaves e formas que o worker (D3) vai consumir."""

    def test_chaves_e_formas(self) -> None:
        frame = np.load(FIXTURES / "npz" / "frame_000000.npz")
        h, w = frame["depth"].shape[:2]
        assert frame["world_points"].shape == (h, w, 3)
        assert frame["world_points_conf"].shape == (h, w)
        assert frame["depth"].shape == (h, w, 1)
        assert frame["depth_conf"].shape == (h, w, 1)
        assert frame["extrinsic"].shape == (3, 4)
        assert frame["intrinsic"].shape == (3, 3)
        assert frame["images"].shape == (3, h, w)

    def test_conf_exercita_o_filtro(self) -> None:
        """O filtro do worker é conf ≥ 1.5 — a fixture tem valores dos dois lados."""
        frame = np.load(FIXTURES / "npz" / "frame_000000.npz")
        conf = frame["world_points_conf"]
        assert (conf >= 1.5).any()
        assert (conf < 1.5).any()

    def test_desprojecao_reconstroi_world_points(self) -> None:
        """A conta central da D5: (u,v,depth) → K⁻¹ → c2w ≡ world_points.

        Se esta identidade não valer na fixture, a desprojeção de detecções nunca
        vai funcionar em dados reais.
        """
        frame = np.load(FIXTURES / "npz" / "frame_000010.npz")
        depth = frame["depth"][..., 0]
        K = frame["intrinsic"]
        c2w = frame["extrinsic"]
        wp = frame["world_points"]
        valid = frame["world_points_conf"] >= 1.5

        vs, us = np.nonzero(valid)
        # Amostra para o teste ser rápido; determinística para ser reprodutível.
        idx = np.linspace(0, len(vs) - 1, 500).astype(int)
        vs, us = vs[idx], us[idx]

        z = depth[vs, us]
        pix = np.stack([us + 0.5, vs + 0.5, np.ones_like(z)])  # centro do pixel
        cam = np.linalg.inv(K) @ pix * z  # 3×N no referencial da câmera
        world = (c2w[:, :3] @ cam) + c2w[:, 3:4]

        err = np.linalg.norm(world.T - wp[vs, us], axis=1)
        # Meio pixel de quantização a ~2 unidades de distância ≈ 0,01 u.
        assert np.median(err) < 0.02, f"desprojeção divergiu: mediana {np.median(err):.4f}"


class TestPosesEArtefatos:
    def test_poses_json_cobre_todos_os_frames(self, meta: dict[str, Any]) -> None:
        poses = json.loads((FIXTURES / "poses.json").read_text())
        assert len(poses["frames"]) == meta["frames"]
        assert poses["keyframes"] == meta["keyframes"]
        first = poses["frames"][0]
        assert len(first["c2w"]) == 3 and len(first["c2w"][0]) == 4
        assert len(first["K"]) == 3

    def test_trajetoria_dentro_da_sala(self, meta: dict[str, Any]) -> None:
        """Câmera atravessando parede = trajetória quebrada no viewer."""
        poses = json.loads((FIXTURES / "poses.json").read_text())
        room = meta["room"]
        for f in poses["frames"]:
            x, y, z = (row[3] for row in f["c2w"])
            assert 0 < x < room["x"] and 0 < y < room["y"] and 0 < z < room["z"]

    def test_ply_dentro_do_teto_de_35mb(self) -> None:
        mb = (FIXTURES / "cloud_preview.ply").stat().st_size / 1024 / 1024
        assert mb <= 35, f"cloud_preview.ply com {mb:.1f} MB estoura o teto do ADR-0006"

    def test_keyframes_existem(self, meta: dict[str, Any]) -> None:
        for i in meta["keyframes"]:
            assert (FIXTURES / "keyframes" / f"{i}.jpg").exists()
