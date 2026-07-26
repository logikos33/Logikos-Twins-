# Plano de execução — Demo "Mapa 3D pelo celular" (LingBot-Map + Railway + RunPod)

**Documento de handoff para implementação (Claude Code).**
Data: 26/07/2026 · Autor: pesquisa e validação técnica desta sessão (repo clonado e inspecionado, docs de infra verificadas — fontes na seção 10).

---

## 0. Como usar este documento

Este arquivo é o briefing completo para implementar a demo. A seção 2 define a arquitetura; a seção 3 lista o que **já foi validado** (com evidência) e o que **falta confirmar** (marcado `[CONFIRMAR]` — verifique durante a implementação, não assuma); a seção 4 fixa contratos (APIs, banco, formatos de arquivo, env vars); a seção 5 detalha as fases com tarefas e critérios de aceite; a seção 9 lista perguntas em aberto — as marcadas **[VITOR]** precisam de decisão humana antes da fase indicada, as marcadas **[CODE]** você mesmo resolve testando.

Regra geral: onde este plano conflitar com a realidade encontrada (API mudou, flag não existe, limite diferente), a realidade vence — registre a divergência num `DECISIONS.md` no repo.

---

## 1. Contexto e objetivo

Estamos construindo uma demonstração de produto: **o usuário filma um ambiente andando com o celular, envia o vídeo por uma página web, e minutos depois recebe um link com o mapa 3D navegável daquele ambiente** — nuvem de pontos densa + trajetória da câmera — com controles de navegação, medição e anotação. Nas fases seguintes, detecções do nosso Recognition são ancoradas em coordenadas 3D desse mapa.

O motor de reconstrução é o **LingBot-Map** (Robbyant/Ant Group, Apache-2.0): modelo feed-forward de reconstrução 3D em streaming que só precisa de vídeo RGB monocular. Já clonamos e inspecionamos o repositório (`github.com/Robbyant/lingbot-map`); os pontos de integração estão mapeados na seção 3.3.

Decisões já tomadas pelo Vitor: captura por **celular** (drone depois), GPU **alugada** (RunPod), aplicação web com **subida inicial no Railway**.

---

## 2. Arquitetura validada

```
┌─────────────┐  ①vídeo (PUT direto,   ┌──────────────────┐
│   Celular    │   presigned URL)       │  Storage R2/S3    │◀────────┐
│ (página web) │───────────────────────▶│  (vídeos+outputs) │         │ ⑤outputs
└──────┬──────┘                         └────────┬─────────┘         │ (PLY, poses,
       │ ②cria scan / start                      │ ④GET vídeo        │  meta, GLB)
       ▼                                          ▼                   │
┌──────────────────────────┐  ③/run   ┌──────────────────────────────┴──┐
│  RAILWAY (sem GPU)        │─────────▶│  RUNPOD Serverless (GPU 4090)    │
│  Next.js: upload, API,    │◀─────────│  Docker worker: LingBot-Map      │
│  viewer 3D, Postgres jobs │ ⑥webhook │  + pós-processamento             │
└──────────────────────────┘          │  (network volume: modelo 4,6 GB) │
       ▲                               └──────────────────────────────────┘
       │ ⑦link do scan pronto: /scan/{id} → viewer Three.js
```

Papéis (todos validados na seção 3):

| Componente | Papel | Por quê |
|---|---|---|
| **Railway** | Front (Next.js), API de jobs, Postgres, webhook receiver | Railway **não tem GPU** (confirmado) — é a casa do app, não do modelo |
| **RunPod Serverless** | Worker Docker com o LingBot-Map; escala a zero; paga por segundo | GPU só existe enquanto processa; 4090 24 GB cobre os ~13 GB de VRAM do streaming |
| **R2 (Cloudflare) ou S3** | Vídeo de entrada e artefatos de saída | Upload direto do celular (presigned), egress gratuito no R2; **nunca** trafegar mídia via payload do RunPod |
| **Network volume RunPod** | Checkpoint `lingbot-map.pt` (4,63 GB) + cache JIT do FlashInfer | Evita rebaixar 4,6 GB a cada cold start; populável via API S3-compatível do RunPod |
| **Postgres (Railway)** | Tabela de scans/jobs, anotações, detecções | Fonte de verdade de estado; webhook + polling de fallback |

