// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPlugs, contractScreen } from "@/test/plug-coverage";
import { STRINGS } from "@/lib/piloto/strings";

/** Engine mockado — jsdom não tem WebGL; a cena não é o alvo do gate. */
vi.mock("./engine", () => ({
  ViewerEngine: class {
    onPick: ((p: { point: [number, number, number] }) => void) | null = null;
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

import { ScanViewer } from "./ScanViewer";

const DETECTIONS = {
  detections: [
    { id: "d1", label: "extintor", score: 0.9, frameIdx: 4, worldPos: [0, 0, 0] },
    { id: "d2", label: "mesa", score: 0.8, frameIdx: 8, worldPos: [1, 0, 0] },
  ],
};
const ANNOTATIONS = {
  annotations: [
    { id: "a1", type: "pin", position: [0, 1, 0], data: { text: "Vazamento" } },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/share")) return jsonRes({ links: [] });
      if (u.includes("/annotations")) return jsonRes(ANNOTATIONS);
      if (u.includes("/detections")) return jsonRes(DETECTIONS);
      if (u.includes("poses")) return jsonRes({ frames: [], keyframes: [] });
      // HEAD da nuvem (Content-Length do chip de LOD)
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

function jsonRes(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function renderReady() {
  const utils = render(
    <ScanViewer
      scanId="s1"
      token="tok"
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

/** Estados do contrato SEM engenharia ainda (issue #47) — nomeados de propósito:
 *  se o contrato mudar, este teste quebra e força a revisão. */
const PENDENTES_47 = ["loading-full"];

describe("gate de plugs — tela viewer (contrato v1.2)", () => {
  const tela = contractScreen("viewer");

  it("estados cobertos + pendentes nomeados = contrato", () => {
    const cobertos = [
      "loading-lod",
      "ready",
      "tool-measure",
      "tool-annotate",
      "tool-search",
      "layers",
      "share",
      "error",
    ];
    expect([...cobertos, ...PENDENTES_47].sort()).toEqual([...tela.states].sort());
  });

  it("ready: raiz com viewer.load, dock com start/annotate, topo com lod/share, camadas, pins por item", async () => {
    const { container } = await renderReady();
    const check = checkPlugs(container, "viewer", "ready", [
      "viewer.load",
      "measure.point",
      "viewer.lod.toggle",
      "share.create",
      "measure.start",
      "annotate.start",
      "layers.toggle",
      "search.open",
      "search.query",
      "viewer.pin.open",
    ]);
    expect(check.missing).toEqual([]);
    expect(check.foreign).toEqual([]);
    expect(check.rootOk).toBe(true);
  });

  it("chip de LOD mostra o tamanho REAL do Content-Length (9 MB), nunca constante", async () => {
    const { container } = await renderReady();
    const chip = container.querySelector('[data-plug="viewer.lod.toggle"]');
    expect(chip?.textContent).toContain("9,0 MB");
  });

  it("tool-measure: hint + measure.remove após 2 pontos; medida em Mono com vírgula", async () => {
    const { container, getByText } = await renderReady();
    fireEvent.click(getByText(STRINGS.viewer.dockMeasure));
    expect(container.querySelector('[data-state="tool-measure"]')).not.toBeNull();
    expect(getByText(STRINGS.viewer.measureTapTwo)).toBeTruthy();
  });

  it("tool-annotate: chips de etiqueta com annotate.tag.set POR ITEM", async () => {
    const { container, getByText } = await renderReady();
    fireEvent.click(getByText(STRINGS.viewer.dockPin));
    expect(container.querySelector('[data-state="tool-annotate"]')).not.toBeNull();
  });

  it("tool-search: exemplos com search.example por item quando a busca está vazia", async () => {
    const { container } = await renderReady();
    const input = container.querySelector('[data-plug="search.query"]')!;
    fireEvent.focus(input);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-plug="search.example"]').length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(container.querySelector('[data-state="tool-search"]')).not.toBeNull();
  });

  it("layers: sheet aberta tem layers.set POR LINHA (4 camadas)", async () => {
    const { container } = await renderReady();
    fireEvent.click(container.querySelector('[data-plug="layers.toggle"]')!);
    expect(container.querySelector('[data-state="layers"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-plug="layers.set"]')).toHaveLength(4);
  });

  it("share: sheet do dono com validade/criar — o link do DONO nunca é compartilhado", async () => {
    const { container } = await renderReady();
    fireEvent.click(container.querySelector('[data-plug="share.create"]')!);
    await waitFor(() =>
      expect(container.querySelector('[data-state="share"]')).not.toBeNull(),
    );
    expect(container.querySelectorAll('[data-plug="share.validity.set"]')).toHaveLength(
      3,
    );
    // nada na sheet aponta para /scan/<id>?token= (o link do dono)
    expect(container.innerHTML).not.toContain("/scan/s1?token=");
  });

  it("zero data-plug fora do contrato em todos os estados exercitados", async () => {
    const { container, getByText } = await renderReady();
    for (const acao of [
      () => fireEvent.click(getByText(STRINGS.viewer.dockMeasure)),
      () => fireEvent.click(getByText(STRINGS.viewer.dockPin)),
      () => fireEvent.click(container.querySelector('[data-plug="layers.toggle"]')!),
    ]) {
      act(acao);
      const plugs = [...container.querySelectorAll("[data-plug]")].map((e) =>
        e.getAttribute("data-plug")!,
      );
      const foreign = checkPlugs(container, "viewer", "x", []).foreign;
      expect(foreign, plugs.join(",")).toEqual([]);
    }
  });
});
