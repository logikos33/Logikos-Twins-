# LGPD no piloto — vídeo bruto e dados de acesso

> Última prova real: 2026-09-02 (purga verificada em produção com objeto de teste — ver §Prova).

## O que o piloto coleta

| Dado | Onde vive | Por quanto tempo |
|---|---|---|
| **Vídeo bruto** da captura (pode conter pessoas) | R2 (`S3_BUCKET`), chave `scans/<id>/…` | **7 dias** — apagado automaticamente |
| Artefatos 3D (nuvem de pontos, poses, keyframes) | R2 | Enquanto o scan existir — **são o produto**, não contêm o vídeo |
| Rostos | Borrados **antes** do motor 3D (blur pré-motor no worker) | Nunca chegam nítidos aos artefatos |
| Metadados do scan (título, status, timestamps, custo) | Postgres | Enquanto o scan existir |
| Links de convidado (`/s/:token`) | Postgres (`share_links`) | Validade escolhida pelo dono: 1/7/30 dias; revogáveis; token do dono expira via `SHARE_TOKEN_TTL_DAYS` |
| IP (rate limit da superfície pública) | Memória do processo (janela de 60 s) | Não persiste |

Não há cadastro, e-mail, nome ou cookie de rastreamento no fluxo `/p/:token` e `/s/:token`.

## Como a promessa de 7 dias é cumprida (não é uma frase — é um job)

- **Motor:** `apps/web/src/lib/services/retention.ts` — `runRetention()` apaga do R2 o vídeo bruto de scans terminais (`done`/`error`) com mais de `VIDEO_RETENTION_MINUTES` e grava `video_deleted_at`. Idempotente (rodar 2× ou em 2 réplicas não muda nada). Se o storage falhar, o scan **não** é marcado como limpo — o próximo ciclo tenta de novo.
- **Agendamento:** `apps/web/src/instrumentation.ts` — a cada **5 min** no boot do Next (produção).
- **TTL:** `VIDEO_RETENTION_MINUTES` default **10080 = 7 dias** (`apps/web/src/lib/env.ts`). Produção não sobrescreve (conferido em 2026-09-02 na env do Railway) → 7 dias valem.
- **Escopo:** só o vídeo bruto. Artefatos 3D nunca são tocados pelo job.

## Prova (2026-09-02, produção)

1. Objeto de teste `tmp/lgpd-proof-bloco4` criado no R2 real.
2. Linha de scan de teste inserida com `created_at = now() - 8 dias`, `status done`, `video_key` apontando para o objeto (id `094c67e6-a152-4f74-a902-33fa07ce0923`).
3. Job de produção (tick de 5 min) purgou sozinho: objeto **ausente** no R2 e `video_deleted_at` preenchido no banco.
4. Linha de teste removida ao final. Nenhum objeto pré-existente foi tocado.

Reprodutível também localmente: `retention.proof.test.ts` (roda só com `LGPD_PROOF_ENV=<json de env>`; no CI é skip).

## Direitos do titular no piloto

- **Eliminação:** apagar o scan (admin) remove metadados e artefatos; o vídeo bruto já cai sozinho em 7 dias.
- **Revogação de acesso:** links de convidado revogáveis na sheet de share; link do dono expira por TTL.
- Canal do piloto: o operador (Logikos) executa pedidos manualmente — não há autosserviço de titular nesta fase.
