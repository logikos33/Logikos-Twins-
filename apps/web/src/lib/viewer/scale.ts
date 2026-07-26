/**
 * Escala métrica do scan — a conta pura da calibração (spec D4).
 *
 * A nuvem sai do motor em unidades arbitrárias. A calibração manual pega dois pontos
 * clicados cuja distância REAL o usuário conhece (batente de porta, azulejo) e deriva
 * o fator unidades→metros. Tudo aqui é puro e testado; o viewer só chama.
 */

export type Vec3 = { x: number; y: number; z: number };

export type ScaleInfo = {
  factor: number;
  method: "none" | "reference_distance" | "aruco";
  refPoints?: [Vec3, Vec3];
};

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Fator de escala a partir de uma referência: `realMeters` é o que o usuário mediu
 * no mundo; os dois pontos são onde ele clicou na nuvem.
 */
export function calibrationFactor(a: Vec3, b: Vec3, realMeters: number): number {
  const sceneUnits = distance(a, b);
  if (sceneUnits <= 1e-9) {
    throw new Error(
      "Os dois pontos de referência coincidem — clique em pontos distintos.",
    );
  }
  if (realMeters <= 0) {
    throw new Error("A distância real precisa ser positiva.");
  }
  return realMeters / sceneUnits;
}

/** Converte uma distância da cena para exibição, conforme a calibração. */
export function formatMeasurement(sceneUnits: number, scale: ScaleInfo | null): string {
  if (!scale || scale.method === "none" || !scale.factor) {
    return `${sceneUnits.toFixed(2)} u`;
  }
  const meters = sceneUnits * scale.factor;
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
  return `${meters.toFixed(2)} m`;
}
