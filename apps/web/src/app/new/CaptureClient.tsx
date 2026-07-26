"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecorder } from "@/lib/capture/useRecorder";
import { FileFallback } from "./FileFallback";

function formatElapsed(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Página de GRAVAÇÃO, não de upload (ADR-0008): abre a câmera, grava com envio em
 * segundo plano e, ao parar, o processamento dispara sozinho. O botão de upload não
 * existe no fluxo do celular — o fallback de arquivo fica atrás de um link discreto.
 */
export function CaptureClient({ maxSeconds }: { maxSeconds: number }) {
  const router = useRouter();
  const { state, videoRef, openCamera, start, stop } = useRecorder(maxSeconds);
  const [showFallback, setShowFallback] = useState(false);

  // A câmera abre assim que a página monta — a primeira coisa que o usuário vê é
  // o próprio ambiente, não um formulário.
  useEffect(() => {
    void openCamera();
  }, [openCamera]);

  // Gravação concluída → direto para a página do scan, que mostra o processamento.
  useEffect(() => {
    if (state.phase === "done" && state.scanId && state.shareToken) {
      router.push(`/scan/${state.scanId}?token=${state.shareToken}`);
    }
  }, [state.phase, state.scanId, state.shareToken, router]);

  const remaining = maxSeconds - state.elapsedS;
  const nearLimit = state.phase === "recording" && remaining <= 15;

  const statusLine = useMemo(() => {
    switch (state.phase) {
      case "requesting-camera":
        return "Abrindo a câmera…";
      case "ready":
        return "Pronto. Ande devagar e filme o ambiente inteiro.";
      case "recording":
        return state.partsQueued > 0
          ? `gravando · enviando (${state.partsSent} ✓)`
          : `gravando · ${state.partsSent} partes enviadas`;
      case "finishing":
        return "Concluindo o envio…";
      case "done":
        return "Pronto! Abrindo o scan…";
      default:
        return null;
    }
  }, [state.phase, state.partsQueued, state.partsSent]);

  if (showFallback || state.unsupported) {
    return (
      <FileFallback
        reason={
          state.unsupported
            ? "Este navegador não suporta gravação pela página — envie um arquivo de vídeo."
            : undefined
        }
      />
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-black">
      {/* Preview da câmera em tela cheia */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Overlay guiado */}
      <div className="relative z-10 flex min-h-dvh flex-col justify-between p-6">
        <header className="flex items-start justify-between">
          <div className="rounded-xl bg-black/60 px-4 py-2 backdrop-blur">
            <p className="text-sm font-medium">Logikos Twins</p>
            {statusLine && <p className="text-xs text-neutral-300">{statusLine}</p>}
          </div>

          {state.phase === "recording" && (
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-2 backdrop-blur ${
                nearLimit ? "bg-red-600/80" : "bg-black/60"
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-sm tabular-nums">
                {formatElapsed(state.elapsedS)}
              </span>
            </div>
          )}
        </header>

        {/* Instruções do protocolo de captura, visíveis antes de começar */}
        {state.phase === "ready" && (
          <div className="mx-auto max-w-sm rounded-2xl bg-black/60 p-4 text-sm backdrop-blur">
            <p className="font-medium">Como filmar bem:</p>
            <ul className="mt-2 space-y-1 text-neutral-300">
              <li>· Celular na horizontal, boa iluminação</li>
              <li>· Ande devagar — um passo por segundo</li>
              <li>· Movimentos suaves, sem giros bruscos</li>
              <li>· Feche voltas: termine onde começou</li>
              <li>· Limite: {Math.floor(maxSeconds / 60)} minutos</li>
            </ul>
            <p className="mt-3 text-xs text-neutral-400">
              O vídeo é enviado durante a gravação e apagado após 7 dias; o mapa 3D
              permanece. Ao gravar, você concorda com o processamento das imagens.
            </p>
          </div>
        )}

        {state.phase === "error" && state.error && (
          <div className="mx-auto max-w-sm rounded-2xl bg-red-950/80 p-4 text-sm backdrop-blur">
            <p className="font-medium text-red-200">Algo deu errado</p>
            <p className="mt-1 text-red-300">{state.error}</p>
            <button
              onClick={() => void openCamera()}
              className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-medium text-neutral-950"
            >
              Tentar de novo
            </button>
          </div>
        )}

        <footer className="flex flex-col items-center gap-4 pb-4">
          {state.phase === "ready" && (
            <button
              onClick={() => void start()}
              aria-label="Começar a gravar"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-transparent"
            >
              <span className="h-14 w-14 rounded-full bg-red-600 transition active:scale-90" />
            </button>
          )}

          {state.phase === "recording" && (
            <button
              onClick={() => void stop()}
              aria-label="Parar e processar"
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-transparent"
            >
              <span className="h-8 w-8 rounded bg-red-600 transition active:scale-90" />
            </button>
          )}

          {state.phase === "finishing" && (
            <div className="flex h-20 items-center">
              <span className="animate-pulse text-sm text-neutral-300">
                enviando as últimas partes…
              </span>
            </div>
          )}

          {(state.phase === "ready" || state.phase === "error") && (
            <button
              onClick={() => setShowFallback(true)}
              className="text-xs text-neutral-400 underline underline-offset-2"
            >
              Enviar um arquivo de vídeo (desktop / drone)
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
