import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createScan, UnsupportedMimeError } from "@/lib/services/scans";
import { findByCaptureToken } from "@/lib/services/projects";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // O MIME real do MediaRecorder (varia por navegador — ADR-0008).
  mimeType: z.string().min(1).max(100),
  // Blur de rostos opcional (D6, LGPD).
  blurFaces: z.boolean().optional(),
  // Link do projeto (#38): associa o scan; inválido/revogado NÃO erra — o scan
  // nasce órfão (o cliente ainda consegue gravar; a associação é conveniência).
  captureToken: z.string().max(64).optional(),
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

  // Limite diário (D7): teto de abuso sem login. O ADMIN_TOKEN passa por cima.
  const isAdmin = req.headers.get("x-admin-token") === env().ADMIN_TOKEN;
  if (!isAdmin) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const today = await db.scan.count({ where: { createdAt: { gte: dayStart } } });
    if (today >= env().MAX_SCANS_PER_DAY) {
      return NextResponse.json(
        {
          error: `Limite de ${env().MAX_SCANS_PER_DAY} scans por dia atingido. Tente amanhã.`,
        },
        { status: 429 },
      );
    }
  }

  try {
    const projeto = parsed.data.captureToken
      ? await findByCaptureToken(parsed.data.captureToken)
      : null;
    const created = await createScan({ ...parsed.data, projectId: projeto?.id });
    console.warn(JSON.stringify({ event: "scan.created", scan_id: created.scanId }));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof UnsupportedMimeError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error("POST /api/scans falhou:", err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
