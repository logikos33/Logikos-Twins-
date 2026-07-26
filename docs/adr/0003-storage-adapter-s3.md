# ADR-0003 — Storage atrás de um adapter S3 (MinIO no dev, R2 na produção)

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O desenvolvimento inteiro precisa rodar **sem nenhuma credencial externa** (regra de ouro 1
do `PROMPT-EXECUCAO.md`), mas a produção usa Cloudflare R2 (escolhido por egress zero e free
tier — plano §2). Se o código conhecer "R2", o desenvolvimento local exige uma conta
Cloudflare no dia um, e a FASE PLUG-IN vira refatoração em vez de troca de variável.

## Opções consideradas

1. **SDK da Cloudflare / API nativa do R2** — amarra o código ao fornecedor; sem equivalente
   local.
2. **Sistema de arquivos local no dev, S3 na produção** — dois caminhos de código
   radicalmente diferentes; presigned URL não existe em filesystem, e é justamente o
   mecanismo central (upload direto do celular, sem passar pela web). O dev não provaria o
   fluxo real.
3. **SDK S3 (`@aws-sdk/client-s3`) contra endpoint configurável** — R2 é S3-compatível e
   MinIO também. O mesmo código, o mesmo presign, o mesmo multipart, dos dois lados.

## Decisão

Opção 3. Um adapter `Storage` (porta) com implementação única em cima do SDK S3, parametrizada
por `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` e
`S3_FORCE_PATH_STYLE`. No dev aponta para o MinIO do compose; no plug-in, para o R2.
Nenhum módulo fora do adapter menciona MinIO ou R2.

## Consequências

- A FASE PLUG-IN, no que toca a storage, é trocar cinco variáveis de ambiente. Zero código.
- `S3_FORCE_PATH_STYLE=true` é necessário no MinIO (bucket no caminho) e `false` no R2
  (bucket no host) — é a única assimetria, e ela está isolada na configuração.
- O multipart upload usado pela gravação em chunks (D1) é idêntico nos dois: o MinIO
  implementa `CreateMultipartUpload`/`UploadPart`/`CompleteMultipartUpload`.
- Restrição herdada do S3: **toda parte de um multipart, exceto a última, precisa ter ≥ 5 MB**.
  Isso condiciona o buffering da gravação — está registrado em `docs/specs/D1-*` e não é
  uma escolha nossa.
- CORS do bucket precisa permitir `PUT` a partir da origem da web nos dois ambientes;
  no dev isso é configurado pelo script de bootstrap do MinIO.
