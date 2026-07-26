/**
 * Buffer de partes do multipart — a lógica pura da gravação em chunks (ADR-0008).
 *
 * O MediaRecorder emite blobs a cada ~3 s; o S3 exige que toda parte, exceto a
 * última, tenha ≥ 5 MB. Este módulo acumula blobs até formar uma parte válida.
 * É lógica sem I/O de propósito: o comportamento nas bordas (última parte pequena,
 * blob gigante único, flush sem nada) é exatamente onde upload quebra em produção,
 * e aqui dá para testar tudo sem navegador nem rede.
 */

import { MIN_PART_BYTES } from "@/lib/storage";

export type PendingPart = {
  partNumber: number;
  blob: Blob;
};

export class PartBuffer {
  private chunks: Blob[] = [];
  private bufferedBytes = 0;
  private nextPartNumber = 1;

  /**
   * Acrescenta um chunk da gravação. Devolve a parte pronta para envio quando o
   * acumulado atinge o mínimo do S3 — ou null enquanto ainda não formou parte.
   */
  push(chunk: Blob): PendingPart | null {
    if (chunk.size === 0) return null;
    this.chunks.push(chunk);
    this.bufferedBytes += chunk.size;

    if (this.bufferedBytes < MIN_PART_BYTES) return null;
    return this.drain();
  }

  /**
   * Fecha o buffer no fim da gravação. A última parte pode ter qualquer tamanho —
   * é a única exceção que o protocolo permite.
   */
  flush(): PendingPart | null {
    if (this.bufferedBytes === 0) return null;
    return this.drain();
  }

  get pendingBytes(): number {
    return this.bufferedBytes;
  }

  get partsProduced(): number {
    return this.nextPartNumber - 1;
  }

  private drain(): PendingPart {
    const type = this.chunks[0]?.type ?? "";
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    this.bufferedBytes = 0;
    return { partNumber: this.nextPartNumber++, blob };
  }
}
