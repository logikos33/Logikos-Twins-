import { NextRequest, NextResponse } from "next/server";
import { findById } from "@/lib/services/scans";
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

  const scan = await findById(id).catch(() => null);
  if (!scan || scan.shareToken !== token) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const frameIdx = Number.parseInt(idx, 10);
  if (!Number.isFinite(frameIdx) || frameIdx < 0) {
    return NextResponse.json({ error: "índice inválido" }, { status: 400 });
  }

  const url = await presignGet(keys.keyframe(scan.id, frameIdx), 3600);
  return NextResponse.redirect(url, 302);
}
