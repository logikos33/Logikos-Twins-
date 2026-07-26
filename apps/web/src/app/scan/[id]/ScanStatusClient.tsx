"use client";

import { useEffect, useState } from "react";
import { ViewerGate } from "./ViewerGate";
import type { ScaleInfo } from "@/lib/viewer/scale";

/**
 * Estado do scan com polling; quando `done`, vira o viewer 3D (D4).
 * O polling PARA ao entrar no viewer — o estado é terminal.
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
  queued: "Na fila de processamento…",
  processing: "Reconstruindo o ambiente em 3D…",
  postprocessing: "Preparando o mapa…",
  done: "Mapa pronto",
  error: "Falhou",
};

export function ScanStatusClient({ scanId, token }: { scanId: string; token: string }) {
  const [scan, setScan] = useState<ScanInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

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

  // Estado terminal com artefatos → o viewer assume a tela inteira.
  if (
    scan?.status === "done" &&
    scan.artifacts["cloud_preview_url"] &&
    scan.artifacts["poses_url"]
  ) {
    return (
      <ViewerGate
        scanId={scanId}
        token={token}
        cloudUrl={scan.artifacts["cloud_preview_url"]}
        posesUrl={scan.artifacts["poses_url"]}
        initialScale={scan.scale}
      />
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-xl font-semibold">Scan não encontrado</h1>
        <p className="mt-2 text-sm text-neutral-400">
          O link pode estar incompleto ou o scan foi removido.
        </p>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <p className="animate-pulse text-neutral-400">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">{scan.title ?? "Scan"}</h1>

      <div className="rounded-2xl border border-neutral-800 p-5">
        <p className="text-lg">{LABELS[scan.status] ?? scan.status}</p>
        {scan.durationS != null && (
          <p className="mt-1 text-sm text-neutral-400">
            {Math.round(scan.durationS)}s de vídeo
          </p>
        )}
        {scan.status === "error" && scan.error && (
          <p className="mt-2 text-sm text-red-400">{scan.error}</p>
        )}
        {scan.status !== "done" && scan.status !== "error" && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-white" />
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Guarde este link — é a chave de acesso ao scan.
      </p>
    </main>
  );
}