Fluxo de um scan: celular grava (protocolo da seção 5/F1) → página cria `scan` e recebe presigned PUT → upload direto ao R2 → `start` dispara `POST /run` no endpoint RunPod com `{video_url, scan_id, params, webhook}` → worker baixa o vídeo, extrai frames, roda inferência, converte para PLY/GLB + `poses.json`, sobe ao R2 → webhook marca `done` → página `/scan/{id}` carrega o viewer.

---

## 3. Validações técnicas (o que já foi verificado)

### 3.1 Railway (verificado nas docs e análises de terceiros)

- **Não oferece GPU** — a própria documentação se declara "not yet well-equipped for ML/GPU compute". Papel do Railway aqui é web/API/DB. ✔
- Regiões disponíveis: `us-west2`, `us-east4` (Virgínia), `europe-west4`, `asia-southeast1`. **Não há região Brasil** — usar `us-east4` (menor latência para o BR). ✔
- Timeout de request HTTP: **15 minutos**; 1 volume por serviço; réplicas não montam volume. Nada disso nos afeta se: uploads forem direto ao R2 (não passam pelo Railway) e o processamento for assíncrono. ✔
- `[CONFIRMAR]` limite de body nas API routes do Next.js no Railway (irrelevante se o upload for presigned — manter payloads JSON pequenos).

### 3.2 RunPod (verificado nas docs oficiais + página de preços)

- **Serverless**: endpoint → fila → worker Docker com handler Python (`runpod` SDK). `POST /run` (assíncrono; resultado disponível por 30 min) e `POST /runsync` (espera máx. 5 min). Nosso caso: **sempre `/run`**. ✔
- **Webhook nativo**: passe `webhook` no request; RunPod chama ao concluir, exige HTTP 200, faz 2 retries com 10 s. Manter **polling de `/status` como fallback** (cron a cada 60 s para jobs `processing` velhos). ✔
- **Execution timeout**: default **10 min** — nossos jobs longos podem passar disso; configurar timeout maior no endpoint/request (máx. 7 dias). ✔
- Rate limits folgados (/run: 1.000 req/10 s). ✔
- **Payload do request é limitado** (ordem de 10–20 MB) → regra do projeto: payload carrega **só URLs e parâmetros**. `[CONFIRMAR]` o número exato na doc ao implementar.
- **Preços serverless por hora** (flex): RTX 4090 24 GB **US$ 1,10/h**; L4/A5000 24 GB US$ 0,69/h; L40S 48 GB US$ 1,75/h; A100 80 GB US$ 2,72/h. Pods on-demand (para a F0 manual): 4090 **US$ 0,69/h**. Network storage US$ 0,07/GB/mês. ✔
- **API S3-compatível para network volumes** existe (docs `storage/s3-api`) — usar para subir o checkpoint uma única vez sem abrir pod. ✔
- GPU escolhida: **RTX 4090 24 GB** (streaming do modelo usa ~13,3 GB segundo o paper; cabe com folga em bf16). Fallback para vídeos muito longos: L40S 48 GB. ✔

### 3.3 LingBot-Map — pontos de integração (verificado no código-fonte clonado)

