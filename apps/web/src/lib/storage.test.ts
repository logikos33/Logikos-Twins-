import { describe, expect, it } from "vitest";
import { keys, MIN_PART_BYTES } from "./storage";

/**
 * A convenção de chaves existe em DOIS lugares — aqui e em
 * `fake-runpod/artifacts.py` (e no worker real, a partir da D3). Estes testes
 * congelam o formato: se alguém mudar de um lado, o teste quebra e aponta o
 * outro lado antes que o viewer procure um arquivo que ninguém subiu.
 */
describe("convenção de chaves de artefato", () => {
  const id = "0f8c2a4e-1111-2222-3333-444455556666";

  it("espelha exatamente o formato usado pelo lado Python", () => {
    expect(keys.video(id)).toBe(`videos/${id}.mp4`);
    expect(keys.video(id, "webm")).toBe(`videos/${id}.webm`);
    expect(keys.cloudPreview(id)).toBe(`scans/${id}/cloud_preview.ply`);
    expect(keys.cloudFull(id)).toBe(`scans/${id}/cloud_full.ply.gz`);
    expect(keys.poses(id)).toBe(`scans/${id}/poses.json`);
    expect(keys.meta(id)).toBe(`scans/${id}/meta.json`);
    expect(keys.keyframe(id, 42)).toBe(`scans/${id}/keyframes/42.jpg`);
    expect(keys.thumbnail(id)).toBe(`scans/${id}/thumb.jpg`);
  });

  it("agrupa todos os artefatos de um scan sob o mesmo prefixo", () => {
    // A retenção (D7) apaga `videos/{id}` e preserva `scans/{id}/` inteiro.
    // Um artefato fora do prefixo escaparia da regra — ou seria apagado por engano.
    const prefix = keys.artifactPrefix(id);
    for (const key of [
      keys.cloudPreview(id),
      keys.cloudFull(id),
      keys.poses(id),
      keys.meta(id),
      keys.keyframe(id, 0),
      keys.thumbnail(id),
    ]) {
      expect(key.startsWith(prefix)).toBe(true);
    }
    expect(keys.video(id).startsWith(prefix)).toBe(false);
  });
});

describe("restrições do multipart S3", () => {
  it("o mínimo por parte é 5 MB — restrição do protocolo, não escolha nossa", () => {
    // Se alguém "otimizar" este número para baixo, o CompleteMultipartUpload
    // passa a falhar com EntityTooSmall em uploads reais de mais de uma parte.
    expect(MIN_PART_BYTES).toBe(5 * 1024 * 1024);
  });
});
