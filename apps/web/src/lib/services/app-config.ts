import { db } from "@/lib/db";

/**
 * Config persistente do admin (#39). Dois números que mudam raro (câmbio e
 * tarifa de GPU por segundo, para exibição de custo) — key-value de 1 nível
 * com defaults no código; a tabela só guarda o que foi salvo de fato.
 * gpuUsdPerS default = tarifa medida do worker atual (US$ 0,0461 / 66,4 s).
 */

export type PilotConfig = {
  usdBrlRate: number;
  gpuUsdPerS: number;
};

export const CONFIG_DEFAULTS: PilotConfig = {
  usdBrlRate: 5.5,
  gpuUsdPerS: 0.000694,
};

export async function getConfig(): Promise<PilotConfig> {
  const rows = await db.appConfig
    .findMany({ where: { key: { in: Object.keys(CONFIG_DEFAULTS) } } })
    .catch(() => []);
  const out = { ...CONFIG_DEFAULTS };
  for (const r of rows) {
    const n = Number(r.value);
    if (Number.isFinite(n) && n > 0) out[r.key as keyof PilotConfig] = n;
  }
  return out;
}

export async function saveConfig(patch: Partial<PilotConfig>): Promise<PilotConfig> {
  for (const [key, v] of Object.entries(patch)) {
    if (!(key in CONFIG_DEFAULTS) || !Number.isFinite(v) || v <= 0) continue;
    await db.appConfig.upsert({
      where: { key },
      create: { key, value: String(v) },
      update: { value: String(v), updatedAt: new Date() },
    });
  }
  return getConfig();
}
