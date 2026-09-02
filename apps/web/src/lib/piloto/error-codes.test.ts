import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_MESSAGES, mapHttpError, mapScanError } from "./error-codes";

describe("mapScanError — errorMsg persistido → código do contrato", () => {
  it("os 3 errorMsg de produto conhecidos mapeiam exato", () => {
    expect(
      mapScanError("O vídeo chegou, mas o processamento não pôde ser iniciado. Tente de novo em instantes."),
    ).toBe("dispatch-failed");
    expect(mapScanError("Gravação abandonada.")).toBe("upload-abandoned");
    expect(mapScanError("Vídeo de 400 MB excede o limite de 300 MB.")).toBe("limit-exceeded");
  });

  it("string técnica crua do worker vira processing-failed, nunca vaza", () => {
    expect(mapScanError("ffmpeg falhou (1): /tmp/scan-abc/video.mp4")).toBe("processing-failed");
    expect(mapScanError("FlashInfer requires GPUs with sm75 or higher")).toBe("processing-failed");
    expect(mapScanError("qualquer stderr desconhecido do pipeline")).toBe("processing-failed");
  });

  it("sem errorMsg cai no genérico legível", () => {
    expect(mapScanError(null)).toBe("unknown");
    expect(mapScanError("")).toBe("unknown");
  });
});

describe("mapHttpError — status HTTP → código, função total", () => {
  it.each([
    [400, "invalid-body"],
    [404, "not-found"],
    [409, "upload-conflict"],
    [413, "limit-exceeded"],
    [415, "unsupported-media"],
    [422, "limit-exceeded"],
    [429, "limit-exceeded"],
    [500, "internal-error"],
  ] as const)("%i → %s", (status, code) => {
    expect(mapHttpError(status)).toBe(code);
  });

  it("status fora da tabela cai no genérico legível", () => {
    expect(mapHttpError(418)).toBe("unknown");
  });
});

describe("toda code tem mensagem de PRODUTO", () => {
  it("cobertura total — nenhum código sem texto", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(10);
    }
  });
});
