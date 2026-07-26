import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de contrato do serviço de processamento — a parte que decide transições
 * de estado. O Prisma e o runner são substituídos por fakes: o que se testa aqui
 * é a LÓGICA de convergência (idempotência, não-regressão de estado, validação
 * do token), não o banco.
 */

const updateMany = vi.fn();
const update = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    scan: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      update: (...a: unknown[]) => update(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

const getJobStatus = vi.fn();
vi.mock("@/lib/jobrunner", () => ({
  startJob: vi.fn(),
  getJobStatus: (...a: unknown[]) => getJobStatus(...a),
}));

process.env.DATABASE_URL = "postgresql://t:t@localhost:5433/t";
process.env.S3_ENDPOINT = "http://localhost:9000";
process.env.S3_ACCESS_KEY_ID = "t";
process.env.S3_SECRET_ACCESS_KEY = "t";
process.env.S3_BUCKET = "t";
process.env.RUNPOD_WEBHOOK_SECRET = "segredo-de-teste";
process.env.ADMIN_TOKEN = "admin-de-teste";

const { applyJobResult, isValidWebhookToken, reconcileStuckScans } = await import(
  "./processing"
);

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  update.mockReset();
  findMany.mockReset();
  getJobStatus.mockReset();
});

describe("applyJobResult — convergência de estado", () => {
  it("COMPLETED grava outputs/metrics e só transiciona a partir de estados ativos", async () => {
    await applyJobResult("scan-1", {
      status: "COMPLETED",
      output: {
        scan_id: "scan-1",
        outputs: { cloud_preview_key: "scans/scan-1/cloud_preview.ply" },
        metrics: { frames: 48 },
      },
      error: null,
    });

    const call = updateMany.mock.calls[0]![0] as {
      where: { status: { in: string[] } };
      data: { status: string };
    };
    // A cláusula `where.status in [ativos]` é a idempotência: um segundo COMPLETED
    // (webhook + reconciliação) não encontra linha para atualizar.
    expect(call.where.status.in).toEqual(["queued", "processing", "postprocessing"]);
    expect(call.data.status).toBe("done");
  });

  it("FAILED vira error com a mensagem do runner", async () => {
    await applyJobResult("scan-1", { status: "FAILED", output: null, error: "GPU morreu" });
    const call = updateMany.mock.calls[0]![0] as { data: { status: string; errorMsg: string } };
    expect(call.data.status).toBe("error");
    expect(call.data.errorMsg).toBe("GPU morreu");
  });

  it("IN_PROGRESS só avança queued → processing, nunca regride", async () => {
    await applyJobResult("scan-1", { status: "IN_PROGRESS", output: null, error: null });
    const call = updateMany.mock.calls[0]![0] as {
      where: { status: string };
      data: { status: string };
    };
    expect(call.where.status).toBe("queued");
    expect(call.data.status).toBe("processing");
  });

  it("IN_QUEUE é no-op", async () => {
    await applyJobResult("scan-1", { status: "IN_QUEUE", output: null, error: null });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("COMPLETED sem output não marca done às cegas", async () => {
    await applyJobResult("scan-1", { status: "COMPLETED", output: null, error: null });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("isValidWebhookToken", () => {
  it("aceita o segredo exato", () => {
    expect(isValidWebhookToken("segredo-de-teste")).toBe(true);
  });
  it("recusa token errado, vazio e null", () => {
    expect(isValidWebhookToken("segredo-de-testE")).toBe(false);
    expect(isValidWebhookToken("")).toBe(false);
    expect(isValidWebhookToken(null)).toBe(false);
  });
  it("recusa prefixo do segredo (comprimento diferente)", () => {
    expect(isValidWebhookToken("segredo-de-test")).toBe(false);
  });
});

describe("reconcileStuckScans — a rede de segurança", () => {
  it("consulta o runner e aplica o resultado para cada scan preso", async () => {
    findMany.mockResolvedValue([
      { id: "s1", runpodJobId: "job-1" },
      { id: "s2", runpodJobId: "job-2" },
    ]);
    getJobStatus
      .mockResolvedValueOnce({
        id: "job-1",
        status: "COMPLETED",
        output: { scan_id: "s1", outputs: {}, metrics: {} },
        error: null,
      })
      .mockResolvedValueOnce({ id: "job-2", status: "FAILED", output: null, error: "x" });

    const touched = await reconcileStuckScans();
    expect(touched).toBe(2);
    expect(getJobStatus).toHaveBeenCalledWith("job-1");
    expect(getJobStatus).toHaveBeenCalledWith("job-2");
  });

  it("runner fora do ar num scan não derruba a reconciliação dos demais", async () => {
    findMany.mockResolvedValue([
      { id: "s1", runpodJobId: "job-1" },
      { id: "s2", runpodJobId: "job-2" },
    ]);
    getJobStatus
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce({
        id: "job-2",
        status: "COMPLETED",
        output: { scan_id: "s2", outputs: {}, metrics: {} },
        error: null,
      });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const touched = await reconcileStuckScans();
    errorSpy.mockRestore();

    expect(touched).toBe(1);
  });
});
