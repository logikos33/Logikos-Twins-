# Spec — D4 Viewer "controle do mapa"

- **Status:** fechada
- **Etapa:** D4
- **ADRs relacionados:** [0002](../adr/0002-nextjs-prisma-postgres.md), [0006](../adr/0006-artefato-ply-preview.md)

## Objetivo

A página do scan deixa de ser "nuvem girando" e vira a experiência que dá nome à demo:
**controlar a planta**. Navegar por dentro, medir com escala real, anotar, rever o
percurso — num celular.

## Escopo

- Carregamento do `cloud_preview.ply` com progresso (PLYLoader + THREE.Points).
- Câmeras: **orbit** (default) · **first-person** (WASD + toque) · **top-down** "planta".
- Trajetória desenhada a partir do `poses.json` + **replay animado** do percurso.
- **Clipping por altura** (slider) — "ver por dentro" cortando o teto.
- **Medição** ponto-a-ponto com **calibração de escala manual**: 2 cliques + distância
  real → fator salvo em `scans.scale` via API; medições passam a exibir metros.
- **Pins de anotação**: clique na nuvem → pin + texto + foto do keyframe mais próximo
  (via poses). Persistem em `annotations`.
- Camadas ligáveis: nuvem / trajetória / pins / detecções (a última chega na D5).
- Galeria `/` com thumbnails e link de compartilhamento (share_token).
- Mobile-friendly: gestos de toque, botões grandes, UI que não cobre o mapa.

## Não-escopo

- Pins semânticos de detecção e busca — **D5** (a camada já existe, vazia).
- Escala automática por ArUco — **D6** (o `scale.method` já aceita `aruco`).
- Proteção da galeria por ADMIN_TOKEN — **D7** (na D4 a galeria lista tudo, dev only).

## Contratos afetados

- `PATCH /api/scans/[id]` (novo): grava `scale` (com `method: 'reference_distance'`).
- `GET/POST /api/scans/[id]/annotations` (novo, plano §4.1).
- `GET /api/scans` (novo): lista para a galeria (id, título, status, thumb).
- Nenhuma migration: `scale`/`annotations` já existem no schema da D1.

## Fatias verticais

1. Viewer base: PLY com progresso, orbit, render responsivo, tela cheia mobile.
2. Trajetória + replay.
3. Modos de câmera (first-person, top-down) + clipping por altura.
4. Medição + calibração de escala (com a rota PATCH e teste da conta).
5. Pins de anotação com foto do keyframe mais próximo (rota + UI).
6. Camadas + galeria + compartilhamento.

## Critérios de aceite

- [x] Tudo funcional na cena sintética no compose — verificado AO VIVO em navegador:
      nuvem carregada com progresso, órbita, trajetória circular visível, medição,
      calibração, pin com foto, planta baixa com corte a 50%, camadas.
- [x] **Medição verificada ponta a ponta ao vivo**: dois picks na nuvem → 7,09 u;
      calibração informando 5,67 m → fator persistido 0,79999 (0,001% do exato);
      nova medição do mesmo vão exibiu **5,67 m**. A conta pura tem teste com a
      parede de 6 u (< 2%).
- [x] Keyframe mais próximo: função pura testada (incluindo o caso "frame vizinho
      não é keyframe") e provada ao vivo — o pin na mesa abriu a foto do keyframe
      da câmera mais próxima.
- [x] Usável em celular: viewport 375×812 verificado — controles empilham, botões
      alcançáveis, sem scroll horizontal.
- [x] Carregamento com barra de progresso e erro legível (não tela preta).

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Escala | 2 pontos a 2,0 u de distância, valor real 1,6 m | fator 0,8; parede de 6 u exibe 4,8 m |
| Medição sem calibração | 2 pontos | mostra unidades relativas + convite a calibrar |
| Keyframe mais próximo | ponto no centro da mesa | keyframe cuja câmera está mais perto |
| Clipping | slider a 50% | pontos acima do corte somem; trajetória permanece |
| Galeria | 3 scans no banco | 3 cards com thumb, status e link com token |

## Riscos

| Risco | Mitigação |
|---|---|
| 1,8 M pontos pesados em celular fraco | THREE.Points com material simples (sem shader custom); se engasgar, subamostrar no cliente por slider de densidade |
| Raycast em nuvem de pontos é impreciso para clicar | `Points.threshold` calibrado pelo tamanho da cena; feedback visual do ponto pego antes de confirmar |
| WebGL context loss no mobile | listener de `webglcontextlost` com recarga limpa |
| SSR do Three.js | `dynamic(..., { ssr: false })` — decidido no ADR-0002 |
