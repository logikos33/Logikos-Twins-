# Deploy de teste no Railway (branch `design/logikos-twins`)

Sobe a demo completa SEM contas externas além do próprio Railway: o MinIO faz o papel
do R2 e o `fake-runpod` faz o papel do RunPod (modo `synthetic`, com a cena sintética
já commitada em `fake-runpod/fixtures/` — só os artefatos prontos, 4,6 MB; o modo
`local-worker` fica de fora deste deploy). Custo esperado: centavos — bem abaixo do
hard limit de US$ 10/mês (DECISIONS.md).

**4 serviços no mesmo projeto/ambiente** (a rede privada `*.railway.internal` exige
bind IPv6 — já resolvido nos `railway.json` de cada serviço):

## 1. Postgres

Plugin gerenciado do Railway. Nada a configurar.

## 2. `minio` (imagem Docker)

- Imagem: `minio/minio:RELEASE.2025-04-22T22-12-26Z`
- Start command: `server /data --address :9000`
- Volume: mount em `/data`
- Domínio público: necessário (o navegador faz PUT/GET por URL assinada) → target port `9000`
- Variáveis:

| Variável | Valor |
|---|---|
| `MINIO_ROOT_USER` | gerar (ex.: `twins-minio`) |
| `MINIO_ROOT_PASSWORD` | gerar segredo forte |
| `MINIO_API_CORS_ALLOW_ORIGIN` | `*` (o celular faz PUT das partes direto no bucket) |

- **Bootstrap do bucket** (uma vez, de qualquer máquina com `mc`):

```bash
mc alias set twins https://<dominio-minio> "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb twins/logikos-twins
mc anonymous set download twins/logikos-twins/scans   # opcional (inspeção)
```

## 3. `fake-runpod` (repo, root directory `fake-runpod/`)

Build pelo Dockerfile do diretório; o `railway.json` já força
`uvicorn --host ::` (IPv6 → rede privada) e healthcheck em `/health`.
**Sem domínio público** — só a web fala com ele, pela rede interna.

| Variável | Valor |
|---|---|
| `FAKE_MODE` | `synthetic` |
| `FIXTURE_DIR` | `/srv/fixtures` |
| `DETECTOR` | `synthetic` |
| `FAKE_COLD_START_S` / `FAKE_PROCESS_S` | `2` / `6` |
| `APP_INTERNAL_URL` | `https://<dominio-web>` (webhook de volta pela URL pública) |
| `RUNPOD_WEBHOOK_SECRET` | gerar (o MESMO da web) |
| `S3_ENDPOINT` | `http://minio.railway.internal:9000` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credenciais do MinIO |
| `S3_BUCKET` | `logikos-twins` |
| `S3_REGION` | `auto` |

## 4. `web` (repo, root directory `apps/web/`)

Railpack detecta Next; o `railway.json` roda `prisma migrate deploy` antes do start e
aponta o healthcheck para `/api/health`. Domínio público → target port do serviço.

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_URL` | `https://<dominio-web>` |
| `S3_ENDPOINT` | `http://minio.railway.internal:9000` |
| `S3_PUBLIC_ENDPOINT` | `https://<dominio-minio>` (o que vai assinado p/ o navegador) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credenciais do MinIO |
| `S3_BUCKET` / `S3_REGION` / `S3_FORCE_PATH_STYLE` | `logikos-twins` / `auto` / `true` |
| `RUNPOD_BASE_URL` | `http://fake-runpod.railway.internal:8080` |
| `RUNPOD_ENDPOINT_ID` / `RUNPOD_API_KEY` | `local` / `dev-nao-usado` |
| `RUNPOD_WEBHOOK_SECRET` | o MESMO do fake-runpod |
| `ADMIN_TOKEN` | gerar segredo forte |
| `MAX_VIDEO_MB` / `MAX_VIDEO_SECONDS` / `EXTRACT_FPS` | `300` / `180` / `8` |
| `VIDEO_RETENTION_MINUTES` | `10080` |

## Ordem e verificação

1. Postgres → 2. minio (+ bootstrap do bucket) → 3. fake-runpod → 4. web.
2. `https://<web>/api/health` responde ok.
3. Fluxo completo: `/new` → gravar (ou fallback de arquivo) → status → viewer.
4. Galeria/admin: `https://<web>/?admin=<ADMIN_TOKEN>` e `/admin?token=<ADMIN_TOKEN>`.

Troca futura para produção (FASE PLUG-IN, com o Vitor): R2 no lugar do MinIO e RunPod
real no lugar do fake — só variáveis (ADR-0003/0004); nada de código.
