import { NextResponse } from "next/server";

/**
 * Healthcheck do serviço web.
 *
 * Deliberadamente NÃO toca no banco nem no storage: é o endpoint que o Railway usa
 * para decidir se o container está vivo. Se ele dependesse do Postgres, uma
 * indisponibilidade momentânea do banco derrubaria o serviço web inteiro em vez de
 * degradar. Prontidão de dependências é assunto de `/api/health/deep` (D7).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "logikos-twins-web",
    time: new Date().toISOString(),
  });
}