- **Entrada**: `demo_render/batch_demo.py` aceita `--video_path` + `--fps` (extração de frames embutida, via OpenCV) — não precisamos de ffmpeg no MVP. Flags confirmadas no código: `--video_path`, `--fps`, `--model_path`, `--mode windowed`, `--window_size`, `--keyframe_interval`, `--overlap_keyframes`, `--conf_threshold`, `--mask_sky`, `--save_predictions`, `--save_glb`, `--no_render`, `--output_folder`. ✔
- **`--no_render` evita todo o stack de renderização** (kaolin + extensões CUDA): os imports de `rgbd_render` são feitos dentro da função de render (lazy, linhas ~763–770), então **o worker do MVP não precisa de kaolin** — imagem Docker menor e mais simples. ✔
- **Saída com `--save_predictions`**: diretório com `frame_000000.npz … frame_NNNNNN.npz` + `meta.npz`. Chaves por frame (confirmadas em `demo.py`): `world_points` (H,W,3 — pontos 3D no mundo), `world_points_conf` (H,W), `depth` (H,W,1), `depth_conf` (H,W), `extrinsic` (3,4 — pose **camera-to-world**, já convertida no `postprocess`), `intrinsic` (3,3), `images` (3,H,W). Metadados de janela: `chunk_scales`, `chunk_transforms`. É tudo que o pós-processamento precisa. ✔
- **`--save_glb` existe** (exporta GLB) — `[CODE]` testar se funciona junto com `--no_render`; se sim, é atalho para o viewer (GLTFLoader). Caminho principal continua sendo NPZ → nossa conversão (controle total de downsample/filtragem).
- **Instalação mínima do worker** (sem visualização, sem render): Python 3.10, `torch==2.8.0+cu128`, `pip install -e .` (deps base: Pillow, huggingface_hub, einops, safetensors, opencv-python, tqdm, scipy), `flashinfer-python` (recomendado; fallback `--use_sdpa`), `onnxruntime-gpu` só se usarmos `--mask_sky` (outdoor). ✔
- **Checkpoints**: 3 arquivos ~4,63 GB no HF `robbyant/lingbot-map` (público). Usar `lingbot-map.pt` (equilibrado); `lingbot-map-long` para cenas grandes. ✔
- Parâmetros de partida para vídeo de celular (~1–3 min): `--fps 8 --mode windowed --window_size 128 --keyframe_interval 2 --overlap_keyframes 8 --conf_threshold 1.5 --no_render --save_predictions`. `[CODE]` calibrar na F0 com vídeo real.
- Resolução de inferência: 518 px (lado maior). Estimativa de tempo num 4090: `[CONFIRMAR na F0]` — o paper reporta ~20 FPS em GPU de datacenter; assumir 5–15 FPS no 4090 até medir.

### 3.4 Dimensionamento e custo por scan (estimativa a validar na F0)

Vídeo de 2 min → extração a 8 fps ≈ **960 frames** → inferência 1,5–3,5 min + download/pós/upload 1–2 min + cold start 0,5–2 min ≈ **4–8 min de worker** → **US$ 0,08–0,15 por scan** no 4090 flex. Custo fixo mensal da demo: Railway (~US$ 5–15) + R2 (~US$ 0–2) + network volume 50 GB (~US$ 3,50) ≈ **US$ 10–25/mês**.

---

## 4. Contratos (fixar antes de codar)

### 4.1 Rotas (Next.js App Router, TypeScript)

| Rota | Método | Faz |
|---|---|---|
| `/api/scans` | POST | Cria scan (`title`), retorna `{scan_id, upload_url}` (presigned PUT no R2, expira 1 h, `Content-Type: video/mp4`) |
| `/api/scans/[id]/start` | POST | Confere se o objeto existe no R2 (HEAD), monta presigned GET (validade 6 h), chama RunPod `/run` com `{input:{scan_id, video_url, params}, webhook, policy:{executionTimeout: 3600000}}`, grava `runpod_job_id`, status→`queued` |
| `/api/webhooks/runpod` | POST | Valida `?token=` (segredo), atualiza status/outputs/metrics do scan |
| `/api/scans/[id]` | GET | Estado + presigned GETs dos artefatos (para o viewer) |
| `/api/scans/[id]/annotations` | GET/POST | Pins, medições, notas (F2) |
| `/` , `/new`, `/scan/[id]` | páginas | Galeria · captura/upload · status + viewer |

MVP sem login: acesso ao scan via `share_token` na URL; `ADMIN_TOKEN` em env para a galeria completa. (Decisão definitiva: seção 9.)

### 4.2 Banco (Postgres no Railway)

