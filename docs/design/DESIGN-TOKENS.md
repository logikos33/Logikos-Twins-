# DESIGN-TOKENS — Logikos Twins

Tradução do **Manual da Marca LOGIKOS (v1.0, julho 2026)** para o produto, em tokens Tailwind CSS 4 (`@theme`).
Fonte oficial consultada: board Miro **"LOGIKOS — Manual da Marca"** (`https://miro.com/app/board/uXjVH5gqWPE=/`) — lido na íntegra nesta execução (página HTML empacotada no board, incluindo paleta nomeada, sistema de logo em SVG, tipografia e regras de motion).

Convenções deste documento:

- **[manual]** — valor definido literalmente no manual.
- **[extensão do manual]** — o manual é omisso para este caso de produto; proposta mínima coerente, sujeita a validação do Vitor.
- Contraste verificado programaticamente (WCAG 2.1). Tabela completa na §8.

---

## 1. Princípios herdados do manual (governam tudo abaixo)

1. **Proporção de uso: 70% preto · 20% branco-cinza · 10% acento.** O acento **nunca vira fundo de página**. [manual]
2. **Magenta `#FF2E63` ("Magenta Glitch") aparece apenas no glitch e em micro-detalhes.** [manual] — a tradução para o produto (§3.2) trata gravação/erro como os "micro-detalhes" críticos do produto. [extensão do manual]
3. **Tom de voz:** direto, técnico sem jargão, frases curtas, números quando há números. "A marca prova, não promete." [manual] — vale para toda microcopy, inclusive estados de espera (nunca inventar progresso).
4. **Motion de marca:** curto e seco (`steps()`, não easing suave), 0,4–0,6 s, sempre terminando em repouso; glitch nunca em loop. [manual] — navegação 3D usa easing suave por ser motion *funcional*, não de marca (ver MOTION-SPEC §1). [extensão do manual]
5. **Personalidade:** "o encontro entre um filósofo grego e um engenheiro de IA" — racional, precisa, discreta-mas-confiante. Nada de UI barulhenta.

---

