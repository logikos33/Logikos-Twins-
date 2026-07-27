# PLUGIN-CHECKLIST — a FASE PLUG-IN, passo a passo

> **Executar COM o Vitor.** Nenhum item daqui roda sozinho: tudo envolve conta, chave ou
> dinheiro. O desenvolvimento (D0–D7) foi feito para que esta fase seja **troca de
> variáveis de ambiente + build/push de imagem** — se algum passo pedir refatoração,
> algo está errado: pare e registre em DECISIONS.md.

## 0. Pré-condições

- [ ] `make check` verde no último `main`.
- [ ] Decidir o **domínio definitivo** (o slug técnico `logikos-twins` não muda).
- [ ] Hard cap de gasto combinado (sugestão do plano: US$ 50/mês no total).

## 1. Contas (billing SEMPRE com alerta/limite mínimo antes de qualquer recurso)

- [ ] **Cloudflare** (R2) — ativar alerta de billing.
- [ ] **RunPod** — carregar o mínimo; configurar spend limit.
- [ ] **Railway** — plano Hobby; limite de uso.

## 2. Storage (R2)

- [ ] Criar bucket `logikos-twins` + chave de API (escopo só nesse bucket).
- [ ] **CORS**: permitir `PUT`/`GET` da origem do app **e expor o header `ETag`** —
      sem `Access-Control-Expose-Headers: ETag` a gravação ao vivo FALHA
      ("parte sem ETag na resposta"). Registrado em DECISIONS.md (2026-07-26).
- [ ] **Lifecycle**: expirar `videos/` em 7 dias (cinto duplo com a retenção da app) e
      abortar multipart incompleto em 1 dia.
- [ ] O bucket fica FECHADO (sem leitura pública): todo acesso é por URL assinada.
      (No dev o prefixo `scans/` é público por conveniência — não replicar.)
- [ ] Envs: `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
      `S3_PUBLIC_ENDPOINT` idem, chaves, `S3_FORCE_PATH_STYLE=false`.

## 3. Pesos no network volume (RunPod)

- [ ] Volume 50 GB em US-East.
- [ ] Subir via API S3-compatível do RunPod (sem abrir pod):
      `models/lingbot-map.pt` (4,63 GB, HF `robbyant/lingbot-map`),
      `models/yolox_s.onnx` (`scripts/fetch_yolox.py` — hash TOFU no script),
      `models/yunet.onnx` (`scripts/fetch_yunet.py`).

## 4. Imagem e endpoint serverless

- [ ] `docker build worker/` e push para GHCR (imagem validada localmente: 19,1 GB).
- [ ] Endpoint serverless: **começar com L4/A5000 (US$ 0,69/h)**; FlashBoot ON;
      0 workers ativos (scale-to-zero); máx 1 worker; `executionTimeout` 60 min;
      volume anexado em `/runpod-volume`.
- [ ] Envs do worker: `MODEL_PATH=/runpod-volume/models/lingbot-map.pt`,
      `YOLOX_MODEL_PATH=/runpod-volume/models/yolox_s.onnx`,
      `YUNET_MODEL_PATH=/runpod-volume/models/yunet.onnx`,
      `S3_*` (R2), `APP_URL`, `RUNPOD_WEBHOOK_SECRET` (novo segredo FORTE),
      `DETECTOR=yolox`, `GPU_USD_PER_HOUR=0.69`, `WORKER_MODE=real`.

## 5. F0 — validação manual do motor (runbook do plano §5/F0)

- [ ] Pod community (~US$ 0,34/h), rodar o runbook: cena de exemplo + 2 vídeos nossos.
- [ ] Medir: min/frame, pico de VRAM, qualidade visual.
- [ ] Comparar L4 vs 4090 por **custo por scan** (nunca por hora) e fixar a GPU.
- [ ] Registrar os números em DECISIONS.md.

## 6. Deploy da web (Railway `us-east4`)

- [ ] Serviço web único a partir de `apps/web` + Postgres do Railway.
- [ ] `railway.json`/build: `npm ci && npm run build` · start `npm start` ·
      healthcheck `/api/health`. Migrations: `npx prisma migrate deploy` no deploy.
- [ ] Envs de `.env.example` com os valores reais; `WEBHOOK_BASE_URL` **vazio**
      (produção usa a APP_URL pública); `ADMIN_TOKEN` e `RUNPOD_WEBHOOK_SECRET`
      fortes e diferentes dos de dev.
- [ ] Domínio provisório `*.up.railway.app` → depois o definitivo.

## 7. Smoke real

- [ ] 3 vídeos reais de celular (protocolo de captura), pelo menos 1 com marcador
      ArUco impresso e 1 com blur ligado.
- [ ] Conferir: mapa navegável, medição calibrada (manual e ArUco), pins, busca,
      custo por scan em `metrics` dentro do estimado (~US$ 0,08–0,15).
- [ ] Ajustar `EXTRACT_FPS`/caps por custo medido (DECISIONS.md).

## 8. Inventário `[TESTAR no plug-in]` (grep no código confirma a lista)

| Onde | O quê |
|---|---|
| `worker/pipeline/infer.py` | Flags reais do `batch_demo.py`; estrutura do diretório de predições; throughput/VRAM com `window_size 128` |
| `worker/Dockerfile` | Motor com torch **2.9.1** (o 2.8.0 do plano sumiu do índice cu128) |
| `worker/pipeline/npz_to_artifacts.py` | open3d para nuvens de 50–200 M pontos (memória) |
| `worker/pipeline/yolox_detector.py` | onnxruntime-**gpu** no worker real |
| OPEN-QUESTIONS Q3 | `--save_glb` × `--no_render` |
| OPEN-QUESTIONS Q4 | vídeo vertical real de celular (a normalização já autorrotaciona) |
| OPEN-QUESTIONS Q6 | cold start real do endpoint (se > 2 min: avaliar worker active em horário de demo) |

## 9. Pós-go-live (primeira semana)

- [ ] Revisar custos reais no painel `/admin` e nos consoles (R2/RunPod/Railway).
- [ ] Conferir que a retenção apagou os primeiros vídeos no prazo.
- [ ] Trocar `APP_NAME`/domínio definitivo se decidido.
- [ ] Voltar a OPEN-QUESTIONS.md e fechar o que a realidade já respondeu.
