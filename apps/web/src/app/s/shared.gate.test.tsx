// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPlugs, contractScreen } from "@/test/plug-coverage";
import { guestState } from "@/lib/services/share-links";

/**
 * Gate da tela SHARED (contrato v1.2, /s/:shareToken). O viewer em readOnly É
 * a tela shared: plugs shared.*, ZERO plugs de escrita (share.create, measure,
 * annotate). expired/revoked são renderizáveis pela page, nunca erro.
 */

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("../scan/[id]/viewer/engine", () => ({
  ViewerEngine: class {
    onPick = null;
    async loadCloud(_u: string, onP: (n: number) => void) {
      onP(100);
    }
    setPoses() {}
    setDetections() {}
    setPins() {}
    setMeasureLine() {}
    setLayers() {}
    setClipHeight() {}
    setMode() {}
    flyTo() {}
    startReplay() {}
    stopReplay() {}
    dispose() {}
  },
}));

import { ScanViewer } from "../scan/[id]/viewer/ScanViewer";
import type { ShareLink } from "@/generated/prisma/client";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/annotations"))
        return new Response(JSON.stringify({ annotations: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (u.includes("/detections"))
        return new Response(
          JSON.stringify({
            detections: [
              {
                id: "d1",
                label: "extintor",
                score: 0.9,
                frameIdx: 4,
                worldPos: [0, 0, 0],
              },
              { id: "d2", label: "mesa", score: 0.8, frameIdx: 8, worldPos: [1, 0, 0] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      if (u.includes("poses"))
        return new Response(JSON.stringify({ frames: [], keyframes: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      return new Response(null, {
        status: 200,
        headers: { "content-length": "9437184" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderShared() {
  const utils = render(
    <ScanViewer
      readOnly
      scanId="s1"
      token="guest_tok"
      cloudUrl="https://x/cloud_preview.ply"
      posesUrl="https://x/poses.json"
      initialScale={null}
    />,
  );
  await waitFor(() =>
    expect(utils.container.querySelector('[data-state="ready"]')).not.toBeNull(),
  );
  return utils;
}

describe("gate de plugs — tela shared (contrato v1.2)", () => {
  const tela = contractScreen("shared");

  it("estados do contrato: loading/ready no viewer readOnly, expired/revoked na page", () => {
    expect([...tela.states].sort()).toEqual(["expired", "loading", "ready", "revoked"]);
  });

  it("ready: raiz shared.load, busca e camadas com plugs shared.* — e NENHUM plug de escrita", async () => {
    const { container } = await renderShared();
    expect(container.querySelector('[data-screen="shared"]')).not.toBeNull();
    const check = checkPlugs(container, "shared", "ready", [
      "shared.load",
      "shared.search.query",
      "shared.layers.toggle",
    ]);
    expect(check.missing).toEqual([]);
    expect(check.foreign).toEqual([]);
    expect(check.rootOk).toBe(true);
    for (const escrita of [
      "share.create",
      "measure.start",
      "annotate.start",
      "measure.point",
    ]) {
      expect(container.querySelector(`[data-plug="${escrita}"]`), escrita).toBeNull();
    }
  });

  it("busca do convidado usa shared.search.focus no primeiro resultado", async () => {
    const { container } = await renderShared();
    const input = container.querySelector('[data-plug="shared.search.query"]');
    expect(input).not.toBeNull();
  });
});

describe("guestState — decisão pura de validade", () => {
  const base: ShareLink = {
    id: "l1",
    scanId: "s1",
    token: "t",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2026-09-08T00:00:00Z"),
    revokedAt: null,
    views: 0,
  };
  const agora = new Date("2026-09-02T00:00:00Z");

  it("dentro da validade → valid", () => {
    expect(guestState(base, agora)).toBe("valid");
  });
  it("passou de expiresAt → expired", () => {
    expect(guestState(base, new Date("2026-09-09T00:00:00Z"))).toBe("expired");
  });
  it("revogado vence a validade → revoked", () => {
    expect(guestState({ ...base, revokedAt: agora }, agora)).toBe("revoked");
  });
});
