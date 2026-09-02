import { describe, expect, it } from "vitest";
import { FROZEN_AFTER_MIN, isFrozenSignature } from "./watchdog";

/**
 * A assinatura do congelamento (DECISIONS [2026-09-03]): fila velha + ZERO
 * workers em todas as colunas. `throttled` NÃO é congelamento (DC sem GPU —
 * aguardar); worker running NÃO é congelamento (pode ser job longo).
 */

const ZERO = {
  idle: 0,
  initializing: 0,
  ready: 0,
  running: 0,
  throttled: 0,
  unhealthy: 0,
};

describe("isFrozenSignature", () => {
  it("fila velha + tudo zero → congelado", () => {
    expect(isFrozenSignature(FROZEN_AFTER_MIN + 1, { workers: ZERO })).toBe(true);
  });
  it("fila nova → não alerta (worker frio legítimo demora minutos)", () => {
    expect(isFrozenSignature(FROZEN_AFTER_MIN - 1, { workers: ZERO })).toBe(false);
  });
  it("throttled ≠ congelado (DC sem GPU: só aguardar)", () => {
    expect(
      isFrozenSignature(FROZEN_AFTER_MIN + 5, { workers: { ...ZERO, throttled: 1 } }),
    ).toBe(false);
  });
  it("running ≠ congelado (job longo em andamento)", () => {
    expect(
      isFrozenSignature(FROZEN_AFTER_MIN + 5, { workers: { ...ZERO, running: 1 } }),
    ).toBe(false);
  });
});
