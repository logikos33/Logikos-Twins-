import type { Vec3 } from "./scale";

/**
 * Trajetória e keyframes — leitura do poses.json e a conta do "keyframe mais
 * próximo" (a foto-evidência de um pin é o keyframe cuja câmera estava mais perto
 * do ponto anotado). Puro e testado.
 */

export type FramePose = {
  i: number;
  t_s: number;
  /** 3×4 camera-to-world */
  c2w: number[][];
  K: number[][];
};

export type PosesFile = {
  frames: FramePose[];
  keyframes: number[];
};

/** Posição da câmera de um frame (a 4ª coluna da c2w). */
export function cameraPosition(pose: FramePose): Vec3 {
  return {
    x: pose.c2w[0]![3]!,
    y: pose.c2w[1]![3]!,
    z: pose.c2w[2]![3]!,
  };
}

/**
 * O keyframe cuja câmera está mais próxima do ponto dado.
 * Só keyframes contam — são os únicos frames com JPEG salvo.
 */
export function nearestKeyframe(poses: PosesFile, point: Vec3): number {
  if (poses.keyframes.length === 0) {
    throw new Error("scan sem keyframes");
  }
  let bestIdx = poses.keyframes[0]!;
  let bestDist = Infinity;
  for (const kf of poses.keyframes) {
    const pose = poses.frames[kf];
    if (!pose) continue;
    const cam = cameraPosition(pose);
    const dx = cam.x - point.x;
    const dy = cam.y - point.y;
    const dz = cam.z - point.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = kf;
    }
  }
  return bestIdx;
}
