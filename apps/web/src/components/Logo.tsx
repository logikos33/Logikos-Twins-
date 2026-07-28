/**
 * Logo LOGIKOS — geometria oficial extraída do Manual da Marca (board Miro).
 *
 * Três peças do sistema: wordmark (Λ no ângulo do lambda + O-fechadura + GIKOS),
 * símbolo (Λ inscrito no círculo) e o sufixo de produto "TWINS" no estilo da
 * tagline do manual (mono, uppercase, tracking .34em, ciano) — este último é
 * [extensão do manual] registrada em docs/design/RELATORIO-DESIGN.md (q1).
 *
 * Regras do manual: wordmark ≥ 90px de largura; símbolo ≥ 20px; nunca rotacionar,
 * distorcer, recolorir fora da paleta ou aplicar sombras. Tudo em currentColor.
 */

function KeyholeMask({ id }: { id: string }) {
  return (
    <mask id={id}>
      <rect width="100" height="100" fill="white" />
      <g transform="translate(24,22.4) scale(0.52)">
        <path d="M40 55.3 A20 20 0 1 1 60 55.3 L67 88 L33 88 Z" fill="black" />
      </g>
    </mask>
  );
}

/** Λ inscrito no círculo — para headers e espaços pequenos (mínimo 20px). */
export function LogoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="currentColor"
        strokeWidth="5.5"
      />
      <polyline
        points="27,79 50,27 73,79"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/**
 * Wordmark ΛOGIKOS (+ sufixo TWINS opcional). O tamanho segue o font-size do
 * elemento: `<LogoWordmark className="text-xl" />`.
 */
export function LogoWordmark({
  className = "",
  withTwins = true,
}: {
  className?: string;
  withTwins?: boolean;
}) {
  const maskId = "lgk-keyhole";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap font-display font-bold tracking-[0.16em] ${className}`}
      aria-label={withTwins ? "Logikos Twins" : "Logikos"}
    >
      <svg
        viewBox="20 16 76 82"
        className="mr-[0.1em] h-[0.9em] w-[0.8em]"
        aria-hidden="true"
      >
        <polyline
          points="58,22 30,90 86,90"
          fill="none"
          stroke="currentColor"
          strokeWidth="13"
          strokeLinejoin="miter"
        />
      </svg>
      <svg
        viewBox="0 0 100 100"
        className="mr-[0.14em] h-[0.8em] w-[0.8em]"
        aria-hidden="true"
      >
        <defs>
          <KeyholeMask id={maskId} />
        </defs>
        <circle cx="50" cy="50" r="44" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
      <span aria-hidden="true">GIKOS</span>
      {withTwins && (
        <em className="ml-[0.9em] -translate-y-[0.1em] font-mono text-[0.44em] font-medium not-italic tracking-[0.34em] text-cyan">
          TWINS
        </em>
      )}
    </span>
  );
}
