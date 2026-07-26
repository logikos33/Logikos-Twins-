import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// O `.env` vive na RAIZ do monorepo (é compartilhado com o compose), não em apps/web.
// `process.loadEnvFile` é nativo do Node 20.12+ — sem dependência de dotenv.
const rootEnv = path.resolve(__dirname, "../../.env");
if (!process.env.DATABASE_URL && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

// Prisma 7: o migrate lê a conexão daqui; o runtime usa o driver adapter em
// `src/lib/db.ts`. O placeholder permite `prisma generate` (que não conecta) rodar
// em ambientes sem banco — a CI, por exemplo. Comandos que conectam de verdade
// (migrate dev/deploy) falham com mensagem clara se a URL for o placeholder.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5433/placeholder",
  },
});
