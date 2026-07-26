"""NPZs do motor → artefatos do produto (ADR-0006).

Entrada: diretório com frame_NNNNNN.npz no schema do LingBot-Map (--save_predictions).
Saída: cloud_preview.ply (binário, filtrado e downsampled), poses.json, meta.json,
keyframes/*.jpg e thumb.jpg.

O núcleo é puro (arrays entram, arrays saem); a escrita de arquivos fica nas funções
`write_*`. O downsample é por grade de voxel implementado em numpy — sem open3d — para
os testes rodarem em qualquer Python. `[TESTAR no plug-in]`: com nuvens reais de
50–200 M pontos, avaliar se o open3d (já na imagem) é necessário por memória.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger("worker.npz_to_artifacts")

CONF_MIN_DEFAULT = 1.5
TARGET_POINTS_DEFAULT = 1_800_000
PREVIEW_CAP_MB = 35.0
# 15 bytes por ponto (3×float32 + 3×uint8) + header — o teto em pontos derivado do teto
# em MB, usado como corte duro depois do downsample.
BYTES_PER_POINT = 15


@dataclass
class FrameData:
    """Conteúdo de um frame_NNNNNN.npz já carregado."""

    world_points: np.ndarray  # (H, W, 3)
    conf: np.ndarray  # (H, W)
    image: np.ndarray  # (H, W, 3) uint8
    extrinsic: np.ndarray  # (3, 4) c2w
    intrinsic: np.ndarray  # (3, 3)


@dataclass
class Artifacts:
    ply_path: Path
    poses_path: Path
    meta_path: Path
    keyframes_dir: Path
    thumb_path: Path
    metrics: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Núcleo puro
# ---------------------------------------------------------------------------


def load_frame(npz_path: Path) -> FrameData:
    data = np.load(npz_path)
    # images vem (3, H, W) do motor; internamente trabalhamos (H, W, 3).
    image = np.transpose(data["images"], (1, 2, 0)).astype(np.uint8)
    return FrameData(
        world_points=data["world_points"],
        conf=data["world_points_conf"],
        image=image,
        extrinsic=data["extrinsic"],
        intrinsic=data["intrinsic"],
    )


def collect_points(frames: list[FrameData], conf_min: float) -> tuple[np.ndarray, np.ndarray]:
    """Concatena os pontos de todos os frames, filtrados por confiança.

    O filtro é o que separa nuvem de nuvem-com-fantasmas: pontos de baixa confiança
    são ruído estrutural do motor, não detalhe fino.
    """
    pts_list: list[np.ndarray] = []
    col_list: list[np.ndarray] = []
    for f in frames:
        mask = f.conf >= conf_min
        pts_list.append(f.world_points[mask])
        col_list.append(f.image[mask])
    points = np.concatenate(pts_list).astype(np.float32)
    colors = np.concatenate(col_list).astype(np.uint8)
    return points, colors


def voxel_downsample(
    points: np.ndarray, colors: np.ndarray, target: int, max_iter: int = 8
) -> tuple[np.ndarray, np.ndarray]:
    """Downsample por grade de voxel com busca do tamanho de célula.

    O voxel é RELATIVO à bounding box (a escala da cena é arbitrária até a
    calibração — "2 cm" não significa nada aqui). A busca ajusta a célula até o
    resultado cair perto do alvo; um ponto (o primeiro) representa cada célula.
    """
    if len(points) <= target:
        return points, colors

    bbox = points.max(axis=0) - points.min(axis=0)
    diag = float(np.linalg.norm(bbox))
    origin = points.min(axis=0)

    # Chute inicial: células ~uniformes assumindo distribuição em superfície (2D):
    # n_células ∝ (diag/voxel)² — daí voxel ∝ diag/sqrt(alvo).
    voxel = diag / max(np.sqrt(target), 1.0)

    best: tuple[np.ndarray, np.ndarray] | None = None
    for _ in range(max_iter):
        keys = np.floor((points - origin) / voxel).astype(np.int64)
        # Chave única por célula → índice do primeiro ponto de cada célula.
        _, first_idx = np.unique(
            keys[:, 0] * 73856093 ^ keys[:, 1] * 19349663 ^ keys[:, 2] * 83492791,
            return_index=True,
        )
        n = len(first_idx)
        best = (points[first_idx], colors[first_idx])

        # ±15% do alvo é bom o bastante; refinamento além disso não muda nada visível.
        if 0.85 * target <= n <= 1.15 * target:
            break
        # n cresce quando o voxel encolhe (~1/voxel²): ajuste proporcional.
        voxel *= float(np.sqrt(n / target))

    assert best is not None
    return best


def enforce_size_cap(
    points: np.ndarray, colors: np.ndarray, cap_mb: float = PREVIEW_CAP_MB
) -> tuple[np.ndarray, np.ndarray]:
    """Nunca subir um preview acima do teto — corta uniformemente se preciso.

    O downsample por voxel já deve ter resolvido; isto é o cinto de segurança que
    transforma o teto de intenção em invariante (ADR-0006).
    """
    max_points = int(cap_mb * 1024 * 1024 // BYTES_PER_POINT)
    if len(points) <= max_points:
        return points, colors
    idx = np.linspace(0, len(points) - 1, max_points).astype(np.int64)
    return points[idx], colors[idx]


# ---------------------------------------------------------------------------
# Escrita
# ---------------------------------------------------------------------------


def write_ply(path: Path, points: np.ndarray, colors: np.ndarray) -> None:
    """PLY binário little-endian XYZ float32 + RGB uint8 (formato do PLYLoader)."""
    n = len(points)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        "end_header\n"
    )
    record = np.zeros(n, dtype=[("xyz", np.float32, 3), ("rgb", np.uint8, 3)])
    record["xyz"] = points
    record["rgb"] = colors
    with path.open("wb") as f:
        f.write(header.encode("ascii"))
        f.write(record.tobytes())


def write_keyframe_jpeg(path: Path, image: np.ndarray, quality: int = 70) -> None:
    """JPEG de verdade via OpenCV — o worker tem opencv na imagem (requirements)."""
    import cv2

    # OpenCV espera BGR.
    ok = cv2.imwrite(str(path), image[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"falha ao gravar keyframe {path}")


# ---------------------------------------------------------------------------
# Orquestração
# ---------------------------------------------------------------------------


def convert(
    npz_dir: Path,
    out_dir: Path,
    fps: float = 8.0,
    conf_min: float = CONF_MIN_DEFAULT,
    target_points: int = TARGET_POINTS_DEFAULT,
    keyframe_every: int = 4,
    versions: dict[str, str] | None = None,
) -> Artifacts:
    """Converte o diretório de NPZs nos artefatos finais, em out_dir."""
    t0 = time.monotonic()
    out_dir.mkdir(parents=True, exist_ok=True)
    kf_dir = out_dir / "keyframes"
    kf_dir.mkdir(exist_ok=True)

    frame_paths = sorted(npz_dir.glob("frame_*.npz"))
    if not frame_paths:
        raise FileNotFoundError(f"nenhum frame_*.npz em {npz_dir}")

    log.info("carregando %d frames de %s", len(frame_paths), npz_dir)
    frames = [load_frame(p) for p in frame_paths]

    points, colors = collect_points(frames, conf_min)
    points_raw = len(points)
    log.info("%d pontos após filtro conf >= %.2f", points_raw, conf_min)

    points, colors = voxel_downsample(points, colors, target_points)
    points, colors = enforce_size_cap(points, colors)
    log.info("%d pontos no preview", len(points))

    ply_path = out_dir / "cloud_preview.ply"
    write_ply(ply_path, points, colors)

    # poses.json — trajetória + K por frame + índices de keyframes.
    keyframe_indices = list(range(0, len(frames), keyframe_every))
    poses_payload = {
        "frames": [
            {
                "i": i,
                "t_s": round(i / fps, 3),
                "c2w": f.extrinsic.tolist(),
                "K": f.intrinsic.tolist(),
            }
            for i, f in enumerate(frames)
        ],
        "keyframes": keyframe_indices,
    }
    poses_path = out_dir / "poses.json"
    poses_path.write_text(json.dumps(poses_payload))

    for i in keyframe_indices:
        write_keyframe_jpeg(kf_dir / f"{i}.jpg", frames[i].image)

    thumb_path = out_dir / "thumb.jpg"
    write_keyframe_jpeg(thumb_path, frames[0].image, quality=60)

    total_s = time.monotonic() - t0
    h, w = frames[0].conf.shape
    ply_mb = ply_path.stat().st_size / 1024 / 1024
    metrics: dict[str, Any] = {
        "frames": len(frames),
        "resolution": [int(w), int(h)],
        "points_raw": int(points_raw),
        "points_preview": len(points),
        "cloud_preview_mb": round(ply_mb, 2),
        "convert_s": round(total_s, 2),
        "keyframes": len(keyframe_indices),
    }
    meta_path = out_dir / "meta.json"
    meta_path.write_text(
        json.dumps(
            {
                **metrics,
                "fps": fps,
                "conf_min": conf_min,
                "versions": versions or {},
            },
            indent=2,
        )
    )

    if ply_mb > PREVIEW_CAP_MB:
        # enforce_size_cap garante que isto nunca acontece; se acontecer, é bug.
        raise AssertionError(f"preview de {ply_mb:.1f} MB estourou o teto — bug no cap")

    return Artifacts(
        ply_path=ply_path,
        poses_path=poses_path,
        meta_path=meta_path,
        keyframes_dir=kf_dir,
        thumb_path=thumb_path,
        metrics=metrics,
    )
