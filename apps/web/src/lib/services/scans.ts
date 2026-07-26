import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as storage from "@/lib/storage";
import type { Scan } from "@/generated/prisma/client";

/**
 * Serviço de scans — toda a lógica de criação, upload por partes e consulta.
 * As rotas validam a borda e delegam para cá; ninguém mais toca no Prisma.
 */

// Extensões aceitas por container de gravação (ADR-0008: Safari grava MP4,
// Chrome Android grava WebM). O worker normaliza tudo para MP4 na D3.
const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function extForMime(mimeType: string): string | null {
  // `video/webm;codecs=vp9` → `video/webm`
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_BY_MIME[base] ?? null;
}

/**
 * Token de compartilhamento: é a única barreira de acesso ao scan (não há login),
 * então precisa ser imprevisível. 24 bytes ≈ 192 bits de entropia, url-safe.
 */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export type CreatedScan = {
  scanId: string;
  shareToken: string;
  uploadId: string;
  videoKey: string;
};

export async function createScan(params: {
  title?: string;
  mimeType: string;
}): Promise<CreatedScan> {
  const ext = extForMime(params.mimeType);
  if (!ext) {
    throw new UnsupportedMimeError(params.mimeType);
  }

  const shareToken = newShareToken();
  const scan = await db.scan.create({
    data: {
      title: params.title ?? null,
      shareToken,
      videoExt: ext,
      extractFps: env().EXTRACT_FPS,
      status: "recording",
    },
  });

  const videoKey = storage.keys.video(scan.id, ext);
  const uploadId = await storage.createMultipart(videoKey, params.mimeType);

  await db.scan.update({
    where: { id: scan.id },
    data: { videoKey, uploadId },
  });

  return { scanId: scan.id, shareToken, uploadId, videoKey };
}

/** Assina a parte N do multipart da gravação em andamento. */
export async function presignPart(scan: Scan, partNumber: number): Promise<string> {
  if (!scan.videoKey || !scan.uploadId) {
    throw new InvalidStateError("scan sem upload multipart aberto");
  }
  if (scan.status !== "recording" && scan.status !== "uploading") {
    throw new InvalidStateError(`scan em '${scan.status}' não aceita mais partes`);
  }
  return storage.presignUploadPart(scan.videoKey, scan.uploadId, partNumber);
}

/**
 * Fecha o multipart e marca o scan pronto para processamento.
 * O tamanho é verificado DEPOIS de completar: o S3 só materializa o objeto no
 * complete, e é o tamanho real do objeto que interessa, não a soma declarada.
 */
export async function completeUpload(
  scan: Scan,
  parts: storage.PartRef[],
  durationS: number | null,
): Promise<Scan> {
  if (!scan.videoKey || !scan.uploadId) {
    throw new InvalidStateError("scan sem upload multipart aberto");
  }
  if (scan.status !== "recording" && scan.status !== "uploading") {
    throw new InvalidStateError(`scan em '${scan.status}' não pode ser completado`);
  }
  if (parts.length === 0) {
    throw new InvalidStateError("nenhuma parte enviada");
  }

  await storage.completeMultipart(scan.videoKey, scan.uploadId, parts);

  const head = await storage.headObject(scan.videoKey);
  const maxBytes = env().MAX_VIDEO_MB * 1024 * 1024;
  if (head && head.size > maxBytes) {
    // Grande demais: apaga e marca erro — não se cobra processamento de um vídeo
    // que a política recusa.
    await storage.deleteObject(scan.videoKey);
    return db.scan.update({
      where: { id: scan.id },
      data: {
        status: "error",
        errorMsg: `Vídeo de ${Math.round(head.size / 1024 / 1024)} MB excede o limite de ${env().MAX_VIDEO_MB} MB.`,
      },
    });
  }

  return db.scan.update({
    where: { id: scan.id },
    data: {
      status: "uploaded",
      videoBytes: head ? BigInt(head.size) : null,
      durationS,
      uploadId: null,
    },
  });
}

/** Aborta o multipart de um scan abandonado (aba fechada no meio da gravação). */
export async function abortUpload(scan: Scan): Promise<Scan> {
  if (scan.videoKey && scan.uploadId) {
    await storage.abortMultipart(scan.videoKey, scan.uploadId).catch(() => {
      // O abort é melhor-esforço: se o multipart já expirou ou foi limpo pelo
      // lifecycle do bucket, o estado do scan ainda precisa ser atualizado.
    });
  }
  return db.scan.update({
    where: { id: scan.id },
    data: { status: "error", errorMsg: "Gravação abandonada.", uploadId: null },
  });
}

/**
 * Busca por share_token — o caminho de quem abre o link. Retorna null tanto para
 * token inexistente quanto para malformado: quem não tem o token não descobre nada.
 */
export async function findByShareToken(token: string): Promise<Scan | null> {
  if (!token || token.length > 64) return null;
  return db.scan.findUnique({ where: { shareToken: token } });
}

export async function findById(id: string): Promise<Scan | null> {
  return db.scan.findUnique({ where: { id } });
}

/** Presigned GETs dos artefatos para o viewer (só o que existir em `outputs`). */
export async function artifactUrls(scan: Scan): Promise<Record<string, string>> {
  const outputs = (scan.outputs ?? {}) as Record<string, string>;
  const urls: Record<string, string> = {};
  for (const [name, key] of Object.entries(outputs)) {
    if (name.endsWith("_key")) {
      urls[name.replace(/_key$/, "_url")] = await storage.presignGet(key);
    }
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Erros específicos — a rota converte para o HTTP certo sem adivinhar por string
// ---------------------------------------------------------------------------

export class UnsupportedMimeError extends Error {
  constructor(mime: string) {
    super(
      `Formato de vídeo não suportado: '${mime}'. Aceitos: MP4 (Safari), WebM (Chrome/Android) e MOV.`,
    );
    this.name = "UnsupportedMimeError";
  }
}

export class InvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}
