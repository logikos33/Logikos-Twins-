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
