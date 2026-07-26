# ADR-0002 — Next.js (App Router) + Prisma + Postgres na camada web

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

A camada web precisa: servir a página de captura (que roda APIs de browser — `getUserMedia`,
`MediaRecorder`, Wake Lock), expor rotas de API para presign de upload e recepção de webhook,
guardar o estado dos scans, e servir o viewer 3D. O plano (§4.1/§4.2) já fixa as rotas e o
schema. O alvo de deploy é o Railway, sem GPU.

## Opções consideradas

1. **Next.js + Prisma** — um único processo serve páginas e rotas de API; Prisma dá
   migrations versionadas e tipos gerados a partir do schema, que é metade da segurança de
   tipos entre banco e código.
2. **Next.js + Drizzle** — mais leve e SQL-first; migrations menos maduras à época, e o
   ganho de bundle é irrelevante num serviço que não roda em edge.
3. **API separada (Fastify/Flask) + SPA** — dois serviços no Railway, dois deploys, CORS,
   e nenhuma vantagem: não há consumidor da API além da própria web.

## Decisão

Opção 1. Next.js com App Router e TypeScript `strict`, Prisma como ORM/migrations, Postgres
como fonte de verdade do estado de scans (plano §4.2). Um único serviço web no Railway.

Camadas finas e obrigatórias: `route → service → adapter/repository`. A rota valida a borda
com Zod e delega; nenhuma rota fala com o Prisma ou com o storage diretamente.

## Consequências

- Um serviço só para hospedar, um `DATABASE_URL`, um healthcheck.
- Migrations versionadas em `apps/web/prisma/migrations/` — nunca editar uma migration já
  aplicada; correção é migration nova.
- O viewer 3D é um componente client-side pesado (Three.js); precisa de `dynamic(..., { ssr: false })`
  para não tentar renderizar WebGL no servidor.
- A validação Zod na borda é o que permite ao `fake-runpod` e ao RunPod real serem
  intercambiáveis sem risco: se o corpo do webhook mudar de forma, o parse falha alto.
