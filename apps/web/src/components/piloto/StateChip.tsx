import type { JobStateKind } from "@/lib/piloto/job-state";

/**
 * Chip de estado do job — o 1º componente compartilhado do piloto.
 * Regra do contrato (D-1): estado comunica-se com COR + ÍCONE + PALAVRA;
 * ciano nunca significa estado; magenta nunca aparece aqui.
 * Motion: só o ponto de "gravando"/"enviando" pulsa, em steps, e o chip
 * termina em repouso nos estados terminais — zero loop decorativo.
 */

const CHIP: Record<JobStateKind, { palavra: string; cor: string; icone: string }> = {
  uploading: { palavra: "enviando", cor: "var(--color-record)", icone: "●" },
  "upload-paused-offline": {
    palavra: "envio pausado — offline",
    cor: "var(--color-warning)",
    icone: "⏸",
  },
  queued: { palavra: "na fila", cor: "var(--color-status-processing)", icone: "≡" },
  processing: {
    palavra: "reconstruindo",
    cor: "var(--color-status-processing)",
    icone: "▣",
  },
  completed: { palavra: "pronto", cor: "var(--color-success)", icone: "✓" },
  failed: { palavra: "falhou", cor: "var(--color-danger)", icone: "✕" },
  cancelled: { palavra: "cancelado", cor: "var(--color-faint)", icone: "⊘" },
};

export function StateChip({
  kind,
  stage,
}: {
  kind: JobStateKind;
  stage?: string | null;
}) {
  const c = CHIP[kind];
  return (
    <span
      data-state={kind}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-xs"
      style={{ color: c.cor }}
    >
      <span aria-hidden="true">{c.icone}</span>
      {c.palavra}
      {kind === "processing" && stage ? (
        <span className="text-faint">· {stage}</span>
      ) : null}
    </span>
  );
}