```sql
scans(
  id uuid pk default gen_random_uuid(),
  created_at timestamptz default now(),
  status text check (status in ('uploading','queued','processing','postprocessing','done','error')),
  title text, share_token text unique,
  video_key text, video_bytes bigint, duration_s real,
  extract_fps int default 8, frames int,
  runpod_job_id text, error_msg text,
  outputs jsonb,   -- {cloud_preview_key, cloud_full_key, poses_key, meta_key, glb_key?}
  metrics jsonb,   -- {infer_s, total_s, points_raw, points_preview, cost_usd_est}
  scale jsonb      -- {factor, method: 'none'|'reference_distance', ref_points}
);
annotations(id uuid pk, scan_id uuid fk, type text, position jsonb, data jsonb, created_at timestamptz);
detections(id uuid pk, scan_id uuid fk, frame_idx int, label text, score real, bbox jsonb, world_pos jsonb);  -- F3
```

### 4.3 Artefatos de saída do worker (subidos ao R2 em `scans/{id}/`)

| Arquivo | Conteúdo | Regra |
|---|---|---|
| `cloud_preview.ply` | Nuvem binária XYZ+RGB, filtrada por `world_points_conf ≥ 1.5` e voxel-downsampled para **1,5–2 M pontos** (~25–35 MB) | É o que o viewer carrega por padrão |
| `cloud_full.ply.gz` | Nuvem completa filtrada (pode ter 50–200 M pts) | Download opcional; gerar só se couber no tempo |
| `poses.json` | Por frame: `{i, t_s, c2w: [3][4], K: [3][3]}` + índices de keyframes | Alimenta trajetória e (F3) projeção de detecções |
| `meta.json` | frames, fps, resolução, janelas usadas, versões (commit do repo, checkpoint), tempos | Reprodutibilidade/debug |
| `keyframes/{i}.jpg` | JPEG dos keyframes (qualidade 70, lado 518) | Para pins com foto (F2/F3) sem reprocessar vídeo |

Conversão NPZ→PLY: `open3d` (voxel_down_sample; ajustar voxel por busca até atingir o alvo de pontos — a escala da cena é arbitrária, então o voxel é relativo à bounding box, não em metros).

### 4.4 Variáveis de ambiente

`DATABASE_URL` · `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET` (web e worker) · `RUNPOD_API_KEY` `RUNPOD_ENDPOINT_ID` (web) · `RUNPOD_WEBHOOK_SECRET` `APP_URL` `ADMIN_TOKEN` `MAX_VIDEO_MB=300` `EXTRACT_FPS=8` (web) · `MODEL_PATH=/runpod-volume/models/lingbot-map.pt` (worker).

### 4.5 Estrutura de repositório (monorepo)

```
/apps/web        Next.js 14+ TS · three.js no /scan/[id] · Prisma (ou Drizzle)
/worker          handler.py · pipeline/ (run_lingbot.py, npz_to_ply.py, upload.py)
                 Dockerfile · requirements.txt
/scripts         populate_volume.md (subir checkpoint via API S3 do RunPod) · seed.ts
/docs            este plano · DECISIONS.md · protocolo-captura.md
```

---

## 5. Fases detalhadas

### F0 — Provar o motor na mão (2–3 dias · ~US$ 5 de GPU)

**O que vamos fazer e por quê.** Antes de automatizar qualquer coisa, rodamos o LingBot-Map manualmente num pod interativo do RunPod (4090, US$ 0,69/h) para tirar os três números que todo o resto depende: minutos de GPU por minuto de vídeo, VRAM real usada, e qualidade visual com vídeo de celular brasileiro comum (não com dataset bonito). É barato, elimina o maior risco do projeto (e se a qualidade decepcionar?) e produz o primeiro material visual.

**Roteiro (runbook para executar no pod):**

```bash
# Pod: RTX 4090, template PyTorch 2.8 cu128, network volume 50GB montado em /workspace
git clone https://github.com/Robbyant/lingbot-map && cd lingbot-map
pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
pip install -e . && pip install --index-url https://pypi.org/simple flashinfer-python
huggingface-cli download robbyant/lingbot-map lingbot-map.pt --local-dir /workspace/models
# 1) cena de exemplo do repo (sanidade)
python demo_render/batch_demo.py --input_folder example --output_folder /workspace/out_ex \
  --model_path /workspace/models/lingbot-map.pt --no_render --save_predictions
# 2) vídeo nosso de celular (subir via runpodctl/scp)
python demo_render/batch_demo.py --video_path /workspace/meu_video.mp4 --fps 8 \
  --mode windowed --window_size 128 --keyframe_interval 2 --overlap_keyframes 8 \
  --model_path /workspace/models/lingbot-map.pt --output_folder /workspace/out1 \
  --no_render --save_predictions
# 3) medir: time, nvidia-smi (pico de VRAM), contagem de frames
# 4) testar --save_glb com --no_render; testar --conf_threshold 1.5 vs 0
```

