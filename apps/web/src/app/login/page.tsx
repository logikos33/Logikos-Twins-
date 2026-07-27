import type { Metadata } from "next";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = { title: "Entrar — Logikos Twins" };

/**
 * Rota estática de design (sem autenticação real por enquanto) — cadastrada agora
 * para o produto já ter o lugar do login sem tocar no fluxo da demo (contrato nº 8:
 * gravar → ver o mapa continua direto, por link com token).
 */
export default function LoginPage() {
  return <LoginClient />;
}
