import { beforeEach, describe, expect, it, vi } from "vitest";

/** #39 — defaults no código; a tabela só guarda o que foi salvo; lixo é ignorado. */

const findMany = vi.fn();
const upsert = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    appConfig: {
      get findMany() {
        return findMany;
      },
      get upsert() {
        return upsert;
      },
    },
  },
}));

import { CONFIG_DEFAULTS, getConfig, saveConfig } from "./app-config";

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  upsert.mockResolvedValue({});
});

describe("getConfig", () => {
  it("banco vazio → defaults", async () => {
    expect(await getConfig()).toEqual(CONFIG_DEFAULTS);
  });

  it("valor salvo sobrepõe o default; lixo não-numérico é ignorado", async () => {
    findMany.mockResolvedValue([
      { key: "usdBrlRate", value: "6.1" },
      { key: "gpuUsdPerS", value: "banana" },
    ]);
    const c = await getConfig();
    expect(c.usdBrlRate).toBe(6.1);
    expect(c.gpuUsdPerS).toBe(CONFIG_DEFAULTS.gpuUsdPerS);
  });
});

describe("saveConfig", () => {
  it("persiste só chaves conhecidas com números positivos", async () => {
    await saveConfig({ usdBrlRate: 5.9, gpuUsdPerS: -1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0].where).toEqual({ key: "usdBrlRate" });
  });
});
