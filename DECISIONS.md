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
  Decisão consciente: esconder por padrão contradiria o módulo EPI/pessoas do
  primeiro cliente (âncora do produto). Privacidade continua a cargo do blur
  opcional por scan (D6), escolha do operador.
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

---

## [2026-07-27] Limpeza de versionamento — repositório fica público, mas mais enxuto

**Contexto:** o repositório foi tornado público no dia anterior para destravar o CI
(minutos do GitHub Actions esgotados no plano privado). Decisão do Vitor: manter
público, mas revisar o que está versionado — documentos de planejamento carregam
contexto de negócio/mercado (posicionamento competitivo, nome de cliente âncora) que
não pertence a um checkout público, mesmo sem serem "segredos" no sentido técnico.

**Decisão:**

1. `PROMPT-EXECUCAO.md`, `plano-demo-handoff.md` e `docs/design/BRIEFING-FRONTEND.md`
   movidos para `referencias/` (fora do versionamento) — ver `CLAUDE.md` para a
   convenção atualizada e a nova cadeia de precedência (`docs/specs/` → `docs/adr/` →
   `CLAUDE.md`, sem depender mais desses documentos).
2. README enxugado para visão técnica — removida a comparação competitiva
   (Matterport/NavVis/Polycam) e a projeção de custo por scan (~US$0,10), que é uma
   estimativa ainda não validada em produção (a validação é justamente o objetivo da
   F0 do plug-in).
3. Passe de sensibilidade no restante do repositório: nome/sigla do cliente âncora
   redigido para "cliente âncora do módulo EPI" em `OPEN-QUESTIONS.md` e `DECISIONS.md`
   (2 ocorrências) — a sigla original não é repetida nem aqui, de propósito: um log
   que documenta uma redação não deve reintroduzir o termo redigido. Nenhum outro nome
   de cliente, e-mail, telefone ou CPF/CNPJ encontrado em conteúdo versionado. Fontes
   woff2 embutidas (Space Grotesk, Inter, JetBrains Mono) conferidas: SIL OFL 1.1,
   redistribuição explicitamente permitida —
   sem problema de licença.
4. `part1.bin`/`part2.bin` (8 MB de bytes aleatórios, sobra de um teste de multipart
   que vazou para o commit da D2) marcados para purga junto — não são sensíveis, só
   peso morto.

**Próximo passo:** os 5 caminhos acima (3 documentos + 2 `.bin`) saem também do
**histórico** via `git filter-repo` — remover só do HEAD não adianta, esses arquivos
estão em ~20 commits desde a D0. Ver a entrada seguinte para o resultado da reescrita
e a verificação de exposição residual via refs de PR.

---

## [2026-07-27] Reescrita de histórico: caminhos + token do cliente purgados; exposição residual via refs de PR (estrutural, não corrigível por force-push)

**Contexto:** decorrência da entrada anterior ("Limpeza de versionamento"). Os 3
documentos de planejamento e os 2 `.bin` de sobra saíam do HEAD desde o commit normal
anterior, mas continuavam presentes em ~20 commits históricos — e a redação do
nome/sigla do cliente âncora tinha sido feita como edição de conteúdo, não como
purga de histórico, o que deixaria o termo original recuperável via `git log -p`.

**Execução (3 passadas de `git filter-repo`, 2 force-push):**

1. `--invert-paths` nos 5 caminhos (3 documentos + `part1.bin`/`part2.bin`) — remove os
   arquivos inteiros de todos os commits. Force-push #1.
2. `--replace-text` trocando o token do cliente por um marcador genérico em **conteúdo
   de arquivo** — descoberto em seguida que isso NÃO cobre mensagens de commit (são
   dois mecanismos distintos na ferramenta).
3. `--replace-message` com a mesma regra, agora para **mensagens de commit** (2 delas,
   escritas por mim nesta sessão, citavam o token ao descrever a própria redação).
   Force-push #2, com o histórico já limpo nos dois eixos.

**Verificação (antes de cada push):** scan bruto de blobs, `git log --all -p` e
`git log --all --format=%B` para o token (0 ocorrências nos dois eixos), confirmação
de que uma correspondência parcial não relacionada (substring dentro de um hash de
integridade em `package-lock.json`) permaneceu intacta — a substituição foi por texto
literal sensível a maiúsculas, não regex genérico, exatamente para não sobrescrever
esse tipo de coincidência. `gitleaks` limpo (29 commits). Confirmado também **na API
do GitHub** (não só localmente): a árvore de `main` remoto não lista mais os 5
caminhos nem contém o token.

