import { describe, expect, it, vi } from "vitest";

/**
 * Bloco 2 da régua: o SERVIDOR recusa fora de [min, max] com o errorCode do
 * contrato, ANTES de completar o multipart (completeUpload não é chamado).
 * Casos: 10 recusa · 20 aceita · 120 aceita · 121 recusa.
 */

const SCAN = {
  id: "s1",
  status: "uploading",
  videoKey: "k",
  uploadId: "u",
  shareToken: "dono",
};

vi.mock("@/lib/services/share-links", () => ({
  authorizeRead: vi.fn(async () => ({ scan: SCAN, role: "owner" as const })),
}));
const completeUpload = vi.fn(async () => ({ ...SCAN, status: "uploaded" }));
const dispatchJob = vi.fn(async () => ({ ...SCAN, status: "queued" }));
vi.mock("@/lib/services/scans", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    get completeUpload() {
      return completeUpload;
    },
  };
});
vi.mock("@/lib/services/processing", () => ({
  get dispatchJob() {
    return dispatchJob;
  },
  markDispatchFailed: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({
  env: () => ({ MIN_VIDEO_SECONDS: 20, MAX_VIDEO_SECONDS: 120 }),
}));

import { POST } from "./[id]/complete/route";

const ctx = { params: Promise.resolve({ id: "s1" }) };
function req(durationS: number) {
  return new Request("http://x/api/scans/s1/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shareToken: "dono",
      parts: [{ partNumber: 1, etag: "e" }],
      durationS,
    }),
  }) as never;
}

describe("limites de duração no complete (contrato 20–120 s)", () => {
  it("10 s → 422 video-too-short, multipart NÃO é completado", async () => {
    const res = await POST(req(10), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).errorCode).toBe("video-too-short");
    expect(completeUpload).not.toHaveBeenCalled();
  });

  it("20 s exatos → aceita", async () => {
    const res = await POST(req(20), ctx);
    expect(res.status).toBe(200);
  });

  it("120 s exatos → aceita", async () => {
    const res = await POST(req(120), ctx);
    expect(res.status).toBe(200);
  });

  it("121 s → 422 (acima do máximo)", async () => {
    completeUpload.mockClear();
    const res = await POST(req(121), ctx);
    expect(res.status).toBe(422);
    expect(completeUpload).not.toHaveBeenCalled();
  });
});
