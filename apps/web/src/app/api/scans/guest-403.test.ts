import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Aceite #47: CADA endpoint de escrita responde 403 ao CONVIDADO — capability
 * no servidor, um teste por endpoint (nunca um genérico). authorizeRead é
 * mockado como guest válido: o handler REAL decide o 403.
 */

const SCAN = {
  id: "s1",
  videoKey: "k",
  uploadId: "u",
  status: "uploading",
  shareToken: "dono",
};

vi.mock("@/lib/services/share-links", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    authorizeRead: vi.fn(async () => ({ scan: SCAN, role: "guest" as const })),
  };
});
vi.mock("@/lib/db", () => ({ db: {} }));

import { POST as postParts } from "./[id]/parts/route";
import { POST as postUpload } from "./[id]/parts/upload/route";
import { POST as postComplete } from "./[id]/complete/route";
import { PUT as putScale } from "./[id]/scale/route";
import { POST as postAnnotations } from "./[id]/annotations/route";
import { POST as postCancel } from "./[id]/cancel/route";
import { POST as postRetry } from "./[id]/retry/route";

const ctx = { params: Promise.resolve({ id: "s1" }) };

function jsonReq(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("escrita com token de CONVIDADO → 403, por endpoint", () => {
  it("POST /parts", async () => {
    const res = await postParts(
      jsonReq("http://x/api/scans/s1/parts", {
        partNumber: 1,
        shareToken: "guest",
      }) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("POST /parts/upload (proxy)", async () => {
    const res = await postUpload(
      new NextRequest("http://x/api/scans/s1/parts/upload?partNumber=1&token=guest", {
        method: "POST",
        body: new Uint8Array([1, 2, 3]),
      }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("POST /complete", async () => {
    const res = await postComplete(
      jsonReq("http://x/api/scans/s1/complete", {
        shareToken: "guest",
        parts: [{ partNumber: 1, etag: "e" }],
        durationS: 10,
      }) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("PUT /scale", async () => {
    const res = await putScale(
      jsonReq(
        "http://x/api/scans/s1/scale",
        { shareToken: "guest", factor: 2, method: "reference_distance" },
        "PUT",
      ) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("POST /cancel (#45)", async () => {
    const res = await postCancel(
      jsonReq("http://x/api/scans/s1/cancel", { shareToken: "guest" }) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("POST /retry (#45)", async () => {
    const res = await postRetry(
      jsonReq("http://x/api/scans/s1/retry", { shareToken: "guest" }) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("POST /annotations", async () => {
    const res = await postAnnotations(
      jsonReq("http://x/api/scans/s1/annotations", {
        shareToken: "guest",
        type: "pin",
        position: { x: 0, y: 0, z: 0 },
        data: {},
      }) as never,
      ctx,
    );
    expect(res.status).toBe(403);
  });
});
