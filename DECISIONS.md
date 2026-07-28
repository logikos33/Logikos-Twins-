# DECISIONS.md — log cronológico

Registro leve de divergências entre plano e realidade, e de microdecisões tomadas
durante a execução. Quando uma entrada for **arquitetural**, ela é promovida a um
ADR em [`docs/adr/`](./docs/adr/) e esta entrada passa a apenas linkar — sem duplicar
conteúdo.

Formato: `## [data] título` → o que o plano dizia · o que a realidade é · o que foi decidido.

---

## [2026-07-26] O repositório remoto está vazio — não havia `main` publicado

**Plano (`PROMPT-EXECUCAO.md`):** "no repositório já criado `github.com/logikos33/Logikos-Twins-` (branch `main`)"
e "o `main` já existe publicado".

**Realidade (medida):** `gh api repos/logikos33/Logikos-Twins-` → `size: 0`;
`gh api .../git/refs` → `409 Git Repository is empty`. O repositório foi criado em
2026-07-26T19:53:03Z e **nunca recebeu um commit**. Não existe branch alguma, nem `main`.

**Decisão:** `git init -b main` local + `git remote add origin` + push inicial cria a `main`.
Não há histórico remoto para preservar nem risco de conflito. Regra C-04 aplicada:
o estado real venceu o documento.

---

## [2026-07-26] A pasta de trabalho estava dentro de OUTRO repositório git

**Realidade (medida):** `git rev-parse --show-toplevel` dentro de
`/Users/vitoremanuel/Documents/Logikos Twins` retornava `/Users/vitoremanuel` — o
**diretório home do Vitor é um repositório git** cujo remote é
`github.com/logikos33/epi-recognition-system`. Sem isolamento, qualquer arquivo criado
aqui apareceria como untracked naquele repositório, e um `git add -A` distraído lá
comitaria o Logikos Twins inteiro dentro do EPI Recognition.

**Decisão:** `git init` dentro de `Logikos Twins` cria um `.git` próprio, e o git para de
descer nessa pasta a partir do repositório pai (passa a ser um repositório aninhado,
ignorado pelo pai a menos que adicionado explicitamente). Isolamento verificado:
`git rev-parse --show-toplevel` agora retorna a própria pasta.

**Risco residual registrado:** o home ser um repositório git é uma armadilha do ambiente,
não deste projeto. Anotado em `CLAUDE.md` para não ser redescoberto a cada sessão.

---

## [2026-07-26] Commit do motor LingBot-Map pinado

**Medido:** `gh api repos/Robbyant/lingbot-map` → licença `Apache-2.0` ✔,
default branch `main`, HEAD `1f480aeb8a47a24656090d46d053115b7fe60435`
("Remove Oxford example", 2026-07-23T18:02:18Z).

**Decisão:** o Dockerfile do worker faz `git checkout 1f480aeb8a47a24656090d46d053115b7fe60435`.
Build reprodutível — o motor não muda debaixo de nós entre um build e outro.
Atualizar o pin é uma mudança deliberada, com ADR se o comportamento mudar.

---

## [2026-07-26] Docker daemon não estava rodando; toolchain local

**Medido:** `docker --version` → 29.5.2 e `docker compose version` → v5.1.3 (instalados),
mas `docker info` falhava — Docker Desktop não iniciado. Node v25.6.0, npm 11.8.0,
Python 3.14.4, gh 2.89.0 autenticado como `logikos33`.

**Decisão / consequência:** Docker Desktop iniciado na D0. O **Python do sistema (3.14) não
é usado pelo pipeline** — o worker roda em container com Python 3.10 (exigência do
LingBot-Map). O gerador de fixture (`scripts/make_fixture.py`) foi escrito para depender
**apenas de numpy** (PLY binário escrito à mão, sem `open3d`), justamente porque `open3d`
ainda não publica wheels para Python 3.14 e a fixture precisa rodar na máquina do Vitor
sem container.

---

## [2026-07-26] Postgres do compose exposto na porta 5433 do host

**Medido:** a máquina do Vitor tem um Postgres **nativo** escutando em `127.0.0.1:5432` e
`::1:5432` (processo `postgres` do usuário, fora do Docker). O bind `*:5432` do Docker era
sombreado para conexões a `localhost` — o Prisma conectava no Postgres errado e falhava com
`role "twins" does not exist`.

**Decisão:** o serviço `postgres` do compose publica em **5433** no host. Dentro da rede do
compose continua `postgres:5432`. `.env.example` e docs atualizados.

---

## [2026-07-26] Prisma 7: configuração nova (prisma.config.ts + driver adapter)

**Plano/handoff:** citava "Prisma (ou Drizzle)" sem versão. O ecossistema instalou o
**Prisma 7.9**, que mudou o modelo de configuração: `url` no `datasource` do schema **não é
mais suportado** (erro P1012), o provider do generator virou `prisma-client`, e o runtime
exige driver adapter (`@prisma/adapter-pg`).

