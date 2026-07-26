import { NextRequest, NextResponse } from "next/server";
import { artifactUrls, findById } from "@/lib/services/scans";

export const dynamic = "force-dynamic";

/**
 * Estado do scan + presigned GETs dos artefatos. É o endpoint que a página de
 * status faz polling e que o viewer usa para carregar a nuvem.
 *
 * Autorização: `?token=<share_token>`. Sem token válido → 404 (não 403): quem não
 * tem o token não descobre nem que o scan existe.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const scan = await findById(id).catch(() => null);
  if (!scan || scan.shareToken !== token) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const urls = scan.status === "done" ? await artifactUrls(scan) : {};

  return NextResponse.json({
    scanId: scan.id,
    status: scan.status,
    title: scan.title,
    createdAt: scan.createdAt.toISOString(),
    durationS: scan.durationS,
    frames: scan.frames,
    error: scan.errorMsg,
    metrics: scan.metrics,
    scale: scan.scale,
    artifacts: urls,
  });
}
