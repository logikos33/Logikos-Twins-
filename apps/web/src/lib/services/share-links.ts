import { randomBytes } from "node:crypto";
import type { Scan, ShareLink } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isShareTokenValid } from "./scans";

/**
 * Link compartilhado SOMENTE-LEITURA (#47, contrato v1.2 /s/:shareToken).
 * Capability checada no servidor: o convidado tem um token PRÓPRIO — nunca o
 * do dono. Escrita com token de convidado → 403 (ele já provou conhecer o
 * scan; negar sem vazar nada novo). Token desconhecido → 404, como sempre.
 */

export type ReadRole = "owner" | "guest";
export type GuestState = "valid" | "expired" | "revoked";

export function newGuestToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShareLink(
  scanId: string,
  days: 1 | 7 | 30,
): Promise<ShareLink> {
  return db.shareLink.create({
    data: {
      scanId,
      token: newGuestToken(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
  });
}

/** Decisão pura do estado do link de convidado. */
export function guestState(link: ShareLink, now: Date = new Date()): GuestState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt <= now) return "expired";
  return "valid";
}

export async function resolveGuestToken(
  token: string,
): Promise<{ link: ShareLink; scan: Scan; state: GuestState } | null> {
  if (!token || token.length > 64) return null;
  const link = await db.shareLink.findUnique({
    where: { token },
    include: { scan: true },
  });
  if (!link) return null;
  const { scan, ...rest } = link;
  return { link: rest as ShareLink, scan, state: guestState(rest as ShareLink) };
}

export async function revokeShareLink(id: string): Promise<void> {
  await db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function bumpViews(id: string): Promise<void> {
  await db.shareLink.update({ where: { id }, data: { views: { increment: 1 } } });
}

export async function listShareLinks(scanId: string): Promise<ShareLink[]> {
  return db.shareLink.findMany({ where: { scanId }, orderBy: { createdAt: "desc" } });
}

/**
 * Autorização de LEITURA: dono (shareToken do scan, com validade) OU convidado
 * (ShareLink válido). ESCRITA continua exigindo o dono — os handlers usam o
 * role para responder 403 ao convidado.
 */
export async function authorizeRead(
  scanId: string,
  token: string,
): Promise<{ scan: Scan; role: ReadRole } | null> {
  const scan = await db.scan.findUnique({ where: { id: scanId } }).catch(() => null);
  if (scan && isShareTokenValid(scan, token)) return { scan, role: "owner" };

  const guest = await resolveGuestToken(token);
  if (guest && guest.state === "valid" && guest.scan.id === scanId) {
    return { scan: guest.scan, role: "guest" };
  }
  return null;
}
