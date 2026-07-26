# CHANGELOG

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Ainda sem versionamento semântico — a demo não foi lançada.

---

## [Não lançado]

### D0 — Bootstrap · 2026-07-26

**Adicionado**

- Monorepo com `apps/web` (Next.js 16 + TS strict + Prisma), `worker/`, `fake-runpod/`,
  `scripts/` e `docs/`.
- Ambiente de desenvolvimento completo por `docker compose`: Postgres, MinIO (papel do R2,
  com bucket e CORS configurados no boot) e o sósia do RunPod — **sem nenhuma credencial
  externa**.
- Sósia do RunPod implementando o contrato real: fila, cold start simulado, `/run`,
  `/status` e webhook com a política de retry do serviço (200 obrigatório, 2 tentativas,
  10 s), mais um interruptor para derrubar o webhook de propósito e exercitar a
  reconciliação.
- Adapter de storage S3 único para MinIO e R2, com multipart e assinatura separada para o
  navegador (uma URL assinada para `minio:9000` não funcionaria no celular).
- **Gate de licença** que reprova AGPL no caminho servido, com testes provando que ele
  falha quando deve.
- **Gate de vulnerabilidades** com exceções explícitas, justificadas e com prazo de
  validade — exceção vencida reprova o build.
- **Gate de processo**: a CI confere que a etapa declarada em `STATUS.md` tem spec escrita.
- Governança: `CLAUDE.md`, `docs/architecture.md` (C4 + fluxos em Mermaid), ADRs 0001–0008,
  template de spec e template de PR.
- `Makefile` com os comandos canônicos (`dev`, `check`, `fixture`, `reset`, `help`).

**Registrado**

- O repositório remoto `logikos33/Logikos-Twins-` estava **vazio** — não havia `main`
  publicada, ao contrário do que o plano de execução afirmava.
- A pasta de trabalho estava **dentro de outro repositório git** (o home do Vitor, que
  aponta para `epi-recognition-system`). Isolada com `.git` próprio.
- Commit do LingBot-Map pinado em `1f480ae` (Apache-2.0, verificado).

Ver `DECISIONS.md`.

### D1 — Dados e captura ao vivo · 2026-07-26

**Adicionado**

- Schema Prisma (scans, annotations, detections) e primeira migration; estados
  `recording`/`uploading` acrescentados ao ciclo do plano (a gravação ao vivo cria um
  intervalo em que o scan existe mas ainda está sendo filmado).
- Rotas de scan: criação com multipart aberto, assinatura de partes durante a gravação,
  complete com validação de limites, e consulta com presigned GETs. Token errado → 404.
- Página `/new` como página de GRAVAÇÃO (ADR-0008): câmera traseira, overlay guiado com
  protocolo de captura, timer com auto-parada no limite, wake lock, envio em segundo
  plano durante a gravação e aviso LGPD. Sem botão de upload no fluxo do celular.
- `PartBuffer` (≥ 5 MB por parte, exceção só na última) e `UploadQueue` (sequencial,
  backoff exponencial) como lógica pura — 13 testes de unidade, incluindo o bug de
  progresso que o teste pegou antes do navegador.
- Fallback de arquivo pelo MESMO pipeline de partes (desktop, drone, navegador sem
  suporte) e página `/scan/[id]` com polling.
- `docs/protocolo-captura.md`.

**Corrigido**

- Postgres do compose movido para a porta 5433 do host: a máquina tem um Postgres nativo
  sombreando a 5432 para conexões localhost (ver DECISIONS.md).

**Registrado**

- Prisma 7 mudou o modelo de configuração (prisma.config.ts + driver adapter) — seguido o
  modelo novo; cliente gerado fora do git.
- Expor `ETag` no CORS do bucket é pré-condição do upload direto — item obrigatório do
  plug-in para o R2.
