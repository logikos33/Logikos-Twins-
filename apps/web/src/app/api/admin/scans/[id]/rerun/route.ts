import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { retryScan } from "@/lib/services/processing";

export const dynamic = "force-dynamic";

/** Rerun do admin (#45): reprocessa também scans 'done' (vídeo ainda vivo).
 * Auth: o cookie do painel OU o header (scripts). Falha = 404, sem enumeração. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = env().ADMIN_TOKEN;
  const ok =
    req.headers.get("x-admin-token") === token ||
    req.cookies.get("admin_token")?.value === token;
  if (!ok) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  const { id } = await ctx.params;
  const scan = await db.scan.findUnique({ where: { id } }).catch(() => null);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  const result = await retryScan(scan, { admin: true });
  if ("blocked" in result) {
    return NextResponse.json(
      {
        error:
          result.blocked === "video"
            ? "vídeo bruto já purgado (retenção) — sem fonte para reprocessar"
            : "estado não permite rerun",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ id: result.id, status: result.status });
}
