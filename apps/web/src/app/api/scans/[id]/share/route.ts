import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findAuthorized } from "@/lib/services/scans";
import { createShareLink, listShareLinks, guestState } from "@/lib/services/share-links";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  shareToken: z.string().min(1),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

/** Cria o link SOMENTE-LEITURA (share.create + share.validity.set). Dono-only. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const scan = await findAuthorized(id, parsed.data.shareToken);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  const link = await createShareLink(scan.id, parsed.data.days);
  return NextResponse.json(
    { id: link.id, token: link.token, expiresAt: link.expiresAt.toISOString() },
    { status: 201 },
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const scan = await findAuthorized(id, token);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  const links = await listShareLinks(scan.id);
  return NextResponse.json({
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      expiresAt: l.expiresAt.toISOString(),
      views: l.views,
      state: guestState(l),
    })),
  });
}
