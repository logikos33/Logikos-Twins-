/**
 * UploadPartFn ÚNICA para gravação e fallback de arquivo (era duplicada).
 *
 * Modo padrão = PROXY same-origin (D- do CORS: o bucket não tem regra e a
 * credencial não permite criá-la). Quando o CORS entrar no bucket, setar
 * NEXT_PUBLIC_UPLOAD_PROXY=0 devolve o PUT presignado direto ao R2.
 */

import type { UploadPartFn } from "./uploadQueue";

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function proxyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_UPLOAD_PROXY !== "0";
}

export function makeUploadPart(scanId: string, shareToken: string): UploadPartFn {
  if (proxyEnabled()) {
    return async (partNumber, blob) => {
      const res = await fetch(
        `/api/scans/${scanId}/parts/upload?partNumber=${partNumber}&token=${encodeURIComponent(shareToken)}`,
        { method: "POST", body: blob },
      );
      if (!res.ok) throw new Error(`parte ${partNumber} (proxy): HTTP ${res.status}`);
      const { etag } = (await res.json()) as { etag: string };
      if (!etag) throw new Error(`parte ${partNumber} sem ETag na resposta`);
      return etag;
    };
  }
  return async (partNumber, blob) => {
    const { url } = await api<{ url: string }>(`/api/scans/${scanId}/parts`, {
      partNumber,
      shareToken,
    });
    const put = await fetch(url, { method: "PUT", body: blob });
    if (!put.ok) throw new Error(`PUT da parte ${partNumber}: HTTP ${put.status}`);
    const etag = put.headers.get("ETag");
    if (!etag) throw new Error(`parte ${partNumber} sem ETag na resposta`);
    return etag;
  };
}
