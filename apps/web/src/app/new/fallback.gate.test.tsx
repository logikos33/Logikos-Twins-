// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STRINGS } from "@/lib/piloto/strings";
import { FileFallback } from "./FileFallback";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * Bloco 5 — o fallback GRAVA, não "envia arquivo": o input primário tem
 * capture="environment" (toque abre a câmera nativa) e o texto fala em gravar.
 * Sem o atributo, o toque abre o seletor de arquivos — metade da confusão.
 */

afterEach(cleanup);

describe("gate do fallback de captura", () => {
  it("input primário com capture=environment e accept video/*", () => {
    const { container } = render(<FileFallback maxSeconds={120} />);
    const cam = container.querySelector('input[capture="environment"]');
    expect(cam).not.toBeNull();
    expect(cam?.getAttribute("accept")).toBe("video/*");
  });

  it("plug capture.fallback-file no botão de GRAVAR (texto de gravação, não de envio)", () => {
    const { container } = render(<FileFallback maxSeconds={120} />);
    const btn = container.querySelector('[data-plug="capture.fallback-file"]');
    expect(btn?.textContent).toContain(STRINGS.capture.fallbackRecord);
    expect(btn?.textContent?.toLowerCase()).not.toContain("enviar vídeo do celular");
  });

  it("caminho secundário de galeria/desktop existe, sem capture (drone continua possível)", () => {
    const { container } = render(<FileFallback maxSeconds={120} />);
    const inputs = [...container.querySelectorAll('input[type="file"]')];
    expect(inputs).toHaveLength(2);
    expect(inputs.some((i) => !i.hasAttribute("capture"))).toBe(true);
  });

  it("motivo técnico aparece recolhido quando fornecido", () => {
    const { container } = render(
      <FileFallback maxSeconds={120} technicalReason="NotFoundError" />,
    );
    expect(container.querySelector("details code")?.textContent).toBe("NotFoundError");
  });
});
