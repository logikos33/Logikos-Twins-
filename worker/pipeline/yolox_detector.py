"""Detector YOLOX-s via ONNX Runtime (Apache-2.0 — ADR-0005).

Pré/pós-processamento implementados conforme o repositório oficial da Megvii
(demo/ONNXRuntime): letterbox para 640×640 SEM normalização (o YOLOX come 0–255),
decode por grades (strides 8/16/32) e NMS por classe.

Pesos: `scripts/fetch_yolox.py` baixa o yolox_s.onnx oficial uma única vez.
CPU no dev; GPU no plug-in (onnxruntime-gpu) — `[TESTAR no plug-in]`.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

from pipeline.detect import Detection

log = logging.getLogger("worker.yolox")

INPUT_SIZE = 640
DEFAULT_SCORE_THRESHOLD = 0.35
NMS_IOU = 0.45

# As 80 classes do COCO, na ordem do treino. Extintor NÃO está aqui — ver
# OPEN-QUESTIONS Q1 (o caso "ativos de segurança" usa fire hydrant).
COCO_CLASSES = (
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
)


def preprocess(image: np.ndarray) -> tuple[np.ndarray, float]:
    """RGB (H,W,3) → tensor (1,3,640,640) letterboxed. Devolve (tensor, ratio)."""
    h, w = image.shape[:2]
    ratio = min(INPUT_SIZE / h, INPUT_SIZE / w)
    nh, nw = int(h * ratio), int(w * ratio)

    import cv2

    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    # Fundo 114 (cinza), como no treino do YOLOX.
    padded = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, dtype=np.uint8)
    padded[:nh, :nw] = resized

    # YOLOX espera BGR 0–255 sem normalização (o repo converte RGB→BGR no demo).
    tensor = padded[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32)
    return tensor, ratio


def decode_outputs(raw: np.ndarray) -> np.ndarray:
    """(1, N, 85) cru → [x1,y1,x2,y2,score,cls] no espaço do input 640."""
    grids = []
    strides_per_cell = []
    for stride in (8, 16, 32):
        cells = INPUT_SIZE // stride
        ys, xs = np.meshgrid(np.arange(cells), np.arange(cells), indexing="ij")
        grids.append(np.stack([xs, ys], axis=-1).reshape(-1, 2))
        strides_per_cell.append(np.full((cells * cells, 1), stride))
    grid = np.concatenate(grids)
    stride_arr = np.concatenate(strides_per_cell)

    pred = raw[0]
    xy = (pred[:, :2] + grid) * stride_arr
    wh = np.exp(pred[:, 2:4]) * stride_arr
    obj = pred[:, 4:5]
    cls_scores = pred[:, 5:] * obj

    cls_idx = cls_scores.argmax(axis=1)
    score = cls_scores[np.arange(len(cls_idx)), cls_idx]

    x1y1 = xy - wh / 2
    x2y2 = xy + wh / 2
    return np.concatenate(
        [x1y1, x2y2, score[:, None], cls_idx[:, None].astype(np.float32)], axis=1
    )


def nms(boxes: np.ndarray, iou_threshold: float = NMS_IOU) -> np.ndarray:
    """NMS por classe. boxes: [x1,y1,x2,y2,score,cls] ordenáveis por score."""
    keep: list[int] = []
    order = boxes[:, 4].argsort()[::-1]
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])

    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        # IoU só entre a mesma classe; classes diferentes coexistem no mesmo lugar.
        same_cls = boxes[rest, 5] == boxes[i, 5]

        xx1 = np.maximum(boxes[i, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[i, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[rest] - inter + 1e-9)

        suppressed = (iou > iou_threshold) & same_cls
        order = rest[~suppressed]
    return boxes[keep]


class YoloxDetector:
    def __init__(self, model_path: str | None = None, score_threshold: float | None = None):
        path = Path(model_path or os.environ.get("YOLOX_MODEL_PATH", "/models/yolox_s.onnx"))
        if not path.exists():
            raise FileNotFoundError(
                f"pesos YOLOX ausentes em {path} — rode scripts/fetch_yolox.py "
                "ou aponte YOLOX_MODEL_PATH."
            )
        import onnxruntime as ort

        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.score_threshold = score_threshold or float(
            os.environ.get("DETECTION_SCORE_THRESHOLD", DEFAULT_SCORE_THRESHOLD)
        )
        log.info("YOLOX carregado de %s", path)

    def detect(self, image: np.ndarray) -> list[Detection]:
        tensor, ratio = preprocess(image)
        (raw,) = self.session.run(None, {self.input_name: tensor})
        boxes = decode_outputs(raw)
        boxes = boxes[boxes[:, 4] >= self.score_threshold]
        if len(boxes) == 0:
            return []
        boxes = nms(boxes)

        h, w = image.shape[:2]
        out: list[Detection] = []
        for x1, y1, x2, y2, score, cls in boxes:
            # De volta ao espaço da imagem original (desfaz o letterbox).
            out.append(
                Detection(
                    label=COCO_CLASSES[int(cls)],
                    score=float(score),
                    bbox=(
                        max(0.0, float(x1) / ratio),
                        max(0.0, float(y1) / ratio),
                        min(float(w - 1), float(x2) / ratio),
                        min(float(h - 1), float(y2) / ratio),
                    ),
                )
            )
        return out
