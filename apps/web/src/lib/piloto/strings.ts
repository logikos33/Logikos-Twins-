/**
 * Dicionário de UI do piloto — espelho tipado do strings.json do export do
 * Design (snapshot em design/piloto-mobile/; cópia viva aqui). Regra do gate:
 * ZERO literal de UI no JSX das telas convertidas — tudo passa por `t()`.
 */

import strings from "./strings.json";

type Dict = typeof strings;

/** t("entry", "capture") — tipado por seção; arrays saem como readonly string[]. */
export function t<S extends keyof Dict, K extends keyof Dict[S]>(section: S, key: K): Dict[S][K] {
  return strings[section][key];
}

export const STRINGS: Dict = strings;
