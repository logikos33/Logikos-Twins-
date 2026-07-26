import { describe, expect, it, vi } from "vitest";
import { UploadQueue } from "./uploadQueue";

const smallBlob = () => new Blob([new Uint8Array(16)]);

describe("UploadQueue — envio sequencial com retry", () => {
  it("envia as partes uma por vez, na ordem de chegada", async () => {
    const order: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const q = new UploadQueue(async (partNumber) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      order.push(partNumber);
      concurrent--;
      return `etag-${partNumber}`;
    });

    q.enqueue(1, smallBlob());
    q.enqueue(2, smallBlob());
    q.enqueue(3, smallBlob());

    const results = await q.drain();
    expect(order).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1); // sequencial de propósito — ver comentário do módulo
    expect(results.map((r) => r.etag)).toEqual(["etag-1", "etag-2", "etag-3"]);
  });

  it("tenta de novo com backoff quando o envio falha", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const q = new UploadQueue(async (partNumber) => {
      attempts++;
      if (attempts < 3) throw new Error("rede caiu");
      return `etag-${partNumber}`;
    });

    q.enqueue(1, smallBlob());
    const drained = q.drain();
    await vi.runAllTimersAsync();
    const results = await drained;

    expect(attempts).toBe(3);
    expect(results).toEqual([{ partNumber: 1, etag: "etag-1" }]);
    vi.useRealTimers();
  });

  it("desiste depois de esgotar as tentativas e o drain rejeita", async () => {
    vi.useFakeTimers();
    const q = new UploadQueue(async () => {
      throw new Error("rede morta");
    });

    q.enqueue(1, smallBlob());
    const drained = q.drain();
    drained.catch(() => {
      // rejeição esperada — tratada nas asserções abaixo
    });
    await vi.runAllTimersAsync();

    await expect(drained).rejects.toThrow(/falhou após 4 tentativas/);
    vi.useRealTimers();
  });

  it("drain com fila vazia resolve imediatamente", async () => {
    const q = new UploadQueue(async () => "nunca-chamado");
    await expect(q.drain()).resolves.toEqual([]);
  });

  it("reporta progresso a cada parte enviada", async () => {
    const progress: [number, number][] = [];
    const q = new UploadQueue(
      async (n) => `etag-${n}`,
      (sent, queued) => progress.push([sent, queued]),
    );

    q.enqueue(1, smallBlob());
    q.enqueue(2, smallBlob());
    await q.drain();

    expect(progress.at(-1)).toEqual([2, 0]);
  });
});
