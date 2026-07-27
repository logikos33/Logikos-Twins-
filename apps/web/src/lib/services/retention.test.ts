import { describe, expect, it } from "vitest";
import { isExpired, videoKeyOf } from "./retention";
import type { Scan } from "@/generated/prisma/client";

/** Scan mínimo para os testes da decisão pura. */
function scanWith(overrides: Partial<Scan>): Scan {
  return {
    id: "s1",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    status: "done",
    title: null,
    shareToken: "t",
    videoKey: "videos/s1.webm",
    videoExt: "webm",
    videoBytes: null,
    durationS: null,
    videoDeletedAt: null,
    uploadId: null,
    blurFaces: false,
    extractFps: 8,
    frames: null,
    runpodJobId: null,
    errorMsg: null,
    outputs: null,
    metrics: null,
    scale: null,
    ...overrides,
  } as Scan;
}

const NOW = new Date("2026-07-08T00:00:01Z"); // 7 dias + 1 s depois
const WEEK_MIN = 7 * 24 * 60;

describe("isExpired — a decisão da retenção", () => {
  it("vence após o prazo em estado terminal", () => {
    expect(isExpired(scanWith({}), NOW, WEEK_MIN)).toBe(true);
  });

  it("não vence dentro do prazo", () => {
    const recent = scanWith({ createdAt: new Date("2026-07-07T23:00:00Z") });
    expect(isExpired(recent, NOW, WEEK_MIN)).toBe(false);
  });

  it("já limpo nunca é tocado de novo (idempotência)", () => {
    const cleaned = scanWith({ videoDeletedAt: new Date("2026-07-05T00:00:00Z") });
    expect(isExpired(cleaned, NOW, WEEK_MIN)).toBe(false);
  });

  it("scan em processamento nunca perde o vídeo, mesmo velho", () => {
    // Um job preso de 8 dias ainda pode ser reconciliado; apagar o vídeo embaixo
    // dele transformaria um atraso em perda de dados.
    expect(isExpired(scanWith({ status: "processing" }), NOW, WEEK_MIN)).toBe(false);
  });

  it("scan sem vídeo (nunca subiu) não é candidato", () => {
    expect(isExpired(scanWith({ videoKey: null }), NOW, WEEK_MIN)).toBe(false);
  });

  it("error também vence — vídeo de scan falhado não fica para sempre", () => {
    expect(isExpired(scanWith({ status: "error" }), NOW, WEEK_MIN)).toBe(true);
  });
});

describe("videoKeyOf — a chave real pós-normalização", () => {
  it("prefere outputs.video_key (webm virou mp4 no worker)", () => {
    const scan = scanWith({
      videoKey: "videos/s1.webm",
      outputs: { video_key: "videos/s1.mp4" },
    });
    expect(videoKeyOf(scan)).toBe("videos/s1.mp4");
  });

  it("cai para videoKey quando o worker nunca rodou", () => {
    expect(videoKeyOf(scanWith({}))).toBe("videos/s1.webm");
  });
});
