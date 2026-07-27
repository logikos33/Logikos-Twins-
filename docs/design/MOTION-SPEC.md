# MOTION-SPEC — Logikos Twins

Especificação dos dois momentos "uau" + linguagem de movimento do produto.
Base: **Manual da Marca LOGIKOS §10 (Motion)** — "movimentos curtos e secos (`steps`, não easing suave), sempre terminando em repouso total; o glitch nunca fica em loop".

## 0. Princípios e fronteira técnica

**Duas linguagens de movimento, com papéis distintos:**

1. **Motion de marca** (2D, momentos de identidade): glitch de 0,4–0,6 s com `steps(3, end)`, 2–3 fatias horizontais deslocadas 2–4 px com franjas ciano `#00E5FF` e magenta `#FF2E63`; usado só em entradas/reveals (logo, "Mapa pronto."), nunca em loop, nunca em elementos persistentes do HUD. [manual]
2. **Motion funcional** (3D, navegação espacial): voos de câmera e transições do mapa usam easing suave (`--ease-fly: cubic-bezier(.4,0,.2,1)`), porque o objetivo é compreensão espacial — o usuário precisa "sentir o caminho" até o objeto. **[extensão do manual]**, justificada: o manual rege a marca; a câmera 3D é instrumento, e movimento seco em 3D desorienta.

**Fronteira de implementação (contrato do briefing):**

- `[ENGINE]` = métodos do `ViewerEngine` (Three.js, fora do React) — tudo que toca nuvem, câmera 3D, marcadores, trajetória.
- `[REACT]` = HUD/painéis (React + Tailwind) — animações via classes/tokens CSS.

**Tokens** (definidos em DESIGN-TOKENS.md §2): `--duration-fast 120ms · base 200ms · slow 320ms · glitch 500ms · fly 1200ms · reveal 2400ms`; easings `--ease-brand steps(3,end) · --ease-out · --ease-in-out · --ease-fly`.

**Guarda-corpos de performance (contrato nº 6 — nuvem de 1,8 M pontos em celular médio):**

- Proibido: shaders custom por estética, blur/bloom em tela cheia, animar atributo por-ponto, re-upload de geometria por frame.
- Permitido: animar **uniforms/propriedades de material** (opacidade e tamanho do `PointsMaterial`), transformações de câmera, `dashOffset` de linha, escala/cor de marcadores (≤ dezenas de objetos), overlays DOM.
- Toda animação 3D roda no rAF já existente do engine; nada de segundo loop.

**Acessibilidade:** com `prefers-reduced-motion: reduce`, todo voo vira **corte seco + crossfade 200 ms**, o glitch não roda (título aparece pronto) e pulsos/halos ficam estáticos. Já implementado nos mocks.

**Interrupção:** qualquer `pointerdown` no canvas **cancela o voo em curso** (o usuário sempre ganha da câmera). Cartões/HUD permanecem no estado final como se o voo tivesse terminado.

---

## 1. Momento "uau" nº 1 — Processando → Mapa pronto

Contexto: mesma rota `/scan/[id]`; o polling (3 s) devolve `status: done`. A revelação acontece **in-page** — sem troca de rota, sem flash branco.

**Pré-carga (invisível, começa antes do "uau"):** assim que `status` entra em `finalizing` e `artifacts.cloud_url` existir, o engine inicia o fetch do PLY em background (`engine.preload(url)`), com a UI de status ainda visível. Na maioria dos casos o PLY (≤ 35 MB) chega antes do `done` → a revelação dispara sem espera. Se não chegou: mostra a barra de carga real ("Carregando a nuvem… 62% · 18 de 29 MB") **entre** as fases B e C — nunca fingir que carregou.

**Sequência (total ≈ 2,4 s):**

| # | t (ms) | Camada | O quê | Duração / curva |
|---|---|---|---|---|
| A1 | 0 | [REACT] | Último segmento da barra de etapas completa; nó "pronto" recebe ✓ | 200 ms `--ease-out` |
| A2 | 0 | [REACT] | Carrossel educativo + rótulo "como funciona" saem (fade + 4 px para baixo) | 150 ms `--ease-in-out` |
| B1 | 150 | [ENGINE] | Canvas do teatro → mapa real: pontos "assentam" — a nuvem entra com offsets aleatórios decaindo a zero (no engine: `points.material.opacity` 0→1 + dolly; **não** anima por-ponto: o efeito de convergência do mock vira, no produto, camera dolly + opacity ramp) | 1200 ms `--ease-out` |
| B2 | 150 | [ENGINE] | Câmera: de top-down alto e distante → enquadramento 3/4 padrão (`engine.flyTo(defaultPose)`) | 1600 ms `--ease-fly` |
| B3 | 900 | [REACT] | Título troca para **"Mapa pronto."** com **glitch de marca** (fatias ciano/magenta, `steps(3,end)`, termina em repouso) | 500 ms `--ease-brand` |
| B4 | 1000 | [ENGINE] | Trajetória do percurso se desenha (linha tracejada; anima `dashOffset` de 100%→0) | 1200 ms linear |
| B5 | 1400 | [ENGINE] | Anel de pulso ciano expande do centro do mapa e some (sprite em escala; opacidade 1→0) | 700 ms `--ease-out` |
| C1 | 1200 | [REACT] | Métricas reais entram em stagger (quadros → pontos → tempo → MB), 140 ms entre cada | 400 ms cada, `--ease-out` |
| C2 | 1900 | [ENGINE] | Octaedros de detecção "pousam" (escala 0→1 + queda 18 px), stagger 90 ms, na ordem dos clusters | 350 ms cada, `--ease-out` |
| C3 | 2100 | [REACT] | HUD entra: top bar desce, dock sobe, chips fade — stagger 60 ms | 320 ms `--ease-out` |

