import { headers } from "next/headers";
import { EntryClient, type EntryMap } from "@/app/entry/EntryClient";
import { findByCaptureToken, projectScans, rateLimitOk } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

/**
 * ENTRY pública do contrato (/p/:token, #38): o cliente com o link vê os mapas
 * DO PROJETO — sem cookie, sem cadastro. Token inválido/revogado → estado
 * invalid-link (nunca 500, nunca enumeração). Rate limit por token e por IP.
 */
export default async function ProjectEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";

  if (!rateLimitOk(`tok:${token}`) || !rateLimitOk(`ip:${ip}`, 120)) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }

  const project = await findByCaptureToken(token);
  if (!project) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }

  const scans = await projectScans(project.id);
  const maps: EntryMap[] = scans.map((s) => ({
    id: s.id,
    name: s.title ?? s.id.slice(0, 8),
    date: s.createdAt.toISOString().slice(0, 10),
    st: s.status === "done" ? "done" : s.status === "error" ? "failed" : "processing",
    href: `/p/${token}/jobs/${s.id}`,
  }));

  return (
    <EntryClient
      state={maps.length > 0 ? "ready" : "empty"}
      projectName={project.name}
      maps={maps}
      captureHref={`/p/${token}/capturar`}
    />
  );
}
