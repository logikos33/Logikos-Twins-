import { CaptureClient } from "@/app/new/CaptureClient";
import { EntryClient } from "@/app/entry/EntryClient";
import { env } from "@/lib/env";
import { findByCaptureToken, rateLimitOk } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

/** Captura DO PROJETO (/p/:token/capturar): mesmo fluxo real do /new, com o
 * captureToken indo no create para associar o scan ao projeto. */
export default async function ProjectCapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!rateLimitOk(`tok:${token}`)) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }
  const project = await findByCaptureToken(token);
  if (!project) {
    return <EntryClient state="invalid-link" projectName="—" maps={[]} />;
  }
  return <CaptureClient maxSeconds={env().MAX_VIDEO_SECONDS} captureToken={token} />;
}
