import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Alias do contrato /m/:mapId → tela real do scan (token continua na query —
 * mapId sozinho nunca autoriza nada). */
export default async function MapAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ mapId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { mapId } = await params;
  const { token } = await searchParams;
  redirect(`/scan/${mapId}?token=${encodeURIComponent(token ?? "")}`);
}
