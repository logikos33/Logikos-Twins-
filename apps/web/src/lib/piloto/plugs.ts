/**
 * Plugs do contrato v1.1 (docs/piloto/ui-contract.json) — a ponte UI↔contrato.
 *
 * Regras que este módulo torna difíceis de violar:
 * - todo interativo carrega `data-plug` com valor DESTE union (zero fora do contrato);
 * - handler ou é real, ou é `notImplemented(issue)` — nunca vazio silencioso;
 * - em listas o plug vai POR ITEM (o chamador usa plugProps em cada linha).
 *
 * Os 46 plugs do v1 entram aqui verbatim quando o export do Design for
 * commitado (issue #12) — este union cresce, nada se renomeia.
 */

export const PLUGS_V11 = [
  "capture.permission.request",
  "job.recapture",
  "search.open",
  "shared.search.open",
  "layers.set",
  "viewer.pin.open",
  "admin.project.open",
  "admin.job.provenance.copy",
  "admin.nav.projects",
  "admin.nav.jobs",
  "admin.nav.links",
  "admin.nav.config",
] as const;

export type PlugId = (typeof PLUGS_V11)[number];

export interface PlugProps {
  "data-plug": PlugId;
  onClick: (ev: { preventDefault?: () => void }) => void;
}

/** Atributos prontos para o JSX: `<button {...plugProps("job.recapture", fn)}>` */
export function plugProps(plug: PlugId, handler: PlugProps["onClick"]): PlugProps {
  return { "data-plug": plug, onClick: handler };
}

/**
 * Handler declaradamente pendente: loga a pendência com o número da issue e
 * não faz nada — visível no console de DEV, impossível de confundir com bug.
 */
export function notImplemented(plug: PlugId, issue: number): PlugProps["onClick"] {
  return () => {
    console.warn(`[piloto] plug ${plug} ainda sem endpoint — issue #${issue}`);
  };
}
