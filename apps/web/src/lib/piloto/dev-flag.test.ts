import { describe, expect, it } from "vitest";
import { devStatesEnabled } from "./dev-flag";

describe("guard do /dev/states — superfície de DEV nunca em produção", () => {
  it("produção sem flag → 404 (guard falso)", () => {
    expect(devStatesEnabled("production", undefined)).toBe(false);
  });

  it("produção com flag explícita '1' habilita (staging de teste consciente)", () => {
    expect(devStatesEnabled("production", "1")).toBe(true);
  });

  it("development habilita sem flag", () => {
    expect(devStatesEnabled("development", undefined)).toBe(true);
  });

  it("flag com valor errado não habilita", () => {
    expect(devStatesEnabled("production", "true")).toBe(false);
    expect(devStatesEnabled("test", "")).toBe(false);
  });
});
