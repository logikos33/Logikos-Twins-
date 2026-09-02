import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeRead } from "@/lib/services/share-links";

export const dynamic = "force-dynamic";

const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

const createSchema = z.object({
  shareToken: z.string().min(1),
  type: z.enum(["pin", "measure", "note"]),
  position: z.union([
    vec3, // pin/note
    z.object({ a: vec3, b: vec3 }), // medição
  ]),
  data: z
    .object({
      text: z.string().max(500).optional(),
      keyframe: z.number().int().nonnegative().optional(),
      sceneUnits: z.number().optional(),
    })
    .optional(),
});

/** Lista as anotações do scan (o viewer carrega junto com a nuvem). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const auth = await authorizeRead(id, token);
  const scan = auth?.scan;
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const annotations = await db.annotation.findMany({
    where: { scanId: scan.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ annotations });
}

/** Cria um pin, medição ou nota. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo não é JSON válido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "corpo inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const auth = await authorizeRead(id, parsed.data.shareToken);
  if (!auth) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  // Capability no SERVIDOR (#47): convidado não anota.
  if (auth.role === "guest") {
    return NextResponse.json({ error: "link somente-leitura" }, { status: 403 });
  }
  const scan = auth.scan;

  const created = await db.annotation.create({
    data: {
      scanId: scan.id,
      type: parsed.data.type,
      position: parsed.data.position,
      data: parsed.data.data ?? {},
    },
  });
  return NextResponse.json({ annotation: created }, { status: 201 });
}
