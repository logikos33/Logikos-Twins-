"use client";

/**
 * Tela JOB do contrato v1.2 — corpo PURO extraído do ScanStatusClient (que
 * mantém a orquestração real: polling, revelação, viewer). Fusão do export com
 * a tela real, preservando o que o produto já fazia melhor (guardião do link,
 * stepper honesto POR STATUS — as 5 etapas de exibição mapeiam status reais,
 * nunca % inventada). D-1: zero magenta (gravando=record, falhou=danger); o
 * shimmer da etapa ativa fica como indicador semântico de atividade (par do
 * ponto REC), respeitando motion-reduce.
 */

import { ERROR_MESSAGES, mapScanError, type ErrorCode } from "@/lib/piloto/error-codes";
import { t } from "@/lib/piloto/strings";
import { IconAlert, IconKey } from "@/components/icons";
import { LogoSymbol } from "@/components/Logo";
import { EduTheater } from "./EduTheater";

/** Status reais do backend + `cancelled` (contrato; ainda sem emissor). */
export type JobStatus =
  | "recording"
  | "uploading"
  | "uploaded"
  | "queued"
  | "processing"
  | "postprocessing"
  | "done"
  | "error"
  | "cancelled"
  | "upload-paused-offline";

/** Status real → estado do CONTRATO (data-state da raiz). */
export function contractState(status: JobStatus): string {
  switch (status) {
    case "recording":
    case "uploading":
      return "uploading";
    case "uploaded":
    case "queued":
      return "queued";
    case "processing":
    case "postprocessing":
      return "processing";
    case "done":
      return "completed";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "upload-paused-offline":
      return "upload-paused-offline";
  }
}

const STAGE: Record<JobStatus, number> = {
  recording: 0,
  uploading: 0,
  uploaded: 1,
  queued: 1,
  processing: 2,
  postprocessing: 3,
  done: 4,
  error: 0,
  cancelled: 0,
  "upload-paused-offline": 0,
};

const CHIP_DOT: Record<JobStatus, string> = {
  recording: "bg-record animate-[rec-dot_1s_steps(2,end)_infinite] motion-reduce:animate-none",
  uploading: "bg-cyan",
  uploaded: "bg-cyan",
  queued: "bg-warning",
  processing: "bg-cyan",
  postprocessing: "bg-cyan",
  done: "bg-success",
  error: "bg-danger",
  cancelled: "bg-faint",
  "upload-paused-offline": "bg-warning",
};

