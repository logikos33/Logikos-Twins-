#!/bin/sh
# Prepara o MinIO para fazer o papel do R2 no desenvolvimento.
#
# Idempotente de propósito: roda a cada `docker compose up` e não pode falhar quando o
# bucket já existe.
set -e

BUCKET="${S3_BUCKET:-logikos-twins}"

echo "→ conectando ao MinIO em ${MINIO_ENDPOINT}"
mc alias set local "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

if mc ls "local/${BUCKET}" >/dev/null 2>&1; then
  echo "→ bucket '${BUCKET}' já existe"
else
  echo "→ criando bucket '${BUCKET}'"
  mc mb "local/${BUCKET}"
fi

# Os artefatos (nuvem, poses, keyframes) são servidos ao viewer por URL assinada, mas
# deixar o prefixo legível simplifica a inspeção manual durante o desenvolvimento.
# Em produção o R2 fica FECHADO — o acesso é só por presigned URL. Ver PLUGIN-CHECKLIST.md.
mc anonymous set download "local/${BUCKET}/scans" >/dev/null 2>&1 || true

# Multipart abandonado (aba fechada no meio da gravação) vira lixo cobrado. Em
# produção isso é regra de lifecycle do bucket; aqui, faxina a cada subida.
mc rm --incomplete --recursive --force "local/${BUCKET}" >/dev/null 2>&1 || true

echo "✓ MinIO pronto: bucket '${BUCKET}'"
