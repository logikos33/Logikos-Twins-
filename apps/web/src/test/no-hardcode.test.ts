import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate estático da Camada B: nas telas CONVERTIDAS, zero literal de UI no JSX
 * (texto vem de strings.ts) e zero hex de cor (só var(--color-*)/utilitários).
 * A lista cresce a cada tela mergeada.
 */

const RAIZ = join(__dirname, "..");
export const ARQUIVOS_CONVERTIDOS = [
  "app/entry/EntryClient.tsx",
  "app/entry/page.tsx",
  "components/piloto/MapChip.tsx",
  "app/new/CaptureView.tsx",
  "app/new/CaptureClient.tsx",
  "components/piloto/StateChip.tsx",
];

// Texto cru como filho de JSX: >  palavra(s) com ≥3 letras  <  (símbolos soltos passam).
const TEXTO_CRU = /(?<!=)>\s*[A-Za-zÀ-ÿ][A-Za-zà-ÿA-ZÀ-Ÿ '’-]{2,}/u;
const HEX = /#[0-9a-fA-F]{3,8}\b/;

describe("gate estático — zero literal e zero hex nas telas convertidas", () => {
  for (const rel of ARQUIVOS_CONVERTIDOS) {
    const src = readFileSync(join(RAIZ, rel), "utf8");
    // comentários fora do jogo (têm PT-BR legítimo)
    const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    it(`${rel}: sem texto de UI hardcoded`, () => {
      const m = semComentarios.match(TEXTO_CRU);
      expect(m, m ? `literal achado: "${m[0]}"` : undefined).toBeNull();
    });

    it(`${rel}: sem hex de cor`, () => {
      const m = semComentarios.match(HEX);
      expect(m, m ? `hex achado: "${m[0]}"` : undefined).toBeNull();
    });
  }
});
