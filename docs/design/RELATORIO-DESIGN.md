# RELATÓRIO DE DESIGN — Logikos Twins

Execução autônoma (sessão agendada, 27 jul 2026). Vitor ausente; decisões registradas abaixo.

## 1. O que foi entregue

| Arquivo | Conteúdo |
|---|---|
| `DESIGN-TOKENS.md` | Tokens completos → Tailwind 4 `@theme`, papéis semânticos, status do scan, contraste WCAG AA verificado por script |
| `tela-captura.html` | `/new` com os **6 estados da §3.2** navegáveis (barra MOCK + hash `#estado=…`), incl. sub-simulação "últimos 15 s" |
| `tela-status.html` | `/scan/[id]` fase status: dramaturgia da espera (teatro em canvas com 3 cenas educativas), 6 fases + **revelação** do "pronto" |
| `tela-viewer.html` | Viewer com HUD completo da §3.3: navegar/medir/anotar, órbita/voar/planta, replay, calibração de escala, pins com foto, detecções + chips, **busca com voo + evidência**, camadas, corte por altura, compartilhar, carregando/erro |
| `tela-home.html` | `/` visitante (privacidade por design) + admin (cards com thumbs em mini-nuvem) + estado vazio |
| `tela-login.html` | `/login` rota estática: formulário, carregando, erro, esqueci-a-senha (+ confirmação de envio) — sem validação real |
| `MOTION-SPEC.md` | Os dois momentos "uau" com durações/curvas/camadas React×Engine + inventário de micro-motions |
| `RELATORIO-DESIGN.md` | Este documento |

Como usar os mocks: abrir no navegador (tudo autocontido, **fontes oficiais embutidas** — funciona offline). A pílula tracejada "MOCK" no canto alterna estados e viewport (390 px ↔ desktop); cada estado tem deep-link por hash (ex.: `tela-captura.html#estado=recording`). Telas linkam entre si no fluxo real (home → captura → status → viewer → login). Todos os estados foram verificados por screenshots renderizados (Chromium 390×844 e 1280×820) durante esta execução.

## 2. Fontes de verdade usadas

- **Manual da Marca no Miro: ACESSÍVEL e lido na íntegra.** O board contém o manual como página HTML empacotada; extraí texto completo, paleta nomeada, **geometria SVG oficial do logo** (Λ do wordmark, O-fechadura, símbolo, monograma) e os **arquivos woff2 variáveis** das 3 fontes — embutidos nos mocks (por isso a tipografia é a oficial, não uma aproximação).
- Briefing técnico embutido no prompt (inventário de telas, contratos, dados).
- Observação: o "resumo de referência" do prompt diverge do manual em 2 pontos, documentados na §3 (decisões d2 e d3).

## 3. Decisões assumidas (execução sem o Vitor)

1. **Tradução da marca adotada sem validação prévia** (o prompt pedia parada para validação; instrução da sessão mandou seguir). Interpretação mais fiel ao manual: preto profundo como base, ciano como único acento de interação, proporção 70/20/10, tom "prova, não promete", glitch só em entradas.
2. **Magenta `#FF2E63` no produto** — o manual restringe o magenta a "glitch e micro-detalhes"; o resumo do prompt o chamava de "candidato natural ao botão de gravar e alertas". Conciliação adotada: no produto, gravação ao vivo e erro **são** os micro-detalhes críticos → `record`/`danger` = magenta, com orçamento visual mínimo (nunca fundos/áreas grandes). Marcado como extensão (§4-e1).
3. **`#23242f` (superfície-2)** — o resumo do prompt o atribuía ao manual, mas o manual só define `#0A0A0F` e `#14141C`. Mantive como **extensão** coerente (§4-e2).
4. **Nome/lockup do produto**: wordmark oficial ΛOGIKOS + sufixo "TWINS" no estilo da tagline do manual (JetBrains Mono, uppercase, tracking .34em, ciano). O manual não prevê sub-marcas (§5-q1).
5. **Limite de gravação: "até 5 min"** nos textos (o briefing diz "limite de minutos" sem valor; `PLY ≤ 35 MB` sugere essa ordem). Configurável — validar (§5-q4).
6. **Card de instruções da captura** cobre a zona do botão até "Entendi" (pré-voo de 1 toque). No produto, a dispensa deve persistir (`localStorage`) para não atrasar quem já sabe usar — comportamento anotado, não implementável no mock.
7. **Espera honesta**: a barra da tela de status é **por etapas** (fatos), sem % inventada dentro de "reconstruindo"; o teatro é rotulado "como funciona" (educação, não progresso). Métricas em tempo real durante o processamento exigiriam mudança de payload da API (contrato nº 2) — ficou de fora.
8. **Sem biblioteca de componentes** (shadcn/radix): os componentes do sistema são pequenos e o custo de dependência não se justifica hoje. Se o produto ganhar formulários complexos/menus aninhados, abrir ADR então.
9. Dados fictícios plausíveis nos mocks (Galpão Norte, 1,6 M pts, confianças 78–95%) e paleta de classes com override semântico (extintor → vermelho-claro).
10. Ícones: set próprio em SVG stroke 1.6–1.8 (grid 24), seguindo "traço uniforme, cantos retos" do manual (§8 grafismos).