**Tarefas:** gravar 2 vídeos de teste (sala/escritório, 60–120 s, protocolo abaixo); executar runbook; converter um NPZ para PLY localmente e abrir no MeshLab/three.js para inspeção; registrar números em `DECISIONS.md`; deixar o checkpoint já no network volume (vira o volume da F1).

**Aceite:** mapa do nosso ambiente visivelmente reconhecível; tempo/VRAM/custo por scan documentados; decisão 4090 confirmada (ou trocada com justificativa).

### F1 — Pipeline automatizado ponta a ponta (semanas 1–2)

**O que vamos fazer e por quê.** Transformar o processo manual da F0 no fluxo do produto: página de upload → job serverless → artefatos no R2 → página de status. No fim desta fase qualquer pessoa com o link consegue gerar um mapa sem nossa ajuda — isso já é uma demo, mesmo com viewer rudimentar.

**Tarefas (web):** esqueleto Next.js + Prisma + Postgres no Railway (região `us-east4`); rotas da seção 4.1; página `/new` com gravação de instruções + `<input type=file>` e upload presigned com barra de progresso; página `/scan/[id]` com status ao vivo (poll 3 s) e, quando `done`, PLY no three.js (PLYLoader + OrbitControls, nada mais); webhook com token; cron de reconciliação (jobs presos → `/status` do RunPod).

**Tarefas (worker):** Dockerfile (base CUDA 12.8 + Python 3.10; clonar repo com commit pinado; deps da seção 3.3; `runpod`, `boto3`, `open3d`); `handler.py`: baixar vídeo → `batch_demo.py` via subprocess → `npz_to_ply.py` (filtro conf + downsample + PLY binário) → `poses.json`/`meta.json`/`keyframes/` → upload R2 → retorno com métricas; publicar endpoint serverless (1 worker máx no início, `executionTimeout` 60 min, FlashBoot on, network volume anexado); documentar em `/scripts/populate_volume.md` como subir o checkpoint via API S3-compatível do RunPod.

**Protocolo de captura v1 (vai na página `/new` e em `/docs/protocolo-captura.md`):** 1080p @ 30 fps, celular na horizontal, andar devagar (1 passo/s), movimentos suaves, girar fechando loops (voltar ao ponto inicial), 60–180 s, boa iluminação, evitar contraluz e superfícies 100% espelhadas; máx. 300 MB.

**Aceite:** do celular ao mapa navegável **sem intervenção manual**, em menos de 10 min de relógio para vídeo de 2 min; falhas viram `status=error` com mensagem legível; custo por scan registrado em `metrics`.

### F2 — "Controle do mapa 3D" (semanas 3–4)

**O que vamos fazer e por quê.** O viewer deixa de ser "nuvem girando" e vira a experiência que dá nome à demo: controlar a planta em detalhe. É o que diferencia a demo de um app de scan qualquer (Polycam/Scaniverse) — os concorrentes de gêmeo digital cobram caro justamente pela camada de navegação/medição/anotação (cf. seção 8).

**Tarefas (viewer, three.js):** trajetória da câmera desenhada (linha + marcador animável "replay do passeio"); modos de câmera (orbit / first-person / top-down "planta baixa"); **medição** ponto-a-ponto com **calibração de escala** (usuário clica 2 pontos e informa a distância real — ex.: batente de porta 0,80 m → fator salvo em `scans.scale`; toda medição posterior usa o fator); **pins de anotação** (clique na nuvem → pin + texto + foto do keyframe mais próximo via `poses.json`); camadas ligáveis (nuvem/trajetória/pins); corte por altura (slider de clipping para "ver por dentro"); compartilhamento por link `share_token`; galeria `/` com thumbnails.