Estado final: mapa em auto-órbita lenta (0,03 rad/s), HUD completo, CTA nenhum — o usuário já está DENTRO do produto.

**Casos de borda:** `done` com zero detecções → pular C2, chips mostram "sem detecções neste scan". PLY falhou → estado de erro do viewer (nunca tela preta). Reduced-motion → A1 + crossfade 200 ms + título sem glitch + tudo já em repouso.

**No mock:** `tela-status.html` → fase "pronto" implementa a versão leve (convergência de pontos, glitch do título, métricas em stagger, anel); botão "↺ repetir revelação" na barra MOCK.

---

## 2. Momento "uau" nº 2 — Busca semântica ("onde está…?")

Contexto: usuário digita/escolhe "mesa" no campo "onde está…?". Resultados = detecções da classe, ordenadas por confiança.

**Sequência (total ≈ 1,7 s):**

| # | t (ms) | Camada | O quê | Duração / curva |
|---|---|---|---|---|
| S1 | 0 | [REACT] | Sugestões fecham; campo mantém o termo; HUD não-essencial esmaece a 40% (dock/chips) | 200 ms `--ease-in-out` |
| S2 | 0 | [ENGINE] | `engine.flyToDetection(id)`: órbita interpolada (yaw pelo caminho mais curto, pitch −20°, dist ≈ 3× o raio do objeto), alvo = centro do cluster | 1200 ms `--ease-fly` |
| S3 | 300 | [ENGINE] | Octaedro-alvo destaca: escala 1→1,3→1,1 + cor da classe a 100%; demais detecções caem a 45% de opacidade | 600 ms `--ease-out` |
| S4 | 1200 | [ENGINE] | Chegada: anel de confirmação expande do marcador (24→64 px, opacidade 1→0); marcador fica pulsando sutilmente (escala ±6%, 1,5 s) enquanto o cartão estiver aberto | 500 ms `--ease-out` |
| S5 | 1250 | [REACT] | **Cartão de evidência** sobe (16 px + fade): foto do keyframe com bbox na cor da classe, rótulo, `confiança 92% · quadro 214 · 0:47`, "próxima ›" se houver mais | 250 ms `--ease-out` |
| S6 | 1250 | [REACT] | HUD esmaecido volta a 100% | 200 ms |

**Vários resultados:** cartão mostra "mesa · 1 de 2"; "próxima ›" repete S2–S5 para o próximo (voo mais curto, 900 ms).
**Sem resultado:** nada de voo. Toast âmbar 2,8 s: "Nada encontrado para 'X'. Detectados: mesa, estante, extintor…" — sempre dizer o que EXISTE (tom "prova, não promete").
**Interrupção:** toque no mapa durante S2 cancela o voo; cartão abre mesmo assim (a informação não é refém da animação).
**Fechar cartão:** marcador volta ao estado normal (200 ms); câmera FICA onde está — o usuário conquistou aquele enquadramento.

**No mock:** `tela-viewer.html` → busca real por classe; barra MOCK tem "▶ demo: busca 'extintor'".

---

## 3. API de motion do ViewerEngine (assinaturas propostas)

```ts
class ViewerEngine {
  preload(cloudUrl: string): Promise<void>;
  playReveal(opts?: {reduced?: boolean}): Promise<void>;      // momento 1 (B1–C2)
  flyTo(pose: CameraPose, ms?: number): Promise<void>;         // cancelável por pointerdown
  flyToDetection(id: string, ms?: number): Promise<void>;      // momento 2 (S2–S4)
  setDetectionEmphasis(id: string | null): void;               // S3 (demais a 45%)
  setCloudOpacity(v: number, ms?: number): void;               // uniform, barato
  drawTrajectory(progress01: number): void;                    // dashOffset
  pulseRingAt(worldPos: Vec3): void;                           // B5/S4
  setClipHeight(y: number): void;                              // corte (sem animação; segue o dedo)
  playTrajectory(t01: number): void;                           // replay do percurso
}
```

React nunca anima nada 3D via estado; chama métodos e espera Promises. HUD escuta eventos (`engine.on('flightend')`) para sincronizar cartões.

## 4. Micro-motions do sistema (inventário)

| Elemento | Animação | Tokens |
|---|---|---|
| Botão gravar (ready→rec) | disco 64 px ↔ quadrado 30 px (morph border-radius/size) | 200 ms `--ease-in-out` |
| Halo de gravação | anel escala 0,86→1,12 + fade, loop | 1,6 s `--ease-out` |
| Timer últimos 15 s | cor → magenta + contagem regressiva no hint (sem piscar a tela) | instantâneo |
| Sheets | translateY 105%→0 | 300 ms `--ease-out` |
| Chips (seleção) | borda/da cor + dot scale 1,3 | 200 ms |
| Toast | fade + 8 px | 250 ms `--ease-out`, auto-close 2,8 s |
| Erro de credencial (login) | shake seco ±5 px, `steps(4,end)`, 1× | 300 ms |
| Wordmark (home/login) | glitch de entrada 1× | 500 ms `--ease-brand` |
| Skeleton | opacidade 0,55↔1 | 1,6 s `--ease-in-out` |
| Stepper ativo | anel 0→7 px de sombra ciano, loop | 2 s |
| Pressed (todos os botões) | scale 0,97 | 120 ms |

Regra geral: **nada pisca, nada gira, nada fica em loop chamativo**. O único loop permitido em tela é respiração sutil (pulso ≤ 2 s) de elementos que significam "trabalhando/ao vivo".
