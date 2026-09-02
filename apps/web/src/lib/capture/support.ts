/**
 * Decisão de suporte à captura — módulo PURO (testável sem navegador).
 *
 * A ordem importa e é o contrato deste módulo:
 *   1. contexto inseguro  → https-required   (nada funciona sem isso)
 *   2. webview embutido   → in-app-browser   (WhatsApp & cia. costumam negar
 *      getUserMedia; dizer "navegador não grava" mandaria o usuário ao caminho
 *      errado — a saída certa é abrir no Chrome/Safari)
 *   3. APIs ausentes      → unsupported      (aí sim o fallback de câmera nativa)
 *   4. tudo presente      → ok
 */

export type CaptureVerdict = "ok" | "https-required" | "in-app-browser" | "unsupported";

export type CaptureEnv = {
  /** window.isSecureContext (cobre iframes e origens opacas — não só o protocolo). */
  secure: boolean;
  userAgent: string;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  /** pickMimeType() encontrou algum container gravável. */
  hasMime: boolean;
};

/** Assinaturas de webview embutido no user-agent. Heurística — falso negativo
 * cai no fluxo normal (inofensivo); falso positivo é raríssimo nesses tokens. */
const IN_APP_SIGNATURES: [RegExp, string][] = [
  [/WhatsApp/i, "whatsapp"],
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB/i, "facebook"],
  [/LinkedInApp/i, "linkedin"],
  [/Telegram/i, "telegram"],
  [/GSA\//i, "google-app"],
  [/; wv\)/, "android-webview"],
];

export function detectInAppBrowser(userAgent: string): string | null {
  for (const [re, name] of IN_APP_SIGNATURES) {
    if (re.test(userAgent)) return name;
  }
  return null;
}

export function captureVerdict(e: CaptureEnv): CaptureVerdict {
  if (!e.secure) return "https-required";
  if (detectInAppBrowser(e.userAgent)) return "in-app-browser";
  if (!e.hasGetUserMedia || !e.hasMediaRecorder || !e.hasMime) return "unsupported";
  return "ok";
}

/** Lê o ambiente real do navegador. Só chamável no cliente. */
export function readCaptureEnv(): CaptureEnv {
  return {
    secure: typeof window !== "undefined" && window.isSecureContext,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    hasGetUserMedia:
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    hasMime: pickMimeType() !== null,
  };
}

// Ordem de preferência de container: o worker normaliza tudo (D3), mas H.264
// poupa a conversão. `isTypeSupported` decide por navegador.
export const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

/** Limites do fallback de arquivo — decisão pura; a UI só traduz para texto. */
export function checkFileLimits(
  sizeBytes: number,
  durationS: number | null,
  maxSeconds: number,
  maxFileMb = 300,
  minSeconds = 20,
): "too-big" | "too-long" | "too-short" | null {
  if (maxFileMb * 1024 * 1024 < sizeBytes) return "too-big";
  if (durationS !== null && maxSeconds < durationS) return "too-long";
  if (durationS !== null && durationS < minSeconds) return "too-short";
  return null;
}