## 4. Extensões do manual (todas marcadas também nos tokens)

- **e1** `record`/`danger` = `#FF2E63` + `danger-text #FF5C85` (AA sobre superfícies) — ver §3.2 do DESIGN-TOKENS.
- **e2** `surface-2 #23242F` (3º nível de elevação).
- **e3** `success #2EE6A3` e `warning #FFB224` (o manual não define estados).
- **e4** Paleta categórica de 8 cores para classes de detecção (ciano excluído de propósito — reservado à UI).
- **e5** Motion funcional 3D com easing suave (voos de câmera), coexistindo com o motion seco de marca — racional no MOTION-SPEC §0.
- **e6** `text-faint #5C6470` só para desabilitados/decoração (abaixo de AA por definição).
- **e7** Lockup de produto "ΛOGIKOS TWINS" (§3-d4).
- **e8** Grid grego aplicado como fundo de telas de espera/hero/login via `repeating-linear-gradient(66deg …)` — o manual pede "capas, hero e telas de espera"; a implementação CSS é minha.

## 5. Perguntas pendentes para o Vitor

1. **q1** O lockup "ΛOGIKOS TWINS" (wordmark + sufixo mono ciano) está aprovado como sub-marca de produto? Alternativa: símbolo Λ-círculo + "Twins" em Space Grotesk.
2. **q2** Confirma magenta como cor de gravar/erro no produto (decisão d2/e1)? Alternativa conservadora: gravar em magenta e erros em um vermelho dedicado (ex.: `#f87171`), liberando o magenta só para o glitch.
3. **q3** Verde `#2EE6A3` e âmbar `#FFB224` podem entrar no manual (v1.1) como cores funcionais oficiais?
4. **q4** Valor real do limite de minutos de gravação (usei "até 5 min") e formatos aceitos no fallback (usei MP4/MOV).
5. **q5** Overrides semânticos fixos de classe além de `extintor` (ex.: `porta`, `pessoa`)? E o rótulo de pessoa deve sequer aparecer (LGPD)?
6. **q6** No desktop, `/new` pode promover o fallback de arquivo a caminho principal (hoje é hint no topo + link), sem tocar no fluxo mobile?
7. **q7** Auto-abrir o viewer no `done` (como especificado) ou exigir o toque em "Abrir o mapa 3D" quando o usuário estiver com a página em segundo plano? (Proposta: auto-abrir só com a aba visível; senão, notificar título da aba.)
8. **q8** Copy do e-mail de "esqueci a senha" e endereço remetente — fora do escopo desta entrega, mas a tela já aponta para isso.

## 6. Checklist dos 8 contratos fixos (revisado tela a tela, com screenshots)

1. **Sem botão de upload no fluxo mobile** ✅ — captura: gravar→parar→processando; fallback é link discreto sublinhado ("ou envie um arquivo de vídeo") e ganha destaque apenas no container desktop/estado de erro.
2. **Rotas/payloads intactos** ✅ — entrega é 100% apresentação; mocks usam apenas os dados do §7 do briefing; a única ideia que exigiria API (métricas parciais) foi explicitamente descartada (§3-d7).
3. **Token inválido → 404** ✅ — nenhuma tela sugere "existe mas negado"; home visitante não lista nada; nota no mock da home.
4. **Mobile-first de uma mão** ✅ — desenhado a 390 px; alvos ≥ 44 px (record 78 px, switches com hit 44, olho da senha 44, chips h36+hit, sliders com faixa de toque); dock ao alcance do polegar; sem scroll horizontal (chips têm faixa própria com máscara).
5. **Controles nunca cobrem o mapa** ✅ — HUD todo em bordas; sheets ≤ 45% e dismissíveis; botão "esconder interface"; pins/detecções só respondem a TAP curto (arrasto sempre navega — drag > 6 px vence o hit-test).
6. **Sem efeito pesado na nuvem** ✅ — mocks: canvas 2D com ~6,5 mil pontos; spec: só uniforms/câmera/dashOffset (MOTION-SPEC §0); nada de shader estético, blur ou per-point anim.
7. **LGPD visível** ✅ — captura (card ready): 7 dias, artefatos permanecem, blur opcional; repetido no fallback e no estado de erro; home: nota de privacidade por link.
8. **Sem login obrigatório / sem onboarding multi-tela** ✅ — primeira tela útil é a câmera (1 card de pré-voo de um toque, com dispensa persistente); login existe como rota estática, linkada discretamente ("entrar" na home), sem validação e sem interceptar nada; a própria tela declara: "o login nunca é exigido para ver um scan compartilhado".

