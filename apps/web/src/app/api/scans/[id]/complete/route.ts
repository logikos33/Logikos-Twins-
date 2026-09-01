import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeUpload, findAuthorized, InvalidStateError } from "@/lib/services/scans";
import { dispatchJob, markDispatchFailed } from "@/lib/services/processing";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  shareToken: z.string().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1),
      }),
    )
    .min(1),
  durationS: z.number().positive().nullable(),
});

/**
 * Fecha o multipart. Chamada quando o usuário toca em PARAR — a partir daqui o
 * processamento dispara sozinho (D2); não existe botão de upload.
 */
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

  const scan = await findAuthorized(id, parsed.data.shareToken);
  if (!scan) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }

  const { durationS } = parsed.data;
  if (durationS !== null && durationS > env().MAX_VIDEO_SECONDS) {
    return NextResponse.json(
      {
        error: `Vídeo de ${Math.round(durationS)}s excede o limite de ${env().MAX_VIDEO_SECONDS}s.`,
      },
      { status: 422 },
    );
  }

  try {
    let updated = await completeUpload(scan, parsed.data.parts, durationS);

    // O processamento dispara SOZINHO (ADR-0008): parar de gravar é o último gesto
    // do usuário. Falha no disparo não desfaz o upload — vira `error` legível e a
    // reconciliação/retry manual ficam possíveis.
    if (updated.status === "uploaded") {
      try {
        updated = await dispatchJob(updated);
      } catch (err) {
        console.error(`disparo do job do scan ${updated.id} falhou:`, err);
        updated = await markDispatchFailed(updated.id);
      }
    }

    return NextResponse.json({
      scanId: updated.id,
      status: updated.status,
      error: updated.errorMsg,
    });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(`POST /api/scans/${id}/complete falhou:`, err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
