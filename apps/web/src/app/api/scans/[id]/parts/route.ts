import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findAuthorized,
  maxUploadParts,
  presignPart,
  InvalidStateError,
} from "@/lib/services/scans";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // S3 numera partes de 1 a 10.000; com partes de ~5 MB isso dá ~50 GB de teto,
  // muito acima do MAX_VIDEO_MB — o limite de partes nunca é o gargalo.
  partNumber: z.number().int().min(1).max(10000),
  shareToken: z.string().min(1),
});

/** Assina a parte N do multipart — chamada repetidamente DURANTE a gravação. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  // Token errado, scan inexistente e link vencido respondem IGUAL (404).
  const scan = await findAuthorized(id, parsed.data.shareToken);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const cap = maxUploadParts();
  if (parsed.data.partNumber > cap) {
    return NextResponse.json(
      { error: `parte ${parsed.data.partNumber} excede o teto do produto (${cap} partes)` },
      { status: 413 },
    );
  }

  try {
    const url = await presignPart(scan, parsed.data.partNumber);
    return NextResponse.json({ url, partNumber: parsed.data.partNumber });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(`POST /api/scans/${id}/parts falhou:`, err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
