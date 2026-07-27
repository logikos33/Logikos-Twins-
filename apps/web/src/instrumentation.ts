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
  const { runRetention } = await import("@/lib/services/retention");

  const INTERVAL_MS = 60_000;
  setInterval(() => {
    reconcileStuckScans()
      .then((n) => {
        if (n > 0) console.warn(`reconciliação: ${n} scan(s) convergido(s) via polling`);
      })
      .catch((err) => console.error("reconciliação falhou:", err));
  }, INTERVAL_MS).unref();
  // unref(): o interval não pode segurar o processo vivo num shutdown.

  // Retenção (D7, LGPD): a promessa "vídeo apagado após N" é ESTE job. A cada 5 min
  // é sobra — o prazo é de dias; no dev (TTL em minutos) dá para ver acontecer.
  const RETENTION_INTERVAL_MS = 5 * 60_000;
  setInterval(() => {
    runRetention()
      .then((n) => {
        if (n > 0) console.warn(`retenção: ${n} vídeo(s) bruto(s) apagado(s)`);
      })
      .catch((err) => console.error("retenção falhou:", err));
  }, RETENTION_INTERVAL_MS).unref();

  console.warn("reconciliação (60 s) e retenção (5 min) ativas");
}
