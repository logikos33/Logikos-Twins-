"use client";

import { ScanStatusClient } from "@/app/scan/[id]/ScanStatusClient";

/** O convidado usa a MESMA cadeia real (poll → viewer): o guest token passa
 * pelas rotas de leitura via authorizeRead; escrita responde 403 no servidor. */
export function SharedViewerGate({
  scanId,
  guestToken,
}: {
  scanId: string;
  guestToken: string;
}) {
  return <ScanStatusClient scanId={scanId} token={guestToken} readOnly />;
}
