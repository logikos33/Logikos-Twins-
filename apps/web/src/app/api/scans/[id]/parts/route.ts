import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findById, presignPart, InvalidStateError } from "@/lib/services/scans";

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

  const scan = await findById(id).catch(() => null);
  // Token errado e scan inexistente respondem IGUAL: quem não tem o token não
  // descobre nem que o id existe.
  if (!scan || scan.shareToken !== parsed.data.shareToken) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
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
