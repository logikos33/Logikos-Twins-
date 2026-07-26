# Architecture Decision Records

Formato MADR curto: **Contexto → Opções consideradas → Decisão → Consequências**.

**ADRs são imutáveis.** Mudou de ideia? Novo ADR com `supersedes #NNNN`, e o antigo passa a
`Status: Superada por ADR-XXXX`. Não se reescreve a história — o valor do registro está em
mostrar o que se sabia na hora.

Escreve-se um ADR quando existem **alternativas reais**: biblioteca, framework, schema,
protocolo, formato de artefato, trade-off de custo. O teste: *em seis meses, alguém
perguntaria "por que assim?"* — se sim, é ADR.

| # | Decisão | Status |
|---|---|---|
| [0001](./0001-monorepo-unico.md) | Monorepo único para web, worker e mock de GPU | Aceita |
| [0002](./0002-nextjs-prisma-postgres.md) | Next.js (App Router) + Prisma + Postgres | Aceita |
| [0003](./0003-storage-adapter-s3.md) | Storage atrás de adapter S3 (MinIO ↔ R2) | Aceita |
| [0004](./0004-fake-runpod-sosia-de-contrato.md) | `fake-runpod` como sósia de contrato | Aceita |
| [0005](./0005-detector-plugavel-yolox.md) | Detector plugável, YOLOX (Apache-2.0) como base | Aceita |
| [0006](./0006-artefato-ply-preview.md) | `cloud_preview.ply` binário, 1,8 M pontos, teto 35 MB | Aceita |
| [0007](./0007-modo-windowed-do-motor.md) | Modo `windowed` do LingBot-Map, janela 128 | Aceita |
| [0008](./0008-captura-ao-vivo-sem-botao-de-upload.md) | Gravação ao vivo, envio em chunks, disparo automático | Aceita |
