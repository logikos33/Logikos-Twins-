"use client";

import dynamic from "next/dynamic";
import type { ScaleInfo } from "@/lib/viewer/scale";

/**
 * Fronteira client-side do viewer: Three.js não sobrevive a SSR (WebGL não existe
 * no servidor — ADR-0002), então o componente entra por dynamic import sem SSR.
 */
const ScanViewer = dynamic(
  () => import("./viewer/ScanViewer").then((m) => m.ScanViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center bg-neutral-950">
        <p className="animate-pulse text-sm text-neutral-400">Preparando o viewer…</p>
      </div>
    ),
  },
);

type Props = {
  scanId: string;
  token: string;
  cloudUrl: string;
  posesUrl: string;
  initialScale: ScaleInfo | null;
};

export function ViewerGate(props: Props) {
  return <ScanViewer {...props} />;
}
