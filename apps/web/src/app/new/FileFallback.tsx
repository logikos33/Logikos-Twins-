"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartBuffer } from "@/lib/capture/partBuffer";
import { UploadQueue } from "@/lib/capture/uploadQueue";

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

export function FileFallback({ reason }: { reason?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setPhase("uploading");
    setError(null);

    try {
      const mimeType = file.type || "video/mp4";
      const created = await api<{ scanId: string; shareToken: string }>("/api/scans", {
        mimeType,
        title: file.name.replace(/\.[^.]+$/, ""),
      });

      const totalParts = Math.ceil(file.size / SLICE_BYTES);
      setProgress({ sent: 0, total: totalParts });

      const queue = new UploadQueue(
        async (partNumber, blob) => {
          const { url } = await api<{ url: string }>(
            `/api/scans/${created.scanId}/parts`,
            { partNumber, shareToken: created.shareToken },
          );
          const put = await fetch(url, { method: "PUT", body: blob });
          if (!put.ok) throw new Error(`PUT da parte ${partNumber}: HTTP ${put.status}`);
          const etag = put.headers.get("ETag");
          if (!etag) throw new Error(`parte ${partNumber} sem ETag`);
          return etag;
        },
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Enviar vídeo</h1>
        {reason && <p className="mt-2 text-sm text-amber-400">{reason}</p>}
        <p className="mt-2 text-sm text-neutral-400">
          Para vídeos de drone ou gravados fora da página. MP4, WebM ou MOV; até 3 minutos
          e 300 MB. O vídeo bruto é apagado após 7 dias; o mapa 3D permanece.
        </p>
      </div>

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
          className="rounded-full bg-white px-6 py-3 font-medium text-neutral-950 transition hover:bg-neutral-200"
        >
          Escolher arquivo
        </button>
      )}

      {phase === "uploading" && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-white transition-all"
              style={{
                width: `${progress.total ? Math.round((progress.sent / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            Enviando… {progress.sent}/{progress.total} partes
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="rounded-xl bg-red-950/60 p-4 text-sm">
          <p className="text-red-200">{error}</p>
          <button
            onClick={() => {
              setPhase("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-medium text-neutral-950"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </main>
  );
}
