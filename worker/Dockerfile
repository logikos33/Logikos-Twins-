# Worker de reconstrução — roda no RunPod Serverless com GPU.
#
# v0.1.1 (bloco 2 do piloto): motor RESIDENTE via API pública — o extra
# [demo]/[vis] (viser/trimesh/matplotlib), o clone em /engine e o subprocess
# morreram no bloco 1. Sem kaolin, sem open3d, sem libGL.
#
# nvcc: a F0 v4 quebrou porque o FlashInfer compila kernels por JIT no 1º uso e
# a imagem runtime não tem compilador. Resolução SEM inchar para a devel:
# flashinfer-jit-cache (wheel AOT do índice oficial, cu128) traz os kernels
# prontos. Fallback operacional: ENGINE_USE_SDPA=1 dispensa o FlashInfer
# inteiro (flag da EngineConfig). Ver DECISIONS.md [2026-08-31].

FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1

# ffmpeg: normalização (ADR-0008) + extração de frames (blur antes do motor).
# Sem libgl1/libglib2.0-0: o opencv não-headless não entra mais (o motor é
# instalado com --no-deps e o cv2 é SEMPRE o headless do requirements).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-venv git ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# torch cu128 primeiro: é a camada mais pesada e a que menos muda.
# 2.9.1, não o 2.8.0 do plano: o índice cu128 removeu o 2.8.0 (medido em
# 2026-07-26); a F0 v4 rodou inferência com 2.9.1 (DECISIONS.md 2026-07-30).
RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 \
    --index-url https://download.pytorch.org/whl/cu128

WORKDIR /app

# Deps nossas + as do motor (declaradas explicitamente no requirements.txt,
# com opencv-python-headless — o pyproject do motor declara o NÃO-headless).
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Motor pinado, SEM dependências (elas já estão acima) e sem clone residual:
# o pacote lingbot_map instalado é tudo de que o engine residente precisa.
ARG ENGINE_COMMIT=1f480aeb8a47a24656090d46d053115b7fe60435
RUN pip install --no-cache-dir --no-deps \
    "lingbot-map @ git+https://github.com/Robbyant/lingbot-map@${ENGINE_COMMIT}"

# FlashInfer pinado + kernels AOT (mesma versão, índice oficial cu128).
RUN pip install --no-cache-dir flashinfer-python==0.6.9 \
    && pip install --no-cache-dir "flashinfer-jit-cache==0.6.9+cu128" \
    --extra-index-url https://flashinfer.ai/whl/cu128

# Proveniência gravada no build: o release-worker.yml passa o sha do commit.
ARG WORKER_COMMIT=unknown
ENV ENGINE_COMMIT=${ENGINE_COMMIT} \
    WORKER_COMMIT=${WORKER_COMMIT} \
    IMAGE_SHA=${WORKER_COMMIT} \
    MODEL_PATH=/runpod-volume/models/lingbot-map.pt \
    YOLOX_MODEL_PATH=/runpod-volume/models/yolox_s.onnx \
    YUNET_MODEL_PATH=/runpod-volume/models/yunet.onnx \
    WORKER_MODE=real

COPY handler.py version.py ./
COPY pipeline/ pipeline/
COPY engine/ engine/

CMD ["python3", "-u", "handler.py"]
