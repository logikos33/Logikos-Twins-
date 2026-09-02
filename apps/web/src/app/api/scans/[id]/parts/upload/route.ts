import { NextRequest, NextResponse } from "next/server";
import {
  maxUploadParts,
  uploadPartDirect,
  InvalidStateError,
} from "@/lib/services/scans";
import { authorizeRead } from "@/lib/services/share-links";

export const dynamic = "force-dynamic";

/**
 * PROXY de upload de parte (D- do CORS): o bucket segue sem regra CORS (a
 * credencial não tem escopo bucket-level — AÇÃO-VITOR no ESTADO), então o
 * browser envia o chunk SAME-ORIGIN e o servidor repassa ao R2. Mesmo teto,
 * mesma auth e mesmo ETag do caminho presignado; volta ao PUT direto por
 * NEXT_PUBLIC_UPLOAD_PROXY=0 quando o CORS existir.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const partNumber = Number.parseInt(req.nextUrl.searchParams.get("partNumber") ?? "", 10);

  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const auth = await authorizeRead(id, token);
  if (!auth) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  // Capability no SERVIDOR (#47): convidado é somente-leitura.
  if (auth.role === "guest") {
    return NextResponse.json({ error: "link somente-leitura" }, { status: 403 });
  }
  const scan = auth.scan;
  const cap = maxUploadParts();
  if (partNumber > cap) {
    return NextResponse.json(
      { error: `parte ${partNumber} excede o teto do produto (${cap} partes)` },
      { status: 413 },
    );
  }
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  try {
    const etag = await uploadPartDirect(scan, partNumber, body);
    return NextResponse.json({ partNumber, etag });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(`POST /api/scans/${id}/parts/upload falhou:`, err);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
