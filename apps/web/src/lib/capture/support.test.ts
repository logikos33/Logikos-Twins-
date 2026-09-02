import { describe, expect, it } from "vitest";
import { captureVerdict, checkFileLimits, detectInAppBrowser } from "./support";

/**
 * Bloco 3 — cada causa com seu veredito, e a ORDEM é contrato:
 * https antes de webview, webview antes de unsupported. Declarar "navegador
 * não grava" quando o problema é o webview do WhatsApp manda o cliente para
 * o caminho errado.
 */

const OK = {
  secure: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1",
  hasGetUserMedia: true,
  hasMediaRecorder: true,
  hasMime: true,
};

describe("captureVerdict — uma causa, um estado", () => {
  it("tudo presente → ok", () => {
    expect(captureVerdict(OK)).toBe("ok");
  });

  it("contexto inseguro → https-required (mesmo com APIs presentes)", () => {
    expect(captureVerdict({ ...OK, secure: false })).toBe("https-required");
  });

  it("https vem ANTES de webview: inseguro dentro do WhatsApp = https-required", () => {
    expect(
      captureVerdict({
        ...OK,
        secure: false,
        userAgent: OK.userAgent + " WhatsApp/2.24",
      }),
    ).toBe("https-required");
  });

  it("webview vem ANTES de unsupported: WhatsApp sem getUserMedia = in-app-browser", () => {
    expect(
      captureVerdict({
        ...OK,
        userAgent: OK.userAgent + " WhatsApp/2.24",
        hasGetUserMedia: false,
      }),
    ).toBe("in-app-browser");
  });

  it("getUserMedia ausente fora de webview → unsupported", () => {
    expect(captureVerdict({ ...OK, hasGetUserMedia: false })).toBe("unsupported");
  });

  it("MediaRecorder ausente → unsupported", () => {
    expect(captureVerdict({ ...OK, hasMediaRecorder: false })).toBe("unsupported");
  });

  it("nenhum mime aceito → unsupported", () => {
    expect(captureVerdict({ ...OK, hasMime: false })).toBe("unsupported");
  });
});

describe("detectInAppBrowser — assinaturas reais de UA", () => {
  const casos: [string, string | null][] = [
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 WhatsApp/2.24.10.74 A",
      "whatsapp",
    ],
    ["Mozilla/5.0 (iPhone) Instagram 320.0.0.34.90", "instagram"],
    ["Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/453.0.0]", "facebook"],
    ["Mozilla/5.0 (Linux; Android 14) LinkedInApp/9.29", "linkedin"],
    [
      "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 Telegram-Android/10.12",
      "telegram",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36",
      "android-webview",
    ],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1", null],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/124 Mobile Safari/537.36", null],
  ];
  for (const [ua, esperado] of casos) {
    it(`${esperado ?? "navegador de verdade"}: ${ua.slice(0, 48)}…`, () => {
      expect(detectInAppBrowser(ua)).toBe(esperado);
    });
  }
});

describe("checkFileLimits — limites do fallback antes de gastar rede", () => {
  it("dentro dos limites → null", () => {
    expect(checkFileLimits(50 * 1024 * 1024, 90, 120)).toBeNull();
  });
  it("acima do teto de bytes → too-big", () => {
    expect(checkFileLimits(301 * 1024 * 1024, 60, 120)).toBe("too-big");
  });
  it("mais longo que o contrato → too-long (errorCode limit-exceeded)", () => {
    expect(checkFileLimits(10 * 1024 * 1024, 121, 120)).toBe("too-long");
  });
  it("duração ilegível (metadata falhou) → passa; o servidor revalida", () => {
    expect(checkFileLimits(10 * 1024 * 1024, null, 120)).toBeNull();
  });
});