**Tarefas (produto):** gravar a demo-vídeo de 3 min (roteiro: filmar ambiente → upload → mapa → medir → anotar); testar com 5 ambientes diferentes (sala, galpão/garagem, corredor, escada, área externa) e registrar onde quebra.

**Aceite:** demo de 3 min gravada sem cortes; medição com erro < ~5% em distâncias de referência após calibração; 5 cenários testados com resultado documentado.

### F3 — Recognition ancorado no espaço (semanas 5–6)

**O que vamos fazer e por quê.** A tese do produto: cruzar o nosso Recognition com o mapa. Cada detecção em um keyframe vira um objeto com coordenada 3D — o mapa passa a responder "onde está?".

**Como tecnicamente:** o worker já salva keyframes + `poses.json` (c2w, K) + `depth` por frame nos NPZs. Pipeline: rodar o detector nos keyframes → para cada bbox, tomar o pixel central (ou mediana da máscara), ler `depth[v,u]`, desprojetar com `K` e `c2w` → `world_pos` → gravar em `detections` → o viewer agrega detecções próximas do mesmo rótulo (cluster por raio) e mostra pins semânticos clicáveis com a foto-evidência; busca por rótulo ("extintor") voa a câmera até o cluster.

**Tarefas:** definir o detector — **[VITOR]** qual stack do Recognition de vocês usar (endpoint? pesos?); fallback aberto para a demo: YOLO (COCO) ou detector open-vocabulary leve, rodando no mesmo worker após a inferência (GPU já está paga); endpoint `POST /api/scans/[id]/detections` (batch, vindo do worker); UI de pins semânticos + filtro por rótulo + lista lateral; caso demonstrável de segurança: "extintores e saídas mapeados automaticamente" ou "pessoas detectadas com posição na planta" (escolher 1).

**Aceite:** busca "onde está X?" funcionando em pelo menos 1 ambiente real com ≥ 3 classes; precisão de posição suficiente para apontar o lugar certo na planta (erro < ~1 m percebido).

### F4 — Endurecimento + material comercial (semanas 7–8)

**O que vamos fazer e por quê.** Tornar a demo mostrável a terceiros sem vergonha e sem risco: LGPD, custos, limites, e o vídeo comercial. Aqui também decidimos o go/no-go do drone N0 (filmagem de drone entra no MESMO pipeline sem mudança de código — só protocolo de captura novo).

**Tarefas:** retenção configurável (apagar vídeo bruto após N dias, manter artefatos — default 7 dias) e aviso LGPD na página de upload; blur de rostos opcional nos keyframes (`[CODE]` avaliar um face-detector leve no worker); painel admin simples (scans, custos acumulados via `metrics`, erros); limites de uso (X scans/dia sem admin token); teste com 1 filmagem de drone (qualquer DJI — vídeo gravado) para validar o caminho N0; vídeo comercial de 90 s editado a partir da demo.

**Aceite:** 10 scans consecutivos sem intervenção; política de retenção ativa; 1 mapa gerado de vídeo de drone; vídeo comercial pronto.

---

## 6. Esboços para acelerar (worker)

**Dockerfile (sketch — ajustar na implementação):**

```dockerfile
FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y python3.10 python3-pip git && rm -rf /var/lib/apt/lists/*
RUN pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
RUN git clone https://github.com/Robbyant/lingbot-map /app && cd /app && git checkout <COMMIT_PINADO> \
 && pip install -e . && pip install flashinfer-python runpod boto3 open3d
COPY handler.py pipeline/ /app/
WORKDIR /app
CMD ["python3.10", "-u", "handler.py"]
```

**handler.py (esqueleto):**

