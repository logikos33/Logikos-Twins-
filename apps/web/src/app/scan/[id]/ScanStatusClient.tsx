"use client";

import { useEffect, useRef, useState } from "react";
import { ViewerGate } from "./ViewerGate";
import { JobBody, type JobStatus } from "./JobBody";
import type { ScaleInfo } from "@/lib/viewer/scale";
import { LogoSymbol } from "@/components/Logo";
import { notImplemented } from "@/lib/piloto/plugs";
import { t } from "@/lib/piloto/strings";

/**
 * ORQUESTRAÇÃO da tela job (contrato v1.2): polling real, revelação com o
 * glitch de marca (momento-uau do MOTION-SPEC §1 — mantido por decisão D-,
 * mesmo com o handoff do piloto vetando glitch em UI operacional: o splash não
 * é operação, é a revelação única) e viewer. O corpo visual vive em JobBody.
 * job.cancel/job.retry não têm rota no backend — notImplemented + issue.
 */

type ScanInfo = {
  scanId: string;
  status: string;
  title: string | null;
  durationS: number | null;
  error: string | null;
  scale: ScaleInfo | null;
  artifacts: Record<string, string>;
};

const ISSUE_JOB_CONTROLS = 45; // rotas de cancelar/reprocessar job

export function ScanStatusClient({ scanId, token }: { scanId: string; token: string }) {
  const [scan, setScan] = useState<ScanInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      const res = await fetch(`/api/scans/${scanId}?token=${encodeURIComponent(token)}`);
      if (!active) return;
      if (res.status === 404) {
        setNotFound(true);
        clearInterval(id);
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as ScanInfo;
        setScan(data);
        if (data.status === "done" || data.status === "error") clearInterval(id);
      }
    }

    const id = setInterval(() => void poll(), 3000);
    void poll();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [scanId, token]);

  const viewerReady =
    scan?.status === "done" &&
    Boolean(scan.artifacts["cloud_preview_url"]) &&
    Boolean(scan.artifacts["poses_url"]);

  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewerReady || revealed) return;

    function reveal() {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return setTimeout(() => setRevealed(true), reduced ? 0 : 1400);
    }

    if (document.visibilityState === "visible") {
      const tmr = reveal();
      return () => clearTimeout(tmr);
    }

    originalTitleRef.current = document.title;
    document.title = t("job", "tabDone");

    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      revealTimer = reveal();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(revealTimer);
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    };
  }, [viewerReady, revealed]);

  if (viewerReady && revealed && scan) {
    return (
      <ViewerGate
        scanId={scanId}
        token={token}
        cloudUrl={scan.artifacts["cloud_preview_url"]!}
        posesUrl={scan.artifacts["poses_url"]!}
        initialScale={scan.scale}
      />
    );
  }

  // Splash da revelação (estado completed do contrato): auto-abre em ~1,4 s;
  // o botão dá o pulo imediato — e carrega o plug job.map.open.
  if (viewerReady) {
    return (
      <main
        data-screen="job"
        data-state="completed"
        data-plug="job.poll"
        className="grid-grego flex min-h-dvh flex-col items-center justify-center gap-4 px-6"
      >
        <h1
          data-text={t("job", "revealTitle")}
          className="glitch glitch-play font-display text-4xl font-bold tracking-tight"
        >
          {t("job", "revealTitle")}
        </h1>
        <p className="font-mono text-xs tracking-wider text-mist">{t("job", "revealSub")}</p>
        <button
          data-plug="job.map.open"
          onClick={() => setRevealed(true)}
          className="mt-2 rounded-md bg-cyan px-6 py-3 font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.97]"
        >
          {t("job", "openNow")}
        </button>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <LogoSymbol className="mb-4 h-10 w-10 text-surface-2" />
        <h1 className="font-display text-xl font-bold">{t("job", "notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-mist">{t("job", "notFoundSub")}</p>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6">
        <LogoSymbol className="h-10 w-10 animate-pulse text-signal/80" />
        <p className="text-sm text-mist">{t("job", "loading")}</p>
      </main>
    );
  }

  function copyLink() {
    void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <JobBody
      status={scan.status as JobStatus}
      title={scan.title}
      durationS={scan.durationS}
      rawError={scan.error}
      copied={copied}
      onCopyLink={copyLink}
      onCancel={() => notImplemented("job.cancel", ISSUE_JOB_CONTROLS)({})}
      onRetry={() => notImplemented("job.retry", ISSUE_JOB_CONTROLS)({})}
    />
  );
}
