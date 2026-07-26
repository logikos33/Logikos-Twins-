import { describe, expect, it } from "vitest";
import { PartBuffer } from "./partBuffer";
import { MIN_PART_BYTES } from "@/lib/storage";

// jsdom não é necessário: Blob existe no Node 18+.
function blobOf(bytes: number, type = "video/webm"): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

describe("PartBuffer — particionamento da gravação ao vivo", () => {
  it("acumula chunks pequenos até atingir o mínimo de 5 MB", () => {
    const buf = new PartBuffer();
    const oneMb = 1024 * 1024;

    // 4 chunks de 1 MB: nada sai — ainda abaixo do mínimo do S3.
    for (let i = 0; i < 4; i++) {
      expect(buf.push(blobOf(oneMb))).toBeNull();
    }
    expect(buf.pendingBytes).toBe(4 * oneMb);

    // O quinto completa os 5 MB e fecha a parte 1.
    const part = buf.push(blobOf(oneMb));
    expect(part).not.toBeNull();
    expect(part!.partNumber).toBe(1);
    expect(part!.blob.size).toBe(MIN_PART_BYTES);
    expect(buf.pendingBytes).toBe(0);
  });

  it("numera as partes sequencialmente", () => {
    const buf = new PartBuffer();
    const first = buf.push(blobOf(MIN_PART_BYTES));
    const second = buf.push(blobOf(MIN_PART_BYTES));
    expect(first!.partNumber).toBe(1);
    expect(second!.partNumber).toBe(2);
    expect(buf.partsProduced).toBe(2);
  });

  it("um chunk maior que o mínimo vira parte sozinho", () => {
    const buf = new PartBuffer();
    const part = buf.push(blobOf(MIN_PART_BYTES * 2));
    expect(part!.blob.size).toBe(MIN_PART_BYTES * 2);
  });

  it("flush entrega a última parte mesmo abaixo do mínimo — a exceção do protocolo", () => {
    const buf = new PartBuffer();
    buf.push(blobOf(1024));
    const last = buf.flush();
    expect(last).not.toBeNull();
    expect(last!.blob.size).toBe(1024);
  });

  it("cenário de 12 MB: 2 partes de 5 MB + última de 2 MB (caso da spec)", () => {
    const buf = new PartBuffer();
    const oneMb = 1024 * 1024;
    const parts: number[] = [];

    // 12 chunks de 1 MB, como uma gravação real emitiria.
    for (let i = 0; i < 12; i++) {
      const p = buf.push(blobOf(oneMb));
      if (p) parts.push(p.blob.size);
    }
    const last = buf.flush();
    if (last) parts.push(last.blob.size);

    expect(parts).toEqual([5 * oneMb, 5 * oneMb, 2 * oneMb]);
  });

  it("flush sem nada acumulado devolve null, não uma parte vazia", () => {
    const buf = new PartBuffer();
    expect(buf.flush()).toBeNull();
    // Parte vazia corromperia o CompleteMultipartUpload.
  });

  it("chunks vazios são ignorados", () => {
    const buf = new PartBuffer();
    expect(buf.push(blobOf(0))).toBeNull();
    expect(buf.pendingBytes).toBe(0);
  });

  it("preserva o MIME type dos chunks na parte montada", () => {
    const buf = new PartBuffer();
    const part = buf.push(blobOf(MIN_PART_BYTES, "video/mp4"));
    expect(part!.blob.type).toBe("video/mp4");
  });
});
