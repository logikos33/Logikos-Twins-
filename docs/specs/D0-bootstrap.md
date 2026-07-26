# Spec — D0 Bootstrap

- **Status:** em execução
- **Etapa:** D0
- **ADRs relacionados:** [0001](../adr/0001-monorepo-unico.md), [0002](../adr/0002-nextjs-prisma-postgres.md), [0003](../adr/0003-storage-adapter-s3.md), [0004](../adr/0004-fake-runpod-sosia-de-contrato.md)

## Objetivo

Qualquer pessoa (ou agente) clona o repositório, roda um comando e tem o ambiente completo de
pé — banco, storage, sósia de GPU e web — **sem digitar uma única credencial**. E encontra,
escrito, como o projeto pensa: arquitetura, decisões e o processo de trabalho.

## Escopo

- Repositório git isolado, conectado a `logikos33/Logikos-Twins-`, com `referencias/` fora do versionamento.
- Monorepo: `apps/web`, `worker/`, `fake-runpod/`, `scripts/`, `docs/`.
- `docker-compose.yml` com Postgres, MinIO (+ bootstrap de bucket e CORS) e fake-runpod, com healthchecks e ordem de dependência.
- `.env.example` completo e comentado.
- Lint/format/typecheck configurados nos dois lados (TS e Python).
- CI com os gates bloqueantes.
- Governança: `CLAUDE.md`, `docs/architecture.md`, ADRs 0001–0008, template de spec, PR template.
- Comandos canônicos num `Makefile`.

## Não-escopo

- Schema do banco e rotas de API — **D1**.
- Qualquer código de captura, viewer, worker real ou detector.
- A cena sintética (`scripts/make_fixture.py`) — é pré-requisito da D2/D3 e entra lá. Na D0
  o `fake-runpod` existe, mas responde com artefatos de placeholder.

## Contratos afetados

Nenhum contrato de runtime. Fixa-se apenas a **estrutura de pastas** (ADR-0001) e o conjunto
de variáveis de ambiente do `.env.example`.

## Fatias verticais

1. Git isolado + `referencias/` + `.gitignore`.
2. Documentos de governança (ADRs, arquitetura, specs, CLAUDE.md, PR template).
3. `apps/web` — Next.js + TS strict + ESLint/Prettier, página inicial mínima, `/api/health`.
4. `worker/` e `fake-runpod/` — esqueleto Python com ruff + mypy + pytest.
5. `docker-compose.yml` + bootstrap do MinIO + `.env.example` + `Makefile`.
6. CI com todos os gates.

## Critérios de aceite

- [x] `git rev-parse --show-toplevel` retorna a própria pasta (não o home do Vitor).
- [x] `git status` limpo, com `referencias/` invisível ao git.
- [x] `docker compose up` sobe Postgres, MinIO e fake-runpod com healthcheck verde.
- [x] `GET /api/health` responde 200 com JSON.
- [x] `make lint` e `make test` verdes nos dois lados.
- [x] CI verde, com gate que exige spec da etapa em curso.
- [x] `.env.example` sem nenhum segredo real e suficiente para subir tudo.
- [x] ADRs 0001–0008 escritos; `docs/architecture.md` bate com o que existe.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Isolamento do git | `git check-ignore -v referencias/` | pasta ignorada pela regra `/referencias/` |
| Compose limpo | `docker compose up -d` | 3 serviços `healthy` |
| Bucket criado | `mc ls local/` no bootstrap | bucket `logikos-twins` existe |
| Health da web | `curl /api/health` | `200` e `{"status":"ok"}` |
| Sósia de GPU | `POST /v2/local/run` | `{"id": ..., "status": "IN_QUEUE"}` |

## Riscos

| Risco | Mitigação |
|---|---|
| Home do Vitor é um repositório git — arquivos vazariam para o `epi-recognition-system` | `git init` aninhado isola; verificado por `show-toplevel`; registrado em `DECISIONS.md` e `CLAUDE.md` |
| Node 25 / Python 3.14 muito novos para parte do ecossistema | Worker roda em container com Python 3.10; fixture depende só de numpy; versões fixadas |
| Docker Desktop não iniciado na máquina | `make dev` falha com mensagem clara em vez de erro críptico |
| CORS do MinIO bloqueando o `PUT` do navegador | Configurado no bootstrap e exercitado já na D1 |
