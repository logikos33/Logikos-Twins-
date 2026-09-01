import { describe, expect, it } from "vitest";
import { maxUploadParts } from "./scans";

describe("maxUploadParts — teto stateless derivado de MAX_VIDEO_MB", () => {
  it("300 MB em partes de 5 MiB dá 60 + 1 curta final", () => {
    expect(maxUploadParts(300)).toBe(61);
  });

  it("teto do piloto (120 MB) dá 25 partes", () => {
    expect(maxUploadParts(120)).toBe(25);
  });

  it("tamanho que não divide exato arredonda para cima", () => {
    expect(maxUploadParts(7)).toBe(3); // 7 MB / 5 MiB → 2 partes + 1
  });
});