```python
import runpod, subprocess, json, os
from pipeline import download_video, npz_to_artifacts, upload_outputs

def handler(job):
    inp = job["input"]                      # {scan_id, video_url, params}
    video = download_video(inp["video_url"])          # → /tmp/in.mp4
    out = "/tmp/out"
    cmd = ["python3.10", "demo_render/batch_demo.py",
           "--video_path", video, "--fps", str(inp["params"].get("fps", 8)),
           "--mode", "windowed", "--window_size", "128",
           "--keyframe_interval", "2", "--overlap_keyframes", "8",
           "--model_path", os.environ["MODEL_PATH"],
           "--output_folder", out, "--no_render", "--save_predictions"]
    subprocess.run(cmd, check=True)
    arts = npz_to_artifacts(out, conf_min=1.5, target_points=1_800_000)  # PLY+poses+meta+keyframes
    keys = upload_outputs(inp["scan_id"], arts)       # → R2
    return {"scan_id": inp["scan_id"], "outputs": keys, "metrics": arts["metrics"]}

runpod.serverless.start({"handler": handler})
```

Notas: usar `runpod.serverless.progress_update(job, ...)` para status intermediário (baixando/inferindo/pós-processando — a página mostra); logar stdout do subprocess (aparece no console do RunPod); em erro, deixar a exceção subir (o RunPod marca FAILED e o webhook/reconciliação atualiza o banco).

---

## 7. Custos estimados da demo

| Item | Valor |
|---|---|
| Railway (app + Postgres, plano Hobby/uso) | ~US$ 5–15/mês |
| R2 (100 vídeos + artefatos ≈ 40–80 GB, egress zero) | ~US$ 1–2/mês |
| Network volume RunPod 50 GB | ~US$ 3,50/mês |
| GPU por scan (4090 flex, vídeo 2 min) | ~US$ 0,08–0,15 |
| **Total para 100 scans/mês** | **≈ US$ 20–35** |

---

## 8. Produtos parecidos (gêmeos digitais) — e a lição de cada um para a nossa demo

O mercado se divide em três grupos. **(a) Plataformas de reality capture profissional:** Matterport (comprada pela CoStar por US$ 1,6 bi, concluído em fev/2025 — câmera própria/LiDAR, walkthroughs fotorrealistas, referência de UX de viewer com "dollhouse view"), NavVis (scanners vestíveis, precisão topográfica), Cupix (360°, gêmeo navegável **com medição no navegador** — exatamente a UX de medição que vamos copiar), HoloBuilder/FARO (360 + laser). **(b) Documentação de obra:** OpenSpace (câmera 360 no capacete, captura sem fricção **vinculada à planta baixa** — lição: ancorar o scan numa planta 2D dá contexto imediato), DroneDeploy (drone + solo, integra Procore/Autodesk), Reconstruct (mistura 360/drone/LiDAR e **sobrepõe o projeto para detectar desvio**), Buildots (capacete 360 + visão computacional para **progresso automático** — o mais próximo da nossa tese "camada de inteligência sobre o mapa", só que em obra), Track3D (idem, progresso objetivo). **(c) Captura por celular / IA generativa:** Polycam e Scaniverse (Niantic Spatial — scan por celular com Gaussian Splatting, processamento no aparelho; lição: onboarding de captura guiada excelente, e prova de que "celular vira scanner" já é comportamento de usuário), e Marble, da World Labs de Fei-Fei Li (lançado nov/2025; **gera** mundos 3D por IA a partir de fotos/texto — não é reconstrução fiel, mas mostra para onde vai a expectativa de UX 3D no navegador).

**Onde a nossa demo se diferencia de todos:** vídeo comum → nuvem densa **com trajetória e profundidade por frame** (base para ancorar recognition), custo marginal de ~US$ 0,10/scan, sem hardware proprietário, e a camada de inteligência é o **nosso** Recognition — o análogo industrial do que Buildots fez para obra, com aquisição 100× mais barata que Matterport/NavVis. Nenhum dos players acima oferece "detecções da SUA operação ancoradas no SEU mapa" como serviço leve.

---

## 9. Perguntas em aberto

> **Atualização (26/07/2026):** as perguntas **[VITOR] 1–8 já foram respondidas** — ver a tabela "Decisões já tomadas" em `PROMPT-EXECUCAO.md`, que prevalece sobre esta seção. As **[CODE] 9–15 continuam valendo** durante a implementação.

**[VITOR] — decidir antes da fase indicada:**

