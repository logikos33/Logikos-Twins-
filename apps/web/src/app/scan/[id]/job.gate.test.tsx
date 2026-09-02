// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPlugs, checkPlugs, contractScreen } from "@/test/plug-coverage";
import { JobBody, type JobStatus } from "./JobBody";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// O EduTheater é canvas — fora do gate (mockado leve).
vi.mock("./EduTheater", () => ({ EduTheater: () => <div /> }));

/** Status real renderizado → plugs esperados (matriz da spec + realidade). */
const CASOS: Array<[JobStatus, string, string[]]> = [
  ["uploading", "uploading", ["job.poll"]],
  ["upload-paused-offline", "upload-paused-offline", ["job.poll"]],
  ["queued", "queued", ["job.poll", "job.cancel"]],
  ["processing", "processing", ["job.poll"]],
  ["done", "completed", ["job.poll"]],
  ["error", "failed", ["job.poll", "job.recapture", "job.retry"]],
  ["cancelled", "cancelled", ["job.poll", "job.recapture"]],
];

afterEach(cleanup);

describe("gate de plugs — tela job (contrato v1.2)", () => {
  const tela = contractScreen("job");

  it("todos os estados do contrato aparecem na matriz", () => {
    expect([...new Set(CASOS.map(([, st]) => st))].sort()).toEqual(
      [...tela.states].sort(),
    );
  });

  for (const [status, state, plugs] of CASOS) {
    it(`status ${status} → estado ${state}: plugs exatos`, () => {
      const { container } = render(
        <JobBody
          status={status}
          title="Galpão Vila Anchieta"
          durationS={108}
          rawError={status === "error" ? "ffmpeg falhou (1)" : null}
          copied={false}
          onCopyLink={() => undefined}
          onCancel={() => undefined}
          onRetry={() => undefined}
        />,
      );
      assertPlugs(checkPlugs(container, "job", state, plugs));
    });
  }

  it("failed mostra mensagem de PRODUTO do código, com a técnica em mono-faint", () => {
    const { container } = render(
      <JobBody
        status="error"
        title={null}
        durationS={null}
        rawError="FlashInfer requires GPUs with sm75 or higher"
        copied={false}
        onCopyLink={() => undefined}
        onCancel={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(container.textContent).toContain("O processamento falhou");
    expect(container.textContent).toContain("Grave de novo"); // mensagem do código
    expect(container.querySelector(".text-faint")?.textContent).toContain("sm75");
    expect(container.innerHTML).not.toContain("magenta");
  });

  it("o splash de completed (ScanStatusClient) carrega job.map.open", () => {
    const src = readFileSync(join(__dirname, "ScanStatusClient.tsx"), "utf8");
    expect(src).toContain('data-plug="job.map.open"');
    expect(src).toContain('data-state="completed"');
  });
});
