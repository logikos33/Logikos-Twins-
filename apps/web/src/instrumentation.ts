/**
 * Instrumentation hook do Next — roda UMA vez na subida do servidor.
 *
 * A reconciliação por polling vive aqui: um serviço separado (cron/worker) para
 * rodar um `findMany` a cada 60 s seria infraestrutura sem retorno (regra de custo
 * mínimo). Limitação documentada na spec D2: com N réplicas rodaria N vezes — e as
 * transições são idempotentes justamente para isso não importar.
 */
export async function register(): Promise<void> {
  // Só no runtime Node de verdade — não no edge nem durante o build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reconcileStuckScans } = await import("@/lib/services/processing");

  const INTERVAL_MS = 60_000;
  setInterval(() => {
    reconcileStuckScans()
      .then((n) => {
        if (n > 0) console.warn(`reconciliação: ${n} scan(s) convergido(s) via polling`);
      })
      .catch((err) => console.error("reconciliação falhou:", err));
  }, INTERVAL_MS).unref();
  // unref(): o interval não pode segurar o processo vivo num shutdown.

  console.warn("reconciliação de jobs ativa (60 s)");
}
