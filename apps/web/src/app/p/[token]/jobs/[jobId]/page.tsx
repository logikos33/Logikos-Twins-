import { ScanStatusClient } from "@/app/scan/[id]/ScanStatusClient";
import { EntryClient } from "@/app/entry/EntryClient";
import { db } from "@/lib/db";
import { findByCaptureToken, rateLimitOk } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

/** Tela job DO PROJETO (/p/:token/jobs/:jobId): o captureToken autoriza o
 * projeto inteiro — o servidor resolve o shareToken do scan e entrega a mesma
 * tela real. Scan de OUTRO projeto ≡ inexistente (invalid-link). */
export default async function ProjectJobPage({
  params,
}: {
  params: Promise<{ token: string; jobId: string }>;
}) {
  const { token, jobId } = await params;
  if (!rateLimitOk(`tok:${token}`)) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }
  const project = await findByCaptureToken(token);
  if (!project) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }
  const scan = await db.scan
    .findFirst({ where: { id: jobId, projectId: project.id } })
    .catch(() => null);
  if (!scan) {
    return <EntryClient state="invalid-link" projectName={project.name} maps={[]} />;
  }
  return <ScanStatusClient scanId={scan.id} token={scan.shareToken} />;
}
