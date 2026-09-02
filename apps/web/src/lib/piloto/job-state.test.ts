import { describe, expect, it } from "vitest";
import { canTransition, fromScanStatus, transition, type JobState } from "./job-state";

describe("fromScanStatus — todo status do banco cai num estado do contrato", () => {
  it("recording e uploading viram uploading", () => {
    expect(fromScanStatus("recording").kind).toBe("uploading");
    expect(fromScanStatus("uploading", { sentParts: 3 })).toEqual({
      kind: "uploading",
      sentParts: 3,
    });
  });

  it("uploaded e queued viram queued", () => {
    expect(fromScanStatus("uploaded").kind).toBe("queued");
    expect(fromScanStatus("queued").kind).toBe("queued");
  });

  it("processing carrega a etapa (progresso é a etapa, nunca porcentagem)", () => {
    expect(fromScanStatus("processing", { stage: "infer" })).toEqual({
      kind: "processing",
      stage: "infer",
    });
    expect(fromScanStatus("postprocessing").kind).toBe("processing");
  });

  it("error sem código mapeado cai no genérico LEGÍVEL, nunca em branco", () => {
    expect(fromScanStatus("error")).toEqual({ kind: "failed", code: "unknown" });
  });
});

describe("transições — inválida é irrepresentável/lança, nunca silenciosa", () => {
  it("uploading pausa offline e retoma", () => {
    expect(canTransition("uploading", "upload-paused-offline")).toBe(true);
    expect(canTransition("upload-paused-offline", "uploading")).toBe(true);
  });

  it("terminais não têm saída", () => {
    for (const t of ["completed", "failed", "cancelled"] as const) {
      expect(canTransition(t, "queued")).toBe(false);
      expect(canTransition(t, "processing")).toBe(false);
    }
  });

  it("pular etapas lança com mensagem nomeando a transição", () => {
    const uploading: JobState = { kind: "uploading", sentParts: 1 };
    expect(() => transition(uploading, { kind: "completed" })).toThrow(
      "uploading → completed",
    );
  });

  it("queued não volta a uploading (upload já fechou)", () => {
    expect(canTransition("queued", "uploading")).toBe(false);
  });
});
