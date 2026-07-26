# Sósia do RunPod Serverless. Serviço de desenvolvimento — nunca vai para produção.
FROM python:3.11-slim

# ffmpeg: o modo local-worker executa o pipeline REAL, que normaliza vídeo.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# `/worker` é montado pelo compose e só é usado no modo `local-worker`.
ENV PYTHONPATH=/srv:/worker \
    PYTHONUNBUFFERED=1

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