## 2. Bloco `@theme` completo (colar em `src/app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* ── Cores da marca [manual] ─────────────────────────────── */
  --color-ink:            #0a0a0f;  /* Preto Logikos — fundo base    */
  --color-graphite:       #14141c;  /* Grafite — superfície 1        */
  --color-signal:         #f4f6f8;  /* Branco Sinal — texto primário */
  --color-mist:           #8a8f98;  /* Cinza Névoa — texto secundário*/
  --color-cyan:           #00e5ff;  /* Ciano Visão — acento primário */
  --color-cyan-deep:      #0091ad;  /* Ciano Profundo — hover/pressed*/
  --color-magenta:        #ff2e63;  /* Magenta Glitch                */

  /* ── Superfícies e papéis semânticos ─────────────────────── */
  --color-bg:             var(--color-ink);
  --color-surface-1:      var(--color-graphite);
  --color-surface-2:      #23242f;  /* superfície elevada [extensão do manual] */
  --color-text:           var(--color-signal);
  --color-text-muted:     var(--color-mist);
  --color-text-faint:     #5c6470;  /* SOMENTE desabilitados/decoração — 3,3:1, não usar em texto informativo [extensão] */
  --color-line:           color-mix(in oklab, var(--color-signal) 8%, transparent);   /* bordas 1px */
  --color-line-strong:    color-mix(in oklab, var(--color-signal) 16%, transparent);

  /* ── Acentos funcionais ──────────────────────────────────── */
  --color-accent:         var(--color-cyan);       /* CTA, links, foco, seleção */
  --color-accent-press:   var(--color-cyan-deep);  /* hover/active de CTA [manual: "hover"] */
  --color-on-accent:      var(--color-ink);        /* texto sobre ciano (12,8:1) */
  --color-record:         var(--color-magenta);    /* botão de gravar + indicador ao vivo [extensão] */
  --color-danger:         var(--color-magenta);    /* erro — ícones, bordas, fills de chip [extensão] */
  --color-danger-text:    #ff5c85;  /* texto de erro sobre superfícies (≥5,2:1) [extensão] */
  --color-success:        #2ee6a3;  /* verde-menta: pronto/confirmações [extensão] */
  --color-warning:        #ffb224;  /* âmbar: fila/quotas/atenção [extensão] */

  /* ── Status do scan (8 estados da API) ───────────────────── */
  --color-status-created:    var(--color-mist);     /* criado */
  --color-status-recording:  var(--color-magenta);  /* gravando (ao vivo) */
  --color-status-uploading:  var(--color-cyan);     /* recebendo */
  --color-status-queued:     var(--color-warning);  /* na fila */
  --color-status-processing: var(--color-cyan);     /* reconstruindo (com pulso) */
  --color-status-finalizing: var(--color-cyan);     /* finalizando */
  --color-status-done:       var(--color-success);  /* pronto */
  --color-status-failed:     var(--color-magenta);  /* falhou */

  /* ── Classes de detecção (cor estável por rótulo) [extensão] ─
     Paleta categórica que NÃO colide com o ciano de UI.
     Atribuição: hash(label) % 8; overrides semânticos permitidos
     (ex.: extintor → --color-class-6). Todas ≥7:1 sobre o fundo. */
  --color-class-0:        #5aa9ff;  /* azul     */
  --color-class-1:        #3ddc97;  /* verde    */
  --color-class-2:        #b78bfa;  /* roxo     */
  --color-class-3:        #ff9f43;  /* laranja  */
  --color-class-4:        #ffd166;  /* amarelo  */
  --color-class-5:        #ff7ab8;  /* rosa     */
  --color-class-6:        #f87171;  /* vermelho-claro (extintor) */
  --color-class-7:        #a3e635;  /* lima     */

  /* ── Tipografia [manual: 3 vozes] ────────────────────────── */
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; /* títulos, wordmark — pesos 400/500/700 */
  --font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;         /* corpo, UI — pesos 400/500/600 */
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;             /* dados, medições, códigos — pesos 400/500 */

  /* Escala tipográfica (mobile-first; desktop pode subir 1 passo) */
  --text-2xs: 0.6875rem;  --text-2xs--line-height: 1rem;      /* 11px labels mono uppercase */
  --text-xs:  0.75rem;    --text-xs--line-height: 1.05rem;    /* 12px legendas, LGPD */
  --text-sm:  0.8125rem;  --text-sm--line-height: 1.2rem;     /* 13px secundário, chips */
  --text-base: 0.9375rem; --text-base--line-height: 1.45rem;  /* 15px corpo */
  --text-lg:  1.0625rem;  --text-lg--line-height: 1.5rem;     /* 17px corpo destacado */
  --text-xl:  1.25rem;    --text-xl--line-height: 1.65rem;    /* 20px h2 */
  --text-2xl: 1.5rem;     --text-2xl--line-height: 1.9rem;    /* 24px h1 mobile */
  --text-3xl: 1.875rem;   --text-3xl--line-height: 2.25rem;   /* 30px display mobile */
  --text-4xl: 2.375rem;   --text-4xl--line-height: 2.7rem;    /* 38px display desktop */
  --text-timer: 2.5rem;   --text-timer--line-height: 1;       /* 40px timer de gravação (mono) */

  /* ── Raios ───────────────────────────────────────────────── */
  --radius-sm: 8px;   /* chips, inputs pequenos  */
  --radius-md: 12px;  /* botões, inputs          */
  --radius-lg: 16px;  /* cards                   */
  --radius-xl: 24px;  /* sheets, painéis do HUD  */

  /* ── Sombras (dark: elevação = borda + véu, nunca blur pesado) ── */
  --shadow-card:  0 1px 0 rgb(244 246 248 / 0.06) inset, 0 8px 24px rgb(0 0 0 / 0.45);
  --shadow-sheet: 0 -1px 0 rgb(244 246 248 / 0.08) inset, 0 -12px 32px rgb(0 0 0 / 0.5);
  --shadow-focus: 0 0 0 2px var(--color-ink), 0 0 0 4px var(--color-cyan); /* anel de foco */

  /* ── Motion [manual §10 + extensão funcional] ────────────── */
  --ease-brand:   steps(3, end);                    /* glitch/reveals de marca [manual] */
  --ease-out:     cubic-bezier(0.22, 1, 0.36, 1);   /* entradas de painéis/cards */
  --ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);   /* trocas de estado */
  --ease-fly:     cubic-bezier(0.4, 0, 0.2, 1);     /* voos de câmera 3D [extensão] */
  --duration-fast:   120ms;   /* feedback de toque */
  --duration-base:   200ms;   /* chips, toggles    */
  --duration-slow:   320ms;   /* sheets, cards     */
  --duration-glitch: 500ms;   /* entrada de logo/título [manual: 0,4–0,6 s] */
  --duration-fly:    1200ms;  /* voo de câmera (busca) */
  --duration-reveal: 2400ms;  /* revelação processando→mapa */
}