**Exposição residual encontrada (e o motivo de nenhum force-push resolver sozinho):**
o GitHub mantém uma ref própria por PR (`refs/pull/N/head`, uma por cada uma das
PRs #1–#8, todas já fechadas/mescladas) que aponta para os commits **anteriores** à
reescrita — essas refs não pertencem ao branch `main` e não são tocadas por
`git push --force`. Verificado concretamente: o commit antigo da PR #1
(`4640798f…`, pré-reescrita) ainda responde pela API do GitHub — a árvore desse
commit lista os 2 documentos removidos, e `GET /repos/.../contents/PROMPT-EXECUCAO.md?ref=4640798f…`
devolve o SHA e o tamanho do blob antigo. O mesmo mecanismo vale para o token do
cliente nas versões antigas de `OPEN-QUESTIONS.md`/`DECISIONS.md`, presentes nos
commits antigos das PRs que tocaram esses arquivos.

**Por que isso não é corrigível localmente:** as `refs/pull/*` são geridas pelo
GitHub, não por push de cliente — não existe comando git que as apague. Reescrever e
forçar o `main` de novo não muda nada aqui, porque essas refs nunca apontaram para
`main`.

**Severidade avaliada como baixa:** não é uma credencial (nenhuma chave, senha ou
token — isso já era o objetivo do `gitleaks`/scan de blobs, que continuam limpos).
É um identificador de cliente e um texto de posicionamento de mercado, recuperável
apenas por quem souber consultar a API do GitHub num SHA específico de um commit
antigo — não aparece na navegação normal do repositório, no branch `main`, nem em
busca padrão do GitHub (que indexa o branch default).

**Opções (registradas para o Vitor decidir, sem escolher por ele):**

- **Aceitar** — a exposição fica limitada ao mecanismo descrito acima; dado que não
  é credencial e exige uma consulta deliberada e específica, o risco prático é baixo.
  É a opção mais simples e não pende de terceiros.
- **Solicitar ao suporte do GitHub** a remoção definitiva dos objetos/commits
  correspondentes (processo formal de "remoção de dados sensíveis publicados",
  aplicável a repositórios públicos) — é a única forma de purgar de fato as
  `refs/pull/*`; exige abrir um chamado, identificar os SHAs antigos específicos
  (listados nesta entrada/no histórico de comandos desta sessão) e aguardar o
  processamento do lado do GitHub.

Nenhuma das duas opções foi executada nesta sessão — fica como decisão em aberto.

---

## [2026-07-30] Primeira imagem do worker publicada — GHCR via GitHub Actions

**Plano/checklist original:** `docker build worker/` local + push manual para o GHCR.

**Ajuste (repositório público desde 2026-07-27 → Actions ilimitado):** build e push
saem da máquina local e vão para `.github/workflows/release-worker.yml`, disparado
por tag `v*`. Motivo prático: a imagem carrega CUDA 12.8 + torch (~19 GB) — Actions
resolve sem depender da máquina do Vitor estar ligada/com espaço livre.

**Publicado:** tag `v0.1.0` → run `30502557432`, job `build-and-push`, conclusão
`success`.

```
ghcr.io/logikos33/logikos-twins-worker:0.1.0
ghcr.io/logikos33/logikos-twins-worker:latest
digest: sha256:22c9978095f1c6dcab7a970542845a4e1a621ce87e7824a4fff16fa093ab03b5
revisão (commit): 2932778...  (org.opencontainers.image.revision)
```

**Verificação:** log do próprio run (fonte confiável — GitHub Actions, não input
manual). Verificação independente via API do GHCR **não foi possível nesta sessão**
— o token local do `gh` não tem escopo `read:packages`, e adicioná-lo exige fluxo
interativo (device code, navegador) que este ambiente não completa sozinho.

**Visibilidade do pacote:** confirmado antes de escrever o workflow que **não existe
endpoint REST** para mudar visibilidade de pacote (só GET/DELETE/restore na API
oficial de Packages) — é ação manual e **irreversível** na interface web. Pendente,
registrada em `PLUGIN-CHECKLIST.md` com o caminho exato de cliques.

**`GHCR_USERNAME`/`GHCR_PULL_TOKEN`:** conferido — nunca existiram em `.env`,
`.env.example` nem em nenhum arquivo rastreado do repositório. Nada a remover;
o pull sem credencial só passa a funcionar de fato depois do passo manual acima.

---

## [2026-07-30] F0, 1ª tentativa: driver do host não suportava CUDA 12.8 — imagem base do worker não sobe em qualquer máquina

**O que aconteceu:** o pod de validação foi criado com a MESMA imagem base do
`worker/Dockerfile` (`nvidia/cuda:12.8.0-runtime-ubuntu22.04`), deliberadamente, para
o F0 testar o que vai para produção. A máquina sorteada (4090, US-NC-1, Secure Cloud)
tinha driver NVIDIA antigo demais, e o container entrou em **crash-loop desde o
segundo zero**, reiniciando a cada ~16 s por ~14 min sem nunca executar o runbook:

```
nvidia-container-cli: requirement error: unsatisfied condition: cuda>=12.8,
please update your driver to a newer version, or use an earlier cuda container
```

**Por que passou despercebido por 14 min:** o monitor observava (a) o `desiredStatus`
do pod pela API e (b) o artefato de resultado no R2. O pod reportava `RUNNING` o tempo
todo — do ponto de vista do RunPod ele *estava* rodando; quem morria e renascia era o
container dentro dele. Ou seja: **o sinal que eu observava não cobria esse modo de
falha**, e silêncio parecia progresso. O log do container (que o Vitor trouxe) era a
única fonte que denunciava.

**Correções:**

1. **`allowedCudaVersions` na criação do pod** — o schema do RunPod tem exatamente
   esse campo para não sortear máquina com driver incompatível. Não usá-lo foi o erro
   de origem; ele passa a ser obrigatório em qualquer pod nosso com CUDA 12.8.
2. **Monitor precisa observar o container, não só o pod.** Status `RUNNING` do pod não
   é evidência de que o processo iniciou. Próxima tentativa acompanha o log do
   container (ou um heartbeat que o próprio script escreve cedo) para detectar
   crash-loop em segundos.

**Custo:** ~14 min de 4090 Secure (US$ 0,69/h) ≈ **US$ 0,16** — dentro do orçamento
aprovado do F0, mas gasto sem produzir medição.

**Nota de rota:** o F0 já estava em Secure Cloud porque **4090 Community ficou
indisponível** durante toda a janela (20 tentativas de criação ao longo de ~8 min,
todas `SUPPLY_CONSTRAINT`). Diagnóstico confirmado com uma 3090 Community, que subiu
de primeira e foi encerrada em seguida: não era bloqueio de conta, era falta de 4090.

---

## [2026-07-30] F0 revelou: `--no_render` NÃO dispensa o stack de visualização — a imagem de produção estava quebrada

**Este é o achado que justifica a existência da F0.** A imagem `v0.1.0`, já publicada
no GHCR e que iria para o endpoint serverless, **não conseguiria processar um único
job** — o worker morreria antes de tocar a GPU.

**O que a ADR-0007 supôs (e o plano §3.3 afirmava):**

> "`--no_render` evita todo o stack de renderização (kaolin + extensões CUDA): os
> imports de `rgbd_render` são feitos dentro da função de render (lazy), então o
> worker do MVP não precisa de kaolin."

**Medido na F0 (3ª tentativa, pod 4090):** a premissa está **meia certa** — e a metade
errada é fatal. `rgbd_render`/kaolin realmente são lazy. Mas o `batch_demo.py`, que é
o script que o nosso worker executa, faz na **linha 29, no topo do módulo**:

```
batch_demo.py:29         → from lingbot_map.vis.sky_segmentation import ...
vis/__init__.py:31       → from lingbot_map.vis.point_cloud_viewer import PointCloudViewer
point_cloud_viewer.py:28 → import viser
                           ModuleNotFoundError: No module named 'viser'
```

Ou seja: **importar o `batch_demo.py` já exige o stack de visualização**, independente
de `--no_render`. A flag controla o que roda, não o que é importado.

**Causa raiz** (confirmada no `pyproject.toml` do motor, commit pinado): `viser` está no
extra opcional `[vis]`, e nosso Dockerfile fazia `pip install .` — só as dependências
base. O extra correto para quem usa `demo_render/` é `[demo]` (que puxa `[vis]`).

**Correções aplicadas ao `worker/Dockerfile`:**

1. `pip install ".[demo]"` no lugar de `pip install .` — traz viser (MIT), trimesh
   (MIT), matplotlib (PSF), requests (Apache-2.0), onnxruntime (MIT). Licenças
   conferidas no PyPI antes de adotar; nenhuma copyleft forte. `LICENSES.md` atualizado.
2. `libgl1` + `libglib2.0-0` no apt. Motivo separado, também medido na F0: o motor
   declara `opencv-python` (não-headless) e nosso requirements traz
   `opencv-python-headless` — **os dois ficam instalados lado a lado** (com conflito de
   numpy declarado pelo pip), e qual deles provê o `cv2` depende da ordem de resolução.
   Se o não-headless vencer, falta `libGL.so.1` e o worker morre. As libs custam ~30 MB
   e tornam a imagem imune a essa loteria, em vez de depender de sorte.

**Sobre a ADR-0007:** a *decisão* (modo windowed + `--no_render`) permanece válida e não
muda — continuamos sem kaolin, e a imagem segue menor por isso. O que estava errado era
uma *consequência declarada*. ADRs são imutáveis por regra do projeto, então a correção
fica registrada aqui e no comentário do Dockerfile, onde quem for mexer vai ler.

**Números já colhidos (4090, Secure Cloud):**

- `torch 2.9.1+cu128` → `torch.cuda.is_available() = True`. Isso **fecha um
  `[TESTAR no plug-in]`** aberto desde a D3 (o plano pedia 2.8.0, que sumiu do índice).
- Checkpoint de 4,6 GB do HF em **12–15 s** (rede de datacenter). Reforça que o valor do
  network volume está no cold start, não em banda.
- Instalação do torch: 104–131 s. Drivers vistos: 570.172.08 e 580.159.04.
- Inferência: **ainda não medida** — as 3 tentativas morreram antes dela.

**Custo acumulado da F0 até aqui:** ~22 min de 4090 Secure ≈ **US$ 0,25**. Barato para
ter encontrado um defeito que só apareceria no primeiro job real de produção.

---

## [2026-07-30] F0 v4: inferência RODOU — e trouxe dois números que mudam decisões de arquitetura

Com o Dockerfile corrigido (`.[demo]` + libgl1), a 4ª tentativa passou dos imports e
**executou o motor na GPU pela primeira vez**. Confirmação de que a correção anterior
era certeira: `imports OK: cv2 4.10.0, viser 1.0.30`.

Duas descobertas novas, ambas impossíveis de ver sem GPU real:

### 1. `nvcc` não existe na imagem — o flashinfer não compila

```
/bin/sh: 1: /usr/local/cuda/bin/nvcc: not found
ninja: build stopped: subcommand failed.
```

O `flashinfer` compila seus kernels **em JIT, no primeiro uso**, e para isso precisa do
`nvcc`. Nossa base é `nvidia/cuda:12.8.0-runtime`, que traz só as bibliotecas de runtime —
o compilador está na variante `-devel`. O processamento continuou mesmo assim (as 4 cenas
de exemplo completaram e o `batch_results.json` foi salvo), o que sugere fallback; mas
estamos pagando GPU para tentar compilar e falhar em toda execução.

Isto tem eco no plano §2, que já previa "network volume: checkpoint + **cache JIT do
FlashInfer**" — ou seja, a arquitetura pretendida sempre foi ter o JIT funcionando e o
cache persistido no volume, o que exige `nvcc` presente. Opções (a decidir): instalar
`cuda-nvcc-12-8` via apt (~100 MB, bem menos que trocar para a imagem `-devel`) e apontar
o cache para `/runpod-volume`; ou assumir o fallback `--use_sdpa` (documentado no plano
§3.3) e remover o flashinfer, com imagem menor e cold start melhor, ao custo de
desempenho de atenção. **Precisa medir os dois — é decisão de custo por scan.**

### 2. VRAM medida: 20.884 MB de pico — bem acima dos ~13,3 GB do paper

| | Paper / plano | **Medido (F0, 4090 24 GB)** |
|---|---|---|
| VRAM | ~13,3 GB | **~20,4 GB (87% da placa)** |

Medido com `nvidia-smi memory.used` amostrado a cada 2 s durante a execução — isto inclui
o que o caching allocator do PyTorch **reserva**, não só o que está em uso; ainda assim, é
o número que precisa caber na placa. E isso foi com a **cena de exemplo** (4 cenas
pequenas, 8 s de processamento): um vídeo de 2–3 min com `--window_size 128` tende a
pressionar mais.

**Consequência direta para o P4:** o plano manda "começar com L4/A5000 (24 GB)". Com pico
medido de ~20,4 GB, a margem em 24 GB é de ~15% — apertado o bastante para um OOM
derrubar job de cliente. Fica como decisão do Vitor (ver conversa): reduzir `window_size`,
subir para 48 GB (L40S), ou validar com vídeo real antes de fixar.

### Outros números (4090, driver 570.195.03, 24.564 MiB)

- torch: 60 s de instalação · checkpoint 4,6 GB: 18 s · cenas de exemplo: 8 s (4/4)
- `frames: 0` no meu resumo é **artefato da minha medição**, não falha: com
  `--input_folder example` a saída é `batch_results.json` (batch de cenas), não
  `frame_*.npz` por vídeo. O contador procurava o padrão errado.
- `exit_code 4` com o processamento concluído — a investigar junto com o flashinfer.

**Custo acumulado da F0:** ~30 min de 4090 Secure ≈ **US$ 0,34**.

## [2026-08-31] Rodada do piloto mobile — inventário (bloco 0): três premissas do prompt caíram, pin fica, trabalho sai do iCloud

Inventário completo antes de construir (issues #9–#19; estado vivo em `docs/piloto/ESTADO.md`).

**Premissas do prompt de execução que a realidade derrubou:**

1. **"Imagem v0.1.0 privada no GHCR"** — é **pública** (pull anônimo lista `0.1.0`/`latest`).
   O bloco de infra serverless não está bloqueado em ação humana. A imagem segue quebrada
   para produção (o fix `8758237` é posterior à tag) — v0.1.1 resolve.
2. **"`8758237` corrige o nvcc"** — corrige o extra `[demo]`+libgl1. O nvcc segue em aberto
   (entrada de 2026-07-30 acima: `cuda-nvcc-12-8` vs `--use_sdpa`, decidir medindo).
3. **"Pin do motor anterior aos fixes de 24/04 e 28/06"** — o pin `1f480aeb` é de
   **2026-07-23**; o fix real de KV cache (SDPA) é `b8231a4f` de **2026-07-02**, já incluso.
   Nessas duas datas não há commit de KV/FlashInfer/SDPA no repo do motor. **Decisão: pin
   fica** (reversível subindo o `ARG ENGINE_COMMIT`). Achado colateral: o repo do motor tem
   **zero menções a FlashInfer** — validar no bloco 1 se `flashinfer-python` (sem pin,
   `worker/Dockerfile:53`) é mesmo necessária (issue #19). Upstream de 2026-08-31 removeu
   `lingbot-map-long` do README — não contar com o checkpoint `-long` sem validar.

**Decisões operacionais desta rodada:**

- **Trabalho em `~/twins-piloto/`** (clone local com origin no GitHub, worktrees por bloco)
  — o checkout em `Documents` sofre eviction do iCloud (lição do projeto irmão). Reversível
  apagando o clone.
- **`torch 2.9.1+cu128` mantido** — a F0 v4 rodou inferência com ela; o prompt citava
  2.8.0 desatualizado.
- **Registro de decisões continua neste arquivo** (log cronológico da casa), não em
  `docs/piloto/DECISOES.md` como o prompt pedia — um ledger só.

**Estado vivo verificado por API (2026-08-31):** RunPod 0 pods · 0 endpoints · **0 network
volumes** (o volume de pesos citado por `populate_volume.py` sumiu — repopular antes de
qualquer job) · saldo US$ 22,03 · US$ 0/h. HF `robbyant/lingbot-map` público com
`lingbot-map.pt` de 4.632.303.465 bytes.

## [2026-08-31] Bloco 1 do piloto: motor residente — o subprocess morreu, o blur mudou de lado

`worker/engine/lingbot.py`: singleton de processo que carrega o checkpoint UMA vez e
expõe `run(frames_dir, cfg)`, espelhando o caminho do `demo.py` do pin (carga → cast do
aggregator p/ bf16 → `inference_streaming`/`windowed` → pose_enc → extrinsic/intrinsic)
usando SÓ a API pública do pacote — o extra `[vis]/[demo]` sai da imagem no bloco 2.

**Decisões com consequência:**

1. **world_points por DESPROJEÇÃO de depth+pose** (`enable_point=False`), não pelo point
   head — é o default do viewer oficial do motor, garante geometria consistente com a
   pose e poupa VRAM. Reversível por config (`enable_point=True`). `world_points_conf`
   passa a ser `depth_conf`; a F0 valida se a régua do filtro (conf ≥ 1,5) segue certa.
2. **`images` no NPZ sai uint8 0–255.** O `batch_demo.py` grava float [0,1], e
   `npz_to_artifacts.load_frame` faz `.astype(np.uint8)` — ou seja, o caminho real
   produziria nuvem e keyframes PRETOS. Nunca foi notado porque o modo real nunca rodou
   o pipeline completo (a F0 v4 parou nos NPZs de exemplo). A fixture sintética, que
   grava uint8 "como o motor grava", MENTIA sobre o motor — landmine clássico deste
   projeto. Teste `test_imagem_float_01_vira_uint8_e_nao_preto` cobre.
3. **Blur ANTES do motor.** O worker agora extrai os frames (ffmpeg, fps do job) e o
   YuNet roda sobre eles antes da inferência — a cor da nuvem nasce de pixel já borrado.
   Antes o blur rodava DEPOIS, só nos keyframes/thumb (`handler.py` antigo :73-77): a
   nuvem ficava com os rostos nítidos em cor. Falha de blur segue fatal (D6).
4. **Blur vira PADRÃO no worker** (`params.blur_faces` default True). A web ainda manda
   o valor explícito por scan (schema Prisma default false) — o flip do produto é do
   bloco 6, com migration própria.
5. **`torch.compile` fica fora do bloco 1**: o maquinário de compile+warmup do pin vive
   em `demo.py` na raiz do repo do motor, FORA do pacote instalado. A F0 mede o baseline
   sem ele; se o ganho justificar, copia-se o warmup com atribuição (registrar aqui).
6. **open3d removido** do requirements: nunca foi importado (voxel é numpy puro).
7. **Gates novos falham antes de passar** (provado com sabotagem): import de
   `lingbot_map.vis`/`viser`/`open3d`/`kaolin`/`ultralytics` em linha de import do
   caminho servido; volta do subprocess no `infer.py`; e import de `engine.lingbot` em
   subprocess com `torch`/`lingbot_map`/`viser` BLOQUEADOS via sys.modules.

**Proveniência completa no job:** meta.json leva `worker_commit`, `image_sha`,
`weights_sha256` (sha do checkpoint, calculado 1× por processo), `engine_flags`; metrics
levam `peak_vram_mb`, `n_keyframes`, `engine_mode`, `keyframe_interval` e
`stage_timings` por etapa (download/normalize/extract/blur/infer/convert/upload).

**Regras de segurança do RoPE codificadas:** `keyframe_interval` efetivo =
`max(cfg, ceil(n/320))`; windowed automático acima de 3.000 frames. 60 testes (41+19).

## [2026-08-31] Bloco 2 do piloto: nvcc resolvido por AOT, R2 vira fonte da verdade dos pesos

**nvcc (pendência da F0 v4) — decidido SEM imagem devel:** base segue
`cuda:12.8.0-runtime`; entra `flashinfer-python==0.6.9` pinado + wheel AOT
`flashinfer-jit-cache==0.6.9+cu128` do índice oficial (kernels pré-compilados,
abi3). Zero JIT no cold start, zero nvcc, zero cache para gerenciar no volume.
Fallback operacional se o motor implicar com a versão: `ENGINE_USE_SDPA=1`
(flag pronta na EngineConfig). A alternativa devel (+~3 GB) não foi medida —
só se o smoke da F0 derrubar o AOT.

**Pesos: R2 é a fonte da verdade, o volume é cache.**
- Upload feito HOJE do checkout local (sha conferido contra os congelados antes
  de subir; tamanho conferido por HEAD depois): `models/lingbot-map/ee665103…/`
  (4.632.303.465 bytes) + `models/yolox_s/c5c2d13e…/` + `models/yunet/8f2383e4…/`
  no bucket do projeto. Script registrado em `scripts/upload_weights_r2.py`.
- `engine/weights.py: ensure_weights()` no cold start: ausente/corrompido →
  baixa do R2 e VERIFICA sha256; divergência é fatal. Caminho quente = marker
  `.sha256ok` + stat (verificação plena de 4,6 GB só quando falta marker).
- Consequência: o volume novo nasce VAZIO e o 1º cold start o popula de dentro
  do datacenter (R2→RunPod, egress zero da Cloudflare) — o upload de 4,6 GB
  Mac→gateway s3api do RunPod (lento, teto de 128 MB/parte) sai do caminho.
  `populate_volume.py` vira fallback manual.

**Miudezas com motivo:** `version.py` no lugar de `python -m worker --version`
(o layout da imagem é flat em /app, não um pacote `worker`); libgl1/libglib
removidas (sem opencv não-headless, ninguém pede libGL); `latest` + semver +
**sha longo do commit** como tags da imagem; `WORKER_COMMIT`/`IMAGE_SHA`
gravados no build (o digest real fica no registry; image_sha = sha do git da
tag). LICENSES.md ganhou FFmpeg, base CUDA e flashinfer (fecha a issue #15).

## [2026-09-01] Bloco 2 provado com GPU real: 3 smokes verdes, capacidade é por DC, motor residente confirmado na prática

**O caminho até o primeiro job verde** (tudo a US$ 0 até funcionar — gate de infra):
1. `/run` serverless vive em **api.runpod.ai** (não `.io`) e o Cloudflare exige
   **User-Agent de browser** (Bearer puro → 403). O RUNPOD_BASE_URL do staging
   será `https://api.runpod.ai`.
2. Endpoint com volume em EU-RO-1 ficou 16 min IN_QUEUE com **zero workers**
   (nem initializing). Prova de causa por sonda: endpoint descartável SEM volume,
   mesma imagem/template → worker em 46 s. **Capacidade de GPU é por DC, e o
   volume prende o endpoint ao DC.** US-TX-3 idem (zero); **US-KS-2 nasceu em
   30 s** → volume final `upp3c2jg6i` (piloto-weights-us-ks-2); o de EU-RO-1
   foi desanexado e apagado (conta com 1 volume, provado por nova consulta).
3. `minCudaVersion` não aceita null via PATCH — ficou 12.8 + allowedCudaVersions
   [12.8, 12.9, 13.0], que é o que o torch cu128 exige de driver.

**Os 3 smokes (vídeo 10 s × 10 fps = 100 frames, blur ON):**

| | cold | delay | exec | peak VRAM | infer | blur |
|---|---|---|---|---|---|---|
| smoke-1 (volume vazio → bootstrap R2) | 1º do endpoint | 227,5 s | 92,5 s | 13.406,9 MB | 11,2 s | 28,8 s |
| smoke-2 (regime, FlashBoot) | não | **0,45 s** | 54,0 s | 13.406,9 MB | 10,9 s | 17,6 s |
| smoke-3 (após DELETAR o .pt do volume) | não | 0,39 s | 62,3 s | 13.406,9 MB | 10,8 s | 26,9 s |

- Proveniência no meta.json **sem nenhum unknown**: worker_commit=image_sha=
  `d7e52b7f`, engine_commit=pin, weights_sha256=`ee665103…`, engine_flags
  completos com `use_sdpa: false` → **FlashInfer AOT funcionou sem nvcc**.
- Bootstrap provado por **nova consulta ao volume** (3 modelos + 3 markers num
  volume que nasceu vazio).
- O smoke-3 revelou o esperado-mas-nunca-provado: **o worker quente nem nota a
  deleção do checkpoint** — o modelo vive na RAM do singleton; `ensure_weights`
  é do startup. A prova do RE-bootstrap fecha no primeiro cold start da imagem
  v0.1.2 (o `lingbot-map.pt` segue deliberadamente ausente do volume até lá).
- VRAM idêntica ao byte nos 3 smokes — inferência determinística no tamanho.
- Custo acumulado: ~US$ 0,35 (teto da F0: US$ 3).

**Achados que viraram trabalho:** blur criava um FaceDetectorYN POR FRAME
(28,8 s/100 frames — issue #25, PR #26, entra na v0.1.2). O PATCH de endpoint
da REST **ecoa o env do template com segredos** — as chaves S3 do R2 tocaram o
log local desta sessão → AÇÃO-VITOR (higiene, baixa urgência): rotacionar a
credencial R2 do bucket; daqui em diante toda resposta de PATCH é filtrada.

## [2026-09-01] F0 sintética completa: previsões bateram, pico 15,4 GB no vídeo de 120 s — GPU de 24 GB cabe

**Previsto ANTES × medido** (testsrc2 1080p→10 fps, blur ON, worker quente v0.1.2, US-KS-2):

| Vídeo | Frames | VRAM prevista | VRAM medida | exec | infer | blur | n_kf |
|---|---|---|---|---|---|---|---|
| 60 s | 600 | 14,5–16 GB | **14.320,9 MB** | 220 s | 58,6 s | 60,2 s | 156 ✓ |
| 90 s | 900 | 15–17 GB | **14.868,9 MB** | 353 s | 85,8 s | 80,3 s | 231 ✓ |
| 120 s | 1.200 | 16–18 GB | **15.417,7 MB** | 654 s | 118,4 s | **321,9 s** | 306 ✓ |

- Crescimento de VRAM linear (~1,1 MB/frame) e DETERMINÍSTICO; inferência 0,10 s/frame.
- **Decisão de GPU: pico 15,4 GB ≤ 19 GB → endpoint desce para 24 GB (4090)**, com
  ~36% de margem. Condicionada à capacidade de 4090 em US-KS-2 (sonda em andamento;
  sem capacidade → fica 48 GB e a margem é conforto, não custo).
- **O 120 s estourou a meta de 10 min POR CAUSA DO BLUR**: 321,9 s (0,27 s/frame) num
  worker novo de CPU fraca — 3× o custo por frame dos jobs 60/90 (mesma imagem). O
  YuNet rodava no 1080p inteiro; fix na v0.1.3 (issue #29/PR #30): detecção ≤640 px
  com caixas escaladas, borrão na resolução cheia. Sem o blur, o job de 120 s fecha
  em ~5,5 min.
- Hipótese dos 20,9 GB da F0 v4 (batch_demo, julho): CONFIRMADA por eliminação — o
  caminho residente com desprojeção (sem point head, sem stack de render) mede 15,4 GB
  no dobro de frames do exemplo da época. O conserto mudou o número; registro fecha.
- `F0-real: PENDENTE (aguardando vídeos)` — mesmos comandos, `pilot/inputs/*.mp4`.

## [2026-09-02] LGPD bloco 4: retenção de 7 dias PROVADA em produção com objeto de teste

- A promessa "vídeo bruto apagado em 7 dias" foi provada de ponta a ponta no ambiente
  real: objeto `tmp/lgpd-proof-bloco4` no R2 + linha de scan com `created_at = now()-8d`
  inserida direto no Postgres → o job de produção (tick de 5 min, `instrumentation.ts`)
  purgou sozinho: objeto AUSENTE no R2 e `video_deleted_at = 2026-09-02 07:52:34+00`.
  Linha e objeto de teste removidos ao final; nada pré-existente foi tocado.
- Produção NÃO define `VIDEO_RETENTION_MINUTES` → vale o default 10080 (7 dias) de
  `env.ts`. Conferido na env do Railway em 2026-09-02; nenhuma mudança necessária.
- Acesso ao Postgres para a prova: `railway ssh` no container do banco com o SQL em
  base64 (o CLI re-parseia args no sh remoto — parênteses explodem). O caminho
  "criar TCP proxy" foi DESCARTADO: o Railway redeploya o banco ao commitar o proxy,
  e reiniciar o Postgres do piloto por causa de uma prova seria o rabo abanando o
  cachorro. Receita documentada aqui para a próxima prova.
- `retention.proof.test.ts` entra no repo como prova reprodutível: só roda com
  `LGPD_PROOF_ENV=<json>` (railway variables --json); no CI é skip.
- `docs/piloto/LGPD-PILOTO.md` criado: o que se coleta, onde vive, TTLs, e por que a
  promessa é um job idempotente e não uma frase de marketing.

## [2026-09-02] mysql2 high no gate: override em vez de allowlist

- O `npm audit` acusou mysql2 3.15.3 [high] vindo do prisma@7.10.0 (CLI, dev-dep) —
  driver MySQL embutido que este projeto (Postgres) nunca executa. Não há prisma 7.x
  mais novo e o "fix" sugerido era downgrade major para 6.19.3 — não.
- Resolvido com `overrides.mysql2 = ^3.24.3` no package.json: a vulnerabilidade sai
  do lockfile de verdade, em vez de virar exceção com prazo no audit-allowlist.