**Decisão:** seguir o modelo novo (realidade > plano): conexão do migrate em
`prisma.config.ts` (lendo o `.env` da raiz via `process.loadEnvFile`), cliente gerado em
`src/generated/prisma` (fora do git; `postinstall`/`prebuild` regeneram), e singleton
**lazy** em `src/lib/db.ts` — o `next build` importa as rotas para coletar metadados, e um
cliente instanciado no import exigiria DATABASE_URL em tempo de build.

---

## [2026-07-26] ETag exposto no CORS é pré-condição do upload direto

**Contexto:** o navegador envia cada parte por `PUT` direto ao storage e precisa **ler o
header `ETag`** da resposta para o `CompleteMultipartUpload`. Cross-origin, isso exige
`Access-Control-Expose-Headers: ETag` do lado do bucket.

**Estado:** no MinIO do compose funciona (verificado no E2E — upload de 2 partes com
complete OK). **No R2, expor o ETag na configuração de CORS do bucket é item obrigatório
do plug-in** — adicionado ao PLUGIN-CHECKLIST (D7). Sem isso, a gravação ao vivo falha com
"parte sem ETag na resposta".

---

## [2026-07-26] torch 2.8.0+cu128 não existe mais no índice do PyTorch

**Plano (§3.3/§6):** worker com `torch==2.8.0` do índice `whl/cu128`.

**Medido:** o índice cu128 oferece `2.7.0, 2.7.1, 2.9.0, 2.9.1, 2.10.0, 2.11.0` — o
2.8.0 foi removido. O erro reproduz em build limpo.

**Decisão:** `torch==2.9.1+cu128` + `torchvision==0.24.1` (o par mais próximo acima do
que o plano pedia; 2.7.x ficaria ABAIXO do que o motor foi testado). Compatibilidade do
LingBot-Map com 2.9.1 marcada `[TESTAR no plug-in]` — é exatamente o tipo de validação
que a F0 existe para fazer.

---

## [2026-07-27] Cap de custo TOTAL do projeto: US$ 30/mês (decisão do Vitor)

**Plano (§9.2):** sugeria hard cap de US$ 50/mês.

**Decisão do Vitor no início da FASE PLUG-IN:** teto TOTAL de **US$ 30/mês**, composto:
RunPod ~US$ 15 (spend limit configurado no console), Railway hard limit US$ 10, R2
dentro do free tier. Substitui a sugestão antiga. Qualquer decisão que ameace esse teto
(worker "active", GPU mais cara, storage acima do free tier) volta ao Vitor antes.

---

## [2026-07-27] Gateway S3 do RunPod corta partes bem antes do limite documentado

**Plano/docs oficiais (storage/s3-api):** "Multipart uploads required for files
exceeding 500MB; individual parts capped at 500MB".

**Realidade medida** (datacenter US-MO-2, volume `jow25i1co4`): parte de 256 MB →
**413 Content Too Large** do gateway na frente da API — não é o limite da própria API
S3, é um proxy que corta antes. Sondagem binária achou o teto funcional: **128 MB
passa, 256 MB não**. Consequência colateral: a sessão de multipart ficou inválida
depois do 413 (a próxima tentativa veio como `NoSuchUpload`), e um multipart
abandonado ficou no volume até ser abortado manualmente.

**Decisão:** `PART_SIZE` em `scripts/populate_volume.py` reduzido para **100 MB**
(margem abaixo do teto medido, já que ele pode variar por DC/momento — não é uma
constante documentada, é um comportamento observado). O script agora aborta o
multipart automaticamente em qualquer falha (antes deixava pendurado) e usa backoff
crescente (5/10/20/30s) em vez de fixo. C-04 aplicado: a doc do fornecedor não é
fonte de verdade quando o gateway na frente diverge dela.

---

## [2026-07-27] Design da marca aplicado a partir do manual (sessão de design agendada)

**Plano:** identidade visual pendente; UI utilitária em neutros (D4/D7).

**Realidade:** o Manual da Marca LOGIKOS (board Miro) foi lido na íntegra pela sessão de
design de 27/07 — paleta nomeada, geometria SVG oficial do logo e os woff2 variáveis
das três famílias foram extraídos do próprio manual. Entregáveis em `docs/design/`
(DESIGN-TOKENS, MOTION-SPEC, RELATORIO-DESIGN, com extensões marcadas e perguntas
pendentes q1–q8).

**Decisão:** aplicar o design como camada de APRESENTAÇÃO na branch
`design/logikos-twins` — rotas, payloads e serviços intactos (contrato nº 2 do
briefing). Fontes via `next/font/local` (build segue offline). Magenta `#FF2E63`
assume gravar/erro como "micro-detalhe" do produto — [extensão do manual], validação
pendente com o Vitor (q2). Cores de classe de detecção: hash do rótulo → paleta
categórica de 8 tons dos tokens (mantém "cor estável por classe" sem colidir com o
ciano de UI).

---

## [2026-07-27] Deploy de teste no Railway a partir da sessão Cowork (limites do sandbox)

**Plano:** mesclar o design e subir no Railway direto desta sessão.

