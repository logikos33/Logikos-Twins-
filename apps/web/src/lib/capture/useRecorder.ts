"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartBuffer } from "./partBuffer";
import { UploadQueue, type PartUploadResult } from "./uploadQueue";
import { makeUploadPart } from "./upload-part";

/**
 * Orquestra a captura ao vivo (ADR-0008):
 * getUserMedia → MediaRecorder (timeslice 3 s) → PartBuffer (mínimo 5 MB)
 * → UploadQueue (sequencial, retry) → complete → o processamento dispara sozinho.
 *
 * A lógica difícil (particionamento e fila) vive em módulos puros testados;
 * este hook é a cola com as APIs de navegador, que só existem em runtime.
 */

export type RecorderPhase =
  | "idle"
  | "requesting-camera"
  | "ready"
  | "recording"
  | "finishing" // parou; enviando as últimas partes e completando
  | "done"
  | "error";

export type RecorderState = {
  phase: RecorderPhase;
  /** Segundos decorridos de gravação. */
  elapsedS: number;
  /** Partes já confirmadas no storage. */
  partsSent: number;
  /** Partes aguardando envio (indicador "enviando…"). */
  partsQueued: number;
  error: string | null;
  /** Preenchidos quando `done` — a página redireciona para /scan/[id]. */
  scanId: string | null;
  shareToken: string | null;
  /** Navegador não suporta captura — a página mostra o fallback de arquivo. */
  unsupported: boolean;
  /** Permissão de câmera negada (NotAllowedError) — estado próprio no contrato. */
  denied: boolean;
  /** Lanterna ligada (quando o hardware suporta torch). */
  torchOn: boolean;
};

const TIMESLICE_MS = 3000;

// Ordem de preferência de container: o worker normaliza tudo (D3), mas H.264
// poupa a conversão. `isTypeSupported` decide por navegador.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `HTTP ${res.status} em ${path}`);
  }
  return res.json() as Promise<T>;
}

export function useRecorder(maxSeconds: number) {
  const [state, setState] = useState<RecorderState>({
    phase: "idle",
    denied: false,
    torchOn: false,
    elapsedS: 0,
    partsSent: 0,
    partsQueued: 0,
    error: null,
    scanId: null,
    shareToken: null,
    unsupported: false,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Quebra o ciclo de declaração start↔stop: o timer de auto-parada (dentro de
  // `start`) chama `stop` por esta ref, atualizada a cada render.
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  // Referências da sessão de upload em andamento.
  const sessionRef = useRef<{
    scanId: string;
    shareToken: string;
    buffer: PartBuffer;
    queue: UploadQueue;
  } | null>(null);

  const patch = useCallback((p: Partial<RecorderState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  /** Pede a câmera traseira e mostra o preview. */
  const openCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      patch({
        unsupported: true,
        phase: "error",
        error: "Câmera não disponível neste navegador.",
      });
      return;
    }
    if (pickMimeType() === null) {
      patch({
        unsupported: true,
        phase: "error",
        error: "Gravação de vídeo não suportada neste navegador.",
      });
      return;
    }

    patch({ phase: "requesting-camera", error: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false, // decisão 8: áudio descartado — nem se captura
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          // autoplay pode exigir gesto; o preview aparece no primeiro toque
        });
      }
      patch({ phase: "ready" });
    } catch (err) {
      const negada = err instanceof DOMException && err.name === "NotAllowedError";
      patch({
        phase: "error",
        denied: negada,
        error:
          negada
            ? "Permissão de câmera negada. Libere a câmera nas configurações do navegador."
            : `Não foi possível abrir a câmera: ${String(err)}`,
      });
    }
  }, [patch]);

  const start = useCallback(
    async (blurFaces = false) => {
      const stream = streamRef.current;
      const mimeType = pickMimeType();
      if (!stream || !mimeType) return;

      patch({ phase: "recording", elapsedS: 0, partsSent: 0, partsQueued: 0 });

      try {
        // 1. Cria o scan e abre o multipart ANTES do primeiro frame.
        const created = await api<{ scanId: string; shareToken: string }>("/api/scans", {
          mimeType,
          blurFaces,
        });

        const queue = new UploadQueue(
          makeUploadPart(created.scanId, created.shareToken),
          (sent, queued) => patch({ partsSent: sent, partsQueued: queued }),
        );

        sessionRef.current = {
          scanId: created.scanId,
          shareToken: created.shareToken,
          buffer: new PartBuffer(),
          queue,
        };

        // 2. Wake lock: a tela apagando mata a gravação. Degrada em silêncio
        // onde a API não existir.
        try {
          wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
        } catch {
          wakeLockRef.current = null;
        }

        // 3. MediaRecorder com timeslice: chunks a cada 3 s viram partes no buffer.
        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          const session = sessionRef.current;
          if (!session || event.data.size === 0) return;
          const part = session.buffer.push(event.data);
          if (part) session.queue.enqueue(part.partNumber, part.blob);
        };

        recorder.start(TIMESLICE_MS);
        startedAtRef.current = Date.now();

        timerRef.current = setInterval(() => {
          const elapsed = (Date.now() - startedAtRef.current) / 1000;
          patch({ elapsedS: Math.floor(elapsed) });
          // Limite de duração: para sozinho, concluindo o envio (critério da spec).
          // Via ref porque `stop` é declarado depois — o timer só roda em runtime.
          if (elapsed >= maxSeconds) void stopRef.current?.();
        }, 500);
      } catch (err) {
        patch({
          phase: "error",
          error: String(err instanceof Error ? err.message : err),
        });
      }
    },
    [maxSeconds, patch],
  );

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    const session = sessionRef.current;
    if (!recorder || !session || recorder.state === "inactive") return;

    if (timerRef.current) clearInterval(timerRef.current);
    patch({ phase: "finishing" });

    try {
      // `stop()` dispara um último ondataavailable com o resto do buffer interno;
      // o evento precisa ser aguardado antes do flush.
      const lastChunk = new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
      });
      recorder.stop();
      await lastChunk;

      const durationS = (Date.now() - startedAtRef.current) / 1000;

      const last = session.buffer.flush();
      if (last) session.queue.enqueue(last.partNumber, last.blob);

      const parts: PartUploadResult[] = await session.queue.drain();

      const completed = await api<{ status: string; error: string | null }>(
        `/api/scans/${session.scanId}/complete`,
        { shareToken: session.shareToken, parts, durationS },
      );

      if (completed.status === "error") {
        patch({ phase: "error", error: completed.error ?? "Falha ao concluir o envio." });
        return;
      }

      patch({
        phase: "done",
        scanId: session.scanId,
        shareToken: session.shareToken,
      });
    } catch (err) {
      patch({ phase: "error", error: String(err instanceof Error ? err.message : err) });
    } finally {
      wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [patch]);

  // Atualizada em efeito (não durante o render — regra dos hooks): o timer de
  // auto-parada só dispara bem depois de o efeito ter rodado.
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Faxina ao desmontar: solta câmera, wake lock e timer.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  // Lanterna: melhor-esforço — hardware sem torch ignora em silêncio (o botão
  // continua no contrato; ligar sem suporte simplesmente não muda nada).
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
    if (!caps?.torch) return;
    const atual = (track.getSettings() as { torch?: boolean }).torch ?? false;
    const ligar = !atual;
    try {
      await track.applyConstraints({ advanced: [{ torch: ligar } as MediaTrackConstraintSet] });
      patch({ torchOn: ligar });
    } catch {
      // dispositivo recusou — estado não muda
    }
  }, [patch]);

  return { state, videoRef, openCamera, start, stop, toggleTorch };
}
