import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createScan, UnsupportedMimeError } from "@/lib/services/scans";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // O MIME real do MediaRecorder (varia por navegador — ADR-0008).
  mimeType: z.string().min(1).max(100),
  // Blur de rostos opcional (D6, LGPD).
  blurFaces: z.boolean().optional(),
});

/**
 * Cria o scan e abre o upload por partes. É a primeira chamada que a página de
 * gravação faz — antes mesmo de o primeiro frame ser gravado.
 */
export async function POST(req: NextRequest) {
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

  try {
    const created = await createScan(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof UnsupportedMimeError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error("POST /api/scans falhou:", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
