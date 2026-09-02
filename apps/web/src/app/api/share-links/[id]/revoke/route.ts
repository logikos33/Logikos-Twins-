import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findAuthorized } from "@/lib/services/scans";
import { revokeShareLink } from "@/lib/services/share-links";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ shareToken: z.string().min(1) });

/** Revoga um link de convidado — só o DONO do scan correspondente. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const link = await db.shareLink.findUnique({ where: { id } }).catch(() => null);
  if (!link) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  const scan = await findAuthorized(link.scanId, parsed.data.shareToken);
  if (!scan) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  await revokeShareLink(link.id);
  return NextResponse.json({ ok: true });
}
