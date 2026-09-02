/**
 * ViewModels do contrato (Zod) — a fronteira entre o payload da API e a UI.
 * Os NOMES vêm do contrato (ui-contract.json v1.1); o shape vem do payload
 * REAL de GET /api/scans/[id] (route.ts) — nada aqui é inventado.
 */

import { z } from "zod";
import { mapScanError } from "./error-codes";
import { fromScanStatus, type JobState } from "./job-state";

export const ScanStatusPayload = z.object({
  scanId: z.string(),
  status: z.enum([
    "recording",
    "uploading",
    "uploaded",
    "queued",
    "processing",
    "postprocessing",
    "done",
    "error",
  ]),
  title: z.string().nullable(),
  createdAt: z.string(),
  durationS: z.number().nullable(),
  frames: z.number().nullable(),
  error: z.string().nullable(),
  metrics: z.unknown().nullable(),
  scale: z.unknown().nullable(),
  artifacts: z.record(z.string(), z.string()).default({}),
});
export type ScanStatusPayload = z.infer<typeof ScanStatusPayload>;

/** O view model que as telas consomem: payload + estado do CONTRATO. */
export interface ScanViewModel {
  scanId: string;
  title: string | null;
  createdAt: string;
  durationS: number | null;
  job: JobState;
  artifacts: Record<string, string>;
  /** String técnica original (log/admin) — a UI mostra a mensagem do código. */
  rawError: string | null;
}

export function toScanViewModel(raw: unknown): ScanViewModel {
  const p = ScanStatusPayload.parse(raw);
  return {
    scanId: p.scanId,
    title: p.title,
    createdAt: p.createdAt,
    durationS: p.durationS,
    job: fromScanStatus(p.status, {
      errorCode: p.status === "error" ? mapScanError(p.error) : undefined,
    }),
    artifacts: p.artifacts,
    rawError: p.error,
  };
}
