"use client";

/**
 * Tela ADMIN do contrato v1.2 — fusão do export com o painel real.
 * Estados cobertos: login (novo — /admin sem cookie mostra o card; token
 * errado no /admin/login segue 404, sem enumeração) e jobs (o painel real).
 * projects/project-detail/job-detail/links/config/confirm-destructive são
 * PENDENTES NOMEADOS (#38/#39/#45/#47) — nav com plugs + stubs. D-3: a 390 px
 * a tabela vira cards por linha (grid → md:table).
 */

import { useState } from "react";
import { LogoSymbol } from "@/components/Logo";
import { notImplemented } from "@/lib/piloto/plugs";
import { t } from "@/lib/piloto/strings";

export interface AdminRow {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  videoDeleted: boolean;
  hasVideo: boolean;
  costUsd: number | null;
  runpodJobId: string | null;
  href: string;
  provenance: string;
}

export interface AdminProject {
  id: string;
  name: string;
  captureToken: string;
  createdAt: string;
  revoked: boolean;
}

export interface AdminViewProps {
  authed: boolean;
  projects: AdminProject[];
  rows: AdminRow[];
  today: number;
  maxPerDay: number;
  totalCost: number;
  costAlertUsd: number;
  errors: Array<{ id: string; createdAt: string; msg: string | null }>;
}

const STATUS_DOT: Record<string, string> = {
  done: "bg-success",
  error: "bg-danger",
  processing: "bg-cyan",
  postprocessing: "bg-cyan",
  queued: "bg-warning",
  uploaded: "bg-warning",
  uploading: "bg-cyan",
  recording: "bg-record",
};

type Filtro = "all" | "queued" | "processing" | "done" | "error";
const FILTRO_STATUS: Record<Filtro, (s: string) => boolean> = {
  all: () => true,
  queued: (s) => s === "queued" || s === "uploaded",
  processing: (s) => s === "processing" || s === "postprocessing",
  done: (s) => s === "done",
  error: (s) => s === "error",
};

