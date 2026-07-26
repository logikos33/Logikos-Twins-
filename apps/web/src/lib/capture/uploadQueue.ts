/**
 * Fila de envio das partes — sequencial e com retry.
 *
 * Sequencial de propósito: o celular está gravando 1080p E enviando ao mesmo tempo;
 * paralelismo agressivo de upload compete por CPU/rede com a própria gravação
 * (risco registrado na spec D1). Uma parte por vez, com backoff, é o comportamento
 * robusto em 4G instável.
 */

export type PartUploadResult = { partNumber: number; etag: string };

export type UploadPartFn = (partNumber: number, blob: Blob) => Promise<string>;

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

export class UploadQueue {
  private queue: { partNumber: number; blob: Blob }[] = [];
  private inFlight = false;
  private completed: PartUploadResult[] = [];
  private failedPermanently: Error | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly uploadPart: UploadPartFn,
    private readonly onProgress?: (sent: number, queued: number) => void,
  ) {}

  enqueue(partNumber: number, blob: Blob): void {
    if (this.failedPermanently) return;
    this.queue.push({ partNumber, blob });
    this.notifyProgress();
    void this.pump();
  }

  /** Espera a fila esvaziar. Rejeita se alguma parte esgotou os retries. */
  async drain(): Promise<PartUploadResult[]> {
    while (this.queue.length > 0 || this.inFlight) {
      if (this.failedPermanently) throw this.failedPermanently;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    if (this.failedPermanently) throw this.failedPermanently;
    return [...this.completed];
  }

  get sentCount(): number {
    return this.completed.length;
  }

  get queuedCount(): number {
    return this.queue.length + (this.inFlight ? 1 : 0);
  }

  private async pump(): Promise<void> {
    if (this.inFlight || this.failedPermanently) return;
    const next = this.queue.shift();
    if (!next) {
      this.wakeWaiters();
      return;
    }

    this.inFlight = true;
    try {
      const etag = await this.withRetry(next.partNumber, next.blob);
      this.completed.push({ partNumber: next.partNumber, etag });
    } catch (err) {
      this.failedPermanently =
        err instanceof Error ? err : new Error("falha de upload desconhecida");
    } finally {
      this.inFlight = false;
      // O progresso é notificado DEPOIS de sair do estado in-flight — senão a
      // parte recém-concluída ainda conta como "na fila" para quem observa.
      this.notifyProgress();
      this.wakeWaiters();
    }

    if (!this.failedPermanently && this.queue.length > 0) void this.pump();
  }

  private async withRetry(partNumber: number, blob: Blob): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.uploadPart(partNumber, blob);
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS) {
          // Backoff exponencial: 1s, 2s, 4s. Perda de rede momentânea em 4G é o
          // caso normal, não o excepcional.
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
        }
      }
    }
    throw new Error(
      `Parte ${partNumber} falhou após ${MAX_ATTEMPTS} tentativas: ${String(lastError)}`,
    );
  }

  private wakeWaiters(): void {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w();
  }

  private notifyProgress(): void {
    this.onProgress?.(this.sentCount, this.queuedCount);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
