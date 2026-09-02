import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Higiene de uploads abandonados (bloco 2): multipart >24 h é abortado; scan
 * preso em recording/uploading >24 h vira error com mensagem honesta. Upload
 * de HOJE nunca é tocado — pode estar em andamento.
 */

const updateMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    scan: {
      get updateMany() {
        return updateMany;
      },
    },
  },
}));

const listPendingMultiparts = vi.fn();
const abortMultipart = vi.fn();
vi.mock("@/lib/storage", () => ({
  get listPendingMultiparts() {
    return listPendingMultiparts;
  },
  get abortMultipart() {
    return abortMultipart;
  },
}));

import { abortStaleMultiparts, failAbandonedRecordings } from "./upload-hygiene";

const AGORA = new Date("2026-09-03T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 0 });
  abortMultipart.mockResolvedValue(undefined);
});

describe("abortStaleMultiparts", () => {
  it("aborta só os com mais de 24 h; o de hoje fica", async () => {
    listPendingMultiparts.mockResolvedValue([
      {
        key: "videos/velho.mp4",
        uploadId: "u1",
        initiatedAt: new Date("2026-09-01T10:00:00Z"),
      },
      {
        key: "videos/hoje.mp4",
        uploadId: "u2",
        initiatedAt: new Date("2026-09-03T11:30:00Z"),
      },
    ]);
    const n = await abortStaleMultiparts(AGORA);
    expect(n).toBe(1);
    expect(abortMultipart).toHaveBeenCalledTimes(1);
    expect(abortMultipart).toHaveBeenCalledWith("videos/velho.mp4", "u1");
  });

  it("sem data de início = suspeito antigo → aborta", async () => {
    listPendingMultiparts.mockResolvedValue([
      { key: "videos/sem-data.mp4", uploadId: "u3", initiatedAt: null },
    ]);
    expect(await abortStaleMultiparts(AGORA)).toBe(1);
  });

  it("falha num abort não derruba os demais", async () => {
    listPendingMultiparts.mockResolvedValue([
      { key: "a", uploadId: "u1", initiatedAt: new Date("2026-09-01T00:00:00Z") },
      { key: "b", uploadId: "u2", initiatedAt: new Date("2026-09-01T00:00:00Z") },
    ]);
    abortMultipart.mockRejectedValueOnce(new Error("storage fora"));
    expect(await abortStaleMultiparts(AGORA)).toBe(1);
  });
});

describe("failAbandonedRecordings", () => {
  it("marca recording/uploading velhos como error, condicionado no WHERE", async () => {
    updateMany.mockResolvedValue({ count: 2 });
    const n = await failAbandonedRecordings(AGORA);
    expect(n).toBe(2);
    const args = updateMany.mock.calls[0]![0];
    expect(args.where.status.in).toEqual(["recording", "uploading"]);
    expect(args.where.createdAt.lt.toISOString()).toBe("2026-09-02T12:00:00.000Z");
    expect(args.data.status).toBe("error");
  });
});
