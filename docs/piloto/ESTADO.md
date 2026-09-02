# ESTADO — Piloto mobile (motor residente → serverless real → captura pelo celular)

> **Âncora de reentrância.** Sessão nova: leia este arquivo primeiro e continue do primeiro marco aberto.
> Atualizado: 2026-09-04 · rodada 5 ("régua de capacidade") · base = `origin/main` @ `900e5f7`.

## Rodada 5 — régua de capacidade (2026-09-04)

**🔎 Divergências-achado:**
1. O prompt dizia que o `errorCode` **`video-too-short` existia** no contrato. **Existia só a STRING** (`strings.json` `job.errors.video-too-short`); o errorCode NÃO estava em `errorCodes`. Adicionei nas duas cópias (PR #60). Segui o repo.
2. O prompt supôs GPU de ~24 GB. **O endpoint não fixa uma GPU**: `gpuTypeIds` = RTX 6000 Ada (48 GB) · L40 (48) · L40S (48) · A40 (48) · RTX A6000 (48) · **RTX 4090 (24)** · **RTX A5000 (24)** — fonte: `GET https://rest.runpod.io/v1/endpoints/mfnx103w05drr5` (a GraphQL não expõe worker.gpuTypeId; 400). **O denominador varia de 24 a 48 GB por sorteio de máquina** — os 22 GB de pico ficam em **92 % de uma 4090/A5000** e 46 % de uma 48 GB. Isso é achado de produto, não detalhe: a MESMA gravação pode caber ou estourar dependendo de qual GPU o RunPod alocar.
3. `costAlertUsd` estava em **env** (`COST_ALERT_USD`), não editável — o prompt pedia editável na Config; movi para `app_config` (persistido, aba Config).

**Bloco 1 — curva de VRAM: MEDIDA E FECHADA. 🟢 120 s CABE.**

Três sintéticos **verticais 1080×1920** (mesma orientação do celular que gerou os 22 GB), pelo caminho do produto (proxy → complete → job):

| duração | frames | pontos | **VRAM pico** | % de 24 GB | % de 48 GB | tempo total | US$ |
|---|---|---|---|---|---|---|---|
| celular real (10,4 s) | 104 | 2,06 M | 22,1 GB | 92 % | 46 % | 170 s | 0,118 |
| **20 s** | 200 | 1,53 M | **21,1 GB** | 88 % | 44 % | 88,7 s | 0,062 |
| **60 s** | 600 | 2,68 M | **22,4 GB** | 93 % | 47 % | 192,5 s | 0,134 |
| **120 s** | 1 200 | 6,14 M | **24,4 GB** | **102 %** ⚠️ | 51 % | 388,3 s | 0,270 |

**A curva é SUBLINEAR e quase plana** — 6× mais frames (200→1200) custam **+15 % de VRAM** (21,1→24,4 GB). Explicação no próprio log do worker: o motor é *streaming* com KV-cache limitado (`FlashInfer KV cache manager: 24 blocks, max_frames=88`), então a janela de atenção não cresce com o vídeo. **Não estoura aos 120 s: veredito = cabe até 120 s, `maxDurationS` fica em 120.**

⚠️ **Mas o denominador é sorteado.** Aos 120 s o pico (24,36 GB) **passa dos 24 GB** de uma RTX 4090/A5000 — duas das sete classes que o endpoint aceita. Numa 48 GB sobra 49 % de folga; numa 24 GB **não cabe**. Como nenhum dos jobs medidos falhou, ou caíram todos em 48 GB, ou a 4090 (24 576 MiB) absorveu por pouco. **D- (registrado): manter `maxDurationS: 120` E restringir o endpoint às classes de 48 GB antes da demo** — remover `ADA_24`/`AMPERE_24` de `gpuIds` custa disponibilidade num DC já apertado, então fica como decisão de véspera: **demo com vídeos ≤60 s (22,4 GB, cabe em qualquer classe) é o caminho sem aposta.**

**Custo real por segundo de vídeo (regressão dos 4 pontos):** ~US$ **0,0021/s** + ~US$ 0,022 de overhead fixo → `custo ≈ 0,022 + 0,0021 × duração_s`. Aos 120 s: **US$ 0,27** (a projeção anterior de US$ 1,42, extrapolada do ponto de 10 s, estava **5× superestimada** — o overhead fixo dominava aquele ponto). `costAlertUsd = 2,00` continua correto como "saiu do normal".

**Custo desta rodada: US$ 0,99** (saldo 16,53 → 15,54; teto era 3, parada em 2). Inclui os ~50 min de `workersMin=1` esperando GPU.

**Bloco 2 — mínimo de 20 s (PR #60, mergeado):** o contrato dizia 20 s e nada validava (o vídeo de 10,4 s do Vitor rodou e foi cobrado). Agora: cliente recusa por metadata **antes de subir** (`checkFileLimits → too-short`, `support.ts`) e o servidor responde **422 `video-too-short`** **antes** de completar o multipart (`complete/route.ts`). Casos 10/20/120/121 testados nos dois lados; sabotagem do guard = 1 vermelho. **Aberto:** no fluxo AO VIVO o usuário só descobre no fim — issue **#62** (desabilitar PARAR antes de 20 s).

**Bloco 3 — custo (PR #60):** fórmula final (4 pontos medidos): `custo ≈ 0,022 + 0,0021 × duração_s` → **US$ 0,27 aos 120 s**. (A régua intermediária de US$ 0,0114/s, tirada só do ponto de 10 s, superestimava 5×: o overhead fixo dominava aquele ponto.) `costAlertUsd` **0,75 → 2,00**, agora **persistido e editável** na aba Config. D-: 0,75 dispararia em quase todo scan real; alerta que sempre dispara é alerta que ninguém lê.

**Bloco 4 — watchdog geração 1 (PR #60):** detecta e **só alerta**. Assinatura: scan `queued` >10 min **e** health com **zero em todas as colunas** (`throttled`/`running` nunca alertam — são espera legítima). Emite `watchdog.frozen_scaler` no log e grava em `app_config` → **banner vermelho no topo do admin**. **Zero ação automática** (freio do prompt): `workersMin` esquecido custa ~US$ 2,50/h — issue **#61** para a geração 2 com teto de tempo e reversão obrigatória.

**Bloco 5 — warm-up é RITO, não recomendação:**
> Com `idleTimeout: 5 s`, "aquecer 15 min antes" **não existe**: o worker morre 5 s depois do job. A única forma de ter GPU garantida na hora da demo é **manter `workersMin = 1` durante a janela** — e isso **custa**.

| Passo | Quando | Comando/ação | Custo |
|---|---|---|---|
| 1. Acender | **45 min antes** | `saveEndpoint` com `workersMin=1` (script em DECISIONS `[2026-09-03]`) | ~US$ 2,50/h → **≈ US$ 1,90 na janela de 45 min** |
| 2. Conferir | 30 min antes | `GET /v2/<id>/health` até ver `idle: 1` ou `ready: 1` | — |
| 3. Se ficar tudo zero | 30 min antes | **escada** do DECISIONS: recycle max 0→1 → purge-queue + cancel/retry → `workersMin=1` → kill total (min/max=0, esperar zerar, pedir de novo) | — |
| 4. Se ficar `throttled` | — | **DC sem GPU: só esperar** (hoje passou de 1 h). ⚠️ Não adianta escada. | — |
| 5. Job de aquecimento | 15 min antes | 1 vídeo curto pelo produto (o worker já está de pé; serve para provar a cadeia) | ~US$ 0,12 |
| 6. **Cool-down** | ao fim | `workersMin=0` **e provar**: `health` com `idle/ready/running = 0` + reler `workersMin` pela API | — |

**Tempo de ponta a ponta com worker QUENTE (medido, 2026-09-02, 15 s de vídeo):** upload 2,7 s (6 MB) → complete 5,4 s → job 66,4 s → **total ~1 min 15 s**. Com worker frio e DC folgado: ~8,4 min. Com DC apertado (hoje): **indeterminado — mais de 1 h sem GPU**.

**`/livez` × `origin/main` — leitura correta:** ao fim da rodada o `/livez` reporta `1ddb57c` (merge do #60) e a main está em `6977ab4`. **Não é deploy quebrado**: `watchPatterns: ["apps/web/**"]` faz o Railway marcar `SKIPPED` em PRs que só tocam `docs/` (#63 e #65 são docs-only; conferido em `list-deployments`: SKIPPED, e o #60 SUCCESS). **A regra do aceite passa a ser: `/livez` tem de bater o último commit que tocou `apps/web/**`, não o HEAD da main.** Divergência sem isso vira alarme falso toda rodada com PR de documentação.

**Estado do endpoint ao fim da rodada — PROVADO** por `GET rest.runpod.io/v1/endpoints/mfnx103w05drr5`: `workersMin: 0`, `workersMax: 1`, `idleTimeout: 5`, volume `upp3c2jg6i`. Health ao fim: fila 0, 18 jobs completos, 0 falhas.

**Aberto por número:** #61 watchdog geração 2 · #62 mínimo no ao vivo · **#64 restringir gpuIds às classes de 48 GB** (o 120 s passa de 24 GB) · #37 busca semântica · #41 cores · #47 resto do viewer.

**Próximo comando (rodada seguinte):**
```bash
cd ~/twins-piloto/repo && git pull
# 1) #64: decidir gpuIds só-48GB (o 120 s pede 24,4 GB) — decisão de véspera da demo
# 2) #62 (mínimo no ao vivo, pequeno) e #61 (watchdog g2)
# 3) demo: usar vídeos <=60 s (22,4 GB cabe em qualquer classe) até o #64
```

## Rodada 4 — gravar no celular tem que funcionar (2026-09-03)

**🔴 AÇÕES-VITOR (topo, nesta ordem):**
1. **Abrir `https://logikos-twins-production.up.railway.app/diag` no celular que falhou e mandar um print.** A página imprime UA, isSecureContext, APIs, os 5 mimes com ✔/✘, kinds de dispositivos e o veredito — nada é coletado nem enviado (LGPD); tem botão "Testar câmera" que mostra o NOME exato do erro.
2. Checklist de prova no celular (6 linhas):
   - [ ] abrir `/diag` no aparelho que falhou → print
   - [ ] abrir o link do projeto no **Chrome/Safari** → gravar 60 s → PARAR → ver o job andar
   - [ ] abrir o MESMO link **pelo WhatsApp** → deve aparecer "Abra no navegador do celular" com botão (não mais "não grava")
   - [ ] no fallback (se aparecer): tocar "Gravar com a câmera do celular" → deve abrir a CÂMERA nativa, não a galeria
   - [ ] gravar >120 s na câmera nativa → deve ser recusado com a mensagem de limite, antes de subir
   - [ ] conferir o scan em `/admin` (aba jobs)
3. CORS do R2 segue pendente (rodadas anteriores) — o proxy cobre.

**Auditoria "a gravação de hoje subiu?" (respondida com dados, 2026-09-03):**

| scan | estado | bytes no R2 | multipart | veredito |
|---|---|---|---|---|
| `ceaf8b0a` (02/09 13:44) | recording | **4 partes = 27,4 MB pendentes** | ABERTO — preservado (evidência) | **Subiu EM PARTE.** A câmera abriu, gravou e 27 MB subiram pelo proxy — o `complete` nunca veio (aba fechada antes de PARAR, ou o app matou a página). Não é o webview: é a 2ª tentativa, num navegador real. |
| `22164ff7` (01/09) | recording | 1 parte = 1 KB | **ABORTADO** na auditoria | teste abandonado |
| `38c1b584` (01/09) | recording | 0 partes | **ABORTADO** na auditoria | teste abandonado |
| demais 8 de 48 h | done/error/queued | objetos completos no R2 | — | sadios |

→ **2 multiparts órfãos abortados (≈1 KB); limpeza agora é automática**: `upload-hygiene.ts` roda a cada 5 min (mesmo tick da retenção) — aborta multipart >24 h e marca scan preso em recording/uploading >24 h como `error` com mensagem honesta. O `ceaf8b0a` cai sozinho no próximo ciclo após completar 24 h.

**Tabela do bloco 0 — caminhos que levavam à MESMA tela "não grava" (antes do fix):**

| # | Condição real | file:line (antes) | O que o usuário via |
|---|---|---|---|
| 1 | `!navigator.mediaDevices?.getUserMedia` | useRecorder.ts:116 | FileFallback "Este navegador não grava direto. Use Enviar vídeo do celular" |
| 2 | `pickMimeType()===null` (sem MediaRecorder OU 0/5 mimes) | useRecorder.ts:124 (58-64) | a MESMA tela |
| 3 | `getUserMedia` lança QUALQUER erro ≠ NotAllowed (NotFound/NotSupported/Security/Overconstrained) | useRecorder.ts:152-160 + CaptureClient:95 | a MESMA tela (estado unsupported) |
| — | webview (WhatsApp/Instagram…) | **não existia detecção** | caía num dos de cima — caminho ERRADO |
| — | `https-required` checava `location.protocol`, não `isSecureContext` | CaptureClient:50 | falso-seguro possível em webview/iframe |

**O que mudou (cada causa com sua tela — `support.ts` é o módulo puro, ordem é contrato):**
1. `isSecureContext=false` → `https-required` (agora via isSecureContext).
2. Webview embutido (WhatsApp/Instagram/FB/LinkedIn/Telegram/GSA/`; wv)`) → **estado NOVO `in-app-browser`** (contrato v1.2 ganhou o estado + plug `capture.open-external`, nas duas cópias): "Abra no navegador do celular", botão que tenta `window.open(_blank)` + instrução do menu. **Ordem: https ANTES de webview ANTES de unsupported — testada.**
3. APIs ausentes/mime zero → `unsupported`, com motivo técnico (`getUserMedia:ausente`, `MediaRecorder:ausente`, `mime:nenhum de 5`, `err.name`) guardado em `state.reason` e visível recolhido no fallback (details) e na `/diag`.
4. `NotAllowedError`/`SecurityError` → `permission-denied`; `NotFoundError` e afins → `unsupported` (fallback de câmera).

**Fallback agora GRAVA (bloco 5):** input primário com **`capture="environment"`** (o toque abre a câmera nativa — confirmado que o atributo NÃO existia; era metade da confusão) + accept `video/*`; texto trocado para **"Gravar com a câmera do celular"**; galeria/desktop/drone vira secundário. Mesmo pipeline (PartBuffer 8 MB → UploadQueue com retry/backoff → proxy → mesmas rotas). **Limite de 120 s validado no cliente via metadata ANTES de subir** (`checkFileLimits`, errorCode limit-exceeded) e revalidado no servidor (`complete` 422 — agora o durationS REAL é enviado, antes ia null e o servidor nunca validava).

**Prova do arquivo grande pelo proxy (produção, 2026-09-03):** 150,1 MB sintético (testsrc2 120 s 1080p) em 18 partes de 8 MB → **32,3 s (37,2 Mbps), pior parte 4,0 s, zero erro de body-limit/timeout; memória do serviço pico 0,18 GB, CPU pico 9%**. Sem `complete` (teto GPU US$ 0 respeitado); multipart e linha de teste limpos.

**Provas de gate:** 200 testes ✓ (28 files) · sabotagens por sed = 1 vermelho cada: ordem do verdict invertida; `capture="environment"` removido; higiene abortando o upload de hoje · FileFallback entrou no gate estático no-hardcode (ficou VERMELHO com os literais antigos antes da conversão — prova natural) e os literais/magenta saíram.

**D- da rodada:**
- D: retomada além do retry-por-parte (persistir sessão multipart entre reloads) fica de fora — 4 tentativas com backoff por parte cobre 4G instável; retomar após fechar a aba exigiria persistir estado local e reconciliar com o servidor (registrar se o piloto mostrar necessidade).
- D: `/diag` fora do gate de strings (página técnica, output é dado do navegador); zero coleta.
- D: o scan `ceaf8b0a` do Vitor NÃO foi completado manualmente (mp4 sem moov final tem chance de ser inútil e completar dispararia job = GPU; a regra de 24 h limpa).
- D: contrato v1.2 ganhou `in-app-browser`/`capture.open-external` — decisão registrada aqui; export do Design fica de atualizar na próxima ida ao Design.

**Ficou por provar (precisa de aparelho físico):** o comportamento REAL do webview do WhatsApp/Instagram no aparelho do Vitor (a heurística de UA está testada com UAs reais, mas o aparelho exato não foi informado — bloco 1 existe para isso); se `window.open(_blank)` escapa do webview em cada app (melhor esforço documentado na tela).

**Próximo comando (rodada seguinte):**
```bash
cd ~/twins-piloto/repo && git pull
# 1) ler o print do /diag do Vitor e agir sobre o dado real
# 2) se o webview for o culpado confirmado: avaliar deep-link intent:// (Android)
# 3) pendências: #37 busca semântica · #41 cores · resto da #47
```

## Rodada 3 — Piloto no ar (2026-09-02)

**🔎 Divergências-achado (topo, como pede o prompt):**
1. **O endpoint `piloto-lingbot` estava com `locations=EU-RO-1` e o volume de pesos em US-KS-2** — combinação que NUNCA provisiona worker (zero em tudo, nem `throttled`). Não identifiquei quem mudou (não foi esta sessão; suspeito da exploração do endpoint-reserva na rodada 2). Corrigido via `saveEndpoint` → US-KS-2 **+ recycle obrigatório `workersMax 0→1`** (sem o recycle o scaler segue congelado mesmo com config certa). Receita em DECISIONS `[2026-09-02]`.
2. **A main estava VERMELHA no CI** ao abrir o PR #53 (herdado dos merges da rodada 2B): 3 erros de lint (react-compiler) + `mysql2 [high]` do prisma CLI no gate de vulnerabilidades + 2 arquivos fora do prettier. Consertado dentro do #53 (override `mysql2@^3.24.3`; downgrade sugerido pelo npm audit foi recusado).
3. CORS do R2 segue sendo **AÇÃO-VITOR** (creds sem escopo de bucket, provado 2×) — o proxy same-origin (#51) cobre o piloto.

**Entregue (tudo mergeado, deploy provado por /livez == SHA da main):**
- **#53 → issue #47:** `/s/:shareToken` somente-leitura REAL. Capability no servidor: `authorizeRead → owner|guest`; **cada endpoint de escrita responde 403 ao convidado com um teste por endpoint** (parts, parts/upload, complete, scale, annotations, +cancel/retry no #55). Migration `share_links` (token 192 bits, validade 1/7/30d, revogação, views). Viewer em readOnly É a tela `shared` do contrato (plugs shared.*, dock sem escrita, overlay de pick desmontado). Sheet de share do dono substitui o `navigator.share` que **vazava o token do dono**. Estados expired/revoked renderizáveis. Gates sabotados e provados (403→200 e data-screen errado = vermelhos).
- **#54 → bloco 4 LGPD:** retenção de 7 dias **provada em produção com objeto de teste** — INSERT vencido via `railway ssh` + objeto no R2 → o job real (tick 5 min) purgou sozinho (`video_deleted_at 07:52:34+00`, objeto AUSENTE). Produção usa o default 10080 min (conferido: env não sobrescreve). `docs/piloto/LGPD-PILOTO.md` + `retention.proof.test.ts` (roda só com `LGPD_PROOF_ENV`) + `scripts/f0-real.mjs`.
- **#55 → issue #45:** cancelar / tentar de novo / rerun de admin. `ScanStatus` ganha `cancelled` (migration aditiva). Regras no servidor: cancel condicionado ao status (409 se já terminou; COMPLETED tardio não ressuscita), retry só com vídeo bruto vivo (LGPD → 409 honesto), admin rerun inclui `done`. **Dogfooding em produção na mesma hora:** o scan preso do e2e foi destravado com `POST /cancel` + `POST /retry` reais.

**Bloco 6 — e2e GPU pelo caminho NOVO (proxy #51), medido em produção:**
| Etapa | Número |
|---|---|
| create → scan | 1,1 s |
| upload 6 MB (2 partes, proxy same-origin) | **2,7 s** |
| complete → queued | 5,4 s |
| Job GPU (15 s de vídeo, 150 frames) | exec **66,4 s** · infer 16,0 s · upload artefatos 9,9 s |
| Custo do job | **US$ 0,0461** · VRAM pico 13,5 GB · 643 786 pontos · 44 kf |
| Cold start honesto | retry→done **8,4 min** (recycle + DC apertado: throttled oscilou ~4 min antes da GPU) |
| Custo GPU da rodada | **≈ US$ 0,05** (teto 5,00; gatilho de parada 3,00 — longe) · saldo 20,74 |

Meta "<10 min frio" passou **sem margem** → warm-up antes da demo é OBRIGATÓRIO (abaixo).

**Warm-up / cool-down da demo (comandos):**
```bash
# 15 min antes (aquecer): recycle + job sintético para materializar o worker
# (usar o python de DECISIONS [2026-09-02]: saveEndpoint workersMax 0→1)
# e disparar 1 vídeo curto pelo produto (custo ≈ US$ 0,05)
ENVFILE=env.json VIDEO=curto.mp4 node scripts/f0-real.mjs   # ou o fluxo do celular
# na janela da demo: workersMax=2 SÓ se houver 2 apresentações simultâneas
# depois (esfriar): conferir /health workers=0 (idleTimeout 5 s esvazia sozinho);
# workersMax volta a 1; custo em regime = storage do volume (US$ 0,001/h)
```

**Roteiro literal da demo (link + celular, sem cadastro):**
1. Admin cria projeto em `/admin` (aba projetos) → **copiar link** `/p/<token>` → mandar no WhatsApp do cliente.
2. Cliente abre no celular → `Gravar` → permitir câmera → filmar 15–60 s → `PARAR`.
3. A página de status mostra as etapas; se travar: **Cancelar → Tentar de novo** (agora existem).
4. `done` → viewer 3D no celular; medir com 2 toques; busca filtra objetos.
5. Botão share → **link de convidado 7 dias** → abrir aba anônima: viewer somente-leitura (badge), sem ferramentas de escrita.
6. `/admin`: job com custo, proveniência, reprocessar.

**AÇÕES-VITOR (persistem):**
- **CORS do R2** (JSON exato em DECISIONS `[2026-09-01]`) — destrava o upload direto e aposenta o proxy.
- **Vídeos reais em `pilot/inputs/`** → `ENVFILE=… node scripts/f0-real.mjs` (F0-real + escala ≤5%).
- **Teste no celular físico** do fluxo completo (aceite 8 da rodada 2 segue pendente).

**Pendências numeradas:** #37 busca semântica real (grande — embeddings; a busca atual filtra labels client-side) · #39 config persistente (usdBrlRate/gpuUsdPerS) · #41 cores do export · resto da issue #47 (cloud_full/LOD toggle real, delete de anotação).

**Próximo comando (rodada seguinte):**
```bash
cd ~/twins-piloto/repo && git pull
# 1) se houver vídeos: F0-real (acima). 2) #39 (pequeno). 3) #37 (grande, planejar).
# aceite visual: abrir o roteiro da demo de ponta a ponta num celular físico.
```

## Camada B — conversão das telas (2026-09-02, em curso)

**Infra:** export commitado (2113680) e push destravado (script do Vitor: issues #40/#41, comentário na #12) · `watchPatterns=["apps/web/**"]` no serviço (provado por GET + deploy SKIPPED no push de design/) · contrato **v1.2** = fusão fonte-única (PR #42; snapshot do export preservado) · harness do gate (plug-coverage + no-hardcode + @testing-library MIT).

| Tela | PR | Estados | Plugs | Gate provado falhando |
|---|---|---|---|---|
| entry (/entry; troca de / no aceite) | **#43 ✔** | 5/5 | 4 (+POR ITEM testado) | 3 vermelhos |
| capture (/new, hook real) | **#44 ✔** | 8/8 | 5 na matriz | 2 vermelhos |
| job (/scan/[id], orquestração intacta) | **#46 ✔** | 7/7 | 5 (+recapture) · cancel/retry=#45 | 6 vermelhos |
| viewer (tela real, 1 PR — mesmo arquivo) | **#48 ✔** | 7/9 (loading-full+share nomeados → #47) | 13 reais (+tag.set/example/pin.open POR ITEM) · lod.toggle=#47 | 3 vermelhos |
| shared | **resultado negativo registrado** | — | dono≡convidado até #38: os 4 plugs shared.* duplicariam o viewer na MESMA tela (viola unicidade) — pendente-nomeado | — |
| admin | **#49 ✔** | 2/8 reais (login NOVO + jobs) · 6 nomeados #38/#39/#45/#47 | login/filter/nav×4 + open/provenance.copy POR ITEM | 1 vermelho |

**Totais:** 138 testes web · zero literal/zero hex nas telas convertidas (gate estático) · chip de LOD com Content-Length REAL · D-3 (admin 390 px) implementado · **login do admin mudou**: /admin sem cookie mostra o card (plug admin.login); /admin/login segue 404 a token errado.

**Incidente pós-merge (resolvido no PR #50):** os deploys de #48/#49 FALHARAM no Railway — `plug-coverage.ts` importava `docs/piloto/ui-contract.json`, que não existe no contexto `rootDirectory=apps/web` (a CI passa porque o checkout é o monorepo). Fix: cópia viva do contrato em `apps/web/src/lib/piloto/ui-contract.json` + teste de sincronização com a canônica (skip onde docs/ não existe). **Lição permanente: import de fora de `apps/web` compila no CI e quebra só no Railway** — o teste de sync é o guarda. `/livez` provado = commit da main.

**Próximo comando (rodada seguinte):**
```bash
cd ~/twins-piloto/repo && git pull
# pendências numeradas: #37 busca · #38 projetos · #39 config · #45 controles de job · #47 APIs do viewer/share
# aceite visual: abrir /dev/states no dev (DEV_STATES=1) e as 4 telas no staging
```

**D- da Camada B:**
- **Rotas reais × alvo** (routeMap no contrato): /p/:token etc. aguardam #38; telas vivem nas rotas existentes.
- **Stages exibidos = status reais** (5 macro-etapas honestas; blur/extract dentro de "Reconstruindo") — o backend não streama etapa, e % inventada é proibida.
- **errorCodes do export sem emissor real ficam pendentes nomeados** no contrato.
- **Capture:** câmera abre no toque em "Permitir" (gesto + estado do contrato; antes abria no mount); produto preservado (instruções/blur/PDF/LGPD/desktop); spinner→progresso por partes.
- **Pulso semântico:** único movimento contínuo permitido = ponto REC e shimmer da etapa ativa (indicadores de atividade ao vivo, steps/motion-reduce); resto corte seco.
- **Splash de revelação com glitch MANTIDO** (momento-uau do MOTION-SPEC §1; o veto do handoff é a UI operacional) + botão `job.map.open`.
- **Job no /scan:** uploading sem bytes (o upload é do /new) e upload-paused-offline só renderizável em dev — a página de status não é a que envia.
- **119 testes** web no ponto da tela 3.

## Bloco 4 — rodada do front (2026-09-02)

**Divergência no topo:** o prompt dizia contrato v1 em `docs/piloto/ui-contract.json` e export em `design/piloto-mobile/` · **nenhum dos dois existia** (git e disco verificados) · segui o caminho previsto: contrato v1.1 nasceu do que tem fonte; Camada A completa; **Camada B BLOQUEADA no export** (issue #12 — os 46 plugs do v1 entram verbatim no commit dele).

**PRs:** contrato v1.1 (#35, doc-only) e Camada A (#36) — ambos mergeados com CI verde. **76 testes web** (51+25).

### Inventário (bloco 0)

| Item | Existe? | Onde | O que falta |
|---|---|---|---|
| Rotas do contrato | parcial | `/new` `/scan/[id]` (+viewer) `/admin` `/login` `/` · **`/dev/states` NOVO** | `entry`/`shared` dedicadas = Camada B |
| Tokens de design | sim (`--color-*`, casa) | `globals.css:17-33` + D-1 novos (`--color-danger/record/status-processing`) | prefixo `--lk-*` do prompt NÃO adotado — casa vence (registrado) |
| Logo · icons · fontes | sim | `components/Logo.tsx`, `icons.tsx`, `src/fonts/*.woff2` | — |
| Dicionário de strings | parcial | mensagens de erro de produto em `lib/piloto/error-codes.ts`; **233 literais** inventariados por tela (varredura, chaves sugeridas) | extração por tela na Camada B |
| Hooks/endpoints por plug | tabela abaixo | — | 3 issues (#37 #38 #39) |
| Harness de teste | vitest + jsdom | `apps/web/vitest.config.ts` | @testing-library entra na Camada B p/ o gate de render |

### Plugs v1.1 — plug · hook/endpoint · estado

| Plug | Hook/endpoint | Estado |
|---|---|---|
| capture.permission.request | `useRecorder.openCamera` (`useRecorder.ts:128+`) | pronto p/ ligar (B) |
| job.recapture | `router.push("/new")` | pronto p/ ligar (B) |
| search.open · shared.search.open | **não existe busca** | `notImplemented` · **#37** |
| layers.set | dock de camadas do `ScanViewer.tsx` | pronto p/ ligar (B) |
| viewer.pin.open | pins/annotations do viewer | pronto p/ ligar (B) |
| admin.project.open | **sem modelo de projeto** | `notImplemented` · **#38** |
| admin.job.provenance.copy | `meta.json` (artifacts) + clipboard | pronto p/ ligar (B) |
| admin.nav.* (4) | rotas/âncoras do admin | pronto p/ ligar (B) |
| Config.usdBrlRate · gpuUsdPerS | **sem persistência** (costAlertUsd = env ✓) | **#39** |

### Erro do backend → errorCodes (contrato)

12 códigos em `ui-contract.json` + mapeadores totais em `lib/piloto/error-codes.ts` (`mapScanError`/`mapHttpError`, fallback SEMPRE legível). Varredura completa origem→código (39 emissores enumerados) na saída do workflow da rodada; padrão-chave: **errorMsg do worker chegava VERBATIM à UI** (stderr de ffmpeg, paths) — `processing-failed` estanca isso; a string técnica fica p/ log/admin.

### D- da rodada

- **D-1 (magenta/estado):** revogada a extensão que usava magenta em gravar/erro; paleta semântica: erro `#FF5A36` (novo `--color-danger`), ok/atenção = tokens existentes (`#2EE6A3`/`#FFB224` — mantidos em vez dos hex do prompt: identidade da casa vence), processando = Névoa+ícone; **colisão "gravando" resolvida: branco-gelo `#F5F7FA` pulsante em steps + ponto + palavra** (não colide com erro/atenção/ciano). `DESIGN-TOKENS.md` §3.2 reescrito, zero magenta em estado.
- **D-2 (config nunca constante):** os 3 fakes viraram `config` no contrato; persistência de usdBrlRate/gpuUsdPerS = #39.
- **D-camada-A:** dicionário de strings entra POR TELA na Camada B (233 literais mapeados; trocá-los agora = diff monstro sem tela p/ validar). Reversível: as chaves sugeridas estão na varredura.
- **Fugitivo do #27:** `detections` GET validava shareToken na mão (sem validade) — corrigido p/ `findAuthorized` no PR da Camada A; grep atual: zero validação manual restante.

### Próximo comando (Camada B — no commit do export)

```bash
cd ~/twins-piloto/repo && git pull && ls design/piloto-mobile/  # confirmar export
git worktree add ~/twins-piloto/wt-b4-entry -b piloto/tela-entry origin/main
# ordem: entry → capture → job → viewer (casca+ferramentas) → shared → admin; 1 PR/tela
# gate: data-plug 1×/estado (por item em listas) + data-state em /dev/states + zero literal/hex — provar falhando
```

## Rodada 2 — em andamento (2026-09-01)

**Teste no celular (iOS Safari): CAUSA-RAIZ PROVADA.** "Parte 1 falhou: TypeError: Load failed" = o R2 responde literalmente **"CORS not configured for this bucket"** ao preflight — o PUT presignado do navegador não passa (a validação de julho não sobreviveu no bucket). A chave S3 atual não tem permissão bucket-level (PutBucketCors → AccessDenied). **AÇÃO-VITOR (30 s, destrava o celular):** painel Cloudflare → R2 → bucket `logikos-twins` → Settings → CORS policy → colar:

```json
[{
  "AllowedOrigins": ["https://logikos-twins-production.up.railway.app", "http://localhost:3000"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

**Fatos da mensagem da rodada 2 × repo/mundo:**
- Export do Design "em design/piloto-mobile/": **NÃO está no git nem no disco** (main sem commits novos; mdfind vazio) — bloco 4 segue bloqueado nisso.
- `pilot/inputs/`: ausente — F0-real segue pendente.
- Rotação R2: chave do `.env` local ainda VÁLIDA; cadeia web→R2 do staging confirmada (create/presign/PUT 200 + ETag); a confirmação do env do TEMPLATE (worker) roda agora no endpoint reserva.
- #17 FEITA (PR #32): admin por cookie httpOnly via `/admin/login?token=…` 1× — **o link antigo `/admin?token=` deixou de funcionar**.
- #18 FEITA (PR #33): build da imagem revalidado toda segunda 06:00 UTC + dispatch.

**ROTAÇÃO R2: CONFIRMADA ponta a ponta — inclusive o COMPLETED.** O job `conf-principal` rodou quando US-KS-2 voltou (~1,6 h de fila a custo zero): exec 107,9 s, artefatos SUBIDOS ao R2 com as chaves novas do template. Bônus medido: **blur_s 4,71 s**/100 frames com o fix ≤640 px (era 28,8 no v0.1.1; projeção p/ 120 s de vídeo: ~56 s → job completo ~5,5 min, meta de 10 min com folga). VRAM 13.406,9 MB — idêntica ao byte pela 15ª execução.

**ROTAÇÃO R2: CONFIRMADA ponta a ponta.** Web→R2 (create/presign/PUT 200+ETag, chaves do Railway) ✓; worker→R2 (chaves do template) ✓ provado por eliminação — 4 jobs no reserva passaram por `ensure_weights` (download R2 + sha), download do vídeo e blur ANTES de morrer no init da GPU. Um `COMPLETED` cosmético fecha quando US-KS-2 voltar (job `conf-principal` deixado na fila do principal, custo zero até rodar).

**Endpoint RESERVA: REPROVADO nesta forma (2026-09-01).** 4 falhas idênticas em 4 hosts distintos ("FlashInfer requires GPUs with sm75 or higher" = CUDA invisível ao torch) com gpuTypeIds modernos + allowedCudaVersions + minCudaVersion TODOS confirmados por GET — o filtro não segura os hosts do pool sem volume (suspeita: community cloud). Congelado com `workersMax=0` (custo zero; apagar se não houver 2ª investigação). **Runbook vigente para DC seco:** recriar o volume no DC vivo (provado: EU-RO-1→US-KS-2 em minutos — criar volume, PATCH `networkVolumeId`+`dataCenterIds`, 1º cold start repopula do R2 sozinho). O fail-fast do PR #34 tornará o sintoma legível na próxima tag.

**Endpoint RESERVA criado (runbook de indisponibilidade de DC — SUPERADO, ver acima):** `piloto-lingbot-reserva` = `fwxjig9ccyvv41` — mesmo template, SEM volume (ensure_weights baixa do R2 pro disco do container a cada cold, +1–2 min), 7 tipos de GPU (48+24 GB — pico medido 15,4 GB cabe), todos os DCs. **Uso:** US-KS-2 seco (workers `throttled`/zero com fila parada) → `railway variables --service Logikos-Twins- --set "RUNPOD_ENDPOINT_ID=fwxjig9ccyvv41"` (redeploy ~3 min); voltar ao principal (`mfnx103w05drr5`) quando o DC voltar. O principal também ganhou os tipos de 24 GB no pool. **Demo:** `workersMax 2` só na janela — `PATCH rest.runpod.io/v1/endpoints/<id> {"workersMax": 2}` antes, `1` depois.

## Fechamento da rodada 1 (2026-09-01)

**Provado hoje:** motor residente (v0.1.1→v0.1.3) · pesos R2→volume com sha e re-bootstrap por deleção · endpoint serverless real com 12 jobs/0 falhas · F0 sintética 60/90/120 s com previsões batidas · staging no ar com proveniência · blur antes do motor com prova mecânica · **custo total da rodada: US$ 1,08** (saldo 22,03→20,96; US$ 0,001/h em regime = storage do volume) · zero workers ao sair (nova consulta).

| Recurso vivo (produto do piloto) | Id |
|---|---|
| Endpoint `piloto-lingbot` (scale-to-zero, max 1, 1.200 s, FlashBoot, 48 GB) | `mfnx103w05drr5` |
| Volume `piloto-weights-us-ks-2` (cache; R2 é a verdade) | `upp3c2jg6i` |
| Template `piloto-lingbot-v0.1.1` → imagem v0.1.3 por digest | `cbzibv5o40` |
| Staging | https://logikos-twins-production.up.railway.app (projeto Railway `Logikos-twins`, serviços `Logikos-Twins-` + `piloto-postgres`) |

**Operacional aprendido:** trocar template com fila ativa = job amarrado à versão antiga (purge-queue resolve); worker preso pós-update = `workersMax 0→1`; `api.runpod.ai` + User-Agent obrigatórios; PORT=3000 explícito no Railway (healthcheck passa na porta injetada e o domínio apontava p/ 3000).

**Próximo passo da rodada 2:** export do Design → contrato v1.1 + telas (bloco 4B) · F0-real + escala ≤5% · teste no celular físico (aceite 8) · v0.1.3 já contém todos os fixes.

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

- [x] **Bloco 0 — inventário** (issues #9–#19; PR #20) · main ficou vermelha por advisories npm pré-existentes → consertada no PR #22 (issue #21)
- [x] **Bloco 1 — motor residente** · issue #9 · `worker/engine/lingbot.py` (singleton, sem viser), blur ANTES do motor, proveniência completa, 60 testes — decisões em `DECISIONS.md [2026-08-31]`
- [x] **Bloco 2 — imagem v0.1.1 + pesos R2 + volume + endpoint** · issue #10 · PR #24 · pesos NO R2 ✔ (3 objetos `models/<nome>/<sha256>/`, tamanhos conferidos) · código: Dockerfile runtime+FlashInfer AOT 0.6.9+cu128 (nvcc morto), `ensure_weights()` (R2=verdade, volume=cache, marker sha256ok), `version.py`, tag sha no workflow · APÓS MERGE: tag `v0.1.1` → build → criar volume `piloto-weights` + endpoint `piloto-lingbot` via API
- [x] **Bloco 3 — F0 sintética** · issue #11 · previsto×medido em `DECISIONS.md [2026-09-01]`; decisão GPU: cabe em 24 GB (15,4 ≤ 19) mas FICA em 48 GB (4090 sem capacidade em US-KS-2 — provado por sonda cancelada) · `F0-real: PENDENTE (aguardando vídeos)` — re-execução: mesmos comandos com `pilot/inputs/*.mp4`
- [~] **Bloco 4 — front mobile** · issue #12 · 4a FEITO (PR #27: validade 7d unificada, PWA, 120 s); contrato v1.1 + telas BLOQUEADOS no export do Design
- [x] **Bloco 5 — Railway staging** · issue #13 · NO AR: https://logikos-twins-production.up.railway.app (`/livez` devolve o commit; serviço já existia FALHANDO todo push — rootDirectory era a causa); confiabilidade: 3 seguidos 53–55 s upload→link + simultâneos com fila provada (par-B esperou ~200 s), 12 jobs/0 falhas
- [x] **Bloco 6 — endurecimento (código)** · issue #14 · PR: cap de partes por MAX_VIDEO_MB (413), alerta custo ≥ COST_ALERT_USD no admin (custo/job já existia), `verify_blur.py` (rodado: 0 rostos/26 imgs); TTL do bruto = VIDEO_RETENTION_MINUTES (D7, já implementado); exclusão de scan: NÃO existe fluxo de delete (arquivar entra com o export/admin novo)

## AÇÕES-VITOR

| Ação | Bloqueia |
|---|---|
| **Entregar a pasta do export do Claude Design** → commitar em `design/piloto-mobile/` (ou informar o caminho aqui; o Code commita) | Bloco 4 camada visual + contrato v1.1 (os 46 plugs do v1 só existem no export) |
| Depositar `pilot/inputs/*.mp4` + `pilot/inputs/medidas.json` (3 distâncias reais/vídeo) | F0 real (bloco 3) — sintético segue sem isso |
| Ligar alerta de saldo baixo / auto-pay no RunPod (saldo atual US$ 22,03 — OK p/ a rodada) | Nada; proteção |
| **Rotacionar a credencial S3 do R2** (o PATCH da REST do RunPod ecoou o env do template no log local desta sessão — exposição só em transcript local, risco baixo) | Nada; higiene |
| Testar no próprio celular (iOS Safari + Android Chrome) e preencher a tabela de escala | Aceites 8 e escala ≤5% (fim da rodada) |
| ~~Tornar imagem GHCR pública~~ | **JÁ É PÚBLICA** — riscado |

## Infra do piloto (criada 2026-09-01 via API — TUDO com prefixo piloto-)

| Recurso | Id | Config |
|---|---|---|
| Imagem | `ghcr.io/logikos33/logikos-twins-worker:0.1.1` | digest `sha256:c94e7588f0e4…`; tags `0.1.1` + `d7e52b7f…` (sha) + `latest`; pública |
| Network volume | `upp3c2jg6i` (`piloto-weights-us-ks-2`) | 15 GB, **US-KS-2** (EU-RO-1 e US-TX-3 tinham capacidade ZERO p/ 48 GB — provado por sonda; volume original apagado) |
| Template | `cbzibv5o40` (`piloto-lingbot-v0.1.1`) | imagem POR DIGEST; segredos S3/webhook no env do template (fora de repo/log; REST não expõe Secrets API) |
| Endpoint | `mfnx103w05drr5` (`piloto-lingbot`) | max workers 1 · idle 5 s · exec timeout 1.200 s · FlashBoot · cuda allowed 12.8/12.9/13.0 · GPUs L40S/6000Ada/L40/A40/A6000 · DC US-KS-2 · **API de jobs: api.runpod.ai + User-Agent obrigatório** |

### Previsão ANTES do smoke (bloco 2.6 → entrada do bloco 3)

| Métrica | Previsto | Limiar de aceite |
|---|---|---|
| 1º cold start (pull imagem + pesos R2→volume + sha + load) | 4–8 min | só informativo (1ª vez; cold start "de regime" é com FlashBoot+volume quente ≤ 120 s) |
| Inferência smoke (10 s × 10 fps = 100 frames, L40S) | 30–90 s | terminar < timeout |
| Pico VRAM (100 frames) | 8–14 GB | ≤ 19 GB (o teste que decide 24 vs 48 GB é o de 1.200 frames, bloco 3) |
| Custo do smoke | ≤ US$ 0,60 | teto US$ 1; teto da F0 inteira US$ 3 |
| Proveniência | completa, zero "unknown" exceto APP_URL ausente | qualquer "unknown" em commit/sha = falha |

## Recursos vivos (verificado 2026-08-31 por API)

- **RunPod:** 0 pods · 0 endpoints · **0 network volumes** (o volume de pesos sumiu — repopular no bloco 2) · saldo **US$ 22,03** · spendLimit US$ 80 · US$ 0/h. GraphQL exige User-Agent de browser (Bearer puro → 403 Cloudflare).
- **GHCR:** `ghcr.io/logikos33/logikos-twins-worker` público, tags `0.1.0`/`latest` — **v0.1.0 quebrada p/ produção**.
- **HF `robbyant/lingbot-map`:** público; `lingbot-map.pt` = 4.632.303.465 bytes (~4,63 GB) ✓; há também `-long.pt`, `-stage1.pt`, `skyseg_batch.onnx`.
- **GitHub:** default branch `main`; issues #9–#19 abertas nesta rodada (antes: 0).

## F0 sintética — PREVISÃO escrita antes do disparo (2026-09-01)

Base: smokes de 100 frames (VRAM 13.406,9 MB determinística, infer 0,11 s/frame, imagem v0.1.2 com blur cacheado).

| Vídeo | Frames | VRAM prevista | Tempo previsto (exec) | Custo previsto |
|---|---|---|---|---|
| smoke-4 (10 s, imagem nova, cold) | 100 | 13,4 GB | 50–70 s + cold 2–5 min (pull v0.1.2 + re-download .pt) | ≤ US$ 0,25 |
| 60 s | 600 | 14,5–16 GB | 3–5 min | ≤ US$ 0,25 |
| 90 s | 900 | 15–17 GB | 4–7 min | ≤ US$ 0,35 |
| 120 s | 1.200 | **16–18 GB** | 6–9 min (meta ≤ 10 min upload→link) | ≤ US$ 0,45 |

Limiar da decisão de GPU (D-): pico ≤ 19 GB no vídeo de 120 s → endpoint desce p/ 24 GB (4090). Componentes da previsão: 13,4 GB medidos + ~2,7 GB de frames de entrada na GPU (1.200 × 2,4 MB) + crescimento dos tokens special (~0,3–1 GB). Teto de custo da F0: US$ 3 (gastos até aqui: ~US$ 0,35).
`F0-real: PENDENTE (aguardando vídeos)` — re-execução: os mesmos comandos com `pilot/inputs/*.mp4` no lugar dos sintéticos.

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

## Export do design (02/09/2026)

- Export do Claude Design commitado em `design/piloto-mobile/` (commit `2113680`, 15 arquivos, 4.344 linhas). **Camada B do Bloco 4 destravada.** Verificação de contrato na data do commit: 46/46 `data-plug` do `ui-contract.json` presentes no DOM dos `.dc.html` (78 ocorrências, 47 valores distintos), zero `data-plug` estático fora do contrato, e `Viewer.dc.html` como único com plug dinâmico (`{{ rootPlug }}`) — o 47º valor. Dívidas registradas no `README.md` da pasta: três controles sem plug (`tg.pick`, `ex.go`, `dop.pick`) e divergência de cor `#3DDC84`/`#FFB020` contra `--color-success: #2EE6A3` / `--color-warning: #FFB224`.
