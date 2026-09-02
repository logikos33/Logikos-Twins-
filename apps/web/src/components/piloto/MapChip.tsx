/**
 * Chip de status de MAPA (entry/admin) — cor + ícone + palavra (D-1).
 * done/failed preenchidos com texto ink; processing outline Névoa.
 */

import { t } from "@/lib/piloto/strings";

export type MapStatus = "done" | "processing" | "failed";

const STYLE: Record<MapStatus, string> = {
  done: "bg-success text-ink",
  processing: "border border-line-strong text-mist",
  failed: "bg-danger text-ink",
};
const ICON: Record<MapStatus, string> = { done: "✓", processing: "▤", failed: "▲" };

export function MapChip({ st }: { st: MapStatus }) {
  const palavra =
    st === "done"
      ? t("entry", "chipDone")
      : st === "processing"
        ? t("entry", "chipProcessing")
        : t("entry", "chipFailed");
  return (
    <span
      data-state={st}
      className={`inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-0.5 text-[11px] font-semibold ${STYLE[st]}`}
    >
      <span aria-hidden="true" className="text-[10px]">
        {ICON[st]}
      </span>
      {palavra}
    </span>
  );
}
