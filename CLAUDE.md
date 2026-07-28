# CLAUDE.md — contexto permanente para agentes

> **Antes de qualquer tarefa: leia a spec da etapa atual em [`docs/specs/`](./docs/specs/) e os
> ADRs relevantes em [`docs/adr/`](./docs/adr/).** Não comece código sem spec; não tome
> decisão arquitetural sem ADR. Isso é gate, não sugestão.

**Precedência quando os documentos discordam:**
`docs/specs/` (a spec da etapa em curso) → `docs/adr/` → este arquivo.
E acima de todos: **a realidade**. Se a API mudou, a flag não existe ou o limite é outro, a
realidade vence — registre em `DECISIONS.md` (ou ADR, se for arquitetural) e siga.

**Sobre `referencias/`:** os documentos originais de planejamento (prompt de execução,
plano de handoff, briefing de design) vivem em `referencias/`, **fora do versionamento**
— quem clona o repositório público não os tem, e não deve precisar deles: as decisões que
importam já foram capturadas em `docs/adr/`, `docs/specs/` e `DECISIONS.md`. Se um desses
documentos citar algo de `referencias/` por nome, trate como citação histórica (o que se
sabia na hora), não como link vivo.

---

## O que é isto

**Logikos Twins** — o usuário filma um ambiente andando com o celular e, minutos depois,
abre um **mapa 3D navegável** daquele lugar: nuvem de pontos densa, trajetória da câmera,
medição com escala real, anotações, e **detecções ancoradas em coordenadas 3D**.

O diferencial não é a nuvem de pontos — é a última parte. O mapa **responde perguntas**
("onde está o extintor?", "quantas pessoas sem capacete nesta ala?") porque cruza a
reconstrução com o **Recognition**, o detector da própria Logikos. Nenhum concorrente
(Matterport, Polycam, OpenSpace) oferece "detecções da SUA operação ancoradas no SEU mapa"
como serviço leve, sem hardware proprietário.

Motor de reconstrução: **LingBot-Map** (Robbyant/Ant Group, Apache-2.0), commit pinado
`1f480aeb8a47a24656090d46d053115b7fe60435`.

---

## Armadilhas conhecidas (leia antes de mexer)

1. **O home do Vitor (`/Users/vitoremanuel`) é um repositório git** do `epi-recognition-system`.
   Esta pasta tem `.git` próprio justamente para se isolar dele. **Nunca** rode `git` com
   `--git-dir` apontando para fora, e confirme com `git rev-parse --show-toplevel` se
   estiver em dúvida sobre onde você está comitando.

2. **`referencias/` nunca entra no git.** Discussões, pesquisas, apresentações e os
   documentos originais de planejamento (`PROMPT-EXECUCAO.md`, `plano-demo-handoff.md`,
   briefing de design) vivem lá e ficam fora do versionamento por regra — o repositório é
   **público** desde 2026-07-27, e esses documentos carregam contexto de negócio/mercado
   que não pertence a um checkout público (ver `DECISIONS.md` "Limpeza de versionamento").
   Versionado = código, `docs/` e os arquivos de execução da raiz listados no `.gitignore`.
   Se aparecer um `.pptx`/`.pdf`/documento de planejamento na raiz, ele vai para
   `referencias/` — e se já foi commitado antes de perceber isso, purgar do **histórico**
   também (não basta remover do HEAD; ver a entrada de `DECISIONS.md` sobre `filter-repo`).

3. **Nada de AGPL ou copyleft forte. Em lugar nenhum.** Isso bane o stack **ultralytics**
   (YOLOv5/v8/v11) — o detector mais óbvio do mercado. Use **YOLOX** (Megvii, Apache-2.0).
   Toda dependência não-trivial entra em `LICENSES.md` com a licença. Se a única opção para
   algo for copyleft, **pare e pergunte**.

4. **Nenhuma credencial externa durante o desenvolvimento.** Não crie conta, não peça chave,
   não dependa de serviço externo. Tudo tem equivalente local: MinIO no lugar do R2,
   `fake-runpod` no lugar do RunPod, cena sintética no lugar da GPU. Contas entram só na
   FASE PLUG-IN, com o Vitor presente.

