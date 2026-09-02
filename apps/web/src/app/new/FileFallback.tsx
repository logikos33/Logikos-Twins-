"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartBuffer } from "@/lib/capture/partBuffer";
import { UploadQueue } from "@/lib/capture/uploadQueue";
import { makeUploadPart } from "@/lib/capture/upload-part";
import { IconBack, IconFile, IconShield, IconUpFile, IconX } from "@/components/icons";
import { t } from "@/lib/piloto/strings";
import { checkFileLimits } from "@/lib/capture/support";

/**
 * Fallback de captura quando o MediaRecorder não grava (ADR-0008).
 *
 * O caminho PRIMÁRIO continua sendo gravar: `capture="environment"` faz o toque
 * abrir a CÂMERA NATIVA do celular — o usuário grava ali e o arquivo volta
 * inteiro. Escolher da galeria (drone/desktop) é o secundário. Os dois entram
 * pelo MESMO pipeline da gravação ao vivo: fatiado local (PartBuffer) → fila
 * sequencial com retry (UploadQueue) → mesmas rotas → mesmo objeto no storage.
 *
 * O arquivo vem inteiro (120 s a 1080p ≈ 100–200 MB), então duração e tamanho
 * são validados AQUI, antes de gastar rede — e o servidor revalida no complete.
 */

type Phase = "idle" | "uploading" | "error";

const SLICE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_MB = 300;

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Duração do arquivo via metadata — sem decodificar o vídeo inteiro. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

export function FileFallback({
  captureToken,
  maxSeconds,
  minSeconds = 20,
  reason,
  technicalReason,
  onBack,
}: {
  captureToken?: string;
  maxSeconds: number;
  minSeconds?: number;
  reason?: string;
  technicalReason?: string | null;
  onBack?: () => void;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);

    // Limites do produto ANTES de gastar rede — errorCode limit-exceeded.
    const durationS = await readDuration(file);
    const limite = checkFileLimits(
      file.size,
      durationS,
      maxSeconds,
      MAX_FILE_MB,
      minSeconds,
    );
    if (limite === "too-big") {
      setPhase("error");
      setError(t("capture", "fallbackTooBig").replace("{mb}", String(MAX_FILE_MB)));
      return;
    }
    if (limite === "too-short") {
      setPhase("error");
      setError(t("job", "errors")["video-too-short"]);
      return;
    }
    if (limite === "too-long") {
      setPhase("error");
      setError(
        t("capture", "fallbackTooLong")
          .replace("{dur}", String(Math.round(durationS ?? 0)))
          .replace("{max}", String(maxSeconds)),
      );
      return;
    }

    setPhase("uploading");
    try {
      const mimeType = file.type || "video/mp4";
      const created = await api<{ scanId: string; shareToken: string }>("/api/scans", {
        captureToken,
        mimeType,
        title: file.name.replace(/\.[^.]+$/, ""),
      });

      const totalParts = Math.ceil(file.size / SLICE_BYTES);
      setProgress({ sent: 0, total: totalParts });

      const queue = new UploadQueue(
        makeUploadPart(created.scanId, created.shareToken),
        (sent) => setProgress((p) => ({ ...p, sent })),
      );

      // O arquivo é fatiado pelo MESMO PartBuffer da gravação — mesma numeração,
      // mesmas regras de tamanho; a fila reenvia parte falhada com backoff.
      const buffer = new PartBuffer();
      for (let offset = 0; offset < file.size; offset += SLICE_BYTES) {
        const part = buffer.push(file.slice(offset, offset + SLICE_BYTES, file.type));
        if (part) queue.enqueue(part.partNumber, part.blob);
      }
      const last = buffer.flush();
      if (last) queue.enqueue(last.partNumber, last.blob);

      const parts = await queue.drain();

      const completed = await api<{ status: string; error: string | null }>(
        `/api/scans/${created.scanId}/complete`,
        { shareToken: created.shareToken, parts, durationS },
      );
      if (completed.status === "error") {
        throw new Error(completed.error ?? t("capture", "fallbackCompleteFail"));
      }

      router.push(`/scan/${created.scanId}?token=${created.shareToken}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-10 sm:px-6">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-3 inline-flex min-h-(--tap) items-center gap-1.5 self-start pr-3 text-sm text-mist transition hover:text-signal"
        >
          <IconBack className="h-5 w-5" />
          {t("capture", "fallbackBack")}
        </button>
      )}

      <h1 className="font-display text-2xl font-bold">{t("capture", "fallbackTitle")}</h1>
      {reason && <p className="mt-2 text-sm text-warning">{reason}</p>}
      <p className="mt-2 mb-5 text-sm leading-relaxed text-mist">
        {t("capture", "fallbackBody")}
      </p>

      {/* capture="environment": o toque abre a câmera nativa — grava, não escolhe. */}
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={onPick}
      />

      {phase === "idle" && (
        <>
          <button
            data-plug="capture.fallback-file"
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed border-line-strong px-5 py-9 text-center transition hover:border-cyan hover:bg-cyan/[0.03]"
          >
            <IconUpFile className="h-8 w-8 text-cyan" />
            <span className="text-sm text-mist">
              <b className="font-semibold text-signal">
                {t("capture", "fallbackRecord")}
              </b>
              <span className="mt-1 block font-mono text-[11px] tracking-wide text-faint">
                {t("capture", "fallbackRecordSub").replace("{max}", String(maxSeconds))}
              </span>
            </span>
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="mt-3 self-center text-xs text-mist underline decoration-dotted underline-offset-2 transition hover:text-signal"
          >
            {t("capture", "fallbackGallery")}
          </button>
        </>
      )}

      {phase === "uploading" && (
        <div className="rounded-lg border border-line bg-graphite p-4">
          <div className="flex items-center gap-2.5 font-mono text-[13px]">
            <IconFile className="h-[18px] w-[18px] flex-none text-mist" />
            <span className="truncate">{fileName ?? t("capture", "fallbackVideo")}</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-cyan transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-mist">
            <span>
              {t("capture", "fallbackPart")
                .replace("{n}", String(Math.min(progress.sent + 1, progress.total)))
                .replace("{total}", String(progress.total))}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-lg border border-line border-l-[3px] border-l-danger bg-graphite p-4 text-sm">
          <p className="flex items-start gap-2 text-danger-soft">
            <IconX className="mt-0.5 h-4 w-4 flex-none" />
            {error}
          </p>
          <button
            onClick={() => {
              setPhase("idle");
              if (cameraRef.current) cameraRef.current.value = "";
              if (galleryRef.current) galleryRef.current.value = "";
            }}
            className="mt-3 rounded-[10px] bg-cyan px-4 py-2 text-xs font-semibold text-ink transition hover:bg-cyan-deep"
          >
            {t("common", "retry")}
          </button>
        </div>
      )}

      {technicalReason && (
        <details className="mt-4 text-xs text-faint">
          <summary className="cursor-pointer">{t("capture", "fallbackDetail")}</summary>
          <code className="mt-1 block font-mono">{technicalReason}</code>
        </details>
      )}

      <p className="mt-6 text-xs leading-relaxed text-mist">
        <IconShield className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />
        {t("capture", "fallbackLgpd")}
      </p>
    </main>
  );
}