/* Fora do @theme (variáveis utilitárias, não geram classes): */
:root {
  --tap: 44px;             /* alvo mínimo de toque (contrato nº 4) */
  --z-canvas: 0;           /* mapa 3D (ViewerEngine)               */
  --z-hud: 10;             /* barras/dock/chips                    */
  --z-sheet: 20;           /* sheets/popovers                      */
  --z-toast: 30;           /* toasts/erros                         */
  --grid-grego: repeating-linear-gradient(66deg,
      transparent 0 26px, rgb(20 20 28 / 0.9) 26px 27px);
  /* textura "grid grego" [manual §8]: diagonais no ângulo do Λ,
     Grafite sobre Preto, quase invisível — capas, hero, telas de espera */
}
```

---

## 3. Racional das decisões de cor

### 3.1 Papéis neutros

| Token | Valor | Papel | Origem |
|---|---|---|---|
| `bg` | `#0a0a0f` | Fundo de todas as páginas. "O preto não é puro: levemente azulado." | [manual] |
| `surface-1` | `#14141c` | Cards, barras, dock do viewer | [manual] |
| `surface-2` | `#23242f` | Sheets, inputs, chips, hover de card | [extensão do manual] — o manual define só dois níveis; o produto precisa de um terceiro para hierarquia de sheets sobre cards. Mantém o matiz azulado da família. |
| `text` | `#f4f6f8` | Texto primário (18,2:1 sobre `bg`) | [manual] |
| `text-muted` | `#8a8f98` | Secundário — passa AA em todas as superfícies (6,1 / 5,6 / 4,7:1) | [manual] |
| `text-faint` | `#5c6470` | **Só** desabilitados e decoração (3,3:1 — abaixo de AA de propósito; WCAG isenta controles desabilitados) | [extensão] |

### 3.2 Magenta: a tradução mais sensível

O manual restringe `#FF2E63` a "glitch e micro-detalhes" **na marca**. O produto, porém, precisa de:
(a) um **botão de gravar** — o componente mais importante do produto; (b) estados de **erro**.

Tradução proposta [extensão do manual]:

- **`record`/`danger` = #FF2E63**, com orçamento visual de micro-detalhe: botão de gravar, ponto pulsante "ao vivo", timer nos últimos 15 s, bordas/ícones de erro, chip "falhou". Nunca em áreas grandes, nunca como fundo. Isso preserva a regra 70/20/10 e conversa com a convenção universal de REC vermelho.
- **`danger-text` = #FF5C85** — `#FF2E63` como *texto* sobre `surface-2` fica em 4,27:1 (reprova AA por pouco). Para parágrafos/mensagens de erro sobre superfícies usa-se este tom clareado (5,2–6,7:1). `#FF2E63` continua válido para texto sobre `bg`/`surface-1` (5,5 / 5,1:1) e para grafismos.
- Texto **sobre** magenta (chip "falhou" preenchido): usar `ink` `#0a0a0f` (5,5:1). **Nunca branco** (3,6:1 — reprova AA de texto normal).

### 3.3 Ciano: acento único de interação

- CTA primário: fill `#00e5ff` + texto `ink` (12,8:1). Hover/pressed: `#0091ad` [manual chama de "hover"] + texto `ink` (5,3:1).
- Links, seleção, anel de foco, trajetória do percurso no viewer, progresso.
- Proibido: fundos grandes, texto longo em ciano, ciano + magenta juntos fora do glitch.

### 3.4 Sucesso e aviso [extensão do manual]

