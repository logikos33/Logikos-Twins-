# PLUGIN-CHECKLIST — a FASE PLUG-IN, passo a passo

> **Executar COM o Vitor.** Nenhum item daqui roda sozinho: tudo envolve conta, chave ou
> dinheiro. O desenvolvimento (D0–D7) foi feito para que esta fase seja **troca de
> variáveis de ambiente + build/push de imagem** — se algum passo pedir refatoração,
> algo está errado: pare e registre em DECISIONS.md.

## 0. Pré-condições

- [ ] `make check` verde no último `main`.
- [ ] Decidir o **domínio definitivo** (o slug técnico `logikos-twins` não muda).
- [x] Hard cap de gasto combinado: **US$ 30/mês no total** (RunPod ~15 + Railway
      hard limit 10 + R2 free tier) — decisão do Vitor em 2026-07-27, substitui os
      US$ 50 do plano original. Ver DECISIONS.md.

## 1. Contas (billing SEMPRE com alerta/limite mínimo antes de qualquer recurso)

- [ ] **Cloudflare** (R2) — ativar alerta de billing.
- [x] **RunPod** — crédito carregado, spend limit US$ 15 configurado (Vitor, 2026-07-27).
- [ ] **Railway** — plano Hobby; limite de uso.

## 2. Storage (R2) — ✅ VALIDADO em 2026-07-27

- [x] Bucket `logikos-twins` + chave de API — PUT/GET/DELETE e multipart de 2 partes
      validados por script (ETag por parte + ETag composto `-2` + bytes íntegros).
- [x] **CORS com ETag exposto** — validado com PUT real + Origin:
      `Allow-Origin: http://localhost:3000` e `Expose-Headers: ETag` na resposta.
      (Nota de método: `Expose-Headers` aparece na resposta REAL, não no preflight.)
- [x] **Lifecycle 7 dias** — configurado pelo Vitor no dashboard; a chave de objeto
      não tem permissão de LER a config via API (AccessDenied — esperado). Conferir
      visualmente na primeira semana que os `videos/` de teste expiram.
- [x] Bucket fechado (sem leitura pública); acesso só por URL assinada.
- [x] Envs preenchidos no `.env` local (`S3_FORCE_PATH_STYLE=false`, endpoint R2).

## 3. Pesos no network volume (RunPod) — ✅ FECHADO em 2026-07-27

- [x] Volume 50 GB: **`jow25i1co4`**, datacenter **US-MO-2** (~US$ 3,50/mês). Escolha
      medida na hora — único DC US que tem simultaneamente API S3 + volume + L4
      disponível no momento (US-GA-2 não aceita volume; nenhum US-S3 tinha 4090
      livre — não bloqueia, a F0 pode comparar com 4090 num pod community de outro DC).
- [x] **S3 API key separada** criada (Settings → S3 API Keys — a API key normal NÃO
      funciona nessa API), preenchida em `RUNPOD_S3_ACCESS_KEY`/`RUNPOD_S3_SECRET`.
- [x] Subidos via `scripts/populate_volume.py`, com sha256 local conferido antes do
      envio e ETag (por parte + composto) conferido depois — sem re-download:
      - `models/lingbot-map.pt` — 4.417,7 MB, ETag `7c53ba2515be00093d4fdbd1a8083067-45`
      - `models/yolox_s.onnx` — 34,2 MB, ETag `162fa8fdc3979a395018701b60ff02fe`
      - `models/yunet.onnx` — 0,2 MB, ETag `4ae92eeb150c82ce15ac80738b3b8167`
      Total 4,35 GB de 50 GB do volume. Nenhum multipart pendurado (conferido).
- [x] Divergência registrada: o gateway S3 do RunPod aceita partes bem menores que
      os 500 MB documentados — teto funcional medido em 128 MB; script usa 100 MB
      com margem. Ver DECISIONS.md 2026-07-27.

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
