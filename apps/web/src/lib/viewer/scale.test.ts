import { describe, expect, it } from "vitest";
import { calibrationFactor, distance, formatMeasurement } from "./scale";

/**
 * O teste de medição da spec D4: a parede da cena sintética tem 6,0 unidades por
 * construção. Calibrando com uma referência conhecida, a medição da parede tem que
 * dar o valor real com erro < 2%.
 */
describe("calibração de escala — o caso da cena sintética", () => {
  it("parede de 6 u calibrada com referência de 2 u = 1,6 m mede 4,80 m", () => {
    // O usuário clica nos dois cantos da mesa (2,0 u de distância na cena) e informa
    // que na realidade são 1,6 m → fator 0,8.
    const factor = calibrationFactor(
      { x: 1.0, y: 1.0, z: 0.4 },
      { x: 3.0, y: 1.0, z: 0.4 },
      1.6,
    );
    expect(factor).toBeCloseTo(0.8, 10);

    // A parede de 6 u então mede 4,8 m — erro zero na conta pura; o < 2% da spec
    // absorve o erro de CLIQUE, não o da matemática.
    const wall = distance({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 });
    const shown = formatMeasurement(wall, {
      factor,
      method: "reference_distance",
    });
    expect(shown).toBe("4.80 m");

    const meters = wall * factor;
    expect(Math.abs(meters - 4.8) / 4.8).toBeLessThan(0.02);
  });

  it("sem calibração, mostra unidades relativas", () => {
    expect(formatMeasurement(2.5, null)).toBe("2.50 u");
    expect(formatMeasurement(2.5, { factor: 0, method: "none" })).toBe("2.50 u");
  });

  it("distâncias curtas viram centímetros", () => {
    expect(formatMeasurement(0.5, { factor: 1, method: "reference_distance" })).toBe(
      "50.0 cm",
    );
  });

  it("pontos coincidentes são recusados com mensagem acionável", () => {
    const p = { x: 1, y: 1, z: 1 };
    expect(() => calibrationFactor(p, { ...p }, 1.0)).toThrow(/pontos distintos/);
  });

  it("distância real não-positiva é recusada", () => {
    expect(() =>
      calibrationFactor({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0),
    ).toThrow(/positiva/);
  });
});
