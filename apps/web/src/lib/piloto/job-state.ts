/**
 * Máquina de estados do job — nomes do CONTRATO (docs/piloto/ui-contract.json
 * v1.1), não do banco. União discriminada: estado inválido não se representa
 * (ex.: `failed` sem código de erro não compila; `processing` sem etapa idem).
 *
 * O banco (schema.prisma ScanStatus) tem 8 estados de implementação; o contrato
 * tem 7 de PRODUTO. O mapeamento é função total — todo status do banco cai num
 * estado do contrato, e o TypeScript prova a exaustão com `never`.
 */

import type { ErrorCode } from "./error-codes";

/** Etapas reais do worker (stage_timings do handler) — progresso é a ETAPA. */
export const PROCESSING_STAGES = [
  "download",
  "normalize",
  "extract",
  "blur",
  "infer",
  "convert",
  "upload",
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export type JobState =
  | { kind: "uploading"; sentParts: number }
  | { kind: "upload-paused-offline"; sentParts: number }
  | { kind: "queued" }
  | { kind: "processing"; stage: ProcessingStage | null }
  | { kind: "completed" }
  | { kind: "failed"; code: ErrorCode }
  | { kind: "cancelled" };

export type JobStateKind = JobState["kind"];

/** Status do banco → estado do contrato. Total por construção (`never`). */
export function fromScanStatus(
  status:
    | "recording"
    | "uploading"
    | "uploaded"
    | "queued"
    | "processing"
    | "postprocessing"
    | "done"
    | "error",
  opts: {
    sentParts?: number;
    stage?: ProcessingStage | null;
    errorCode?: ErrorCode;
  } = {},
): JobState {
  switch (status) {
    case "recording":
    case "uploading":
      return { kind: "uploading", sentParts: opts.sentParts ?? 0 };
    case "uploaded":
    case "queued":
      return { kind: "queued" };
    case "processing":
    case "postprocessing":
      return { kind: "processing", stage: opts.stage ?? null };
    case "done":
      return { kind: "completed" };
    case "error":
      return { kind: "failed", code: opts.errorCode ?? "unknown" };
    default: {
      const nunca: never = status;
      throw new Error(`status de banco fora do contrato: ${String(nunca)}`);
    }
  }
}

/**
 * Grafo de transições válidas — quem quiser mudar de estado passa por aqui.
 * `upload-paused-offline` só existe entre uploading e o fim do upload;
 * terminais (completed/failed/cancelled) não têm saída.
 */
const TRANSITIONS: Record<JobStateKind, readonly JobStateKind[]> = {
  uploading: ["upload-paused-offline", "queued", "failed", "cancelled"],
  "upload-paused-offline": ["uploading", "failed", "cancelled"],
  queued: ["processing", "failed", "cancelled"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: JobStateKind, to: JobStateKind): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Transição checada: inválida lança — nunca degrada em silêncio. */
export function transition(from: JobState, to: JobState): JobState {
  if (!canTransition(from.kind, to.kind)) {
    throw new Error(`transição inválida do job: ${from.kind} → ${to.kind}`);
  }
  return to;
}
