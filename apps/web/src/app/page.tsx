import Link from "next/link";
import { listScans } from "@/lib/services/gallery";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  recording: "gravando",
  uploading: "enviando",
  uploaded: "enviado",
  queued: "na fila",
  processing: "processando",
  postprocessing: "finalizando",
  done: "pronto",
  error: "falhou",
};

/**
 * Galeria de scans. Na D4 lista tudo (dev); a D7 põe a listagem completa atrás do
 * ADMIN_TOKEN — o acesso a um scan individual permanece pelo link com share_token.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string }>;
}) {
  // Galeria completa só com ADMIN_TOKEN (D7): sem ele, a home é o call-to-action —
  // cada scan continua acessível pelo próprio link com share_token.
  const { admin } = await searchParams;
  const isAdmin = admin === env().ADMIN_TOKEN;
  const scans = isAdmin ? await listScans().catch(() => []) : [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Logikos Twins</h1>
          <p className="mt-2 max-w-md text-pretty text-sm text-neutral-400">
            Filme um ambiente andando com o celular e receba o mapa 3D navegável — com
            medição, anotações e detecções ancoradas no espaço.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center rounded-full bg-white px-6 py-3 font-medium text-neutral-950 transition hover:bg-neutral-200"
        >
          Novo scan
        </Link>
      </header>

      {!isAdmin ? (
        <p className="text-sm text-neutral-500">
          Cada scan tem um link próprio de compartilhamento — quem tem o link, vê o mapa.
          A galeria completa é do painel do operador.
        </p>
      ) : scans.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhum scan ainda — toque em “Novo scan” e filme o primeiro ambiente.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {scans.map((s) => (
            <li key={s.scanId}>
              <Link
                href={`/scan/${s.scanId}?token=${s.shareToken}`}
                className="group block overflow-hidden rounded-2xl border border-neutral-800 transition hover:border-neutral-600"
              >
                <div className="aspect-video bg-neutral-900">
                  {s.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- thumb vem por URL assinada do storage
                    <img
                      src={s.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-neutral-700">
                      🗺️
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">
                    {s.title ?? "Scan sem título"}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {STATUS_LABEL[s.status] ?? s.status} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-600">
        O vídeo bruto de cada scan é apagado após 7 dias; o mapa 3D permanece.
      </p>
    </main>
  );
}
