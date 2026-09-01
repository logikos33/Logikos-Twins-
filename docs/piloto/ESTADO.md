# ESTADO — Piloto mobile (motor residente → serverless real → captura pelo celular)

> **Âncora de reentrância.** Sessão nova: leia este arquivo primeiro e continue do primeiro marco aberto.
> Atualizado: 2026-08-31 · rodada 1 · base = `origin/main` @ `2e10a80`.

## Divergências prompt × realidade (bloco 0 — provadas)

| O prompt dizia | O repo/mundo diz | Decisão |
|---|---|---|
| Repo = workspace aberto no VS Code | Workspace aberto era o **Recognition** (proibido) | Segui `~/Documents/Logikos Twins` (único checkout de `logikos33/Logikos-Twins-`); trabalho em `~/twins-piloto/` (clone local fora do iCloud — `Documents` sofre eviction) |
| Imagem v0.1.0 **privada** no GHCR | **Pública** — pull anônimo lista tags `0.1.0`, `latest` | Bloco 2 NÃO bloqueado no Vitor; v0.1.0 segue quebrada p/ prod (fix `8758237` é pós-tag) |
| `8758237` corrige o **nvcc** | Corrige `[demo]`+libgl1; **nvcc segue aberto** (DECISIONS.md:498-552: nvcc vs `--use_sdpa`, pendente) | Bloco 2 decide e implementa |
| Pin anterior aos fixes 2026-04-24 / 2026-06-28 | Pin `1f480aeb` = **2026-07-23**; fix real de SDPA KV cache = **2026-07-02** (`b8231a4f`), **já incluso**; datas do prompt não correspondem a commits reais; FlashInfer: **0 menções** no repo do motor | **Pin fica** (resultado negativo). Validar no bloco 1 se `flashinfer-python` é mesmo usada (issue #19) |
| Export do Claude Design entregue (7 telas `.dc.html`, `ui-contract.json`…) | **Não está no git nem em lugar nenhum do disco** (mdfind zero) | Camada visual do bloco 4 BLOQUEADA → AÇÃO-VITOR |
| `torch==2.8.0` cu128 | Dockerfile já pina **2.9.1+cu128** e a F0 v4 **rodou inferência** com ela | 2.9.1 fica |
| Tokens `--lk-*` | `globals.css` usa `--color-*` (e `surface-2 #23242f` + `#5c6470`=`--color-faint` **já existem**, :26-27) | Padrão da casa (`--color-*`) vence |
| D- em `docs/piloto/DECISOES.md` | Casa usa `DECISIONS.md` na raiz, log cronológico por data, sem numeração | Registro segue na raiz; ESTADO aponta |
| 3 bugs da F0 sem registro? | **Registrados** em DECISIONS.md `[2026-07-30]` (driver CUDA :397-434 · `[demo]`/viser :437-495 · nvcc+VRAM 20,9GB :498-552) | Nada a recriar |
| — | Upstream `main` do motor (2026-08-31) **removeu `lingbot-map-long` do README** | Não contar com `-long` p/ galpão sem validar |

## Marcos

- [x] **Bloco 0 — inventário** (este arquivo; issues #9–#19)
- [ ] **Bloco 1 — motor residente** ← PRÓXIMO · issue #9 · worktree `piloto/bloco1`
- [ ] **Bloco 2 — imagem v0.1.1 + pesos R2 + volume + endpoint** · issue #10
- [ ] **Bloco 3 — F0** · issue #11 · sintético destravado; `F0-real: PENDENTE (aguardando vídeos)`
- [ ] **Bloco 4 — front mobile** · issue #12 · camada A parcial; camada B BLOQUEADA (export)
- [ ] **Bloco 5 — Railway staging** · issue #13
- [ ] **Bloco 6 — endurecimento + handoff** · issue #14

## AÇÕES-VITOR

| Ação | Bloqueia |
|---|---|
| **Entregar a pasta do export do Claude Design** → commitar em `design/piloto-mobile/` (ou informar o caminho aqui; o Code commita) | Bloco 4 camada visual + contrato v1.1 (os 46 plugs do v1 só existem no export) |
| Depositar `pilot/inputs/*.mp4` + `pilot/inputs/medidas.json` (3 distâncias reais/vídeo) | F0 real (bloco 3) — sintético segue sem isso |
| Ligar alerta de saldo baixo / auto-pay no RunPod (saldo atual US$ 22,03 — OK p/ a rodada) | Nada; proteção |
| Testar no próprio celular (iOS Safari + Android Chrome) e preencher a tabela de escala | Aceites 8 e escala ≤5% (fim da rodada) |
| ~~Tornar imagem GHCR pública~~ | **JÁ É PÚBLICA** — riscado |

## Recursos vivos (verificado 2026-08-31 por API)

- **RunPod:** 0 pods · 0 endpoints · **0 network volumes** (o volume de pesos sumiu — repopular no bloco 2) · saldo **US$ 22,03** · spendLimit US$ 80 · US$ 0/h. GraphQL exige User-Agent de browser (Bearer puro → 403 Cloudflare).
- **GHCR:** `ghcr.io/logikos33/logikos-twins-worker` público, tags `0.1.0`/`latest` — **v0.1.0 quebrada p/ produção**.
- **HF `robbyant/lingbot-map`:** público; `lingbot-map.pt` = 4.632.303.465 bytes (~4,63 GB) ✓; há também `-long.pt`, `-stage1.pt`, `skyseg_batch.onnx`.
- **GitHub:** default branch `main`; issues #9–#19 abertas nesta rodada (antes: 0).

## Inventário (bloco 0) — o que já existe × o que falta

| Item | Existe? | Onde | O que falta |
|---|---|---|---|
| Subprocess do `batch_demo.py` | SIM (é o problema) | `worker/pipeline/infer.py:53` (run :76) | Bloco 1: singleton `worker/engine/lingbot.py` |
| Correção `8758237` | SIM | `worker/Dockerfile` (`.[demo]`+libgl1) | nvcc/SDPA segue aberto → bloco 2 |
| Import `lingbot_map.vis` | Só via subprocess (`batch_demo.py:29`) | grep worker/ = zero | Testes estático+runtime no bloco 1 |
| Conflito opencv | SIM | `worker/requirements.txt:12` headless vs motor não-headless | Resolver no pip (`--no-deps`) no bloco 1, não via libgl1 |
| Blur YuNet | DEPOIS do motor, só keyframes/thumb | `worker/handler.py:73-77`, `blur_faces.py:64` | Mover p/ ANTES (frames que colorem a nuvem); falha de blur já é FATAL (D6) ✓ |
| Upload multipart do celular | SIM | `storage.ts:29` (5 MiB presigned) + `useRecorder.ts:128-214` (timeslice 3s, wake lock, s/ áudio, fallback arquivo) | Estado `upload-paused-offline`; fallback usa PUT único (ok p/ MVP) |
| Página de gravação | SIM | rota `/new` (`CaptureClient.tsx`) | Visual do export; limite 120s com contador (conferir `MAX_VIDEO_SECONDS`) |
| Viewer no toque | SIM (medir+anotar+pins) | `scan/[id]/viewer/engine.ts`, `ScanViewer.tsx:39`, three `^0.185.1` npm | LOD/progressivo; chip de LOD; FPS counter no admin |
| Link compartilhado | SIM, token **sem validade** | `scans.ts:31`; 404 p/ token errado ✓ | Validade 7 dias (issue #16) |
| Admin auth | Token em query (`notFound()` se inválido) | `admin/page.tsx:32` | Cookie/sessão (issue #17); bypass por header (route.ts:38) |
| Máquina de estados do job | SIM (8 estados) | `schema.prisma:16-25`, `ScanStatusClient.tsx:29-72` | Alinhar ao contrato (`upload-paused-offline`, `cancelled`) quando o export chegar |
| Proveniência no job | PARCIAL | `handler.py:63-66`, `npz_to_artifacts.py:244-260` (engine_commit, checkpoint, metrics) | `weights_sha256`, `image_sha`, `worker_commit`, `flags`, `peak_vram_mb`, `stage_timings` → bloco 1 |
| Workflow de build/publicação | SIM | `release-worker.yml` (tag `v*` → GHCR semver+latest) | Tag = commit sha também; `--version` na imagem |
| Pesos → volume | Script pronto, volume MORTO | `scripts/populate_volume.py` (sha256 congelado :29-33, multipart 100MB, teto real 128MB) | R2 como fonte da verdade + `ensure_weights()` → bloco 2 |
| Testes | 83 ✓ (42 vitest + 41 pytest) | `apps/web/src/lib/*.test.ts`, `worker/tests/` | Novos por bloco |
| CI | 6 jobs | `ci.yml`: web, python, gates(licença+npm audit), secrets(gitleaks), worker-image(condicional, issue #18), spec | — |
| `LICENSES.md` | SIM | raiz | FFmpeg + base nvidia/cuda ausentes (issue #15) |
| R2 | VALIDADO 2026-07-27 | `PLUGIN-CHECKLIST.md:22-31` (bucket `logikos-twins`, multipart+ETag/CORS) | Envs são `S3_*` (não há var “R2”); worker usa `transfer.py` boto3 |
| PWA | NÃO | — | manifest+ícone → bloco 4 |
| `/dev/states` | NÃO | — | Nasce com o export → bloco 4 |
| Rate limit upload | Só `MAX_SCANS_PER_DAY` na criação | `api/scans/route.ts:38-51` | `/parts` e `/complete` → bloco 6 |
| fake-runpod | SIM (sósia de contrato) | `fake-runpod/app.py`; `make dev` | — |

## Decisões desta rodada (registradas em `DECISIONS.md` raiz)

- Pin do motor mantido (`1f480aeb`, 23/07) — posterior ao fix SDPA KV de 02/07; reversível subindo o ARG no Dockerfile.
- Trabalho em `~/twins-piloto/` (clone local, worktrees por bloco) — iCloud eviction em `Documents`; reversível apagando o clone.
- `torch 2.9.1+cu128` mantido (F0 v4 rodou inferência com ela; prompt citava 2.8.0 desatualizado).

## Comandos de verificação

```bash
# recursos RunPod (nunca imprimir a chave)
cd ~/twins-piloto/repo && set -a && source "/Users/vitoremanuel/Documents/Logikos Twins/.env" >/dev/null 2>&1 && set +a
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" https://rest.runpod.io/v1/pods | python3 -c 'import json,sys;print(len(json.load(sys.stdin)),"pods")'
# testes
cd ~/twins-piloto/wt-piloto-bloco1 && make test   # 83 + novos
```

## Próximo comando

```bash
cd ~/twins-piloto/repo && git worktree add ~/twins-piloto/wt-piloto-bloco1 -b piloto/bloco1 origin/main
# → bloco 1 (issue #9): worker/engine/lingbot.py residente, blur antes do motor, proveniência completa
```
