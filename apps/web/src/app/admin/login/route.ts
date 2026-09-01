import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Troca o ADMIN_TOKEN por um cookie httpOnly (issue #17): o token deixa de
 * viver em query string — que vaza para history do navegador, logs de proxy e
 * cabeçalho Referer. Uso único: /admin/login?token=… → cookie → /admin limpo.
 * Token errado → 404, como em todo o resto (não vazar existência).
 */
export function GET(req: NextRequest) {
  const given = req.nextUrl.searchParams.get("token") ?? "";
  const expected = env().ADMIN_TOKEN;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set("admin_token", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
