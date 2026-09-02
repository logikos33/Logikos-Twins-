import { NextRequest, NextResponse } from "next/server";
import { authorizeRead } from "@/lib/services/share-links";
import { keys, presignGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Foto de um keyframe: redireciona para a URL assinada do JPEG.
 * Existe para o viewer usar `<img src="/api/scans/.../keyframes/12?token=...">`
 * sem conhecer o storage.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; idx: string }> },
) {
  const { id, idx } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const auth = await authorizeRead(id, token);
  const scan = auth?.scan;
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const frameIdx = Number.parseInt(idx, 10);
  if (!Number.isFinite(frameIdx) || frameIdx < 0) {
    return NextResponse.json({ error: "índice inválido" }, { status: 400 });
  }

  const url = await presignGet(keys.keyframe(scan.id, frameIdx), 3600);
  return NextResponse.redirect(url, 302);
}
