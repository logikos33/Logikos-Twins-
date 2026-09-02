import { randomBytes } from "node:crypto";
import type { Project } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Projeto + link de captura sem cadastro (#38, contrato v1.2 /p/:token).
 * Regras da superfície pública: token opaco (CSPRNG, 24 bytes base64url =
 * 192 bits); inexistente ≡ revogado (null — zero enumeração); resolução SEMPRE
 * no servidor.
 */

export function newCaptureToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createProject(name: string): Promise<Project> {
  return db.project.create({ data: { name, captureToken: newCaptureToken() } });
}

/** null para token malformado, inexistente OU revogado — indistinguíveis. */
export async function findByCaptureToken(token: string): Promise<Project | null> {
  if (!token || token.length > 64) return null;
  const p = await db.project.findUnique({ where: { captureToken: token } });
  if (!p || p.revokedAt) return null;
  return p;
}

export async function revokeProject(id: string): Promise<void> {
  await db.project.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function listProjects(): Promise<Project[]> {
  return db.project.findMany({ orderBy: { createdAt: "desc" } });
}

/** Mapas do projeto para a entry pública (mesma shape da galeria). */
export async function projectScans(projectId: string) {
  return db.scan.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Rate limit da superfície pública /p/* — janela deslizante em memória,
 * por chave (token ou IP). Por instância (o piloto roda 1 réplica).
 * ponytail: janela em memória; mover p/ tabela se houver réplicas.
 */
const janela = new Map<string, number[]>();

export function rateLimitOk(chave: string, limite = 60, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const hits = (janela.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (hits.length >= limite) {
    janela.set(chave, hits);
    return false;
  }
  hits.push(agora);
  janela.set(chave, hits);
  return true;
}