1. (F1) Nome do produto/domínio para a demo? (precisa para `APP_URL`, webhook e o vídeo comercial)
2. (F1) Contas: já existem organizações RunPod/Railway/Cloudflare com billing? Limite de gasto mensal autorizado (sugestão: US$ 50 hard cap)?
3. (F1) Acesso à demo: link secreto por scan (proposto) ou exigir login simples desde já?
4. (F2) Calibração de escala com objeto de referência (informar 1 distância conhecida por scan) é aceitável na experiência, ou preferem imprimir um marcador padrão (A4/ArUco) no chão?
5. (F3) Recognition: qual o stack atual (modelo, formato dos pesos, API)? Podemos rodá-lo dentro do worker GPU, ou é serviço externo a chamar?
6. (F3) Caso demonstrável prioritário: ativos de segurança (extintores/saídas) ou pessoas/EPI? (define classes e o roteiro do vídeo)
7. (F4) LGPD: retenção de vídeo bruto por 7 dias ok? Blur de rostos obrigatório ou opcional na demo?
8. (Geral) Vídeos com áudio: descartar áudio no upload (proposto, privacidade) ou manter?

**[CODE] — confirmar testando durante a implementação:**

9. Limite exato de payload do `/run` e comportamento do webhook atrás do proxy do Railway (responder 200 rápido, processar async).
10. `--save_glb` funciona com `--no_render`? Se sim, comparar GLB nativo vs nosso PLY (tamanho/fidelidade).
11. Throughput real do 4090 (frames/s) e pico de VRAM com `window_size 128` — ajustar `fps`/`keyframe_interval` e o cap de duração de vídeo a partir disso.
12. Cold start real do endpoint (imagem grande + FlashBoot + volume): se > 2 min, avaliar imagem com pesos embutidos vs volume, e/ou 1 worker "active" nas horas de demo.
13. Upload de 100–300 MB via presigned PUT único em 4G: se instável, implementar multipart (Uppy) já na F1.
14. PLY de preview > 40 MB no 4G: se pesado, gerar também versão Draco/compactada ou reduzir alvo de pontos.
15. Vídeo vertical (celular em pé) e `--rotate_clockwise_90`: testar orientações e normalizar no worker (metadados de rotação do MP4).

---

## 10. Fontes da validação

- Código e flags: repositório clonado `github.com/Robbyant/lingbot-map` (README; `demo.py` linhas ~255–415; `demo_render/batch_demo.py` linhas ~1–80, 529–600, 1066–1263) e paper incluído (arXiv 2604.14141) — VRAM ~13,3 GB e ~20 FPS.
- Railway: [regiões oficiais](https://docs.railway.com/deployments/regions) · [análise "Railway para apps de IA em 2026" — sem GPU, timeout 15 min, volumes](https://dev.to/stackandsails/is-railway-reliable-for-ai-apps-in-2026-44oe)
- RunPod: [docs Serverless (endpoints/workers/handler/FlashBoot)](https://docs.runpod.io/serverless/overview) · [send-requests: /run vs /runsync, timeouts, webhooks, rate limits](https://docs.runpod.io/serverless/endpoints/send-requests) · [preços serverless/pods/storage](https://www.runpod.io/pricing) · [API S3-compatível de network volumes](https://docs.runpod.io/storage/s3-api)
- Modelos: [HF robbyant/lingbot-map (checkpoints 4,63 GB)](https://huggingface.co/robbyant/lingbot-map)
- Gêmeos digitais: [panorama reality capture 2026 (OpenSpace, DroneDeploy, Cupix, HoloBuilder, Reconstruct, Buildots, Track3D, Matterport, NavVis)](https://amazingarchitecture.com/articles/the-best-reality-capture-solutions-for-construction-in-2026) · [CoStar conclui compra da Matterport (US$ 1,6 bi)](https://www.constructiondive.com/news/costar-deal-matterport-ai-reality-capture/714360/) · [Polycam vs Scaniverse 2026](https://www.skyebrowse.com/news/posts/polycam-vs-scaniverse) · [Scaniverse/Niantic Spatial](https://scaniverse.com/news/creating-splats-which-app-to-choose) · [Marble, World Labs (TechCrunch, nov/2025)](https://techcrunch.com/2025/11/12/fei-fei-lis-world-labs-speeds-up-the-world-model-race-with-marble-its-first-commercial-product/)

