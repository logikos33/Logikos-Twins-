import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { listScans } from "@/lib/services/gallery";
import { EntryClient, type EntryMap } from "./EntryClient";

export const dynamic = "force-dynamic";

/**
 * Rota real da tela entry (routeMap do contrato v1.2; /p/:token aguarda #38).
 * Fonte de dados: a MESMA galeria admin-gated da home (listScans) — sem admin,
 * o visitante vê o estado `empty` e grava o primeiro. Estados offline/loading/
 * invalid-link são client-side/dev (galeria completa no /dev/states).
 */
export default async function EntryPage() {
  const jar = await cookies();
  const isAdmin = jar.get("admin_token")?.value === env().ADMIN_TOKEN;
  const scans = isAdmin ? await listScans().catch(() => []) : [];

  const maps: EntryMap[] = scans.map((s) => ({
    id: s.scanId,
    name: s.title ?? s.scanId.slice(0, 8),
    date: s.createdAt.slice(0, 10),
    st: s.status === "done" ? "done" : s.status === "error" ? "failed" : "processing",
    href: `/scan/${s.scanId}?token=${s.shareToken}`,
  }));

  return (
    <EntryClient
      state={maps.length > 0 ? "ready" : "empty"}
      projectName={env().APP_NAME}
      maps={maps}
    />
  );
}