export function AdminView(p: AdminViewProps) {
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rerunMsg, setRerunMsg] = useState<string | null>(null);
  const [view, setView] = useState<"jobs" | "projects">("jobs");
  const [projects, setProjects] = useState(p.projects);
  const [novoNome, setNovoNome] = useState("");

  if (!p.authed) {
    return (
      <main
        data-screen="admin"
        data-state="login"
        className="grid-grego mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6"
      >
        <LogoSymbol className="mb-4 h-9 w-9" />
        <h1 className="font-display text-xl font-bold">{t("admin", "loginTitle")}</h1>
        <form method="GET" action="/admin/login" className="mt-5 flex flex-col gap-3">
          <label className="text-sm text-mist" htmlFor="admin-token">
            {t("admin", "loginToken")}
          </label>
          <input
            id="admin-token"
            name="token"
            type="password"
            autoComplete="off"
            className="rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm outline-none focus:border-cyan"
          />
          <button
            data-plug="admin.login"
            type="submit"
            className="mt-1 rounded-[10px] bg-cyan py-2.5 font-semibold text-ink transition hover:bg-cyan-deep"
          >
            {t("admin", "loginSubmit")}
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          {t("admin", "loginHint")}
        </p>
      </main>
    );
  }

  const rows = p.rows.filter((r) => FILTRO_STATUS[filtro](r.status));
  const nav = t("admin", "nav");
  const navPlugs = [
    ["admin.nav.projects", () => setView("projects")],
    ["admin.nav.jobs", () => setView("jobs")],
    ["admin.nav.links", notImplemented("admin.nav.links", 47)],
    ["admin.nav.config", notImplemented("admin.nav.config", 39)],
  ] as const;

  async function criarProjeto() {
    const name = novoNome.trim();
    if (!name) return;
    const res = await fetch("/api/admin/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const np = (await res.json()) as AdminProject;
      setProjects((ps) => [{ ...np, createdAt: "", revoked: false }, ...ps]);
      setNovoNome("");
    }
  }

  async function revogarProjeto(id: string) {
    await fetch(`/api/admin/projects/${id}/revoke`, { method: "POST" });
    setProjects((ps) => ps.map((x) => (x.id === id ? { ...x, revoked: true } : x)));
  }

  function copiarLink(pr: AdminProject) {
    void navigator.clipboard
      ?.writeText(`${window.location.origin}/p/${pr.captureToken}`)
      .catch(() => undefined);
    setCopiedId(pr.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  // #45: reprocessa pelo cookie do painel; a resposta (ou o 409) vira aviso no topo.
  async function rerun(r: AdminRow) {
    const res = await fetch(`/api/admin/scans/${r.id}/rerun`, { method: "POST" }).catch(
      () => null,
    );
    if (res?.ok) {
      setRerunMsg(t("admin", "rerunOk").replace("{id}", r.id.slice(0, 8)));
    } else {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setRerunMsg(body?.error ?? t("admin", "rerunFail"));
    }
  }

  function copyProv(r: AdminRow) {
    void navigator.clipboard?.writeText(r.provenance).catch(() => undefined);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <main
      data-screen="admin"
      data-state={view}
      className="grid-grego mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-7 px-5 py-9 sm:px-6"
    >
      <header>
        <div className="flex items-center gap-2.5">
          <LogoSymbol className="h-6 w-6" />
          <span className="k-label text-[10px] text-mist">{t("admin", "kicker")}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
          {t("admin", "title")}
        </h1>
        <p className="mt-1.5 font-mono text-[13px] text-mist">
          {t("admin", "summary")
            .replace("{n}", String(p.rows.length))
            .replace("{hoje}", String(p.today))
            .replace("{lim}", String(p.maxPerDay))
            .replace("{custo}", p.totalCost.toFixed(2))}
        </p>
        {rerunMsg && <p className="mt-2 font-mono text-xs text-warning">{rerunMsg}</p>}
        <nav
          className="mt-4 flex gap-1 border-b border-line"
          aria-label={t("admin", "title")}
        >
          {nav.map((label, i) => {
            const [plug, handler] = navPlugs[i]!;
            const ativa =
              (view === "jobs" && plug === "admin.nav.jobs") ||
              (view === "projects" && plug === "admin.nav.projects");
            return (
              <button
                key={plug}
                data-plug={plug}
                onClick={handler}
                className={`px-3.5 py-2 text-sm ${
                  ativa
                    ? "border-b-2 border-cyan font-semibold text-cyan"
                    : "text-mist hover:text-signal"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>

      {view === "projects" && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-mist">
              {t("admin", "projectsTitle")}
            </h2>
            <div className="ml-auto flex gap-2">
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder={t("admin", "projectName")}
                className="w-56 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-cyan"
              />
              <button
                data-plug="admin.project.create"
                onClick={() => void criarProjeto()}
                className="rounded-[10px] bg-cyan px-4 py-2 text-sm font-semibold text-ink hover:bg-cyan-deep"
              >
                {t("admin", "projectCreate")}
              </button>
            </div>
          </div>
          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-mist">
              {t("admin", "projectEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((pr) => (
                <li
                  key={pr.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-graphite p-3"
                >
                  <span className="text-sm font-medium">{pr.name}</span>
                  <span className="font-mono text-[11px] text-faint">
                    {t("admin", "projectLink")} ·
                    {pr.revoked
                      ? ` ${t("admin", "projectRevoked")}`
                      : ` /p/${pr.captureToken.slice(0, 8)}…`}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button
                      data-plug="admin.project.link.copy"
                      onClick={() => copiarLink(pr)}
                      disabled={pr.revoked}
                      className="rounded-lg border border-line-strong px-3 py-1.5 font-mono text-xs text-cyan disabled:opacity-40"
                    >
                      {copiedId === pr.id
                        ? t("admin", "projectCopied")
                        : t("admin", "projectCopy")}
                    </button>
                    <button
                      data-plug="admin.project.link.revoke"
                      onClick={() => void revogarProjeto(pr.id)}
                      disabled={pr.revoked}
                      className="rounded-lg border border-line-strong px-3 py-1.5 font-mono text-xs text-danger-soft disabled:opacity-40"
                    >
                      {t("admin", "projectRevoke")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "jobs" && p.errors.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-danger-soft">
            {t("admin", "errorsTitle")}
          </h2>
          <ul className="space-y-1 font-mono text-xs text-mist">
            {p.errors.map((e) => (
              <li key={e.id} className="truncate">
                <span className="text-signal">{e.id.slice(0, 8)}</span> · {e.createdAt} ·{" "}
                {e.msg ?? t("admin", "noMessage")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "jobs" && (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-mist">
              {t("admin", "tableTitle")}
            </h2>
            <div
              data-plug="admin.job.filter"
              role="group"
              aria-label={t("admin", "filterAria")}
              className="flex flex-wrap gap-1.5"
            >
              {(Object.keys(FILTRO_STATUS) as Filtro[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`h-8 rounded-full border px-3 font-mono text-[11px] transition ${
                    filtro === f
                      ? "border-cyan bg-cyan/15 text-cyan"
                      : "border-line text-mist hover:border-line-strong"
                  }`}
                >
                  {t("admin", "filters")[f]}
                </button>
              ))}
            </div>
          </div>

          {/* D-3 (390 px): cards por linha no mobile; tabela de verdade em md+. */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-line bg-graphite p-3">
                <div className="flex items-center gap-2">
                  <i
                    className={`h-2 w-2 rounded-full ${STATUS_DOT[r.status] ?? "bg-mist"}`}
                  />
                  <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                  <span className="truncate text-sm">{r.title ?? "—"}</span>
                  <span className="ml-auto font-mono text-xs">
                    {r.costUsd != null ? custoCell(r.costUsd, p.costAlertUsd) : "—"}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-mist">
                  {r.createdAt}
                  <span className="ml-auto flex gap-3">
                    <button
                      data-plug="admin.job.provenance.copy"
                      onClick={() => copyProv(r)}
                      className="text-cyan"
                    >
                      {copiedId === r.id ? t("admin", "copied") : t("admin", "copyProv")}
                    </button>
                    <a
                      data-plug="admin.job.open"
                      className="text-cyan underline"
                      href={r.href}
                    >
                      {t("admin", "open")}
                    </a>
                    <button
                      data-plug="admin.job.rerun"
                      onClick={() => void rerun(r)}
                      className="text-warning underline decoration-dotted"
                    >
                      {t("admin", "rerun")}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-graphite font-mono text-[10px] tracking-wider text-mist uppercase">
                <tr>
                  <th className="px-3 py-2.5">{t("admin", "cols").id}</th>
                  <th className="px-3 py-2.5">{t("admin", "cols").titulo}</th>
                  <th className="px-3 py-2.5">{t("admin", "cols").status}</th>
                  <th className="px-3 py-2.5">{t("admin", "cols").criado}</th>
                  <th className="px-3 py-2.5">{t("admin", "cols").video}</th>
                  <th className="px-3 py-2.5">{t("admin", "cols").custo}</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2.5 font-mono">{r.id.slice(0, 8)}</td>
                    <td className="max-w-40 truncate px-3 py-2.5">{r.title ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <i
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status] ?? "bg-mist"}`}
                        />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-mist">{r.createdAt}</td>
                    <td className="px-3 py-2.5 text-mist">
                      {r.videoDeleted
                        ? t("admin", "videoDeleted")
                        : r.hasVideo
                          ? t("admin", "videoOk")
                          : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono">
                      {r.costUsd != null ? custoCell(r.costUsd, p.costAlertUsd) : "—"}
                    </td>
                    <td className="flex gap-3 px-3 py-2.5">
                      <button
                        data-plug="admin.job.provenance.copy"
                        onClick={() => copyProv(r)}
                        className="font-mono text-cyan"
                        title={t("admin", "copyProv")}
                      >
                        {copiedId === r.id
                          ? t("admin", "copied")
                          : t("admin", "copyProv")}
                      </button>
                      <a
                        data-plug="admin.job.open"
                        className="text-cyan underline decoration-dotted underline-offset-2 hover:text-cyan-deep"
                        href={r.href}
                      >
                        {t("admin", "open")}
                      </a>
                      <button
                        data-plug="admin.job.rerun"
                        onClick={() => void rerun(r)}
                        className="font-mono text-warning"
                        title={t("admin", "rerunTitle")}
                      >
                        {t("admin", "rerun")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function custoCell(v: number, limiar: number) {
  const acima = v >= limiar;
  return (
    <span
      className={acima ? "font-semibold text-danger" : undefined}
      title={
        acima ? t("admin", "aboveThreshold").replace("{v}", String(limiar)) : undefined
      }
    >
      ${v.toFixed(3)}
    </span>
  );
}
