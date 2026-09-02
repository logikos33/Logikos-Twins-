"use client";

/**
 * Página de GRAVAÇÃO (ADR-0008) — orquestra o useRecorder real e entrega os
 * estados do CONTRATO à CaptureView (a apresentação pura, testada no gate).
 *
 * Mapeamento phase real → estado do contrato:
 *   idle|requesting-camera → permission-prompt (o "Permitir" chama openCamera)
 *   ready                  → idle (ou portrait-hint na 1ª vez em pé)
 *   recording              → recording
 *   finishing              → stopping
 *   error{unsupported}     → unsupported · error{denied} → permission-denied
 * https-required deriva do protocolo. Nada disso mexe no hook de mídia.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRecorder } from "@/lib/capture/useRecorder";
import { FileFallback } from "./FileFallback";
import { CaptureView, type CaptureState } from "./CaptureView";
import { t } from "@/lib/piloto/strings";

const INSTR_KEY = "twins.instr.dismissed";
const HINT_KEY = "twins.portrait.dismissed";

export function CaptureClient({
  maxSeconds,
  captureToken,
}: {
  maxSeconds: number;
  captureToken?: string;
}) {
  const router = useRouter();
  const { state, videoRef, openCamera, start, stop, toggleTorch } = useRecorder(maxSeconds);
  const [showFallback, setShowFallback] = useState(false);
  const [blurFaces, setBlurFaces] = useState(false);
  const [instrOpen, setInstrOpen] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(INSTR_KEY) !== "1") return;
    const tmr = setTimeout(() => setInstrOpen(false), 0);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (window.location.protocol !== "https:" && !local) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- detecção de contexto (http sem câmera) só existe no cliente; roda uma vez no mount
      setInsecure(true);
      return;
    }
    const mq = window.matchMedia("(orientation: portrait)");
    const apply = () => setIsPortrait(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    setHintDismissed(window.sessionStorage.getItem(HINT_KEY) === "1");
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (state.phase === "done" && state.scanId && state.shareToken) {
      router.push(`/scan/${state.scanId}?token=${state.shareToken}`);
    }
  }, [state.phase, state.scanId, state.shareToken, router]);

  const dismissHint = useCallback(() => {
    window.sessionStorage.setItem(HINT_KEY, "1");
    setHintDismissed(true);
  }, []);

  const closeInstr = useCallback((open: boolean) => {
    setInstrOpen(open);
    if (!open) window.localStorage.setItem(INSTR_KEY, "1");
  }, []);

  if (showFallback || state.unsupported) {
    return (
      <FileFallback
        captureToken={captureToken}
        reason={state.unsupported ? tUnsupportedReason() : undefined}
        onBack={state.unsupported ? undefined : () => setShowFallback(false)}
      />
    );
  }

  const captureState: CaptureState = insecure
    ? "https-required"
    : state.phase === "error"
      ? state.denied
        ? "permission-denied"
        : "unsupported"
      : state.phase === "recording"
        ? "recording"
        : state.phase === "finishing"
          ? "stopping"
          : state.phase === "ready"
            ? isPortrait && !hintDismissed && !instrOpen
              ? "portrait-hint"
              : "idle"
            : "permission-prompt"; // idle | requesting-camera

  return (
    <CaptureView
      state={captureState}
      elapsedS={state.elapsedS}
      maxSeconds={maxSeconds}
      partsSent={state.partsSent}
      partsQueued={state.partsQueued}
      instrOpen={instrOpen && (state.phase === "ready" || state.phase === "idle")}
      blurFaces={blurFaces}
      errorDetail={state.phase === "error" ? state.error : null}
      onStart={() => void start(blurFaces, captureToken)}
      onStop={() => void stop()}
      onTorch={() => void toggleTorch()}
      onFallback={() => setShowFallback(true)}
      onAllow={() => void openCamera()}
      onDismissHint={dismissHint}
      onToggleInstr={closeInstr}
      onToggleBlur={setBlurFaces}
      camSlot={
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
      }
    />
  );
}

function tUnsupportedReason(): string {
  return t("capture", "unsupported");
}
