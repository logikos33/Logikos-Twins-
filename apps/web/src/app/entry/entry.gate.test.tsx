// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPlugs, checkPlugs, contractScreen } from "@/test/plug-coverage";
import { EntryClient, type EntryMap, type EntryState } from "./EntryClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const MAPA: EntryMap = {
  id: "m1",
  name: "Piso térreo",
  date: "2026-08-12",
  st: "done",
  href: "/scan/m1?token=x",
};

/** Plugs esperados POR ESTADO (spec do export, destilada no ESTADO). */
const ESPERADO: Record<EntryState, string[]> = {
  loading: ["entry.load"],
  ready: ["entry.load", "entry.capture.open", "entry.guide.toggle", "entry.map.open"],
  empty: ["entry.load", "entry.capture.open", "entry.guide.toggle"],
  offline: ["entry.load", "entry.capture.open", "entry.guide.toggle", "entry.map.open"],
  "invalid-link": ["entry.load"],
};

afterEach(cleanup);

describe("gate de plugs — tela entry (contrato v1.2)", () => {
  const tela = contractScreen("entry");

  it("todos os estados do contrato estão no gate", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...tela.states].sort());
  });

  for (const [state, plugs] of Object.entries(ESPERADO) as [EntryState, string[]][]) {
    it(`estado ${state}: cada plug 1×, zero fora do contrato, raiz correta`, () => {
      const { container } = render(
        <EntryClient state={state} projectName="Galpão Vila Anchieta" maps={[MAPA]} />,
      );
      assertPlugs(checkPlugs(container, "entry", state, plugs));
    });
  }

  it("plug POR ITEM em listas — 2 mapas ⇒ 2× entry.map.open (regra v1.2)", () => {
    const { container } = render(
      <EntryClient
        state="ready"
        projectName="Galpão Vila Anchieta"
        maps={[MAPA, { ...MAPA, id: "m2", st: "failed" }]}
      />,
    );
    expect(container.querySelectorAll('[data-plug="entry.map.open"]')).toHaveLength(2);
  });
});