**Realidade (medida):** o sandbox da sessão agendada (1) só permite git em repositórios
vinculados à sessão — o proxy interno ignora PATs e não há `add_repo` disponível; e
(2) bloqueia a API do Railway (`backboard.railway.com`, tunnel error). O repositório
chegou por .zip enviado no chat; o design foi integrado e validado localmente
(build + lint + 42 testes + screenshots).

**Decisão:** entregar a branch `design/logikos-twins` como bundle/patches para push
pelo Vitor; deploy orquestrado pelo conector oficial do Railway (roda fora do
sandbox) ou pelo runbook `docs/deploy-railway.md`. Para o fake-runpod dispensar
volume montado, os artefatos prontos da cena sintética (4,6 MB, sem os NPZs do modo
local-worker) foram commitados em `fake-runpod/fixtures/` — vale só para a branch de
teste; a regra "fixtures fora do git" continua para `main` (regenerável via
`make fixture`).

---

## [2026-07-27] Repositório aberto ao público (fix do CI sem minutos)

**Realidade:** o CI do PR #8 falhava em todos os 5 jobs em 2–10s, sem executar
nenhum step, em 10 tentativas seguidas — assinatura de limite de minutos/gasto do
GitHub Actions esgotado no plano privado (2.000 min/mês grátis, já consumidos pelas
~10 execuções × 5 jobs das PRs #1–#8).

**Decisão do Vitor:** tornar `logikos33/Logikos-Twins-` **público** — Actions fica
ilimitado em repositório público. Verificação de segurança feita antes de confirmar
a mudança: scan bruto de todos os 276 blobs já armazenados no objeto-database (todas
as branches, `gitleaks` + grep de padrões de chave) — **nenhum segredo encontrado,
nenhum `.env*` real jamais versionado**. Repositório aberto com segurança confirmada.

---

## [2026-07-27] Revisão das perguntas q1–q7 do relatório de design — decisões do Vitor

O relatório (`docs/design/RELATORIO-DESIGN.md`) listou 8 perguntas da sessão autônoma
de 27/07. A q8 (copy do e-mail de recuperação de senha) o próprio relatório marca como
fora de escopo desta entrega — não decidida agora. As demais, decididas pelo Vitor:

- **q1 (lockup do produto):** aprovado **ΛOGIKOS TWINS** (wordmark oficial + sufixo
  "TWINS" em JetBrains Mono ciano) — mantido como já aplicado, nenhuma mudança de código.
- **q2 (magenta em gravar/erro):** confirmado. O manual restringe magenta a
  "glitch e micro-detalhes"; a extensão do produto trata gravação e erro como os
  micro-detalhes críticos do fluxo — mantido como já aplicado.
- **q3 (verde/âmbar como cores oficiais):** **aprovado** — `#2EE6A3` (sucesso) e
  `#FFB224` (aviso) deixam de ser extensão local e passam a cores funcionais oficiais
  do Manual da Marca LOGIKOS (v1.1). Ação pendente **fora deste repositório**: atualizar
  o board Miro do manual com as duas cores — não é algo que o código resolve sozinho.
- **q4 (limite de gravação):** **não havia divergência real** — o mock HTML dizia
  "até 5 min", mas o componente React (`CaptureClient.tsx`) já usa
  `maxMin = Math.floor(maxSeconds / 60)` com `maxSeconds={env().MAX_VIDEO_SECONDS}`
  (180s = 3 min, o valor real testado desde a D1). Zero código alterado — o texto do
  mock nunca chegou ao produto.
- **q5 (rótulo "pessoa" / LGPD):** mantido **visível como hoje** — "pessoa" já é uma
  classe COCO detectada por padrão (`worker/pipeline/yolox_detector.py`), sem filtro.
  Decisão consciente: esconder por padrão contradiria o módulo EPI/pessoas da RVB
  (âncora do produto — ver `project_cenario_rvb_multimodulo` na memória do projeto).
  Privacidade continua a cargo do blur opcional por scan (D6), escolha do operador.
- **q6 (fallback de arquivo no desktop):** **promovido** a ação de peso igual ao
  botão de gravar, só em telas `md:` (desktop) — `CaptureClient.tsx`. O link discreto
  original permanece intocado em mobile (`md:hidden`); nada mudou no fluxo do celular
  (contrato nº 1 continua valendo — zero botão de upload como caminho principal ali).
- **q7 (abertura do viewer ao terminar):** implementado **"auto-abrir só com a aba em
  primeiro plano"** — `ScanStatusClient.tsx` agora checa `document.visibilityState`
  antes de iniciar a revelação; em segundo plano, troca o título da aba para
  "✓ Mapa pronto — Logikos Twins" e espera o `visibilitychange` antes de revelar,
  restaurando o título original ao fim. Evita abrir uma cena WebGL pesada sem o
  usuário olhando.

**Decisão de fluxo:** deploy no Railway (runbook `docs/deploy-railway.md`, demo com
MinIO+fake-runpod sintético) **fica para depois** — o Vitor optou por aguardar o
worker real (P3–P5 da FASE PLUG-IN: imagem no GHCR, endpoint RunPod, validação F0)
para que o primeiro deploy já processe vídeo de verdade, em vez de subir uma vitrine
com a cena sintética primeiro.
