import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { findById } from "@/lib/services/scans";
import { isValidWebhookToken } from "@/lib/services/processing";

export const dynamic = "force-dynamic";

const clusterSchema = z.object({
  label: z.string().min(1).max(80),
  score: z.number().min(0).max(1),
  count: z.number().int().positive(),
  world_pos: z.tuple([z.number(), z.number(), z.number()]),
  best_frame: z.number().int().nonnegative(),
});

const batchSchema = z.object({
  clusters: z.array(clusterSchema).max(500),
});

/**
 * Batch de detecções ancoradas, enviado pelo WORKER ao fim do processamento.
 * Autenticação pelo MESMO segredo do webhook (vem da nossa infraestrutura, não do
 * usuário) — `?token=`. Substitui as detecções do scan (idempotente para retry).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!isValidWebhookToken(req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo não é JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "corpo inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const scan = await findById(id).catch(() => null);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  // Substituição atômica: um retry do worker não pode duplicar pins.
  await db.$transaction([
    db.detection.deleteMany({ where: { scanId: scan.id } }),
    db.detection.createMany({
      data: parsed.data.clusters.map((c) => ({
        scanId: scan.id,
        frameIdx: c.best_frame,
        label: c.label,
        score: c.score,
        bbox: [],
        worldPos: { x: c.world_pos[0], y: c.world_pos[1], z: c.world_pos[2] },
      })),
    }),
  ]);

  return NextResponse.json({ ok: true, count: parsed.data.clusters.length });
}

/** Detecções para o viewer (autorizado pelo share_token, como tudo). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const scan = await findById(id).catch(() => null);
  if (!scan || scan.shareToken !== token) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const detections = await db.detection.findMany({
    where: { scanId: scan.id },
    orderBy: [{ label: "asc" }, { score: "desc" }],
  });
  return NextResponse.json({ detections });
}
