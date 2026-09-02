import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRead } from "@/lib/services/share-links";
import { retryScan } from "@/lib/services/processing";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ shareToken: z.string().min(1) });

/** Re-dispara o job de um scan error/cancelled (#45). Dono apenas. */
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
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const auth = await authorizeRead(id, parsed.data.shareToken);
  if (!auth) {
    return NextResponse.json({ error: "scan não encontrado" }, { status: 404 });
  }
  if (auth.role === "guest") {
    return NextResponse.json({ error: "link somente-leitura" }, { status: 403 });
  }

  const result = await retryScan(auth.scan);
  if ("blocked" in result) {
    return NextResponse.json(
      {
        error:
          result.blocked === "video"
            ? "o vídeo original já expirou (retenção de 7 dias) — grave de novo"
            : "este scan não está em um estado que permita tentar de novo",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ id: result.id, status: result.status });
}
