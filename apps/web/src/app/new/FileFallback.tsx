"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartBuffer } from "@/lib/capture/partBuffer";
import { UploadQueue } from "@/lib/capture/uploadQueue";
import { makeUploadPart } from "@/lib/capture/upload-part";
import { IconBack, IconFile, IconShield, IconUpFile, IconX } from "@/components/icons";

/**
 * Fallback de arquivo: desktop, vídeos de drone (N0) e navegadores sem MediaRecorder.
 *
 * NÃO é um caminho de segunda classe (ADR-0008): usa o MESMO multipart, as mesmas
 * rotas e produz o mesmo objeto no storage — o arquivo é fatiado localmente e passa
 * pelo mesmo PartBuffer/UploadQueue da gravação ao vivo. A diferença é só a origem
 * dos bytes.
 */

type Phase = "idle" | "uploading" | "error";

const SLICE_BYTES = 8 * 1024 * 1024;

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

export function FileFallback({
  captureToken,
  reason,
  onBack,
}: {
  captureToken?: string;
  reason?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setPhase("uploading");
    setFileName(file.name);
    setError(null);

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
      // mesmas regras de tamanho.
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
        { shareToken: created.shareToken, parts, durationS: null },
      );
      if (completed.status === "error") {
        throw new Error(completed.error ?? "Falha ao concluir o envio.");
      }

      router.push(`/scan/${created.scanId}?token=${created.shareToken}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-10 sm:px-6">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-3 inline-flex min-h-(--tap) items-center gap-1.5 self-start pr-3 text-sm text-mist transition hover:text-signal"
        >
          <IconBack className="h-5 w-5" />
          câmera
        </button>
      )}

      <h1 className="font-display text-2xl font-bold">Enviar arquivo de vídeo</h1>
      {reason && <p className="mt-2 text-sm text-warning">{reason}</p>}
      <p className="mt-2 mb-5 text-sm leading-relaxed text-mist">
        Para <b className="font-medium text-signal">desktop, drone</b> ou navegador sem
        câmera. Mesmo pipeline da captura ao vivo: o arquivo sobe em partes e o
        processamento dispara sozinho.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {phase === "idle" && (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-3 rounded-lg border-[1.5px] border-dashed border-line-strong px-5 py-9 text-center transition hover:border-cyan hover:bg-cyan/[0.03]"
        >
          <IconUpFile className="h-8 w-8 text-cyan" />
          <span className="text-sm text-mist">
            <b className="font-semibold text-signal">Toque para escolher o vídeo</b>
            <span className="mt-1 block font-mono text-[11px] tracking-wide text-faint">
              MP4 · WebM · MOV — até 3 min e 300 MB
            </span>
          </span>
        </button>
      )}

      {phase === "uploading" && (
        <div className="rounded-lg border border-line bg-graphite p-4">
          <div className="flex items-center gap-2.5 font-mono text-[13px]">
            <IconFile className="h-[18px] w-[18px] flex-none text-mist" />
            <span className="truncate">{fileName ?? "vídeo"}</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-cyan transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-mist">
            <span>
              parte {Math.min(progress.sent + 1, progress.total)} de {progress.total}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-lg border border-line border-l-[3px] border-l-magenta bg-graphite p-4 text-sm">
          <p className="flex items-start gap-2 text-danger-soft">
            <IconX className="mt-0.5 h-4 w-4 flex-none" />
            {error}
          </p>
          <button
            onClick={() => {
              setPhase("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="mt-3 rounded-[10px] bg-cyan px-4 py-2 text-xs font-semibold text-ink transition hover:bg-cyan-deep"
          >
            Tentar de novo
          </button>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-mist">
        <IconShield className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />O vídeo bruto é
        apagado após 7 dias; o mapa 3D e as fotos de evidência permanecem.
      </p>
    </main>
  );
}
