import Link from "next/link";
import { listScans } from "@/lib/services/gallery";
import { env } from "@/lib/env";
import { LogoSymbol, LogoWordmark } from "@/components/Logo";
import { IconLock } from "@/components/icons";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  recording: "gravando",
  uploading: "enviando",
  uploaded: "enviado",
  queued: "na fila",
  processing: "reconstruindo",
  postprocessing: "finalizando",
  done: "pronto",
  error: "falhou",
};

// Ponto do chip de status → token de cor (DESIGN-TOKENS §3.5). O rótulo textual é
// obrigatório: cor sozinha não comunica para daltônicos.
const STATUS_DOT: Record<string, string> = {
  recording: "bg-magenta",
  uploading: "bg-cyan",
  uploaded: "bg-cyan",
  queued: "bg-warning",
  processing: "bg-cyan animate-pulse",
  postprocessing: "bg-cyan animate-pulse",
  done: "bg-success",
  error: "bg-magenta",
};

const STEPS = [
  [
    "01",
    "Filme andando",
    "1 passo por segundo, feche a volta. O envio acontece durante a filmagem.",
  ],
  ["02", "Processamos em minutos", "O vídeo vira um mapa 3D navegável, com escala real."],
  ["03", "Pergunte ao mapa", "“Onde está o extintor?” — voo até o objeto + foto-prova."],
] as const;

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
    <main className="grid-grego relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(70%_100%_at_50%_0%,rgb(0_229_255/0.07),transparent)]"
      />

      <nav className="relative flex items-center justify-between">
        <LogoWordmark className="text-[19px]" />
        {!isAdmin && (
          <Link
            href="/login"
            className="inline-flex min-h-(--tap) items-center rounded-md px-3 text-sm text-mist transition hover:text-signal"
          >
            entrar
          </Link>
        )}
      </nav>

      {!isAdmin ? (
        /* ── Visitante: nada é listado (privacidade por design) ──────────── */
        <>
          <section className="mt-[10dvh] max-w-xl">
            <p className="k-label text-cyan">
              scan 3d pelo celular · sem hardware especial
            </p>
            <h1 className="mt-4 font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
              Filme o ambiente. Receba um mapa 3D que responde{" "}
              <span className="text-cyan">onde as coisas estão</span>.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist">
              Grave andando, direto do navegador — o envio acontece durante a filmagem.
              Minutos depois: nuvem de pontos com{" "}
              <b className="font-medium text-signal">escala real</b>, medição, anotações e
              busca por objetos.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/new"
                className="inline-flex min-h-[50px] items-center rounded-md bg-cyan px-6 font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.97]"
              >
                Novo scan
              </Link>
              <a
                href="#como"
                className="inline-flex min-h-[50px] items-center rounded-md border border-line-strong px-6 font-semibold text-signal transition hover:border-cyan active:scale-[0.97]"
              >
                Como funciona
              </a>
            </div>
          </section>

          <section id="como" className="mt-10 grid gap-2.5 sm:grid-cols-3">
            {STEPS.map(([n, t, d]) => (
              <div
                key={n}
                className="flex items-start gap-3 rounded-lg border border-line bg-graphite/70 p-3.5"
              >
                <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-sm border border-cyan-deep font-mono text-[11px] text-cyan">
                  {n}
                </span>
                <span>
                  <b className="block text-sm font-semibold">{t}</b>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-mist">
                    {d}
                  </span>
                </span>
              </div>
            ))}
          </section>

          <section className="mt-6 flex max-w-2xl gap-3 rounded-lg border border-line border-l-[3px] border-l-cyan-deep bg-graphite/70 p-4">
            <IconLock className="mt-0.5 h-5 w-5 flex-none text-cyan" />
            <div>
              <b className="block text-sm font-semibold">Privacidade por padrão</b>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mist">
                Nenhum scan é listado nesta página. Cada mapa existe apenas para quem tem
                o link com token secreto. O vídeo bruto é apagado após 7 dias; o mapa 3D
                permanece.
              </p>
            </div>
          </section>

          <footer className="mt-10 mt-auto flex items-center gap-3 border-t border-line pt-5 pb-1">
            <LogoSymbol className="h-5 w-5 text-mist" />
            <span className="k-label text-[10px] text-faint">
              a razão que enxerga · logikos soluções
            </span>
          </footer>
        </>
      ) : (
        /* ── Operador (?admin=token): grade de cards ─────────────────────── */
        <>
          <div className="relative mt-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex h-[34px] items-center gap-2 rounded-full border border-dashed border-warning/50 px-3 font-mono text-[11px] tracking-wider text-warning">
              <i className="h-1.5 w-1.5 rounded-full bg-warning" />
              modo operador
            </span>
            <span className="flex-1" />
            <Link
              href={`/admin?token=${admin}`}
              className="inline-flex min-h-(--tap) items-center px-2 font-mono text-xs text-mist transition hover:text-cyan"
            >
              painel /admin ↗
            </Link>
            <Link
              href="/new"
              className="inline-flex min-h-[42px] items-center rounded-[10px] bg-cyan px-4 text-sm font-semibold text-ink transition hover:bg-cyan-deep"
            >
              Novo scan
            </Link>
          </div>

          <div className="relative mt-6 flex items-baseline gap-3">
            <h2 className="font-display text-[22px] font-bold">Seus scans</h2>
            <span className="font-mono text-xs text-mist">{scans.length} no total</span>
          </div>

          {scans.length === 0 ? (
            <div className="mx-auto my-auto flex max-w-xs flex-col items-center gap-2 py-16 text-center">
              <LogoSymbol className="mb-2 h-16 w-16 text-surface-2" />
              <h3 className="font-display text-2xl font-bold">Nenhum scan ainda.</h3>
              <p className="text-sm leading-relaxed text-mist">
                Do corredor ao mapa 3D em{" "}
                <b className="font-medium text-signal">menos de 10 minutos</b>. Toque em
                “Novo scan” e filme o primeiro ambiente.
              </p>
            </div>
          ) : (
            <ul className="relative mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {scans.map((s) => (
                <li key={s.scanId}>
                  <Link
                    href={`/scan/${s.scanId}?token=${s.shareToken}`}
                    className="group block overflow-hidden rounded-lg border border-line bg-graphite shadow-card transition hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <div className="relative aspect-video bg-[#101017]">
                      {s.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- thumb vem por URL assinada do storage
                        <img
                          src={s.thumbUrl}
                          alt=""
                          className={`h-full w-full object-cover transition group-hover:scale-105 ${
                            s.status === "error" ? "opacity-40 saturate-50" : ""
                          }`}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <LogoSymbol className="h-8 w-8 text-surface-2" />
                        </div>
                      )}
                      <span className="absolute top-2 right-2 inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-ink/85 px-2.5 font-mono text-[10px]">
                        <i
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status] ?? "bg-mist"}`}
                        />
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold">
                        {s.title ?? "Scan sem título"}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10.5px] text-mist">
                        {new Date(s.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="relative mt-4 text-xs text-faint">
            Cada card abre o scan pelo próprio link de compartilhamento (share_token).
          </p>
        </>
      )}
    </main>
  );
}
