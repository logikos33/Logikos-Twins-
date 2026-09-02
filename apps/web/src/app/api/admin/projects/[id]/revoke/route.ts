import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { revokeProject } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (jar.get("admin_token")?.value !== env().ADMIN_TOKEN) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  const { id } = await ctx.params;
  await revokeProject(id).catch(() => undefined); // id inexistente ≡ ok (idempotente)
  return NextResponse.json({ ok: true });
}