O manual não define verde/âmbar. Propostas: `#2ee6a3` (verde-menta, 12,2:1 — matiz frio, harmoniza com o ciano) e `#ffb224` (âmbar, 11,0:1). Chips preenchidos usam texto `ink` sobre ambos (≥10:1).

### 3.5 Status do scan (mapa completo)

| Estado (API) | Rótulo pt-BR | Cor | Anim. |
|---|---|---|---|
| `created` | criado | `mist` | — |
| `recording` | gravando | `magenta` | ponto pulsante 1 s |
| `uploading` | recebendo o vídeo | `cyan` | barra indeterminada |
| `queued` | na fila | `warning` | — |
| `processing` | reconstruindo em 3D | `cyan` | pulso 2 s |
| `finalizing` | finalizando o mapa | `cyan` | pulso 2 s |
| `done` | pronto | `success` | — |
| `failed` | falhou | `magenta` | — |

Regra: chips de status = ponto colorido + rótulo `text` sobre `surface-2` (nunca depender só da cor — acessibilidade para daltônicos; o rótulo textual é obrigatório).

### 3.6 Classes de detecção

Paleta categórica de 8 cores [extensão], todas ≥7:1 sobre o fundo (funcionam como grafismo E como chip preenchido com texto `ink`). Atribuição estável por `hash(label) % 8`; permite override semântico fixo (ex.: `extintor → class-6` vermelho-claro). O ciano **não** participa da paleta de classes — segue reservado para UI (senão o filtro "selecionado" e a classe se confundem).

---

## 4. Tipografia — as três vozes no produto

| Voz | Família | Pesos [manual] | Usos no produto |
|---|---|---|---|
| Display | Space Grotesk | 400 / 500 / 700 | Títulos de tela, "Reconstruindo o ambiente…", números-destaque, wordmark |
| UI/corpo | Inter | 400 / 500 / 600 | Todo o resto: corpo, botões, chips, formulários |
| Técnica | JetBrains Mono | 400 / 500 | **Toda medição** (3,42 m), timer, contadores (1,8 M pontos), tokens/links, labels uppercase com tracking 0.22em, confiança de detecção (92%) |

Regra de ouro: **se é um número que o sistema mediu, é mono.** Isso cria a assinatura "instrumento de engenharia" da interface.
Os três arquivos woff2 variáveis oficiais foram extraídos do manual e estão embutidos nos mocks (autocontidos); no produto, servir via `next/font/local`.

## 5. Espaçamento, raios, alvos

- Escala de espaçamento: padrão Tailwind (base 4px). Página mobile: padding lateral `16px`; gutter entre cards `12px`; seções `24–32px`.
- Raios: ver tokens (§2). Botão de gravar é círculo perfeito (`radius-full`).
- **Alvo mínimo de toque `--tap: 44px`** (contrato nº 4) — vale para chips de filtro, olho-de-senha, slider de corte (thumb visual 28px, área de toque 44px).
- Botão de gravar: **anel externo 78px** (área de toque) + disco interno 64px `record`; parar = disco vira quadrado arredondado 30px (morph 200ms `ease-in-out`).

## 6. Foco, toque e estados

- Foco visível (teclado): `--shadow-focus` (anel ciano com offset escuro) em **todo** elemento interativo.
- Toque: feedback `scale(0.97)` + `--duration-fast`; nunca remover `:focus-visible`.
- Desabilitado: `text-faint` + `opacity` de superfície; nunca cinza sobre cinza sem borda.
- Skeleton: blocos `surface-2` com shimmer sutil (opacidade 0,55→1, 1,6 s, `ease-in-out`; sem gradiente animado pesado).

## 7. Logo no produto (extraído do manual — geometria SVG oficial)

- **Wordmark** (hero da home): Λ (polyline `58,22 30,90 86,90`, stroke 13) + O-fechadura (círculo r44 com máscara fechadura) + "GIKOS" em Space Grotesk 700, tracking 0.16em. Largura mínima 90px.
- **Símbolo** (headers/canto): Λ inscrito em círculo (r45 stroke 5.5 + polyline `27,79 50,27 73,79` stroke 10). Mínimo 20px; abaixo disso, monograma sólido.
- Área de proteção 1x (x = altura do O-fechadura). Nunca rotacionar, distorcer, recolorir, sombrear. Glitch **não** entra em favicon.
- Tagline: "a razão que enxerga" — JetBrains Mono, uppercase, tracking 0.34em, ciano.

