"use client";

import { useEffect, useRef, useState } from "react";
import { ViewerGate } from "./ViewerGate";
import { EduTheater } from "./EduTheater";
import type { ScaleInfo } from "@/lib/viewer/scale";
import { LogoSymbol } from "@/components/Logo";
import { IconAlert, IconKey } from "@/components/icons";

/**
 * Estado do scan com polling; quando `done`, vira o viewer 3D (D4).
 * O polling PARA ao entrar no viewer — o estado é terminal.
 *
 * A espera de 1–8 min é um momento de VENDA (dramaturgia: docs/design/MOTION-SPEC §1):
 * stepper honesto por etapas (fatos, nunca % inventada), teatro educativo em canvas e
 * revelação com o glitch de marca ao entrar no viewer.
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

const LABELS: Record<string, string> = {
  recording: "Gravando…",
  uploading: "Recebendo o vídeo…",
  uploaded: "Vídeo recebido — preparando o processamento…",
  queued: "Na fila de processamento",
  processing: "Reconstruindo o ambiente em 3D…",
  postprocessing: "Finalizando o mapa…",
  done: "Mapa pronto",
  error: "Falhou",
};

const SUBLINES: Record<string, string> = {
  recording: "As partes sobem durante a própria filmagem.",
  uploading: "As partes que subiram durante a filmagem estão sendo montadas.",
  uploaded: "Seu vídeo está seguro no servidor.",
  queued: "Um worker assume em instantes.",
  processing: "Normalmente 2–5 min. Vídeos longos podem levar mais.",
  postprocessing: "Compactando a nuvem e ancorando as detecções.",
};

// Posição de cada status no stepper (5 etapas visíveis).
const STAGE: Record<string, number> = {
  recording: 0,
  uploading: 0,
  uploaded: 1,
  queued: 1,
  processing: 2,
  postprocessing: 3,
  done: 4,
};

const STEP_LABELS = ["recebendo", "na fila", "reconstrução", "finalizando", "pronto"];

// Chip do topo: cor por token (rótulo textual sempre presente).
const CHIP: Record<string, { dot: string; label: string }> = {
  recording: { dot: "bg-magenta animate-pulse", label: "gravando" },
  uploading: { dot: "bg-cyan animate-pulse", label: "recebendo" },
  uploaded: { dot: "bg-cyan", label: "recebido" },
  queued: { dot: "bg-warning", label: "na fila" },
  processing: { dot: "bg-cyan animate-pulse", label: "reconstruindo" },
  postprocessing: { dot: "bg-cyan animate-pulse", label: "finalizando" },
  done: { dot: "bg-success", label: "pronto" },
  error: { dot: "bg-magenta", label: "falhou" },
};

export function ScanStatusClient({ scanId, token }: { scanId: string; token: string }) {
  const [scan, setScan] = useState<ScanInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  // A revelação segura o viewer por ~1,4 s para o glitch de marca ("Mapa pronto.")
  // tocar uma vez — pulada com prefers-reduced-motion.
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
        // Estado terminal: parar de fazer polling — cada poll re-assina URLs à toa,
        // e trocar a URL da nuvem embaixo do viewer não ajuda ninguém.
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

  // Guarda o título original da aba enquanto ela notifica em segundo plano — sem
  // isto, uma segunda revelação (ex.: reabrir o efeito) grava "✓ Mapa pronto" por
  // cima do próprio aviso.
  const originalTitleRef = useRef<string | null>(null);

  // Abrir sozinho o viewer com a aba em segundo plano jogaria uma experiência 3D
  // pesada (WebGL, carregamento de PLY) para rodar sem ninguém olhando — decisão
  // do produto (q7, 2026-07-27): só revela com a aba em primeiro plano; senão,
  // avisa no título e espera o usuário voltar.
  useEffect(() => {
    if (!viewerReady || revealed) return;

    function reveal() {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      return setTimeout(() => setRevealed(true), reduced ? 0 : 1400);
    }

    if (document.visibilityState === "visible") {
      const t = reveal();
      return () => clearTimeout(t);
    }

    originalTitleRef.current = document.title;
    document.title = "✓ Mapa pronto — Logikos Twins";

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

  // Estado terminal com artefatos → o viewer assume a tela inteira.
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

  // Splash da revelação: glitch de marca, uma vez, e o viewer entra.
  if (viewerReady) {
    return (
      <main className="grid-grego flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <h1
          data-text="Mapa pronto."
          className="glitch glitch-play font-display text-4xl font-bold tracking-tight"
        >
          Mapa pronto.
        </h1>
        <p className="font-mono text-xs tracking-wider text-mist">abrindo o viewer…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <LogoSymbol className="mb-4 h-10 w-10 text-surface-2" />
        <h1 className="font-display text-xl font-bold">Scan não encontrado</h1>
        <p className="mt-2 text-sm text-mist">
          O link pode estar incompleto ou o scan foi removido.
        </p>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6">
        <LogoSymbol className="h-10 w-10 animate-pulse text-signal/80" />
        <p className="text-sm text-mist">Carregando…</p>
      </main>
    );
  }

  const stage = STAGE[scan.status] ?? 0;
  const failed = scan.status === "error";
  const chip = CHIP[scan.status] ?? { dot: "bg-mist", label: scan.status };

  function copyLink() {
    void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="grid-grego mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-5 sm:px-6">
      <header className="flex items-center gap-2.5">
        <LogoSymbol className="h-6 w-6" />
        <span className="k-label text-[10px] text-mist">logikos twins</span>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 font-mono text-[11px]">
          <i className={`h-2 w-2 rounded-full ${chip.dot}`} />
          {chip.label}
        </span>
      </header>

      <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">
        {scan.title ?? "Scan"}
      </h1>
      {scan.durationS != null && (
        <p className="mt-0.5 font-mono text-xs text-mist">
          vídeo de {Math.floor(scan.durationS / 60)}:
          {String(Math.round(scan.durationS) % 60).padStart(2, "0")}
        </p>
      )}

      {/* Stepper honesto: etapas concluídas são fatos; a ativa apenas pulsa. */}
      {!failed && (
        <div
          className="mt-5 mb-4 flex items-start"
          aria-label="Progresso do processamento"
        >
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="relative flex flex-1 flex-col items-center gap-2">
              {i > 0 && (
                <span
                  className={`absolute top-[11px] right-1/2 left-[-50%] h-0.5 ${
                    i <= stage ? "bg-cyan-deep" : "bg-surface-2"
                  }`}
                />
              )}
              <span
                className={`relative z-10 grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-[11px] font-bold text-ink ${
                  i < stage
                    ? "border-cyan bg-cyan"
                    : i === stage
                      ? "border-cyan bg-ink shadow-[0_0_0_4px_rgb(0_229_255/0.14)]"
                      : "border-surface-2 bg-ink"
                }`}
              >
                {i < stage ? "✓" : ""}
              </span>
              <b
                className={`px-0.5 text-center font-mono text-[8px] font-normal tracking-wider uppercase ${
                  i === stage ? "text-cyan" : i < stage ? "text-mist" : "text-faint"
                }`}
              >
                {label}
              </b>
            </div>
          ))}
        </div>
      )}

      {failed ? (
        <div className="mt-5 rounded-lg border border-magenta/35 bg-graphite p-4">
          <h2 className="flex items-center gap-2.5 font-display text-xl font-bold">
            <IconAlert className="h-[22px] w-[22px] text-magenta" />O processamento falhou
          </h2>
          {scan.error && (
            <p className="mt-2.5 rounded-[10px] bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] text-danger-soft">
              {scan.error}
            </p>
          )}
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            Grave de novo com <b className="font-medium text-signal">mais luz ambiente</b>{" "}
            e movimentos mais lentos.
          </p>
          <a
            href="/new"
            className="mt-3.5 inline-flex min-h-[46px] items-center rounded-md bg-cyan px-5 font-semibold text-ink transition hover:bg-cyan-deep"
          >
            Gravar de novo
          </a>
        </div>
      ) : (
        <>
          <EduTheater />

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
            <h2 className="font-display text-[19px] font-medium">
              {LABELS[scan.status] ?? scan.status}
            </h2>
          </div>
          {SUBLINES[scan.status] && (
            <p className="mt-1 text-[13px] text-mist">{SUBLINES[scan.status]}</p>
          )}

          {/* Barra por etapas — segmentos concluídos cheios; o ativo com shimmer. */}
          <div className="mt-3 mb-5 flex gap-1" aria-hidden="true">
            {STEP_LABELS.map((_, i) => (
              <i
                key={i}
                className={`relative h-1 flex-1 overflow-hidden rounded-full ${
                  i < stage ? "bg-cyan-deep" : "bg-surface-2"
                }`}
              >
                {i === stage && (
                  <span className="absolute inset-y-0 w-3/5 animate-[stage-slide_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-cyan to-transparent motion-reduce:animate-none" />
                )}
              </i>
            ))}
          </div>
        </>
      )}

      <div className="mt-1 rounded-lg border border-line bg-graphite p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <IconKey className="h-4 w-4 text-warning" />
          Guarde este link
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-mist">
          Ele é a única chave deste scan. Sem o link com token, ninguém encontra o mapa —
          nem você.
        </p>
        <button
          onClick={copyLink}
          className={`mt-2.5 inline-flex min-h-(--tap) items-center rounded-[10px] border px-4 font-mono text-xs transition ${
            copied
              ? "border-success text-success"
              : "border-line-strong hover:border-cyan"
          }`}
        >
          {copied ? "copiado ✓" : "copiar link"}
        </button>
      </div>

      <p className="mt-auto pt-4 pb-1 text-center text-xs text-faint">
        Pode fechar esta página — o processamento continua no servidor. Volte pelo link.
      </p>
    </main>
  );
}
