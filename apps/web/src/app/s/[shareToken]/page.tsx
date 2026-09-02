import { LogoSymbol } from "@/components/Logo";
import { bumpViews, resolveGuestToken } from "@/lib/services/share-links";
import { rateLimitOk } from "@/lib/services/projects";
import { STRINGS } from "@/lib/piloto/strings";
import { SharedViewerGate } from "./SharedViewerGate";

export const dynamic = "force-dynamic";

/** Tela SHARED do contrato (/s/:shareToken): somente-leitura de verdade — a
 * capability é checada em cada endpoint no servidor; aqui só se decide entre
 * valid (viewer readonly), expired e revoked (renderizáveis, nunca erro). */
export default async function SharedPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  if (!rateLimitOk(`stok:${shareToken}`)) {
    return <SharedFim texto={STRINGS.shared.expired} state="expired" />;
  }
  const guest = await resolveGuestToken(shareToken);
  if (!guest) {
    return <SharedFim texto={STRINGS.shared.expired} state="expired" />;
  }
  if (guest.state !== "valid") {
    return (
      <SharedFim
        texto={
          guest.state === "revoked" ? STRINGS.shared.revoked : STRINGS.shared.expired
        }
        state={guest.state}
      />
    );
  }
  await bumpViews(guest.link.id).catch(() => undefined);
  return <SharedViewerGate scanId={guest.scan.id} guestToken={shareToken} />;
}

function SharedFim({ texto, state }: { texto: string; state: string }) {
  return (
    <main
      data-screen="shared"
      data-state={state}
      className="grid-grego flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <LogoSymbol className="h-10 w-10 text-faint" />
      <p className="max-w-[260px] text-[14.5px]">{texto}</p>
    </main>
  );
}
