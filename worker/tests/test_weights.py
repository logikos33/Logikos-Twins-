"""ensure_weights (bloco 2): R2 é fonte da verdade, volume é cache.

Sem rede: o downloader é injetável. O que se prova aqui é a LÓGICA — marker
barato no caminho quente, verificação plena quando falta marker, sha divergente
fatal — e que as duas cópias dos hashes congelados (engine × populate_volume)
não divergem em silêncio.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from engine import weights


def _use_tmp_targets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    mapping = {
        "MODEL_PATH": tmp_path / "lingbot-map.pt",
        "YOLOX_MODEL_PATH": tmp_path / "yolox_s.onnx",
        "YUNET_MODEL_PATH": tmp_path / "yunet.onnx",
    }
    for env, path in mapping.items():
        monkeypatch.setenv(env, str(path))
    return {p.name: p for p in mapping.values()}


def _content_for(name: str) -> bytes:
    # Conteúdo sintético cujo sha vira o "congelado" via monkeypatch.
    return f"pesos-de-mentira-{name}".encode()


def _patch_expected(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = {n: hashlib.sha256(_content_for(n)).hexdigest() for n in weights.EXPECTED_SHA256}
    monkeypatch.setattr(weights, "EXPECTED_SHA256", fake)


class TestConstantesCongeladas:
    def test_engine_e_populate_volume_nao_divergem(self) -> None:
        from populate_volume import EXPECTED_SHA256 as script_sha

        assert script_sha == weights.EXPECTED_SHA256

    def test_chave_r2_carrega_o_sha(self) -> None:
        key = weights.r2_key("lingbot-map.pt")
        assert key.startswith("models/lingbot-map/ee665103")
        assert key.endswith("/lingbot-map.pt")


class TestEnsureWeights:
    def test_baixa_verifica_e_marca_quando_ausente(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _use_tmp_targets(monkeypatch, tmp_path)
        _patch_expected(monkeypatch)
        baixados: list[str] = []

        def fake_download(name: str, dst: Path) -> None:
            baixados.append(name)
            dst.write_bytes(_content_for(name))

        status = weights.ensure_weights(download=fake_download)
        assert set(baixados) == set(weights.EXPECTED_SHA256)
        assert all(v == "downloaded" for v in status.values())
        # Marker gravado → segunda chamada é toda cache, zero downloads.
        baixados.clear()
        status = weights.ensure_weights(download=fake_download)
        assert baixados == []
        assert all(v == "cached" for v in status.values())

    def test_arquivo_sem_marker_e_verificado_de_verdade(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        targets = _use_tmp_targets(monkeypatch, tmp_path)
        _patch_expected(monkeypatch)
        # Simula volume populado pelo script antigo: arquivos certos, sem marker.
        for name, path in targets.items():
            path.write_bytes(_content_for(name))

        status = weights.ensure_weights(download=_nunca_baixa)
        assert all(v == "cached" for v in status.values())

    def test_sha_divergente_no_download_e_fatal(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _use_tmp_targets(monkeypatch, tmp_path)
        _patch_expected(monkeypatch)

        def download_corrompido(name: str, dst: Path) -> None:
            dst.write_bytes(b"bytes errados")

        with pytest.raises(RuntimeError, match="diverge"):
            weights.ensure_weights(download=download_corrompido)

    def test_arquivo_corrompido_no_volume_e_rebaixado(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        targets = _use_tmp_targets(monkeypatch, tmp_path)
        _patch_expected(monkeypatch)
        for path in targets.values():
            path.write_bytes(b"corrompido")  # sem marker, sha não bate

        def fake_download(name: str, dst: Path) -> None:
            dst.write_bytes(_content_for(name))

        status = weights.ensure_weights(download=fake_download)
        assert all(v == "downloaded" for v in status.values())


def _nunca_baixa(name: str, dst: Path) -> None:  # pragma: no cover - não deve rodar
    raise AssertionError(f"download indevido de {name}")