5. **Mídia nunca trafega pela web.** O vídeo vai do celular direto ao bucket (presigned), e
   os artefatos voltam do worker direto ao bucket. Se você se pegar escrevendo uma rota que
   recebe o vídeo, pare — o desenho está errado.

6. **`apps/web` nunca importa de `worker/`.** Eles se falam só pelos contratos do plano §4.

7. **Toda parte de multipart S3, exceto a última, precisa ter ≥ 5 MB.** É por isso que a
   gravação bufferiza antes de enviar. Não é escolha nossa, é o protocolo.

8. **O container do vídeo varia por navegador.** Safari grava MP4/H.264, Chrome no Android
   grava WebM/VP8-9. O worker normaliza com `ffmpeg` antes de qualquer coisa. Não presuma MP4.

9. **`getUserMedia` exige contexto seguro.** `localhost` funciona; testar no celular pela rede
   local exige HTTPS (mkcert) ou túnel.

10. **Python do sistema é 3.14** — novo demais para parte do ecossistema (ex.: `open3d`).
    O worker roda em container com **Python 3.10**. `scripts/make_fixture.py` depende só de
    numpy, de propósito, para rodar direto na máquina.

---

## Mapa do repositório

```
apps/web/          Next.js (App Router) + TS strict + Prisma. Páginas, API, viewer Three.js.
  src/app/         rotas e páginas
  src/lib/         adapters (storage, jobrunner) e serviços — a lógica mora aqui, não nas rotas
  prisma/          schema + migrations
worker/            Python 3.10. handler.py (SDK runpod) + pipeline/. Roda na GPU (prod) e em CPU (dev).
fake-runpod/       FastAPI. Sósia do contrato do RunPod Serverless. Nunca vai para produção.
scripts/           make_fixture.py (cena sintética), bootstrap do MinIO, infra como código.
docs/              architecture.md · adr/ · specs/ · protocolo-captura.md
referencias/       NÃO VERSIONADO — discussões, pesquisas, apresentações
```

Os três nomes que importam: **`apps/web`** (não `web/`), **`worker/`** (não `apps/worker`),
**`infra` de migrations dentro de `apps/web/prisma`** (Prisma manda).

---

## Comandos canônicos

Ninguém decora sequência de passos — está tudo no `Makefile`.

```bash
make dev        # sobe tudo (postgres + minio + fake-runpod + web)
make test       # testes dos dois lados
make lint       # ruff + eslint + tsc --noEmit
make fixture    # (re)gera a cena sintética em fixtures/
make reset      # derruba tudo e apaga volumes locais
make logs       # logs agregados do compose
```

---

## Convenções

- **TypeScript:** `strict: true`, zero `any` implícito. Validação de borda com **Zod** em toda
  rota. Camadas `route → service → adapter`: a rota valida e delega; página só apresenta.
- **Python:** `ruff` (lint + format) + `mypy`, type hints em tudo. O núcleo do pipeline são
  **funções puras** — é o que permite testar desprojeção, escala e conversão sem I/O.
- **Comentário explica *por quê*, não *o quê*.** Nome descritivo dispensa comentário.
- **Proibido:** abstração especulativa, código morto, `TODO` sem entrada em
  `OPEN-QUESTIONS.md`, `any`/`# type: ignore` sem justificativa escrita ao lado, warning
  silenciado sem registro.
- **Commits:** Conventional Commits — `feat(viewer): medição com calibração de escala`.
  Um commit por fatia vertical da spec.
- **Testes:** todo bug corrigido ganha **antes** o teste que o reproduz. Sem meta de
  cobertura vazia; teste onde há lógica de verdade (NPZ→PLY, desprojeção, escala, presign,
  webhook, retenção).
- **`[TESTAR no plug-in]`** marca no código o que só GPU/serviço real valida. Procure por
  essa string antes da FASE PLUG-IN.

---

## Estado atual

Ver [`STATUS.md`](./STATUS.md) — etapa atual, o que falta e como testar agora.

Etapas: **D0** bootstrap · **D1** dados e captura ao vivo · **D2** jobs ponta a ponta ·
**D3** worker real · **D4** viewer · **D5** detecções ancoradas (+D5.5 Recognition) ·
**D6** ArUco e blur · **D7** hardening.
**A FASE PLUG-IN não começa sem o Vitor.**
