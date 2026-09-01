import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findAuthorized } from "@/lib/services/scans";

export const dynamic = "force-dynamic";

const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

const bodySchema = z.object({
  shareToken: z.string().min(1),
  factor: z.number().positive().finite(),
  method: z.enum(["reference_distance", "aruco"]),
  refPoints: z.tuple([vec3, vec3]).optional(),
});

/** Grava a calibração de escala do scan (D4: manual; D6: aruco sobrescreve). */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo não é JSON válido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "corpo inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const scan = await findAuthorized(id, parsed.data.shareToken);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const { factor, method, refPoints } = parsed.data;
  const updated = await db.scan.update({
    where: { id: scan.id },
    data: { scale: { factor, method, refPoints: refPoints ?? null } },
  });

  return NextResponse.json({ scanId: updated.id, scale: updated.scale });
}
