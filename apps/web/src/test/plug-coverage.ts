/**
 * Gate de cobertura de plugs da Camada B (contrato v1.2).
 *
 * Para uma tela renderizada num estado:
 * - todo plug esperado do estado aparece EXATAMENTE 1× (em listas, o teste da
 *   tela renderiza 1 item — produção aplica por item);
 * - ZERO data-plug fora do contrato (screens + extraPlugs do v1.2);
 * - a raiz carrega data-screen e data-state.
 *
 * Provado FALHANDO antes de passar (remoção de plug → vermelho) — ver o teste
 * da tela correspondente.
 */

// Cópia VIVA do contrato dentro do app: o build do Railway usa rootDirectory
// apps/web e não enxerga docs/ (deploy dos merges #48/#49 quebrou nisso).
// O teste de sincronização abaixo impede divergência com a canônica.
import contract from "../lib/piloto/ui-contract.json";

type Screen = { id: string; plugs: string[]; states: string[] };

const SCREENS: Screen[] = (contract as { screens: Screen[] }).screens;
const EXTRA_PLUGS = Object.keys(
  (contract as { extraPlugs: Record<string, unknown> }).extraPlugs,
);
const ALL_PLUGS = new Set<string>([...SCREENS.flatMap((s) => s.plugs), ...EXTRA_PLUGS]);

export function contractScreen(id: string): Screen {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) throw new Error(`tela fora do contrato: ${id}`);
  return s;
}

export interface PlugCheck {
  missing: string[];
  duplicated: string[];
  foreign: string[];
  rootOk: boolean;
}

/** Varre o DOM renderizado e compara com o contrato. */
export function checkPlugs(
  container: HTMLElement,
  screenId: string,
  state: string,
  expectedPlugs: readonly string[],
): PlugCheck {
  const found = new Map<string, number>();
  for (const el of Array.from(container.querySelectorAll("[data-plug]"))) {
    const p = el.getAttribute("data-plug") ?? "";
    found.set(p, (found.get(p) ?? 0) + 1);
  }
  const missing = expectedPlugs.filter((p) => !found.has(p));
  const duplicated = expectedPlugs.filter((p) => (found.get(p) ?? 0) > 1);
  const foreign = [...found.keys()].filter((p) => !ALL_PLUGS.has(p));
  const root = container.querySelector(`[data-screen="${screenId}"]`);
  const rootOk = root?.getAttribute("data-state") === state;
  return { missing, duplicated, foreign, rootOk };
}

/** Falha legível para o expect da tela. */
export function assertPlugs(check: PlugCheck): void {
  const problemas: string[] = [];
  if (check.missing.length) problemas.push(`faltando: ${check.missing.join(", ")}`);
  if (check.duplicated.length)
    problemas.push(`duplicados: ${check.duplicated.join(", ")}`);
  if (check.foreign.length)
    problemas.push(`FORA DO CONTRATO: ${check.foreign.join(", ")}`);
  if (!check.rootOk) problemas.push("raiz sem data-screen/data-state corretos");
  if (problemas.length)
    throw new Error(`gate de plugs reprovou — ${problemas.join(" · ")}`);
}
