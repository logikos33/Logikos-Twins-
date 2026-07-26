"""Detecção ancorada em 3D — a tese do produto (spec D5, ADR-0005).

Pipeline: detector roda nos keyframes → o centro de cada bbox é desprojetado com
depth + K + c2w → world_pos → detecções próximas do mesmo rótulo viram um cluster.

O `Detector` é um protocol com três implementações:
- ``yolox``      — YOLOX-s ONNX (Apache-2.0, COCO), a base que funciona sozinha;
- ``recognition``— o detector da Logikos (D5.5), com fallback automático para yolox;
- ``synthetic``  — "detecta" os objetos PLANTADOS da cena sintética projetando as
  caixas conhecidas nos keyframes. Existe para testar a desprojeção e o cluster com
  gabarito exato, sem depender de pesos.

Nada aqui importa ultralytics — o gate de licença reprova (LICENSES.md).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

log = logging.getLogger("worker.detect")


@dataclass
class Detection:
    label: str
    score: float
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 em pixels


@dataclass
class AnchoredDetection:
    frame_idx: int
    label: str
    score: float
    bbox: tuple[float, float, float, float]
    world_pos: tuple[float, float, float]


class Detector(Protocol):
    def detect(self, image: np.ndarray) -> list[Detection]:
        """image: (H, W, 3) RGB uint8 → detecções em pixels dessa imagem."""
        ...


# ---------------------------------------------------------------------------
# Desprojeção — o coração da ancoragem
# ---------------------------------------------------------------------------


def unproject_bbox_center(
    bbox: tuple[float, float, float, float],
    depth: np.ndarray,  # (H, W)
    intrinsic: np.ndarray,  # (3, 3)
    c2w: np.ndarray,  # (3, 4)
    valid: np.ndarray | None = None,  # (H, W) bool
) -> tuple[float, float, float] | None:
    """Centro da bbox → ponto 3D no mundo. None se não houver depth confiável ali.

    O depth do pixel EXATO do centro pode ser inválido (borda de objeto, reflexo).
    Usa-se a MEDIANA de uma janela 5×5 de pixels válidos ao redor — robusta a
    outliers de borda, que é onde bboxes de detector costumam cair.
    """
    h, w = depth.shape
    u = int((bbox[0] + bbox[2]) / 2)
    v = int((bbox[1] + bbox[3]) / 2)
    if not (0 <= u < w and 0 <= v < h):
        return None

    half = 2
    v0, v1 = max(0, v - half), min(h, v + half + 1)
    u0, u1 = max(0, u - half), min(w, u + half + 1)
    window = depth[v0:v1, u0:u1]
    mask = window > 0
    if valid is not None:
        mask &= valid[v0:v1, u0:u1]
    if not mask.any():
        return None

    z = float(np.median(window[mask]))

    # Pixel (centro) → raio no referencial da câmera → mundo. A MESMA conta validada
    # pelo teste de identidade da fixture (mediana < 0,02 u).
    pix = np.array([u + 0.5, v + 0.5, 1.0])
    cam = np.linalg.inv(intrinsic) @ pix * z
    world = c2w[:, :3] @ cam + c2w[:, 3]
    return (float(world[0]), float(world[1]), float(world[2]))


# ---------------------------------------------------------------------------
# Cluster — N vistas do mesmo objeto viram 1 pin
# ---------------------------------------------------------------------------


@dataclass
class Cluster:
    label: str
    center: tuple[float, float, float]
    score: float  # melhor score entre as evidências
    count: int
    evidence: list[AnchoredDetection]

    @property
    def best_frame(self) -> int:
        return max(self.evidence, key=lambda d: d.score).frame_idx


def cluster_detections(detections: list[AnchoredDetection], radius: float) -> list[Cluster]:
    """Agrupamento guloso por rótulo + raio.

    Guloso (por ordem de score) em vez de DBSCAN: as cenas têm dezenas de
    detecções, não milhões — o algoritmo simples é auditável e suficiente. O
    centro do cluster é a MÉDIA das evidências, atualizada a cada adesão.
    """
    clusters: list[Cluster] = []
    for det in sorted(detections, key=lambda d: -d.score):
        home: Cluster | None = None
        for c in clusters:
            if c.label != det.label:
                continue
            dx = c.center[0] - det.world_pos[0]
            dy = c.center[1] - det.world_pos[1]
            dz = c.center[2] - det.world_pos[2]
            if (dx * dx + dy * dy + dz * dz) ** 0.5 <= radius:
                home = c
                break
        if home is None:
            clusters.append(
                Cluster(
                    label=det.label,
                    center=det.world_pos,
                    score=det.score,
                    count=1,
                    evidence=[det],
                )
            )
        else:
            home.evidence.append(det)
            home.count += 1
            home.score = max(home.score, det.score)
            n = home.count
            home.center = (
                home.center[0] + (det.world_pos[0] - home.center[0]) / n,
                home.center[1] + (det.world_pos[1] - home.center[1]) / n,
                home.center[2] + (det.world_pos[2] - home.center[2]) / n,
            )
    return clusters


# ---------------------------------------------------------------------------
# Detector sintético — gabarito exato para testes
# ---------------------------------------------------------------------------


class SyntheticDetector:
    """Projeta os objetos plantados da cena nos keyframes e emite as bboxes.

    Não olha os pixels: usa a geometria declarada em meta.json. É o que permite
    testar desprojeção + cluster com números esperados, sem pesos de modelo.
    O frame atual entra por `set_frame` (depth/K/c2w) antes de cada `detect`.
    """

    def __init__(self, objects: dict[str, dict[str, list[float]]]):
        self.objects = objects
        self._frame: dict[str, np.ndarray] | None = None

    def set_frame(self, depth: np.ndarray, intrinsic: np.ndarray, c2w: np.ndarray) -> None:
        self._frame = {"depth": depth, "K": intrinsic, "c2w": c2w}

    def detect(self, image: np.ndarray) -> list[Detection]:
        if self._frame is None:
            return []
        h, w = image.shape[:2]
        K = self._frame["K"]
        c2w = self._frame["c2w"]
        depth = self._frame["depth"]
        R = c2w[:, :3]
        t = c2w[:, 3]

        out: list[Detection] = []
        for name, obj in self.objects.items():
            center = np.array(obj["center"])
            size = np.array(obj["size"])
            # Projeta os 8 cantos da caixa; a bbox 2D é o retângulo que os contém.
            corners = []
            for sx in (-0.5, 0.5):
                for sy in (-0.5, 0.5):
                    for sz in (-0.5, 0.5):
                        corners.append(center + size * np.array([sx, sy, sz]))
            cam = (np.array(corners) - t) @ R
            if (cam[:, 2] <= 0.05).any():
                continue  # atrás da câmera
            uv = cam @ K.T
            us = uv[:, 0] / uv[:, 2]
            vs = uv[:, 1] / uv[:, 2]
            x1, x2 = float(us.min()), float(us.max())
            y1, y2 = float(vs.min()), float(vs.max())
            if x2 < 0 or y2 < 0 or x1 >= w or y1 >= h:
                continue  # fora do quadro
            x1, y1 = max(0.0, x1), max(0.0, y1)
            x2, y2 = min(float(w - 1), x2), min(float(h - 1), y2)

            # Oclusão: se o depth real no centro divergir muito da distância
            # esperada da caixa, outro objeto está na frente — não "detecta".
            u_c, v_c = int((x1 + x2) / 2), int((y1 + y2) / 2)
            expected_z = float(((center - t) @ R)[2])
            actual = float(depth[v_c, u_c]) if depth[v_c, u_c] > 0 else None
            if actual is None or abs(actual - expected_z) > max(0.4, 0.25 * expected_z):
                continue

            out.append(Detection(label=name, score=0.99, bbox=(x1, y1, x2, y2)))
        return out


# ---------------------------------------------------------------------------
# Orquestração sobre os NPZs
# ---------------------------------------------------------------------------


def make_detector(kind: str | None = None) -> tuple[str, Any]:
    """Fábrica com fallback (ADR-0005): recognition → yolox; síntese sob demanda."""
    kind = kind or os.environ.get("DETECTOR", "yolox")

    if kind == "recognition":
        try:
            from pipeline.recognition_detector import RecognitionDetector

            return "recognition", RecognitionDetector()
        except Exception as exc:
            log.warning("Recognition indisponível (%s) — caindo para YOLOX", exc)
            kind = "yolox"

    if kind == "yolox":
        from pipeline.yolox_detector import YoloxDetector

        return "yolox", YoloxDetector()

    raise ValueError(f"DETECTOR desconhecido: {kind}")


def detect_over_keyframes(
    npz_dir: Path,
    keyframe_indices: list[int],
    detector: Any,
    cluster_radius: float | None = None,
) -> tuple[list[AnchoredDetection], list[Cluster]]:
    """Roda o detector nos keyframes e ancora cada detecção em 3D."""
    anchored: list[AnchoredDetection] = []
    scene_min = np.array([np.inf] * 3)
    scene_max = np.array([-np.inf] * 3)

    for idx in keyframe_indices:
        npz_path = npz_dir / f"frame_{idx:06d}.npz"
        if not npz_path.exists():
            continue
        data = np.load(npz_path)
        image = np.transpose(data["images"], (1, 2, 0)).astype(np.uint8)
        depth = data["depth"][..., 0]
        K = data["intrinsic"]
        c2w = data["extrinsic"]
        valid = data["world_points_conf"] >= 1.5

        # O detector sintético precisa da geometria do frame; os reais, não.
        if hasattr(detector, "set_frame"):
            detector.set_frame(depth, K, c2w)

        for det in detector.detect(image):
            pos = unproject_bbox_center(det.bbox, depth, K, c2w, valid)
            if pos is None:
                continue
            anchored.append(
                AnchoredDetection(
                    frame_idx=idx,
                    label=det.label,
                    score=det.score,
                    bbox=det.bbox,
                    world_pos=pos,
                )
            )
            scene_min = np.minimum(scene_min, pos)
            scene_max = np.maximum(scene_max, pos)

    if not anchored:
        return [], []

    if cluster_radius is None:
        # Raio proporcional à cena: 4% da diagonal — objetos de cena (cadeira, mesa)
        # cabem; objetos distintos afastados não se fundem.
        diag = float(np.linalg.norm(scene_max - scene_min))
        cluster_radius = max(diag * 0.04, 1e-6)

    clusters = cluster_detections(anchored, cluster_radius)
    log.info(
        "%d detecções ancoradas → %d clusters (raio %.3f)",
        len(anchored),
        len(clusters),
        cluster_radius,
    )
    return anchored, clusters


def load_scene_objects(meta_path: Path) -> dict[str, dict[str, list[float]]]:
    """Objetos plantados da cena sintética (para o SyntheticDetector)."""
    meta = json.loads(meta_path.read_text())
    objects: dict[str, dict[str, list[float]]] = meta.get("objects", {})
    return objects
