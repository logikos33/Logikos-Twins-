import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

/**
 * Higiene de uploads abandonados (rede de galpão: upload interrompido é o caso
 * normal). Duas pontas, mesmas regras, mesmo job:
 *  - multipart no R2 sem conclusão há mais de STALE_HOURS → abort (partes
 *    pendentes ocupam espaço e não aparecem em listagem comum);
 *  - scan preso em recording/uploading há mais de STALE_HOURS → error com
 *    mensagem honesta (o admin enxerga; o usuário pode regravar).
 * Idempotente — rodar 2× não muda nada.
 */

export const STALE_HOURS = 24;

export async function abortStaleMultiparts(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - STALE_HOURS * 3600 * 1000;
  const pending = await storage.listPendingMultiparts();
  let aborted = 0;
  for (const u of pending) {
    if (u.initiatedAt && u.initiatedAt.getTime() >= cutoff) continue;
    try {
      await storage.abortMultipart(u.key, u.uploadId);
      aborted++;
      console.warn(JSON.stringify({ event: "hygiene.multipart_aborted", key: u.key }));
    } catch (err) {
      console.error(`abort do multipart ${u.key} falhou:`, err);
    }
  }
  return aborted;
}

export async function failAbandonedRecordings(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_HOURS * 3600 * 1000);
  const r = await db.scan.updateMany({
    where: {
      status: { in: ["recording", "uploading"] },
      createdAt: { lt: cutoff },
    },
    data: {
      status: "error",
      errorMsg: "A gravação não foi concluída — o envio parou no meio. Grave de novo.",
    },
  });
  return r.count;
}

export async function runUploadHygiene(now = new Date()): Promise<void> {
  const a = await abortStaleMultiparts(now).catch(() => 0);
  const f = await failAbandonedRecordings(now).catch(() => 0);
  if (a + f > 0) {
    console.warn(`higiene: ${a} multipart(s) abortado(s), ${f} scan(s) abandonado(s)`);
  }
}
