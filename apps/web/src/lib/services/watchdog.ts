import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Watchdog do congelamento do scaler (DECISIONS [2026-09-03]): scan em queued
 * há mais de FROZEN_AFTER_MIN com o health do endpoint ZERADO (nem throttled)
 * é a assinatura provada do scaler dormindo.
 *
 * Geração 1: SÓ DETECTA E ALERTA — log estruturado + registro em app_config
 * (o admin exibe). Nenhuma ação automática: a escada mexe em workersMin, e
 * workersMin esquecido custa ~US$ 2,50/h — o watchdog não pode virar a fonte
 * do próximo susto. Ação automática só depois de a detecção provar que não dá
 * falso positivo (issue aberta).
 */

export const FROZEN_AFTER_MIN = 10;

type Health = {
  jobs?: { inQueue?: number };
  workers?: Record<string, number>;
};

/** Decisão pura: fila parada + zero workers em TODAS as colunas = congelado. */
export function isFrozenSignature(oldestQueuedAgeMin: number, health: Health): boolean {
  if (oldestQueuedAgeMin < FROZEN_AFTER_MIN) return false;
  const w = health.workers ?? {};
  const totalWorkers = Object.values(w).reduce((a, b) => a + b, 0);
  return totalWorkers === 0;
}

async function fetchHealth(): Promise<Health | null> {
  const e = env();
  try {
    const res = await fetch(`${e.RUNPOD_BASE_URL}/v2/${e.RUNPOD_ENDPOINT_ID}/health`, {
      headers: { Authorization: `Bearer ${e.RUNPOD_API_KEY}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export async function runWatchdog(now = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - FROZEN_AFTER_MIN * 60_000);
  const stuck = await db.scan.findFirst({
    where: { status: "queued", createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
  });
  if (!stuck) return false;

  const health = await fetchHealth();
  if (!health) return false;
  const ageMin = (now.getTime() - stuck.createdAt.getTime()) / 60_000;
  if (!isFrozenSignature(ageMin, health)) return false;

  const alerta = {
    at: now.toISOString(),
    scanId: stuck.id,
    queuedMin: Math.round(ageMin),
  };
  console.error(JSON.stringify({ event: "watchdog.frozen_scaler", ...alerta }));
  // app_config é o quadro de avisos que o admin já lê (#39).
  await db.appConfig
    .upsert({
      where: { key: "watchdog.lastAlert" },
      create: { key: "watchdog.lastAlert", value: JSON.stringify(alerta) },
      update: { value: JSON.stringify(alerta), updatedAt: now },
    })
    .catch(() => undefined);
  return true;
}

/** Alerta recente (para o banner do admin). */
export async function lastWatchdogAlert(
  maxAgeH = 12,
): Promise<{ at: string; scanId: string; queuedMin: number } | null> {
  const row = await db.appConfig
    .findUnique({ where: { key: "watchdog.lastAlert" } })
    .catch(() => null);
  if (!row) return null;
  try {
    const a = JSON.parse(row.value) as { at: string; scanId: string; queuedMin: number };
    if (Date.now() - new Date(a.at).getTime() > maxAgeH * 3600 * 1000) return null;
    return a;
  } catch {
    return null;
  }
}
