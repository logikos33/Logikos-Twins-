"""Escala métrica automática por marcador ArUco (spec D6).

O usuário imprime o marcador (DICT_4X4_50 id 0, lado de 150 mm — o PDF da página de
gravação), deixa-o plano no chão e filma normalmente. Aqui: detecta-se o marcador nos
keyframes, os 4 cantos são desprojetados com depth+K+c2w (a mesma conta validada da
D5), o lado em unidades de cena sai da mediana dos 4 lados do quadrilátero 3D, e o
fator = lado_real_m / lado_cena. Entre vistas, a MEDIANA dos fatores — uma detecção
ruim não contamina o resultado.

Sem marcador → devolve None e nada muda (a calibração manual da D4 continua valendo).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

from pipeline.detect import unproject_bbox_center

log = logging.getLogger("worker.aruco")

MARKER_SIDE_M_DEFAULT = 0.15  # lado impresso no PDF (A4)


def _unproject_corner(
    corner: tuple[float, float],
    depth: np.ndarray,
    K: np.ndarray,
    c2w: np.ndarray,
    valid: np.ndarray,
) -> tuple[float, float, float] | None:
    """Canto (u, v) → mundo, com a mesma janela-mediana robusta da desprojeção D5."""
    u, v = corner
    # bbox degenerada de 1 px centrada no canto reaproveita a lógica testada.
    return unproject_bbox_center((u, v, u, v), depth, K, c2w, valid)


def detect_scale(
    npz_dir: Path,
    keyframe_indices: list[int],
    marker_side_m: float | None = None,
) -> dict[str, Any] | None:
    """Procura o marcador nos keyframes e devolve {factor, method, ...} ou None."""
    import cv2

    side_m = marker_side_m or float(
        os.environ.get("ARUCO_MARKER_SIDE_M", MARKER_SIDE_M_DEFAULT)
    )

    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    detector = cv2.aruco.ArucoDetector(dictionary)

    factors: list[float] = []
    views = 0
    for idx in keyframe_indices:
        npz_path = npz_dir / f"frame_{idx:06d}.npz"
        if not npz_path.exists():
            continue
        data = np.load(npz_path)
        image = np.transpose(data["images"], (1, 2, 0)).astype(np.uint8)
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

        corners_list, ids, _ = detector.detectMarkers(gray)
        if ids is None or len(corners_list) == 0:
            continue

        depth = data["depth"][..., 0]
        K = data["intrinsic"]
        c2w = data["extrinsic"]
        valid = data["world_points_conf"] >= 1.5

        for marker_corners in corners_list:
            pts3d = []
            for u, v in marker_corners.reshape(-1, 2):
                p = _unproject_corner((float(u), float(v)), depth, K, c2w, valid)
                if p is None:
                    break
                pts3d.append(p)
            if len(pts3d) != 4:
                continue

            arr = np.array(pts3d)
            sides = [float(np.linalg.norm(arr[i] - arr[(i + 1) % 4])) for i in range(4)]
            side_scene = float(np.median(sides))
            if side_scene <= 1e-6:
                continue
            factors.append(side_m / side_scene)
            views += 1

    if not factors:
        log.info("nenhum marcador ArUco encontrado nos keyframes")
        return None

    factor = float(np.median(factors))
    log.info("escala ArUco: fator %.4f (mediana de %d vistas)", factor, views)
    return {
        "factor": round(factor, 6),
        "method": "aruco",
        "marker_side_m": side_m,
        "views": views,
    }
