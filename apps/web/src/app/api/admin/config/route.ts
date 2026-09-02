import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getConfig, saveConfig } from "@/lib/services/app-config";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  usdBrlRate: z.number().positive().max(1000).optional(),
  gpuUsdPerS: z.number().positive().max(1).optional(),
  costAlertUsd: z.number().positive().max(100).optional(),
});

function authed(req: NextRequest): boolean {
  const token = env().ADMIN_TOKEN;
  return (
    req.headers.get("x-admin-token") === token ||
    req.cookies.get("admin_token")?.value === token
  );
}

/** Config do admin (#39). Sem auth → 404, sem enumeração. */
export async function GET(req: NextRequest) {
  if (!authed(req))
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  return NextResponse.json(await getConfig());
}

export async function PUT(req: NextRequest) {
  if (!authed(req))
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo não é JSON válido" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  return NextResponse.json(await saveConfig(parsed.data));
}
