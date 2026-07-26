import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as storage from "@/lib/storage";
import * as jobrunner from "@/lib/jobrunner";
import type { Scan } from "@/generated/prisma/client";
import type { JobOutput } from "@/lib/jobrunner";

/**
 * Serviço de processamento — dispara o job e converge o estado.
 *
 * Regra central: webhook e reconciliação chamam AS MESMAS funções. Não há duas
 * lógicas de transição; há duas fontes do mesmo evento. As transições são
 * idempotentes e só avançam — o update é condicionado ao status atual, então o
 * segundo evento (webhook + polling do mesmo COMPLETED) vira no-op.
 */

/** Estados a partir dos quais ainda faz sentido receber progresso de job. */
const ACTIVE_STATES = ["queued", "processing", "postprocessing"] as const;

export async function dispatchJob(scan: Scan): Promise<Scan> {
  if (scan.status !== "uploaded") {
    throw new Error(`scan em '${scan.status}' não pode disparar job`);
  }
  if (!scan.videoKey) {
    throw new Error("scan sem vídeo");
  }

  // GET assinado para o WORKER (validade 6 h — cobre fila + processamento longo).
  const videoUrl = await storage.presignGetInternal(scan.videoKey);

  const jobId = await jobrunner.startJob({
    scanId: scan.id,
    videoUrl,
    params: { fps: scan.extractFps },
  });

  return db.scan.update({
    where: { id: scan.id },
    data: { status: "queued", runpodJobId: jobId },
  });
}

/** Marca a falha de DISPARO (o job nem chegou ao runner). */
export async function markDispatchFailed(scanId: string): Promise<Scan> {
  return db.scan.update({
    where: { id: scanId },
    data: {
      status: "error",
      errorMsg: "O vídeo chegou, mas o processamento não pôde ser iniciado. Tente de novo em instantes.",
    },
  });
}

/**
 * Aplica um resultado terminal de job (COMPLETED/FAILED) ao scan.
 * Idempotente: se o scan já saiu dos estados ativos, não faz nada.
 */
export async function applyJobResult(
  scanId: string,
  result: { status: string; output: JobOutput | null; error: string | null },
): Promise<void> {
  if (result.status === "COMPLETED" && result.output) {
    await db.scan.updateMany({
      where: { id: scanId, status: { in: [...ACTIVE_STATES] } },
      data: {
        status: "done",
        outputs: result.output.outputs,
        // O Json do Prisma aceita o objeto direto; o cast é só para o TS.
        metrics: (result.output.metrics ?? {}) as object,
        errorMsg: null,
      },
    });
    return;
  }

  if (result.status === "FAILED") {
    await db.scan.updateMany({
      where: { id: scanId, status: { in: [...ACTIVE_STATES] } },
      data: {
        status: "error",
        errorMsg: result.error ?? "O processamento falhou sem detalhe.",
      },
    });
    return;
  }

  if (result.status === "IN_PROGRESS") {
    await db.scan.updateMany({
      where: { id: scanId, status: "queued" },
      data: { status: "processing" },
    });
  }
  // IN_QUEUE: nada a fazer — o scan já está em queued.
}

/**
 * Reconciliação: encontra scans presos em estado ativo e consulta o runner.
 * É a rede de segurança para webhook perdido (DoD da D2). Idempotente por
 * construção — pode rodar em paralelo com o webhook sem corrida perigosa.
 */
export async function reconcileStuckScans(): Promise<number> {
  const cutoff = new Date(Date.now() - 60_000);
  const stuck = await db.scan.findMany({
    where: {
      status: { in: [...ACTIVE_STATES] },
      runpodJobId: { not: null },
      // Sem updated_at no schema (decisão de simplicidade): o corte usa createdAt
      // apenas para não reconciliar um job criado há 2 segundos.
      createdAt: { lt: cutoff },
    },
    take: 20,
  });

  let touched = 0;
  for (const scan of stuck) {
    if (!scan.runpodJobId) continue;
    try {
      const status = await jobrunner.getJobStatus(scan.runpodJobId);
      await applyJobResult(scan.id, status);
      touched++;
    } catch (err) {
      // Runner fora do ar não pode derrubar a reconciliação dos demais.
      console.error(`reconciliação do scan ${scan.id} falhou:`, err);
    }
  }
  return touched;
}

/** Segredo do webhook em comparação de tempo constante seria excesso aqui? Não:
 * é uma comparação de string curta e o custo é zero — timingSafeEqual evita
 * side-channel no único segredo que fica exposto numa URL. */
export function isValidWebhookToken(token: string | null): boolean {
  if (!token) return false;
  const expected = env().RUNPOD_WEBHOOK_SECRET;
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
