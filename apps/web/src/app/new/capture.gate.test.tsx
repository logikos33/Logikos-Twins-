// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPlugs, checkPlugs, contractScreen } from "@/test/plug-coverage";
import { CaptureView, type CaptureState } from "./CaptureView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Matriz plug×estado da spec destilada do export (ESTADO.md). */
const ESPERADO: Record<CaptureState, string[]> = {
  "permission-prompt": ["capture.permission.request", "capture.fallback-file"],
  "permission-denied": ["capture.fallback-file"],
  unsupported: ["capture.fallback-file"],
  "https-required": [],
  "in-app-browser": ["capture.open-external"],
  idle: ["capture.torch", "capture.start", "capture.fallback-file"],
  recording: ["capture.torch", "capture.stop", "capture.fallback-file"],
  stopping: ["capture.torch", "capture.stop", "capture.fallback-file"],
  "portrait-hint": [
    "capture.guide.dismiss",
    "capture.torch",
    "capture.start",
    "capture.fallback-file",
  ],
};

function renderState(state: CaptureState) {
  const nada = () => undefined;
  return render(
    <CaptureView
      state={state}
      elapsedS={42}
      maxSeconds={120}
      partsSent={3}
      partsQueued={1}
      instrOpen={false}
      blurFaces={false}
      onStart={nada}
      onStop={nada}
      onTorch={nada}
      onFallback={nada}
      onOpenExternal={nada}
      onAllow={nada}
      onDismissHint={nada}
      onToggleInstr={nada}
      onToggleBlur={nada}
      camSlot={<div />}
    />,
  );
}

afterEach(cleanup);

describe("gate de plugs — tela capture (contrato v1.2)", () => {
  const tela = contractScreen("capture");

  it("todos os estados do contrato estão no gate", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...tela.states].sort());
  });

  for (const [state, plugs] of Object.entries(ESPERADO) as [CaptureState, string[]][]) {
    it(`estado ${state}: cada plug 1×, zero fora do contrato, raiz correta`, () => {
      const { container } = renderState(state);
      assertPlugs(checkPlugs(container, "capture", state, plugs));
    });
  }

  it("limite perto do fim: contador vira atenção (nunca magenta) e mostra / 02:00", () => {
    const { container } = render(
      <CaptureView
        state="recording"
        elapsedS={105}
        maxSeconds={120}
        partsSent={5}
        partsQueued={1}
        instrOpen={false}
        blurFaces={false}
        onStart={() => undefined}
        onStop={() => undefined}
        onTorch={() => undefined}
        onOpenExternal={() => undefined}
        onFallback={() => undefined}
        onAllow={() => undefined}
        onDismissHint={() => undefined}
        onToggleInstr={() => undefined}
        onToggleBlur={() => undefined}
        camSlot={<div />}
      />,
    );
    expect(container.textContent).toContain("/ 02:00");
    expect(container.querySelector(".text-warning")).not.toBeNull();
    expect(container.innerHTML).not.toContain("magenta");
  });
});
