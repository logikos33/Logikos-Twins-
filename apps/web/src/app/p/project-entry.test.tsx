// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provas do #38: a entry pública lista os mapas do projeto SEM NENHUM COOKIE
 * (nenhum mock de cookies aqui — a página nem importa next/headers além do IP);
 * token revogado/inexistente → invalid-link; scan de outro projeto não vaza.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.7"]]),
}));

const PROJETO = {
  id: "p1",
  name: "Galpão Vila Anchieta",
  captureToken: "tok_valido",
  createdAt: new Date(),
  revokedAt: null as Date | null,
};
const SCAN = {
  id: "s1",
  title: "Piso térreo",
  status: "done",
  createdAt: new Date("2026-09-01T12:00:00Z"),
  projectId: "p1",
  shareToken: "share_s1",
};

const findUnique = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    project: { get findUnique() { return findUnique; } },
    scan: {
      get findMany() { return findMany; },
      get findFirst() { return findFirst; },
    },
  },
}));

import ProjectEntryPage from "./[token]/page";
import ProjectJobPage from "./[token]/jobs/[jobId]/page";
import { rateLimitOk } from "@/lib/services/projects";

beforeEach(() => {
  findUnique.mockReset();
  findMany.mockReset();
  findFirst.mockReset();
});
afterEach(cleanup);

describe("/p/:token — entry pública (#38)", () => {
  it("SEM cookie: token válido lista os mapas do projeto (state ready)", async () => {
    findUnique.mockResolvedValue(PROJETO);
    findMany.mockResolvedValue([SCAN]);
    const jsx = await ProjectEntryPage({ params: Promise.resolve({ token: "tok_valido" }) });
    const { container, getByText } = render(jsx);
    expect(container.querySelector('[data-state="ready"]')).not.toBeNull();
    expect(getByText("Galpão Vila Anchieta")).toBeTruthy();
    expect(getByText("Piso térreo")).toBeTruthy();
  });

  it("token revogado → invalid-link (nunca 500, nunca enumeração)", async () => {
    findUnique.mockResolvedValue({ ...PROJETO, revokedAt: new Date() });
    const jsx = await ProjectEntryPage({ params: Promise.resolve({ token: "tok_valido" }) });
    const { container } = render(jsx);
    expect(container.querySelector('[data-state="invalid-link"]')).not.toBeNull();
  });

  it("token inexistente responde IGUAL ao revogado", async () => {
    findUnique.mockResolvedValue(null);
    const jsx = await ProjectEntryPage({ params: Promise.resolve({ token: "tok_x" }) });
    const { container } = render(jsx);
    expect(container.querySelector('[data-state="invalid-link"]')).not.toBeNull();
  });

  it("scan de OUTRO projeto não vaza pela rota de job (filtro projectId no servidor)", async () => {
    findUnique.mockResolvedValue(PROJETO);
    findFirst.mockResolvedValue(null); // where {id, projectId} não casa
    const jsx = await ProjectJobPage({
      params: Promise.resolve({ token: "tok_valido", jobId: "scan-de-outro" }),
    });
    const { container } = render(jsx);
    expect(container.querySelector('[data-state="invalid-link"]')).not.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "scan-de-outro", projectId: "p1" } }),
    );
  });
});

describe("rate limit da superfície pública", () => {
  it("estoura a janela → falso a partir do limite", () => {
    for (let i = 0; i < 60; i++) expect(rateLimitOk("teste:janela", 60)).toBe(true);
    expect(rateLimitOk("teste:janela", 60)).toBe(false);
  });
});
