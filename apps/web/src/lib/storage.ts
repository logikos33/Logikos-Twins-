import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, publicS3Endpoint } from "./env";

/**
 * Porta `Storage` — o único módulo que sabe que existe MinIO ou R2 (ADR-0003).
 *
 * Tudo aqui fala S3, que é o denominador comum dos dois. A FASE PLUG-IN troca
 * variáveis de ambiente e este arquivo não muda.
 */

export type PartRef = { partNumber: number; etag: string };

/**
 * Mínimo de 5 MB por parte de multipart, exceto a última. É restrição do protocolo S3,
 * não escolha nossa — e é o que dita o buffering da gravação em chunks (ADR-0008).
 */
export const MIN_PART_BYTES = 5 * 1024 * 1024;

function client(): S3Client {
  const e = env();
  return new S3Client({
    region: e.S3_REGION,
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Cliente separado para assinar URLs destinadas ao NAVEGADOR.
 *
 * Dentro do compose a web fala com `http://minio:9000`, mas o celular não resolve esse
 * nome. A assinatura embute o host, então uma URL assinada para `minio:9000` é inútil
 * fora da rede do Docker — daí um cliente que assina para o endpoint público.
 */
function browserClient(): S3Client {
  const e = env();
  return new S3Client({
    region: e.S3_REGION,
    endpoint: publicS3Endpoint(),
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    },
  });
}

const bucket = () => env().S3_BUCKET;

// ---------------------------------------------------------------------------
// Objetos simples
// ---------------------------------------------------------------------------

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function listObjects(prefix: string): Promise<string[]> {
  const r = await client().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix }),
  );
  return (r.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
}

// ---------------------------------------------------------------------------
// URLs assinadas
// ---------------------------------------------------------------------------

/** GET assinado para o navegador (viewer carregando artefatos). */
export async function presignGet(key: string, expiresIn = 6 * 3600): Promise<string> {
  return getSignedUrl(
    browserClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

/** GET assinado para o WORKER (roda em rede de servidor, não no navegador). */
export async function presignGetInternal(
  key: string,
  expiresIn = 6 * 3600,
): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn,
  });
}

/** PUT assinado de objeto inteiro — usado pelo fallback de upload de arquivo. */
export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    browserClient(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

// ---------------------------------------------------------------------------
// Multipart — o caminho da gravação ao vivo (ADR-0008)
// ---------------------------------------------------------------------------

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const r = await client().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!r.UploadId) throw new Error("S3 não devolveu UploadId ao iniciar o multipart");
  return r.UploadId;
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    browserClient(),
    new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn },
  );
}

/** UploadPart SERVER-SIDE (modo proxy, D- do CORS): o browser manda o chunk
 * para a nossa rota same-origin e o servidor repassa ao R2 — dispensa CORS no
 * bucket. Volta o ETag como no PUT presignado. */
export async function uploadPartServer(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<string> {
  const out = await client().send(
    new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  );
  const etag = out.ETag?.replaceAll('"', "");
  if (!etag) throw new Error(`parte ${partNumber} sem ETag do storage`);
  return etag;
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: PartRef[],
): Promise<void> {
  // O S3 exige as partes em ordem crescente de PartNumber; o navegador pode
  // confirmá-las fora de ordem quando envia em paralelo.
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: ordered.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await client().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}

/** Multiparts pendentes do bucket — para a limpeza de uploads abandonados. */
export async function listPendingMultiparts(): Promise<
  { key: string; uploadId: string; initiatedAt: Date | null }[]
> {
  const res = await client().send(
    new ListMultipartUploadsCommand({ Bucket: env().S3_BUCKET }),
  );
  return (res.Uploads ?? []).flatMap((u) =>
    u.Key && u.UploadId
      ? [{ key: u.Key, uploadId: u.UploadId, initiatedAt: u.Initiated ?? null }]
      : [],
  );
}

// ---------------------------------------------------------------------------
// Convenção de chaves — um lugar só, para web e worker concordarem
// ---------------------------------------------------------------------------

export const keys = {
  video: (scanId: string, ext = "mp4") => `videos/${scanId}.${ext}`,
  artifactPrefix: (scanId: string) => `scans/${scanId}/`,
  cloudPreview: (scanId: string) => `scans/${scanId}/cloud_preview.ply`,
  cloudFull: (scanId: string) => `scans/${scanId}/cloud_full.ply.gz`,
  poses: (scanId: string) => `scans/${scanId}/poses.json`,
  meta: (scanId: string) => `scans/${scanId}/meta.json`,
  keyframe: (scanId: string, idx: number) => `scans/${scanId}/keyframes/${idx}.jpg`,
  thumbnail: (scanId: string) => `scans/${scanId}/thumb.jpg`,
} as const;
