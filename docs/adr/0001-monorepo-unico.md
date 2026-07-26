# ADR-0001 — Monorepo único para web, worker e mock de GPU

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O produto tem três executáveis que precisam concordar sobre os mesmos contratos: a
aplicação web (Next.js/TypeScript), o worker de GPU (Python) e o sósia local do RunPod
(`fake-runpod`, Python). Os contratos que eles compartilham — payload do `/run`, corpo do
webhook, nomes das chaves de artefato no storage, schema do `meta.json` — são exatamente
onde um desalinhamento silencioso custa caro: o worker sobe um artefato com um nome, o
viewer procura outro, e a falha só aparece em runtime, no fim do pipeline.

## Opções consideradas

1. **Repositórios separados** (web, worker) — isolamento de CI e deploy independente, mas o
   contrato vira documentação, não código verificado. Toda mudança de payload precisa de
   dois PRs coordenados manualmente.
2. **Monorepo com ferramenta de workspace** (Turborepo/Nx) — bom para muitos pacotes JS;
   aqui há **um** pacote JS e dois Python. A ferramenta cobraria configuração sem entregar
   o que ela otimiza (cache de builds entre dezenas de pacotes).
3. **Monorepo simples, sem orquestrador** — pastas por artefato, comandos canônicos num
   `Makefile`, CI único.

## Decisão

Opção 3. Estrutura fixada em `apps/web`, `worker/`, `fake-runpod/`, `scripts/`, `docs/`
(seção 4.5 do plano). Um único `Makefile` na raiz expõe `dev`, `test`, `lint`, `fixture`,
`reset`. Um único workflow de CI roda todos os gates.

## Consequências

- Uma mudança de contrato aparece num PR só, e a CI reprova os dois lados juntos.
- A cena sintética (`scripts/make_fixture.py`) é escrita **uma vez** e serve tanto aos
  testes do worker quanto ao `fake-runpod` — é o que torna o desenvolvimento sem GPU viável.
- Deploy não é afetado: a web vai para o Railway a partir de `apps/web`, e o worker vira
  imagem Docker a partir de `worker/`. O Railway recebe `railway.json` apontando o
  diretório certo.
- Custo: a CI roda gates de JS e Python em todo PR, mesmo quando só um lado mudou. Aceito —
  o pipeline é pequeno e o custo de um contrato quebrado é maior.
