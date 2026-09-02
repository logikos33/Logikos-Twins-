// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { checkPlugs, contractScreen } from "@/test/plug-coverage";
import { AdminView, type AdminRow } from "./AdminView";

const ROW: AdminRow = {
  id: "abcd1234-x",
  title: "Galpão Vila Anchieta",
  status: "done",
  createdAt: "2026-09-02 05:00",
  videoDeleted: false,
  hasVideo: true,
  costUsd: 0.9,
  runpodJobId: "job-1",
  href: "/scan/abcd?token=t",
  provenance: '{"scanId":"abcd"}',
};

const BASE = {
  projects: [
    {
      id: "p1",
      name: "Galpão Vila Anchieta",
      captureToken: "tok_projeto_1",
      createdAt: "2026-09-02",
      revoked: false,
    },
  ],
  rows: [ROW, { ...ROW, id: "efgh5678-y", costUsd: 0.1, status: "error" }],
  today: 2,
  maxPerDay: 20,
  totalCost: 1.0,
  costAlertUsd: 0.75,
  errors: [{ id: "efgh5678-y", createdAt: "2026-09-02 05:10", msg: "ffmpeg falhou" }],
};

/** Estados do contrato SEM tela ainda — nomeados: mudança no contrato quebra aqui. */
const PENDENTES = {
  "project-detail": 38,
  "job-detail": 45,
  links: 47,
  config: 39,
  "confirm-destructive": 45,
};

afterEach(cleanup);

describe("gate de plugs — tela admin (contrato v1.2)", () => {
  const tela = contractScreen("admin");

  it("estados cobertos + pendentes nomeados = contrato", () => {
    expect(["login", "jobs", "projects", ...Object.keys(PENDENTES)].sort()).toEqual(
      [...tela.states].sort(),
    );
  });

  it("login: admin.login no submit, raiz correta", () => {
    const { container } = render(<AdminView authed={false} {...BASE} rows={[]} />);
    const check = checkPlugs(container, "admin", "login", ["admin.login"]);
    expect(check.missing).toEqual([]);
    expect(check.foreign).toEqual([]);
    expect(check.rootOk).toBe(true);
  });

  it("jobs: nav 4 plugs + filtro + job.open/provenance.copy POR ITEM (2 linhas ⇒ 2×)", () => {
    const { container } = render(<AdminView authed {...BASE} />);
    const check = checkPlugs(container, "admin", "jobs", [
      "admin.nav.projects",
      "admin.nav.jobs",
      "admin.nav.links",
      "admin.nav.config",
      "admin.job.filter",
    ]);
    expect(check.missing).toEqual([]);
    expect(check.foreign).toEqual([]);
    expect(check.rootOk).toBe(true);
    // por item ×2 linhas ×2 layouts (cards mobile + tabela md — só um visível por CSS)
    expect(
      container.querySelectorAll('[data-plug="admin.job.open"]').length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      container.querySelectorAll('[data-plug="admin.job.provenance.copy"]').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("projects: nav ativa + create e copy/revoke POR ITEM", () => {
    const { container } = render(<AdminView authed {...BASE} />);
    fireEvent.click(container.querySelector('[data-plug="admin.nav.projects"]')!);
    const check = checkPlugs(container, "admin", "projects", [
      "admin.nav.projects",
      "admin.nav.jobs",
      "admin.nav.links",
      "admin.nav.config",
      "admin.project.create",
      "admin.project.link.copy",
      "admin.project.link.revoke",
    ]);
    expect(check.missing).toEqual([]);
    expect(check.foreign).toEqual([]);
    expect(check.rootOk).toBe(true);
  });

  it("filtro funciona: 'Falhou' deixa só a linha error", () => {
    const { container, getAllByText } = render(<AdminView authed {...BASE} />);
    fireEvent.click(getAllByText("Falhou")[0]!);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("custo acima do limiar destacado em danger com title do limiar", () => {
    const { container } = render(<AdminView authed {...BASE} />);
    const alto = [...container.querySelectorAll(".text-danger")].find((e) =>
      e.textContent?.includes("0.900"),
    );
    expect(alto).toBeTruthy();
  });
});
