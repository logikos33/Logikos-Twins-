"""Escala de detecção do blur (issue #29) — lógica pura, sem o modelo YuNet."""

from __future__ import annotations

from pipeline.blur_faces import DETECT_MAX_SIDE, detect_scale_for


class TestDetectScale:
    def test_1080p_desce_para_640_no_maior_lado(self) -> None:
        s = detect_scale_for(1920, 1080)
        assert abs(s - 640 / 1920) < 1e-9
        assert round(1920 * s) == DETECT_MAX_SIDE

    def test_retrato_usa_o_maior_lado(self) -> None:
        s = detect_scale_for(1080, 1920)
        assert round(1920 * s) == DETECT_MAX_SIDE

    def test_imagem_pequena_nao_e_ampliada(self) -> None:
        assert detect_scale_for(518, 294) == 1.0
        assert detect_scale_for(640, 640) == 1.0

    def test_caixa_escalada_volta_ao_tamanho_original(self) -> None:
        # Um rosto em (100, 50, 32, 32) no frame 640 corresponde a (300, 150,
        # 96, 96) no 1080p (escala 1/3) — a conta que o blur aplica.
        s = detect_scale_for(1920, 1080)
        assert [int(v / s) for v in (100.0, 50.0, 32.0, 32.0)] == [300, 150, 96, 96]
