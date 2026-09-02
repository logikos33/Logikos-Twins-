import { DiagClient } from "./DiagClient";

export const dynamic = "force-static";

/** Diagnóstico de captura (bloco 1): imprime o que o navegador diz — nada sobe
 * ao servidor, nada é coletado. Existe para o usuário mandar um print. */
export default function DiagPage() {
  return <DiagClient />;
}