## 8. Contraste — verificação WCAG 2.1 (calculada nesta execução)

AA texto normal ≥ 4,5:1 · AA texto grande / componentes de UI ≥ 3:1.

| Par (texto / fundo) | Razão | AA | Uso |
|---|---|---|---|
| `#f4f6f8` / `#0a0a0f` | 18,23 | ✅ | texto primário / fundo |
| `#f4f6f8` / `#14141c` | 16,91 | ✅ | texto / superfície-1 |
| `#f4f6f8` / `#23242f` | 14,20 | ✅ | texto / superfície-2 |
| `#8a8f98` / `#0a0a0f` | 6,08 | ✅ | secundário / fundo |
| `#8a8f98` / `#14141c` | 5,64 | ✅ | secundário / superfície-1 |
| `#8a8f98` / `#23242f` | 4,74 | ✅ | secundário / superfície-2 |
| `#00e5ff` / `#0a0a0f` | 12,84 | ✅ | ciano / fundo (e sobre a nuvem: pontos ficam ≤ 60% de luminância do ciano) |
| `#0a0a0f` / `#00e5ff` | 12,84 | ✅ | texto sobre CTA ciano |
| `#0a0a0f` / `#0091ad` | 5,32 | ✅ | texto sobre CTA hover |
| `#ff2e63` / `#0a0a0f` | 5,48 | ✅ | magenta sobre fundo (texto e grafismo) |
| `#ff2e63` / `#14141c` | 5,08 | ✅ | magenta / superfície-1 |
| `#ff2e63` / `#23242f` | 4,27 | ⚠️ só grande/gráfico | por isso existe `danger-text` |
| `#ff5c85` / `#23242f` | 5,22 | ✅ | texto de erro / superfície-2 |
| `#0a0a0f` / `#ff2e63` | 5,48 | ✅ | texto em chip "falhou" |
| `#ffffff` / `#ff2e63` | 3,61 | ❌ texto normal | **não usar branco sobre magenta** |
| `#2ee6a3` / `#0a0a0f` | 12,19 | ✅ | sucesso |
| `#ffb224` / `#0a0a0f` | 10,95 | ✅ | aviso |
| `#5c6470` / `#0a0a0f` | 3,30 | só desabilitado | text-faint |
| classes 0–7 / `#0a0a0f` | 7,1–13,7 | ✅ | detecções e chips |

Texto sobre a nuvem de pontos: labels 3D sempre com pílula `surface-1` a 85% de opacidade atrás do texto — o contraste é garantido pela pílula, não pela sorte do fundo.

## 9. Componentes-chave (resumo de spec)

- **Botão primário**: h48, `radius-md`, fill `accent`, texto `on-accent` Inter 600 15px; hover `accent-press`; pressed scale 0.97.
- **Botão secundário**: h48, borda `line-strong`, texto `text`; hover borda ciano.
- **Botão gravar**: ver §5; estados ready→recording→finishing com morph; halo pulsante 1,6 s apenas em `recording` (opacity 0,25→0, sem blur custoso).
- **Chip de filtro**: h36 (hit 44), `radius-full`, `surface-2` + ponto da classe; selecionado = fill da cor da classe + texto `ink`.
- **Input**: h48, `surface-2`, borda `line`; foco = borda `accent` + anel; erro = borda `danger` + texto `danger-text`.
- **Toast/erro**: `surface-2`, barra lateral 3px `danger`, título Inter 600, ação "Tentar de novo" como botão-texto ciano.
- **Skeleton**: §6.
- **Sem biblioteca de componentes** (shadcn/radix): os componentes acima são pequenos o bastante para viver em `src/components/ui/`. Adicionar biblioteca = ADR (ver RELATORIO-DESIGN §4).

---

*Gerado automaticamente pela sessão de design agendada (Logikos Twins). Verificações de contraste reproduzíveis: `python3 contrast.py` (script incluído no relatório).*
