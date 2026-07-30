# Worker de reconstrução — roda no RunPod Serverless com GPU.
#
# Build local valida a imagem; a EXECUÇÃO com GPU fica para a FASE PLUG-IN.
# Sem kaolin: o worker roda o motor com --no_render, e os imports do stack de
# renderização são lazy (ADR-0007) — imagem menor, cold start menor.

FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1

# ffmpeg: exigência da gravação no navegador (ADR-0008) — normalização e strip de áudio.
#
# libgl1/libglib2.0-0: o motor declara `opencv-python` (NÃO-headless) como dependência,
# e nosso requirements traz `opencv-python-headless` — os dois provêem o mesmo módulo
# `cv2`, e qual deles "ganha" depende da ordem de resolução do pip (medido na F0:
# ficam instalados lado a lado, com conflito de numpy declarado). Se o não-headless
# vencer, ele exige libGL.so.1 e o worker morre em ImportError — foi exatamente o que
# derrubou a 2ª tentativa da F0. Estas libs custam ~30 MB e tornam a imagem imune à
# ordem de resolução, em vez de depender de sorte.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-venv git ffmpeg \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# torch cu128 primeiro: é a camada mais pesada e a que menos muda.
# 2.9.1, não o 2.8.0 do plano: o índice cu128 removeu o 2.8.0 (sobraram 2.7.x e
# ≥ 2.9.x — medido em 2026-07-26). Ver DECISIONS.md; [TESTAR no plug-in] confirmar
# o motor com 2.9.1 na F0.
RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 \
    --index-url https://download.pytorch.org/whl/cu128

# Motor pinado (LICENSES.md / DECISIONS.md 2026-07-26). Atualizar o pin é mudança
# deliberada, nunca efeito colateral de rebuild.
ARG ENGINE_COMMIT=1f480aeb8a47a24656090d46d053115b7fe60435
# `pip install .` (não `-e .`): o build backend do motor não implementa o hook
# editable (PEP 660) — medido no build; e instalação normal é o correto numa imagem.
# O clone permanece em /engine porque o handler chama demo_render/batch_demo.py dele.
#
# `.[demo]` e NÃO `.`: medido na F0 (2026-07-30). O `batch_demo.py` importa
# `lingbot_map.vis` já na linha 29 — e `vis/__init__.py` importa `PointCloudViewer`,
# que faz `import viser` no topo. Ou seja, o stack de VISUALIZAÇÃO não é lazy e
# `--no_render` não o evita (ao contrário do que a ADR-0007 supôs; só o
# `rgbd_render`/kaolin é que é lazy de fato). Sem o extra, o worker morre em
# ModuleNotFoundError antes de tocar a GPU. O extra `demo` puxa `[vis]`:
# viser (MIT), trimesh (MIT), matplotlib (PSF), onnxruntime (MIT), requests
# (Apache-2.0) — licenças conferidas, nenhuma copyleft forte.
RUN pip install --no-cache-dir --upgrade pip \
    && git clone https://github.com/Robbyant/lingbot-map /engine \
    && cd /engine \
    && git checkout ${ENGINE_COMMIT} \
    && pip install --no-cache-dir ".[demo]" \
    && pip install --no-cache-dir flashinfer-python
ENV ENGINE_DIR=/engine \
    ENGINE_COMMIT=${ENGINE_COMMIT}

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py .
COPY pipeline/ pipeline/

# MODEL_PATH aponta para o network volume montado pelo RunPod.
ENV MODEL_PATH=/runpod-volume/models/lingbot-map.pt \
    WORKER_MODE=real

CMD ["python3", "-u", "handler.py"]
