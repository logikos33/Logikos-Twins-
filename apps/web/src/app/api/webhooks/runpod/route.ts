import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyJobResult, isValidWebhookToken } from "@/lib/services/processing";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Corpo que o RunPod (e o sósia) envia ao concluir.
const bodySchema = z.object({
  id: z.string().min(1),
  status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  output: z
    .object({
      scan_id: z.string(),
      outputs: z.record(z.string(), z.string()),
      metrics: z.record(z.string(), z.unknown()),
      // Escala ArUco (D6): opcional; sobrescreve a manual quando presente.
      scale: z
        .object({
          factor: z.number().positive(),
          method: z.literal("aruco"),
          marker_side_m: z.number().positive(),
          views: z.number().int().positive(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  error: z.string().nullable().optional(),
});

/**
 * Webhook do runner. Regras do contrato: responder 200 RÁPIDO (o RunPod só tenta
 * 3 vezes) e nunca confiar no corpo sem validar o token — a URL do webhook é o
 * único lugar onde o segredo circula.
 */
export async function POST(req: NextRequest) {
  if (!isValidWebhookToken(req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo não é JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    // 200 mesmo com corpo estranho: um retry do RunPod com o mesmo corpo não vai
    // melhorar, e 3 falhas seguidas descartam o webhook de vez. A reconciliação
    // por polling cobre o job; o log fica para diagnóstico.
    console.error("webhook com corpo inesperado:", parsed.error.issues);
    return NextResponse.json({ ok: false, ignored: true });
  }

  const { id: jobId, status, output, error } = parsed.data;

  // O corpo não carrega scan_id fora do output; localiza-se o scan pelo job.
  const scanId =
    output?.scan_id ??
    (await db.scan.findFirst({ where: { runpodJobId: jobId }, select: { id: true } }))
      ?.id;

  if (!scanId) {
    console.error(`webhook para job ${jobId} sem scan correspondente`);
    return NextResponse.json({ ok: false, ignored: true });
  }

  await applyJobResult(scanId, { status, output: output ?? null, error: error ?? null });
  return NextResponse.json({ ok: true });
}
