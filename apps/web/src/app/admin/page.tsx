import { db } from "@/lib/db";
import { env } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoSymbol } from "@/components/Logo";

export const dynamic = "force-dynamic";

const STATUS_DOT: Record<string, string> = {
  recording: "bg-magenta",
  uploading: "bg-cyan",
  uploaded: "bg-cyan",
  queued: "bg-warning",
  processing: "bg-cyan",
  postprocessing: "bg-cyan",
  done: "bg-success",
  error: "bg-magenta",
};

/**
 * Painel admin (D7): scans, custo acumulado (de metrics), erros. Fonte de custos da
 * demo — sem SaaS de telemetria (regra de custo mínimo).
 *
 * Sem token válido → 404, não 403: a existência do painel não se anuncia.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (token !== env().ADMIN_TOKEN) notFound();

  const scans = await db.scan.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  const totalCost = scans.reduce((acc, s) => {
    const m = (s.metrics ?? {}) as Record<string, unknown>;
    return acc + (typeof m["cost_usd_est"] === "number" ? m["cost_usd_est"] : 0);
  }, 0);
  const byStatus = scans.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});
  const errors = scans.filter((s) => s.status === "error").slice(0, 20);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const today = scans.filter((s) => s.createdAt >= dayStart).length;

  return (
    <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-7 px-5 py-9 sm:px-6">
      <header>
        <div className="flex items-center gap-2.5">
          <LogoSymbol className="h-6 w-6" />
          <span className="k-label text-[10px] text-mist">logikos twins · painel</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Operação</h1>
        <p className="mt-1.5 font-mono text-[13px] text-mist">
          {scans.length} scans · {today} hoje{" "}
          <span className="text-faint">(limite {env().MAX_SCANS_PER_DAY}/dia)</span> ·
          custo acumulado <span className="text-signal">US$ {totalCost.toFixed(2)}</span>
        </p>
      </header>

      <section className="flex flex-wrap gap-2">
        {Object.entries(byStatus).map(([status, count]) => (
          <div
            key={status}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-graphite px-3.5 py-2 font-mono text-[12px]"
          >
            <i className={`h-2 w-2 rounded-full ${STATUS_DOT[status] ?? "bg-mist"}`} />
            <span className="text-mist">{status}</span>
            <b className="font-medium text-signal">{count}</b>
          </div>
        ))}
      </section>

      {errors.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-danger-soft">Erros recentes</h2>
          <ul className="space-y-1 font-mono text-xs text-mist">
            {errors.map((s) => (
              <li key={s.id} className="truncate">
                <span className="text-signal">{s.id.slice(0, 8)}</span> ·{" "}
                {s.createdAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                {s.errorMsg ?? "sem mensagem"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-mist">Scans</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-graphite font-mono text-[10px] tracking-wider text-mist uppercase">
              <tr>
                <th className="px-3 py-2.5">id</th>
                <th className="px-3 py-2.5">título</th>
                <th className="px-3 py-2.5">status</th>
                <th className="px-3 py-2.5">criado</th>
                <th className="px-3 py-2.5">vídeo</th>
                <th className="px-3 py-2.5">custo</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const m = (s.metrics ?? {}) as Record<string, unknown>;
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-3 py-2.5 font-mono">{s.id.slice(0, 8)}</td>
                    <td className="max-w-40 truncate px-3 py-2.5">{s.title ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <i
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status] ?? "bg-mist"}`}
                        />
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-mist">
                      {s.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2.5 text-mist">
                      {s.videoDeletedAt ? "apagado (retenção)" : s.videoKey ? "ok" : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {typeof m["cost_usd_est"] === "number"
                        ? `$${(m["cost_usd_est"] as number).toFixed(3)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        className="text-cyan underline decoration-dotted underline-offset-2 hover:text-cyan-deep"
                        href={`/scan/${s.id}?token=${s.shareToken}`}
                      >
                        abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
