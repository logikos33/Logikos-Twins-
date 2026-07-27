import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as storage from "@/lib/storage";
import type { Scan } from "@/generated/prisma/client";

/**
 * Retenção do vídeo bruto (D7, LGPD): a promessa "apagado após 7 dias" é este job,
 * não uma frase na página. Os artefatos 3D NUNCA são tocados — são o produto.
 *
 * Idempotente: `video_deleted_at` marca o que já foi limpo; rodar duas vezes (ou em
 * duas réplicas) não muda nada. No dev, `VIDEO_RETENTION_MINUTES` baixo permite ver
 * a retenção acontecer sem esperar uma semana.
 */

/** A chave REAL do vídeo: a normalização pode ter trocado a extensão (webm→mp4). */
export function videoKeyOf(scan: Scan): string | null {
  const outputs = (scan.outputs ?? {}) as Record<string, string>;
  return outputs["video_key"] ?? scan.videoKey;
}

/** Decide quais scans têm vídeo vencido. Puro sobre os dados — testável sem banco. */
export function isExpired(scan: Scan, now: Date, retentionMinutes: number): boolean {
  if (scan.videoDeletedAt) return false; // já limpo
  if (!videoKeyOf(scan)) return false; // nunca teve vídeo
  // Só estados terminais: apagar o vídeo de um scan ainda processando quebraria o job.
  if (scan.status !== "done" && scan.status !== "error") return false;
  const ageMinutes = (now.getTime() - scan.createdAt.getTime()) / 60_000;
  return ageMinutes > retentionMinutes;
}

export async function runRetention(now = new Date()): Promise<number> {
  const retention = env().VIDEO_RETENTION_MINUTES;
  const cutoff = new Date(now.getTime() - retention * 60_000);

  const candidates = await db.scan.findMany({
    where: {
      videoDeletedAt: null,
      status: { in: ["done", "error"] },
      createdAt: { lt: cutoff },
    },
    take: 50,
  });

  let cleaned = 0;
  for (const scan of candidates) {
    if (!isExpired(scan, now, retention)) continue;
    const key = videoKeyOf(scan);
    if (!key) continue;
    try {
      await storage.deleteObject(key);
      await db.scan.update({
        where: { id: scan.id },
        data: { videoDeletedAt: now },
      });
      cleaned++;
      console.warn(
        JSON.stringify({ event: "retention.video_deleted", scan_id: scan.id, key }),
      );
    } catch (err) {
      // O próximo ciclo tenta de novo; um storage momentaneamente fora do ar não
      // pode marcar o scan como limpo sem ter limpado.
      console.error(`retenção do scan ${scan.id} falhou:`, err);
    }
  }
  return cleaned;
}
