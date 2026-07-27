# Imagem de PRODUÇÃO da web, construída pelo Railway (railway.json → builder: DOCKERFILE).
# NÃO usar o builder de auto-detecção (Railpack/Nixpacks): o build é explícito aqui para
# ser reprodutível e não quebrar quando a heurística do Railway mudar.
#
# Base Debian slim (não Alpine): é o caminho recomendado pelo Prisma e evita as dores de
# musl/openssl no `prisma migrate deploy`, que roda no start (ver railway.json).

FROM node:22-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# openssl/ca-certificates são exigidos pelo engine de migração do Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instalar dependências antes de copiar o código aproveita o cache de camadas: mudar um
# componente não refaz o `npm ci`. `--ignore-scripts` porque o postinstall (prisma
# generate) precisa do schema, que só chega no COPY seguinte.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Código + client Prisma + build de produção do Next.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# O start real (migrate deploy + next start) vem de deploy.startCommand no railway.json;
# este CMD é o mesmo comando, para a imagem também rodar sozinha fora do Railway.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
