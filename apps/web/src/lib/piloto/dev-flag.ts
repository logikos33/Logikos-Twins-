/**
 * Guard do /dev/states: superfície de DEV com dados fake NUNCA vai a produção.
 * Função pura para o teste provar o 404 sem renderizar server component.
 */
export function devStatesEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.DEV_STATES,
): boolean {
  return nodeEnv === "development" || flag === "1";
}
