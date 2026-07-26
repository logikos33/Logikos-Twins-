"""Testes do coração do worker: NPZ → artefatos (spec D3, fatia 1).

Rodam sobre a cena sintética — dimensões conhecidas, então os testes verificam
NÚMEROS, não só "arquivo existe".
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from pipeline import npz_to_artifacts as n2a

FIXTURES = Path(__file__).resolve().parent.parent.parent / "fixtures"

pytestmark = pytest.mark.skipif(
    not (FIXTURES / "npz").exists(),
    reason="fixture ausente — rode `make fixture` antes",
)


# ---------------------------------------------------------------------------
# Núcleo puro
# ---------------------------------------------------------------------------


class TestFiltroDeConfianca:
    def test_so_pontos_confiantes_sobrevivem(self) -> None:
        frame = n2a.load_frame(FIXTURES / "npz" / "frame_000000.npz")
        pts, cols = n2a.collect_points([frame], conf_min=1.5)
        expected = int((frame.conf >= 1.5).sum())
        assert len(pts) == expected
        assert len(cols) == expected

    def test_conf_min_zero_deixa_tudo_passar(self) -> None:
        frame = n2a.load_frame(FIXTURES / "npz" / "frame_000000.npz")
        pts, _ = n2a.collect_points([frame], conf_min=0.0)
        assert len(pts) == frame.conf.size


class TestVoxelDownsample:
    def test_atinge_o_alvo_com_tolerancia(self) -> None:
        rng = np.random.default_rng(1)
        pts = rng.random((200_000, 3)).astype(np.float32) * 10
        cols = rng.integers(0, 255, (200_000, 3), dtype=np.uint8)
        out_pts, out_cols = n2a.voxel_downsample(pts, cols, target=50_000)
        # ±20% do alvo (a busca aceita ±15%; folga extra para variação de seed).
        assert 40_000 <= len(out_pts) <= 60_000
        assert len(out_pts) == len(out_cols)

    def test_nao_mexe_quando_ja_esta_abaixo_do_alvo(self) -> None:
        pts = np.zeros((100, 3), dtype=np.float32)
        cols = np.zeros((100, 3), dtype=np.uint8)
        out_pts, _ = n2a.voxel_downsample(pts, cols, target=1_000)
        assert len(out_pts) == 100

    def test_pontos_resultantes_sao_subconjunto(self) -> None:
        """Downsample seleciona pontos existentes — não inventa geometria."""
        rng = np.random.default_rng(2)
        pts = rng.random((50_000, 3)).astype(np.float32)
        cols = rng.integers(0, 255, (50_000, 3), dtype=np.uint8)
        out_pts, _ = n2a.voxel_downsample(pts, cols, target=10_000)
        # Todo ponto do resultado existe no original (comparação por view de bytes).
        orig = {p.tobytes() for p in pts}
        assert all(p.tobytes() in orig for p in out_pts[:100])


class TestTetoDeTamanho:
    def test_corta_acima_do_teto(self) -> None:
        n_over = int(36 * 1024 * 1024 / n2a.BYTES_PER_POINT)  # ~36 MB de pontos
        pts = np.zeros((n_over, 3), dtype=np.float32)
        cols = np.zeros((n_over, 3), dtype=np.uint8)
        out_pts, _ = n2a.enforce_size_cap(pts, cols, cap_mb=35.0)
        assert len(out_pts) * n2a.BYTES_PER_POINT <= 35 * 1024 * 1024

    def test_nao_mexe_abaixo_do_teto(self) -> None:
        pts = np.zeros((1000, 3), dtype=np.float32)
        cols = np.zeros((1000, 3), dtype=np.uint8)
        out_pts, _ = n2a.enforce_size_cap(pts, cols)
        assert len(out_pts) == 1000


# ---------------------------------------------------------------------------
# Conversão completa sobre a fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def artifacts(tmp_path_factory: pytest.TempPathFactory) -> n2a.Artifacts:
    out = tmp_path_factory.mktemp("artifacts")
    return n2a.convert(
        FIXTURES / "npz",
        out,
        target_points=100_000,  # menor que o real para o teste ser rápido
        versions={"engine_commit": "fixture", "checkpoint": "none"},
    )


class TestConvertPontaAPonta:
    def test_ply_binario_valido_e_dentro_do_teto(self, artifacts: n2a.Artifacts) -> None:
        raw = artifacts.ply_path.read_bytes()
        assert raw.startswith(b"ply\nformat binary_little_endian 1.0\n")
        mb = len(raw) / 1024 / 1024
        assert mb <= n2a.PREVIEW_CAP_MB

    def test_geometria_sobrevive_a_conversao(self, artifacts: n2a.Artifacts) -> None:
        """A sala de 6×4×3 continua tendo 6×4×3 depois de filtro+downsample."""
        raw = artifacts.ply_path.read_bytes()
        header_end = raw.index(b"end_header\n") + len(b"end_header\n")
        n = int(
            next(
                line.split()[-1]
                for line in raw[:header_end].decode().splitlines()
                if line.startswith("element vertex")
            )
        )
        rec = np.frombuffer(
            raw[header_end:], dtype=[("xyz", np.float32, 3), ("rgb", np.uint8, 3)], count=n
        )
        pts = rec["xyz"]
        dims = pts.max(axis=0) - pts.min(axis=0)
        assert dims[0] == pytest.approx(6.0, rel=0.03)
        assert dims[1] == pytest.approx(4.0, rel=0.03)
        assert dims[2] == pytest.approx(3.0, rel=0.03)

    def test_poses_completos(self, artifacts: n2a.Artifacts) -> None:
        poses = json.loads(artifacts.poses_path.read_text())
        meta = json.loads(artifacts.meta_path.read_text())
        assert len(poses["frames"]) == meta["frames"]
        assert all(len(f["c2w"]) == 3 for f in poses["frames"])

    def test_keyframes_sao_jpeg_de_verdade(self, artifacts: n2a.Artifacts) -> None:
        """O worker grava JPEG real (a fixture usa PNG disfarçado; aqui não)."""
        first = next(artifacts.keyframes_dir.glob("*.jpg"))
        assert first.read_bytes()[:2] == b"\xff\xd8"  # magic do JPEG

    def test_metricas_coerentes(self, artifacts: n2a.Artifacts) -> None:
        m = artifacts.metrics
        assert m["frames"] == 48
        assert m["points_raw"] > m["points_preview"]
        assert m["cloud_preview_mb"] <= n2a.PREVIEW_CAP_MB

    def test_diretorio_vazio_falha_alto(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError, match="nenhum frame"):
            n2a.convert(tmp_path, tmp_path / "out")
