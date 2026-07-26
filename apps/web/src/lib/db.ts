import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

/**
 * Singleton LAZY do Prisma.
 *
 * Lazy porque o `next build` importa os módulos de rota para coletar metadados —
 * instanciar o cliente no import exigiria DATABASE_URL em tempo de build e abriria
 * conexão onde nenhuma requisição existe. A primeira requisição real cria o cliente.
 *
 * Cache no globalThis: o `next dev` recarrega módulos a cada edição; sem o cache,
 * cada reload abriria um pool novo até esgotar as conexões do Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