export interface JobBodyProps {
  status: JobStatus;
  title: string | null;
  durationS: number | null;
  rawError: string | null;
  copied: boolean;
  onCopyLink: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

const SUBLINES = t("job", "statusSublines") as Partial<Record<JobStatus, string>>;
const LABELS = t("job", "statusLabels") as Partial<Record<JobStatus, string>>;

export function JobBody(p: JobBodyProps) {
  const stage = STAGE[p.status];
  const failed = p.status === "error";
  const cancelled = p.status === "cancelled";
  const code: ErrorCode = failed ? mapScanError(p.rawError) : "unknown";
  const steps = t("job", "steps");

  return (
    <main
      data-screen="job"
      data-state={contractState(p.status)}
      data-plug="job.poll"
      className="grid-grego mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-5 sm:px-6"
    >
      <header className="flex items-center gap-2.5">
        <LogoSymbol className="h-6 w-6" />
        <span className="k-label text-[10px] text-mist">{t("job", "brand")}</span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 font-mono text-[11px]">
          <i className={`h-2 w-2 rounded-full ${CHIP_DOT[p.status]}`} />
          {t("job", "chips")[p.status]}
        </span>
      </header>

      <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">
        {p.title ?? t("job", "chips").done}
      </h1>
      {p.durationS != null && (
        <p className="mt-0.5 font-mono text-xs text-mist">
          {t("job", "videoOf").replace(
            "{t}",
            `${Math.floor(p.durationS / 60)}:${String(Math.round(p.durationS) % 60).padStart(2, "0")}`,
          )}
        </p>
      )}

      {!failed && !cancelled && (
        <div className="mt-5 mb-4 flex items-start" aria-label={t("job", "stepperAria")}>
          {steps.map((label, i) => (
            <div key={label} className="relative flex flex-1 flex-col items-center gap-2">
              {i > 0 && (
                <span
                  className={`absolute top-[11px] right-1/2 left-[-50%] h-0.5 ${
                    i <= stage ? "bg-cyan-deep" : "bg-surface-2"
                  }`}
                />
              )}
              <span
                className={`relative z-10 grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-[11px] font-bold text-ink ${
                  i < stage
                    ? "border-cyan bg-cyan"
                    : i === stage
                      ? "border-cyan bg-ink shadow-[0_0_0_4px_rgb(0_229_255/0.14)]"
                      : "border-surface-2 bg-ink"
                }`}
              >
                {i < stage ? "✓" : ""}
              </span>
              <b
                className={`px-0.5 text-center font-mono text-[8px] font-normal tracking-wider uppercase ${
                  i === stage ? "text-cyan" : i < stage ? "text-mist" : "text-faint"
                }`}
              >
                {label}
              </b>
            </div>
          ))}
        </div>
      )}

      {cancelled && (
        <div className="mt-8 flex flex-col items-start gap-4">
          <h2 className="font-display text-[22px] font-medium">
            {t("job", "chips").cancelled}.
          </h2>
          <a
            data-plug="job.recapture"
            href="/new"
            className="inline-flex min-h-[46px] items-center rounded-md border border-line-strong px-5 font-semibold hover:border-cyan"
          >
            {t("entry", "capture")}
          </a>
        </div>
      )}

      {failed && (
        <div className="mt-5 rounded-lg border border-danger/40 bg-graphite p-4">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold">
            <IconAlert className="h-[22px] w-[22px] text-danger" />
            {t("job", "failedTitle")}
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed">{ERROR_MESSAGES[code]}</p>
          {p.rawError && (
            <p className="mt-2 rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[11px] text-faint">
              {p.rawError}
            </p>
          )}
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            {t("job", "failedHint").split("{b}")[0]}
            <b className="font-medium text-signal">{t("job", "failedHintBold")}</b>
            {t("job", "failedHint").split("{b}")[1]}
          </p>
          <div className="mt-3.5 flex gap-2.5">
            <a
              data-plug="job.recapture"
              href="/new"
              className="inline-flex min-h-[46px] items-center rounded-md border border-line-strong px-5 font-semibold hover:border-cyan"
            >
              {t("job", "recapture")}
            </a>
            <button
              data-plug="job.retry"
              onClick={p.onRetry}
              className="inline-flex min-h-[46px] items-center rounded-md bg-cyan px-5 font-semibold text-ink transition hover:bg-cyan-deep"
            >
              {t("job", "retry")}
            </button>
          </div>
        </div>
      )}

      {!failed && !cancelled && (
        <>
          <EduTheater />

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-display text-[19px] font-medium">
              {LABELS[p.status]}
            </h2>
          </div>
          {SUBLINES[p.status] && (
            <p className="mt-1 text-[13px] text-mist">{SUBLINES[p.status]}</p>
          )}

          <div className="mt-3 mb-5 flex gap-1" aria-hidden="true">
            {steps.map((_, i) => (
              <i
                key={i}
                className={`relative h-1 flex-1 overflow-hidden rounded-full ${
                  i < stage ? "bg-cyan-deep" : "bg-surface-2"
                }`}
              >
                {i === stage && (
                  <span className="absolute inset-y-0 w-3/5 animate-[stage-slide_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-cyan to-transparent motion-reduce:animate-none" />
                )}
              </i>
            ))}
          </div>

          {(p.status === "uploaded" || p.status === "queued") && (
            <button
              data-plug="job.cancel"
              onClick={p.onCancel}
              className="mb-4 self-start rounded-xl border border-line-strong px-5 py-2.5 text-sm font-medium text-mist hover:border-cyan"
            >
              {t("job", "cancel")}
            </button>
          )}
        </>
      )}

      <div className="mt-1 rounded-lg border border-line bg-graphite p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <IconKey className="h-4 w-4 text-warning" />
          {t("job", "keepLinkTitle")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-mist">{t("job", "keepLinkSub")}</p>
        <button
          onClick={p.onCopyLink}
          className={`mt-2.5 inline-flex min-h-(--tap) items-center rounded-[10px] border px-4 font-mono text-xs transition ${
            p.copied ? "border-success text-success" : "border-line-strong hover:border-cyan"
          }`}
        >
          {p.copied ? t("job", "copied") : t("job", "copyLink")}
        </button>
      </div>

      <p className="mt-auto pt-4 pb-1 text-center text-xs text-faint">
        {t("job", "footer")}
      </p>
    </main>
  );
}
