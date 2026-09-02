import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AdminView, type AdminProject, type AdminRow } from "./AdminView";
import { listProjects } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

/**
 * Painel admin (contrato v1.2): auth por cookie (#32); sem cookie renderiza o
 * estado LOGIN do contrato (o /admin/login segue devolvendo 404 a token errado
 * — a tela não enumera nada, só aponta o formulário; D- da Camada B). Com
 * cookie, o estado jobs com dados reais. Corpo visual em AdminView.
 */
export default async function AdminPage() {
  const jar = await cookies();
  const authed = jar.get("admin_token")?.value === env().ADMIN_TOKEN;

  if (!authed) {
    return (
      <AdminView
        authed={false}
        projects={[]}
        rows={[]}
        today={0}
        maxPerDay={env().MAX_SCANS_PER_DAY}
        totalCost={0}
        costAlertUsd={env().COST_ALERT_USD}
        errors={[]}
      />
    );
  }

  const scans = await db.scan.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const projects: AdminProject[] = (await listProjects()).map((pr) => ({
    id: pr.id,
    name: pr.name,
    captureToken: pr.captureToken,
    createdAt: pr.createdAt.toISOString(),
    revoked: pr.revokedAt != null,
  }));
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  let totalCost = 0;
  const rows: AdminRow[] = scans.map((s) => {
    const m = (s.metrics ?? {}) as Record<string, unknown>;
    const cost = typeof m["cost_usd_est"] === "number" ? m["cost_usd_est"] : null;
    if (cost) totalCost += cost;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      createdAt: s.createdAt.toISOString().slice(0, 16).replace("T", " "),
      videoDeleted: s.videoDeletedAt != null,
      hasVideo: s.videoKey != null,
      costUsd: cost,
      runpodJobId: s.runpodJobId,
      href: `/scan/${s.id}?token=${s.shareToken}`,
      provenance: JSON.stringify(
        { scanId: s.id, runpodJobId: s.runpodJobId, metrics: s.metrics },
        null,
        1,
      ),
    };
  });

  return (
    <AdminView
      authed
      projects={projects}
      rows={rows}
      today={scans.filter((s) => s.createdAt >= dayStart).length}
      maxPerDay={env().MAX_SCANS_PER_DAY}
      totalCost={totalCost}
      costAlertUsd={env().COST_ALERT_USD}
      errors={scans
        .filter((s) => s.status === "error")
        .slice(0, 20)
        .map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString().slice(0, 16).replace("T", " "),
          msg: s.errorMsg,
        }))}
    />
  );
}
