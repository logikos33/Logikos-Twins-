"""Testes da normalização de vídeo — exigem ffmpeg no PATH (imagem do worker tem;
na máquina de dev, `brew install ffmpeg`). Os vídeos de teste são GERADOS pelo
próprio ffmpeg (testsrc), então não há binário versionado."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from pipeline import normalize

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None,
    reason="ffmpeg ausente — brew install ffmpeg",
)


def _make_test_video(
    path: Path, *, container: str, with_audio: bool, rotate: bool = False
) -> Path:
    """Gera 2 s de vídeo de teste (testsrc) no container pedido.

    A rotação usa `-display_rotation` num segundo passo com `-c copy`: é o que grava
    a Display Matrix de verdade — o mecanismo que celulares usam. A tag
    `-metadata rotate=90` é silenciosamente descartada pelo muxer moderno (medido).
    """
    cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15"]
    if with_audio:
        cmd += ["-f", "lavfi", "-i", "sine=frequency=440:duration=2"]
    if container == "webm":
        cmd += ["-c:v", "libvpx-vp9", "-b:v", "200k"]
        if with_audio:
            cmd += ["-c:a", "libopus"]
    else:
        cmd += ["-c:v", "libx264"]
        if with_audio:
            cmd += ["-c:a", "aac"]

    if not rotate:
        subprocess.run([*cmd, str(path)], check=True, capture_output=True)
        return path

    plain = path.with_name(f"plain_{path.name}")
    subprocess.run([*cmd, str(plain)], check=True, capture_output=True)
    subprocess.run(
        ["ffmpeg", "-y", "-display_rotation", "90", "-i", str(plain), "-c", "copy", str(path)],
        check=True,
        capture_output=True,
    )
    return path


class TestNormalize:
    def test_webm_com_audio_vira_mp4_sem_audio(self, tmp_path: Path) -> None:
        """O caso do Chrome Android: WebM/VP9 + áudio → MP4/H.264 mudo (decisão 8)."""
        src = _make_test_video(tmp_path / "in.webm", container="webm", with_audio=True)
        assert normalize.has_audio(src)

        dst = normalize.normalize(src, tmp_path / "out.mp4")

        info = normalize.probe(dst)
        video_streams = [s for s in info["streams"] if s["codec_type"] == "video"]
        assert video_streams[0]["codec_name"] == "h264"
        assert not normalize.has_audio(dst)

    def test_mp4_ja_normalizado_continua_valido(self, tmp_path: Path) -> None:
        """O caso do Safari: MP4/H.264 entra, MP4/H.264 sai (sem áudio)."""
        src = _make_test_video(tmp_path / "in.mp4", container="mp4", with_audio=True)
        dst = normalize.normalize(src, tmp_path / "out.mp4")
        assert not normalize.has_audio(dst)
        assert normalize.video_duration_s(dst) == pytest.approx(2.0, abs=0.3)

    def test_rotacao_de_metadados_e_materializada(self, tmp_path: Path) -> None:
        """Vídeo 'em pé' (rotate=90): a saída tem os PIXELS rotacionados, não a tag —
        porque o OpenCV do motor ignora a tag (plano §9.15)."""
        src = _make_test_video(
            tmp_path / "in.mp4", container="mp4", with_audio=False, rotate=True
        )
        dst = normalize.normalize(src, tmp_path / "out.mp4")

        info = normalize.probe(dst)
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        # 320×240 com rotate=90 → 240×320 de fato, e sem tag de rotação restante.
        assert (v["width"], v["height"]) == (240, 320)
        side_data = v.get("side_data_list", [])
        assert not any(d.get("rotation") for d in side_data)

    def test_arquivo_corrompido_falha_alto(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad.mp4"
        bad.write_bytes(b"isto nao e um video")
        with pytest.raises(normalize.FfmpegError):
            normalize.normalize(bad, tmp_path / "out.mp4")
