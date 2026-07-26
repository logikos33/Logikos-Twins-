import { describe, expect, it } from "vitest";
import { cameraPosition, nearestKeyframe, type PosesFile } from "./poses";

/**
 * Poses no formato da fixture: câmeras em posições simples para o "mais próximo"
 * ser verificável de cabeça.
 */
function posesAt(positions: [number, number, number][], keyframes: number[]): PosesFile {
  return {
    frames: positions.map(([x, y, z], i) => ({
      i,
      t_s: i / 8,
      c2w: [
        [1, 0, 0, x],
        [0, 1, 0, y],
        [0, 0, 1, z],
      ],
      K: [
        [400, 0, 259],
        [0, 400, 194],
        [0, 0, 1],
      ],
    })),
    keyframes,
  };
}

describe("nearestKeyframe — a foto-evidência do pin", () => {
  it("escolhe o keyframe cuja câmera está mais perto do ponto", () => {
    const poses = posesAt(
      [
        [0, 0, 1.5],
        [2, 0, 1.5],
        [4, 0, 1.5],
        [6, 0, 1.5],
      ],
      [0, 2],
    );
    // Ponto perto do frame 3 — mas 3 NÃO é keyframe; o mais próximo COM FOTO é o 2.
    expect(nearestKeyframe(poses, { x: 5.5, y: 0, z: 1.0 })).toBe(2);
    expect(nearestKeyframe(poses, { x: 0.2, y: 0, z: 1.0 })).toBe(0);
  });

  it("falha alto num scan sem keyframes", () => {
    const poses = posesAt([[0, 0, 1.5]], []);
    expect(() => nearestKeyframe(poses, { x: 0, y: 0, z: 0 })).toThrow(/sem keyframes/);
  });

  it("cameraPosition lê a 4ª coluna da c2w", () => {
    const poses = posesAt([[1.5, 2.5, 3.5]], [0]);
    expect(cameraPosition(poses.frames[0]!)).toEqual({ x: 1.5, y: 2.5, z: 3.5 });
  });
});
