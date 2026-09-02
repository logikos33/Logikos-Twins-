import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scan } from "@/generated/prisma/client";

/**
 * #45 — cancelar e reprocessar. As transições são condicionadas ao status atual
 * (updateMany where status in …): cancelar o que terminou é no-op, retry sem
 * vídeo vivo é bloqueado (LGPD purga em 7 dias), e só o admin reprocessa 'done'.
 */

const updateMany = vi.fn();
const update = vi.fn();
const findUniqueOrThrow = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    scan: {
      get updateMany() {
        return updateMany;
      },
      get update() {
        return update;
      },
      get findUniqueOrThrow() {
        return findUniqueOrThrow;
      },
    },
  },
}));

const cancelJob = vi.fn();
const startJob = vi.fn();
vi.mock("@/lib/jobrunner", () => ({
  get cancelJob() {
    return cancelJob;
  },
  get startJob() {
    return startJob;
  },
}));

vi.mock("@/lib/storage", () => ({
  abortMultipart: vi.fn(),
  presignGetInternal: vi.fn(async () => "https://assinada/video"),
}));

import { cancelScan, retryScan } from "./processing";

function scanDe(over: Partial<Scan>): Scan {
  return {
    id: "s1",
    status: "processing",
    videoKey: "scans/s1/video.mp4",
    videoDeletedAt: null,
    runpodJobId: "job-1",
    uploadId: null,
    extractFps: 8,
    blurFaces: false,
    outputs: {},
    createdAt: new Date(),
    ...over,
  } as unknown as Scan;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
  update.mockImplementation(async (args: { data: object }) => ({
    ...scanDe({}),
    ...args.data,
  }));
  findUniqueOrThrow.mockResolvedValue({ ...scanDe({}), status: "cancelled" });
  startJob.mockResolvedValue("job-2");
  cancelJob.mockResolvedValue(undefined);
});

describe("cancelScan", () => {
  it("processing → cancelled e cancela no runner", async () => {
    const out = await cancelScan(scanDe({ status: "processing" }));
    expect(out?.status).toBe("cancelled");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
    expect(cancelJob).toHaveBeenCalledWith("job-1");
  });

  it("scan já terminado → null (a rota vira 409), runner não é chamado", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const out = await cancelScan(scanDe({ status: "done" }));
    expect(out).toBeNull();
    expect(cancelJob).not.toHaveBeenCalled();
  });

  it("runner fora do ar NÃO desfaz o cancelamento local", async () => {
    cancelJob.mockRejectedValue(new Error("runner caiu"));
    const out = await cancelScan(scanDe({ status: "queued" }));
    expect(out?.status).toBe("cancelled");
  });
});

describe("retryScan", () => {
  it("error com vídeo vivo → volta a uploaded e redispara", async () => {
    const out = await retryScan(scanDe({ status: "error" }));
    expect("blocked" in out).toBe(false);
    expect(startJob).toHaveBeenCalled();
    expect((out as Scan).status).toBe("queued");
  });

  it("vídeo purgado pela retenção → blocked video, nada redisparado", async () => {
    const out = await retryScan(
      scanDe({ status: "error", videoDeletedAt: new Date() } as Partial<Scan>),
    );
    expect(out).toEqual({ blocked: "video" });
    expect(startJob).not.toHaveBeenCalled();
  });

  it("done SEM admin → blocked estado; COM admin → redispara", async () => {
    expect(await retryScan(scanDe({ status: "done" } as Partial<Scan>))).toEqual({
      blocked: "estado",
    });
    const out = await retryScan(scanDe({ status: "done" } as Partial<Scan>), {
      admin: true,
    });
    expect("blocked" in out).toBe(false);
  });

  it("cancelled é retryável pelo dono", async () => {
    const out = await retryScan(scanDe({ status: "cancelled" } as Partial<Scan>));
    expect("blocked" in out).toBe(false);
  });
});
