import { db } from "@/lib/db";
import { env } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">Painel — Logikos Twins</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {scans.length} scans · {today} hoje (limite {env().MAX_SCANS_PER_DAY}/dia) ·
          custo estimado acumulado{" "}
          <span className="font-mono text-neutral-200">US$ {totalCost.toFixed(2)}</span>
        </p>
      </header>

      <section className="flex flex-wrap gap-3">
        {Object.entries(byStatus).map(([status, count]) => (
          <div
            key={status}
            className="rounded-xl border border-neutral-800 px-4 py-2 text-sm"
          >
            <span className="text-neutral-400">{status}</span>{" "}
            <span className="font-mono">{count}</span>
          </div>
        ))}
      </section>

      {errors.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-red-400">Erros recentes</h2>
          <ul className="space-y-1 text-xs text-neutral-400">
            {errors.map((s) => (
              <li key={s.id} className="truncate">
                <span className="font-mono">{s.id.slice(0, 8)}</span> ·{" "}
                {s.createdAt.toISOString()} · {s.errorMsg ?? "sem mensagem"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Scans</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2">id</th>
                <th className="px-3 py-2">título</th>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2">criado</th>
                <th className="px-3 py-2">vídeo</th>
                <th className="px-3 py-2">custo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => {
                const m = (s.metrics ?? {}) as Record<string, unknown>;
                return (
                  <tr key={s.id} className="border-t border-neutral-800">
                    <td className="px-3 py-2 font-mono">{s.id.slice(0, 8)}</td>
                    <td className="max-w-40 truncate px-3 py-2">{s.title ?? "—"}</td>
                    <td className="px-3 py-2">{s.status}</td>
                    <td className="px-3 py-2">
                      {s.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">
                      {s.videoDeletedAt ? "apagado (retenção)" : s.videoKey ? "ok" : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {typeof m["cost_usd_est"] === "number"
                        ? `$${(m["cost_usd_est"] as number).toFixed(3)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        className="text-neutral-400 underline"
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
