import { NextResponse } from "next/server";

/**
 * Prova de vida COM proveniência: devolve o commit que está no ar.
 * "unknown" = deploy sem proveniência = falha do processo de deploy (piloto,
 * bloco 5) — o Railway injeta RAILWAY_GIT_COMMIT_SHA nos deploys por git.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    commit: process.env.GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown",
  });
}
