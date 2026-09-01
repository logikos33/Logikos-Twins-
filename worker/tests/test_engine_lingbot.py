"""Testes do motor residente (bloco 1) — núcleo puro, sem torch/GPU.

O que dá para provar sem GPU: o mapeamento config → kwargs do construtor
(espelho do demo.py do pin), as regras de keyframe/modo (limite de 320 views do
RoPE), a contagem de frames armazenados na KV cache e o escritor de NPZ — que
corrige o landmine do batch_demo (images float [0,1] viravam pixels pretos no
`.astype(np.uint8)` do npz_to_artifacts).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from engine import lingbot
from pipeline import npz_to_artifacts as n2a


class TestConfigParaKwargs:
    def test_espelha_o_load_model_do_demo(self) -> None:
        cfg = lingbot.EngineConfig(num_scale_frames=8, camera_num_iterations=4)
        kw = lingbot.model_kwargs(cfg)
        assert kw["kv_cache_scale_frames"] == 8
        assert kw["camera_num_iterations"] == 4
        assert kw["use_sdpa"] is False  # FlashInfer é o backend padrão do motor
        assert kw["enable_point"] is False  # desprojeção de depth, como o viewer
        assert kw["kv_cache_cross_frame_special"] is True
        assert kw["kv_cache_include_scale_frames"] is True
        assert kw["img_size"] == 518
        assert kw["max_frame_num"] == 1024

    def test_flags_de_proveniencia_carregam_os_efetivos(self) -> None:
        cfg = lingbot.EngineConfig()
        flags = lingbot.flags_for_provenance(cfg, kf_interval=7, mode="windowed")
        assert flags["effective_keyframe_interval"] == 7
        assert flags["effective_mode"] == "windowed"
        assert "model_path" not in flags  # caminho de arquivo não é flag


class TestRegrasDeKeyframeEModo:
    def test_video_de_120s_fica_no_default(self) -> None:
        # 120 s × 10 fps = 1.200 frames; com interval 4 → 306 armazenados ≤ 320.
        cfg = lingbot.EngineConfig()
        assert lingbot.effective_keyframe_interval(1200, cfg) == 4

    def test_acima_de_320_por_intervalo_o_teto_do_rope_manda(self) -> None:
        # 2.000 frames / 4 = 500 keyframes > 320 → sobe para ceil(2000/320) = 7.
        cfg = lingbot.EngineConfig()
        assert lingbot.effective_keyframe_interval(2000, cfg) == 7

    def test_video_curto_nao_mexe(self) -> None:
        cfg = lingbot.EngineConfig()
        assert lingbot.effective_keyframe_interval(300, cfg) == 4

    def test_windowed_automatico_so_acima_de_3000(self) -> None:
        cfg = lingbot.EngineConfig()
        assert lingbot.select_mode(3000, cfg) == "streaming"
        assert lingbot.select_mode(3001, cfg) == "windowed"

    def test_windowed_explicito_e_respeitado(self) -> None:
        cfg = lingbot.EngineConfig(mode="windowed")
        assert lingbot.select_mode(100, cfg) == "windowed"

    def test_contagem_de_frames_na_kv_cache(self) -> None:
        # 8 de escala + ceil(1192/4) = 306 — é o número que a proveniência reporta.
        assert lingbot.count_stored_frames(1200, 4, 8) == 306
        assert lingbot.count_stored_frames(10, 1, 8) == 10  # interval 1 = todos
        assert lingbot.count_stored_frames(5, 4, 8) == 5  # menos que os de escala


class TestEscritorDeNpz:
    def _write(self, tmp_path: Path, image: np.ndarray) -> Path:
        h, w = 6, 8
        return lingbot.write_frame_npz(
            tmp_path,
            0,
            world_points=np.ones((h, w, 3), dtype=np.float64),
            world_points_conf=np.full((h, w), 2.0),
            depth=np.ones((h, w, 1)),
            depth_conf=np.full((h, w, 1), 2.0),
            image=image,
            extrinsic_c2w=np.eye(4)[:3],
            intrinsic=np.eye(3),
        )

    def test_imagem_float_01_vira_uint8_e_nao_preto(self, tmp_path: Path) -> None:
        """O landmine do batch_demo: float [0,1] + astype(uint8) = tudo preto."""
        img = np.full((3, 6, 8), 0.5, dtype=np.float32)  # cinza médio
        path = self._write(tmp_path, img)
        frame = n2a.load_frame(path)
        assert frame.image.dtype == np.uint8
        assert int(frame.image.mean()) in range(120, 135)  # ~128, não 0

    def test_uint8_passa_intacto(self, tmp_path: Path) -> None:
        img = np.full((3, 6, 8), 200, dtype=np.uint8)
        frame = n2a.load_frame(self._write(tmp_path, img))
        assert int(frame.image[0, 0, 0]) == 200

    def test_schema_completo_para_todos_os_consumidores(self, tmp_path: Path) -> None:
        """npz_to_artifacts, detect e aruco_scale leem chaves diferentes —
        o NPZ precisa de todas (o mesmo conjunto da fixture sintética)."""
        path = self._write(tmp_path, np.zeros((3, 6, 8), dtype=np.uint8))
        data = np.load(path)
        assert set(data.files) == {
            "world_points",
            "world_points_conf",
            "depth",
            "depth_conf",
            "images",
            "extrinsic",
            "intrinsic",
        }
        assert data["extrinsic"].shape == (3, 4)
        assert data["depth"].shape == (6, 8, 1)
        assert data["world_points"].dtype == np.float32
