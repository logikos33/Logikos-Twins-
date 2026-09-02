/**
 * Códigos de erro do CONTRATO (ui-contract.json v1.1) — derivados por varredura
 * de TODO erro que o backend/worker produz hoje (tabela completa: ESTADO.md).
 *
 * Regra do contrato: erro sem mapeamento cai em código genérico LEGÍVEL —
 * nunca tela branca, nunca string técnica crua do worker na cara do usuário
 * (hoje o errorMsg do job FAILED chega verbatim, com stderr de ffmpeg e path
 * de /tmp — este módulo é o que estanca isso).
 */

export const ERROR_CODES = [
  "invalid-body",
  "not-found",
  "unauthorized-webhook",
  "limit-exceeded",
  "unsupported-media",
  "upload-conflict",
  "dispatch-failed",
  "processing-failed",
  "upload-abandoned",
  "viewer-load-failed",
  "internal-error",
  "unknown",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Mensagem de PRODUTO por código — a string técnica fica no log/metrics. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "invalid-body": "O aplicativo enviou dados que o servidor não entendeu. Recarregue a página.",
  "not-found": "Scan não encontrado. O link pode estar incompleto, vencido ou o scan foi removido.",
  "unauthorized-webhook": "Chamada interna não autorizada.",
  "limit-exceeded": "Um limite do piloto foi atingido (tamanho, duração ou scans por dia).",
  "unsupported-media": "Formato de vídeo não suportado — use MP4, WebM ou MOV.",
  "upload-conflict": "Este scan não aceita mais envio — grave um novo.",
  "dispatch-failed":
    "O vídeo chegou, mas o processamento não pôde ser iniciado. Tente de novo em instantes.",
  "processing-failed": "O processamento falhou. Grave de novo — se repetir, fale com o operador.",
  "upload-abandoned": "A gravação foi abandonada antes do envio terminar.",
  "viewer-load-failed": "Não foi possível carregar o mapa. O link continua válido — tente de novo.",
  "internal-error": "Algo falhou do nosso lado. Tente de novo em instantes.",
  unknown: "Algo inesperado aconteceu. Tente de novo — se repetir, fale com o operador.",
};

/** Padrões dos errorMsg persistidos no banco (texto de produto já estável). */
const SCAN_ERROR_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/não pôde ser iniciado/i, "dispatch-failed"],
  [/Gravação abandonada/i, "upload-abandoned"],
  [/excede o limite/i, "limit-exceeded"],
  // Famílias técnicas do worker (chegam verbatim do pipeline — issue de contrato):
  [/ffmpeg|normaliz|frame|extra[çc]|blur|YuNet|infer|motor|GPU|CUDA|sm75|artifact|NPZ|npz|upload|boto|S3/i,
    "processing-failed"],
];

/** errorMsg persistido do scan → código do contrato. Total, com fallback legível. */
export function mapScanError(errorMsg: string | null | undefined): ErrorCode {
  if (!errorMsg) return "unknown";
  for (const [re, code] of SCAN_ERROR_PATTERNS) {
    if (re.test(errorMsg)) return code;
  }
  return "processing-failed"; // errorMsg só existe em falha de job/upload — família certa
}

/** Resposta HTTP de erro das rotas → código do contrato. Total, com fallback. */
export function mapHttpError(status: number, bodyError?: string): ErrorCode {
  switch (status) {
    case 400:
      return "invalid-body";
    case 401:
      return "unauthorized-webhook";
    case 404:
      return "not-found";
    case 409:
      return "upload-conflict";
    case 413:
    case 422:
    case 429:
      return "limit-exceeded";
    case 415:
      return "unsupported-media";
    case 500:
      return "internal-error";
    default:
      return bodyError ? mapScanError(bodyError) : "unknown";
  }
}