## 7. Instruções de aplicação no código

**Tokens** — colar o bloco `@theme` do DESIGN-TOKENS §2 em `src/app/globals.css` (Tailwind 4). As variáveis fora do `@theme` (`--tap`, `--z-*`, `--grid-grego`) entram no `:root` do mesmo arquivo.

**Fontes** — usar `next/font/local` com os 3 woff2 variáveis oficiais (Space Grotesk wght 300–700, Inter 100–900, JetBrains Mono 400–800). Os arquivos estão embutidos em base64 dentro de qualquer um dos mocks (bloco `<style id="brand-fonts">`) — extrair e salvar em `src/fonts/`. Vantagem: são exatamente os binários do manual.

**Logo** — os `<symbol>` no topo de cada mock trazem a geometria oficial (ids `lg-lam`, `lg-o`, `lg-sym`): copiar para um `Logo.tsx` com `currentColor`. Regras: wordmark ≥ 90 px, símbolo ≥ 20 px, área de proteção 1x, nunca recolorir/rotacionar/sombrear, glitch nunca no favicon.

**Mapa telas → rotas:**

| Mock | Rota | Componentes React sugeridos | Métodos de engine tocados |
|---|---|---|---|
| tela-captura | `/new` | `CaptureScreen`, `InstructionCard`, `RecordButton`, `RecPill`, `FileFallback` | — |
| tela-status | `/scan/[id]` (fase status) | `StatusHeader`, `StageStepper`, `EduTheater` (canvas 2D próprio, ~1,8 mil pts — leve), `EduCarousel`, `LinkGuardCard`, `FailCard`, `DoneReveal` | `preload()`, `playReveal()` |
| tela-viewer | `/scan/[id]` (fase viewer) | `ViewerHud`: `TopBar`, `SearchBox`, `ToolDock`, `CameraCluster`, `CutSlider`, `LayersSheet`, `ClassChips`, `ReplayBar`, `EvidenceCard`, `CalibSheet`, `PinSheet`, `Toast` | `flyTo`, `flyToDetection`, `setClipHeight`, `playTrajectory`, `setDetectionEmphasis`, `pulseRingAt` |
| tela-home | `/` | `Hero`, `StepStrip`, `PrivacyCard`, `ScanCard` (thumb = `thumb_url` do artifact; a mini-nuvem canvas dos mocks é placeholder) | — |
| tela-login | `/login` | `LoginCard`, `ForgotPanel` — rota estática, submit desabilitado/simulado | — |

**Estados**: cada mock usa `data-state`/`data-fase`/`data-modo` no root + CSS — traduz direto para o state React da página. Os rótulos pt-BR dos 8 status estão na tabela do DESIGN-TOKENS §3.5.

**Motion**: seguir MOTION-SPEC (tokens já no `@theme`); tudo tem fallback `prefers-reduced-motion` (já demonstrado nos mocks).

**Meta-UI dos mocks**: a pílula "MOCK" e o palco/moldura são só do protótipo — nada disso vai para o produto.

## 8. Limitações conhecidas dos mocks

- Nuvem decorativa (~6,5 mil pts) sugere a real; sem pinch-zoom (wheel/drag apenas); "Voar" só com teclado.
- Fotos de keyframe são geradas em canvas (placeholder) — no produto vêm de `keyframe JPEG` URL.
- Miniaturas da home idem (usar `artifacts.thumb`).
- PDF do marcador, painel `/admin` e Web Share dependem do produto real (stubs com aviso).
- `/admin` não fazia parte dos entregáveis desta rodada — se quiser, é a extensão natural da próxima.
