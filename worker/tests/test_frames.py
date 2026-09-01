"""Extração de frames + ordem blur→motor (bloco 1). Exige ffmpeg no PATH."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from pipeline import frames

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None,
    reason="ffmpeg ausente — brew install ffmpeg",
)


def _make_test_video(path: Path, seconds: int = 2, rate: int = 15) -> Path:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=duration={seconds}:size=320x240:rate={rate}",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


class TestExtracao:
    def test_extrai_na_taxa_pedida(self, tmp_path: Path) -> None:
        video = _make_test_video(tmp_path / "v.mp4", seconds=2)
        paths = frames.extract_frames(video, tmp_path / "frames", fps=5)
        # 2 s a 5 fps → ~10 frames (ffmpeg pode variar ±1 na borda).
        assert 9 <= len(paths) <= 11
        assert paths[0].name == "frame_000001.jpg"

    def test_video_ilegivel_e_erro_legivel(self, tmp_path: Path) -> None:
        bogus = tmp_path / "nada.mp4"
        bogus.write_bytes(b"isso nao e video")
        with pytest.raises(frames.FrameExtractionError):
            frames.extract_frames(bogus, tmp_path / "frames", fps=5)


class TestOrdemBlurAntesDoMotor:
    """A promessa do bloco 1: nenhum pixel de rosto chega ao motor."""

    def test_blur_roda_depois_da_extracao_e_antes_de_devolver(self, tmp_path: Path) -> None:
        ordem: list[str] = []

        def fake_extract(video: Path, out: Path, fps: int) -> list[Path]:
            ordem.append("extract")
            return [out / "frame_000001.jpg"]

        def fake_blur(d: Path) -> int:
            ordem.append("blur")
            return 3

        _out, timings = frames.prepare_frames(
            tmp_path / "v.mp4",
            tmp_path / "frames",
            fps=10,
            blur=True,
            _extract=fake_extract,
            _blur_dir=fake_blur,
        )
        assert ordem == ["extract", "blur"]
        assert "extract_s" in timings and "blur_s" in timings

    def test_sem_blur_nao_ha_blur(self, tmp_path: Path) -> None:
        ordem: list[str] = []

        def fake_extract(video: Path, out: Path, fps: int) -> list[Path]:
            ordem.append("extract")
            return []

        def fake_blur(d: Path) -> int:  # pragma: no cover - não deve rodar
            ordem.append("blur")
            return 0

        _, timings = frames.prepare_frames(
            tmp_path / "v.mp4",
            tmp_path / "frames",
            fps=10,
            blur=False,
            _extract=fake_extract,
            _blur_dir=fake_blur,
        )
        assert ordem == ["extract"]
        assert "blur_s" not in timings
