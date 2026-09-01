import { describe, expect, it } from "vitest";
import { isShareTokenValid } from "./scans";

const NOW = new Date("2026-09-01T12:00:00Z");

function scanWith(expiresAt: Date | null, token = "tok-certo") {
  return { shareToken: token, shareTokenExpiresAt: expiresAt };
}

describe("isShareTokenValid — a decisão pura de autorização do link", () => {
  it("token certo e dentro do prazo passa", () => {
    const scan = scanWith(new Date("2026-09-08T12:00:00Z"));
    expect(isShareTokenValid(scan, "tok-certo", NOW)).toBe(true);
  });

  it("token errado é recusado mesmo com prazo válido", () => {
    const scan = scanWith(new Date("2026-09-08T12:00:00Z"));
    expect(isShareTokenValid(scan, "tok-errado", NOW)).toBe(false);
  });

  it("token vazio é recusado", () => {
    expect(isShareTokenValid(scanWith(null), "", NOW)).toBe(false);
  });

  it("link vencido é recusado — indistinguível de token errado", () => {
    const scan = scanWith(new Date("2026-08-31T12:00:00Z"));
    expect(isShareTokenValid(scan, "tok-certo", NOW)).toBe(false);
  });

  it("vencimento exatamente agora já é recusado (> estrito)", () => {
    expect(isShareTokenValid(scanWith(NOW), "tok-certo", NOW)).toBe(false);
  });

  it("linha legada sem validade (null) continua acessível", () => {
    expect(isShareTokenValid(scanWith(null), "tok-certo", NOW)).toBe(true);
  });
});
