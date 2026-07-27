# Briefing de front-end — Logikos Twins

> **Para que serve este documento:** é a base para montar o prompt do designer (Claude
> Designer ou humano). Ele descreve **o que o produto faz hoje**, tela por tela, estado
> por estado, o que é **contrato fixo** (não pode mudar) e o que é **campo livre de
> design**. Tudo aqui está implementado e funcionando — o design não é para uma ideia,
> é para um sistema vivo que dá para rodar com `make dev`.

---

## 1. O produto em um parágrafo

O usuário **filma um ambiente andando com o celular** (a gravação acontece na própria
página, o envio sobe em segundo plano durante a filmagem — não existe botão de upload) e,
minutos depois, abre um **mapa 3D navegável** daquele lugar: nuvem de pontos densa,
trajetória do percurso, **medição com escala real** (calibração manual ou automática por
marcador ArUco impresso), **pins de anotação com foto-evidência**, e — a tese do produto —
**detecções ancoradas em coordenadas 3D**: o mapa responde *"onde está a mesa?"*, *"onde
está o extintor?"* voando a câmera até o objeto e mostrando a foto que prova.

**Posicionamento:** Matterport/NavVis exigem hardware caro; Polycam/Scaniverse param na
captura. Nenhum concorrente entrega "as detecções da SUA operação ancoradas no SEU mapa"
por ~US$ 0,10/scan. O tom é industrial-pragmático, não gadget de consumidor.

## 2. Quem usa, onde

| Persona | Dispositivo | Situação |
|---|---|---|
| **Operador** (quem filma) | Celular, muitas vezes 4G, uma mão só | Em pé, andando pelo galpão/obra/sala; luz variável; pressa |
| **Gestor/cliente** (quem recebe o link) | Celular ou desktop | Recebeu um link por WhatsApp; nunca viu o produto; precisa entender em 10 segundos |
| **Dono da demo** (Vitor) | Desktop | Painel `/admin`: custos, erros, volume |

Sem login. O acesso a um scan é o **link com `share_token`**; a galeria completa e o
painel são do operador (`ADMIN_TOKEN`).

## 3. Inventário de telas (tudo já implementado)

### 3.1 `/` — Home / galeria

- **Sem token:** título, frase de valor, botão "Novo scan", nota de privacidade. Nada é
  listado (privacidade por design).
- **Com `?admin=<token>`:** grid de cards de scans (thumbnail, título, status em
  português, data) → cada card abre o scan com o próprio share_token.
- Estado vazio: convite ao primeiro scan.

### 3.2 `/new` — Captura (a tela mais importante do produto)

Página de GRAVAÇÃO, não de upload. Estados implementados:

| Estado | O que mostra hoje |
|---|---|
| `requesting-camera` | "Abrindo a câmera…" |
| `ready` | Preview da câmera em tela cheia + card de instruções (protocolo de captura: horizontal, 1 passo/s, fechar voltas, limite de minutos) + **toggle "Borrar rostos (LGPD)"** + link do **PDF do marcador de escala** + aviso de privacidade + botão vermelho de gravar + link discreto do fallback de arquivo |
| `recording` | Timer (fica vermelho nos últimos 15 s), indicador "gravando · enviando (N ✓)" com contagem de partes subidas, botão de parar. **Wake lock ativo** |
| `finishing` | "enviando as últimas partes…" |
| `error` | Card com mensagem acionável (ex.: permissão de câmera negada) + "Tentar de novo" + fallback |
| fallback (`FileFallback`) | Upload de arquivo (desktop/drone/navegador incompatível) com barra de progresso por partes — mesmo pipeline |

Ao parar, o processamento dispara sozinho e a página navega para `/scan/[id]`.

### 3.3 `/scan/[id]?token=…` — Status → Viewer

**Fase status** (polling 3 s): rótulos amigáveis por estado — gravando → recebendo →
na fila → *"Reconstruindo o ambiente em 3D…"* → finalizando → pronto/falhou; barra
animada; mensagem de erro legível quando `error`; "guarde este link".

**Fase viewer** (quando `done` — tela cheia, Three.js):

- **Ferramentas:** Navegar · Medir · Anotar
- **Câmeras:** Órbita · Voar (WASD+QE) · **Planta** (top-down travado)
- **▶ Percurso:** replay animado da trajetória da câmera
- **Medir:** 2 toques → distância; sem calibração mostra "u" + botão *"Esta distância eu
  conheço"* → input de metros → tudo passa a exibir metros/cm. (Com marcador ArUco na
  filmagem, a escala já vem automática.)
- **Anotar:** toque → pin + texto; abrir o pin mostra a **foto do keyframe mais próximo**
- **Detecções:** octaedros coloridos por classe; chips de filtro por rótulo (cor estável
  por classe); **campo de busca "onde está…?"** → voo de câmera + card de evidência com
  foto e confiança
- **Camadas:** Nuvem · Trajeto · Pins · Detecções (liga/desliga)
- **Corte:** slider de clipping por altura ("ver por dentro" / planta baixa)
- **Compartilhar:** Web Share API / copiar link
- Carregamento do PLY com barra de progresso e %; erro de carga com mensagem (nunca tela
  preta)

### 3.4 `/admin?token=…` — Painel do operador

Total de scans, contagem do dia vs limite, **custo estimado acumulado**, chips por
status, lista de erros recentes, tabela de scans (com "apagado (retenção)" na coluna de
vídeo). Sem token → 404.

### 3.5 `/api/marker` — PDF do marcador ArUco

A4 para impressão a 100%, quadrado de 150 mm, instruções. Linkado na captura.

## 4. Contratos FIXOS (o design não pode quebrar)

1. **Não existe botão de upload no fluxo do celular.** Gravar → parar → processando. O
   upload de arquivo é fallback discreto (desktop/drone).
2. **As rotas e payloads da API não mudam** (ver `docs/architecture.md` e as rotas em
   `apps/web/src/app/api/`). O design é de apresentação; a lógica está em
   `src/lib/` e não deve ser movida para componentes.
3. **Token inválido → 404** (nunca 403, nunca "scan existe mas você não pode").
4. **Mobile-first de verdade:** o operador usa uma mão; alvos de toque grandes; o viewer
   não pode ter scroll horizontal nem gestos que conflitem com órbita/pan.
5. **Viewer:** os controles não podem cobrir o mapa (é o produto); bounding boxes/pins
   nunca capturam clique de navegação (picking já rejeita arraste).
6. **Performance:** nuvem de até 1,8 M pontos num celular médio; nada de shader/efeito
   pesado por estética; PLY ≤ 35 MB é invariante.
7. **Textos de privacidade** (LGPD: vídeo morre em 7 dias, artefatos ficam, blur
   opcional) permanecem visíveis na captura.
8. **Sem login, sem onboarding multi-tela.** A primeira tela útil é a câmera aberta.

## 5. Campo LIVRE para o designer

- **Identidade visual completa**: hoje é um placeholder neutro escuro (Tailwind neutral,
  fundo `#0a0a0a`, fonte do sistema). Não há logo, não há paleta de marca, não há
  tipografia própria. O nome é **Logikos Twins**.
- Layout, hierarquia, microcopy (em pt-BR), iconografia, motion/transições leves,
  empty states, skeletons de carregamento.
- O visual do viewer: cores/formas de pins e detecções, HUD, painéis, legenda de
  classes, aparência da trajetória e do marcador de replay, slider de corte.
- A dramaturgia do processamento (a espera de 1–8 min é um momento de venda: o que
  mostrar enquanto "Reconstruindo o ambiente em 3D…"?).
- O card de instruções de captura pode virar overlay guiado mais rico (desde que não
  atrase quem já sabe usar).
- Dark é a base (moldura clara prejudica a leitura da nuvem), mas o designer decide o
  resto do sistema.

## 6. Stack e restrições técnicas do front

- **Next.js 16 (App Router) + TypeScript strict + Tailwind CSS 4** (tokens via
  `@theme` em `src/app/globals.css`).
- **Three.js r185+** — a cena vive FORA do React (`viewer/engine.ts`, classe
  `ViewerEngine`); o React só faz UI/estado (`ScanViewer.tsx`). Essa fronteira é
  arquitetural: mexer no visual 3D = métodos do engine; mexer em painéis = React.
- Validação de borda com Zod; componentes client-side marcados; o viewer entra por
  `dynamic(..., { ssr: false })`.
- Sem biblioteca de componentes instalada (sem shadcn/radix hoje) — adicionar uma é
  decisão aberta ao designer/dev, registrada em ADR se acontecer.
- Testes: 42 na web (a lógica pura de escala/keyframe/upload tem testes — refatorar UI
  não deve tocá-los).

## 7. Dados disponíveis por tela (para o design saber o que existe)

- **Scan** (`GET /api/scans/[id]?token=`): `status` (8 estados), `title`, `createdAt`,
  `durationS`, `frames`, `error`, `metrics` (`frames`, `points_preview`,
  `cloud_preview_mb`, `total_s`, `cost_usd_est`, `detector`, `detections`), `scale`
  (`factor`, `method: none|reference_distance|aruco`), `artifacts`
  (`cloud_preview_url`, `poses_url`, `meta_url`, `thumb_url`).
- **Detecções** (`GET .../detections?token=`): lista de `{label, score, frameIdx,
  worldPos}` (clusters — 1 por objeto).
- **Anotações** (`GET .../annotations?token=`): `{type: pin|measure|note, position,
  data:{text, keyframe}}`.
- **Keyframe JPEG**: `GET .../keyframes/[idx]?token=` (usável direto em `<img src>`).
- **Poses**: JSON com `frames[{i, t_s, c2w, K}]` e `keyframes[]` — alimenta trajetória
  e replay.

## 8. Como o designer vê o sistema rodando

```bash
cp .env.example .env
make fixture   # gera a cena sintética (sala 6×4×3 com mesa/armário/caixa + marcador)
make dev       # sobe tudo: http://localhost:3000
```

Enviar qualquer vídeo curto pelo fallback de `/new` → em ~10 s o scan fica `done` com a
cena sintética: dá para exercitar viewer, medição, calibração, pins, busca ("mesa",
"armario", "caixa_chao") e o painel (`/admin?token=admin-token-dev`;
galeria: `/?admin=admin-token-dev`). Câmera real: só em `localhost` ou HTTPS
(ver `docs/protocolo-captura.md`).

## 9. Referências de contexto no repositório

- `docs/architecture.md` — fluxos e contratos (diagramas Mermaid)
- `docs/specs/D1-…D7` — o que cada tela faz, com critérios de aceite marcados
- `docs/adr/0008` — por que a captura é "gravação ao vivo sem botão de upload"
- `README.md` — visão geral e posicionamento
- Código das telas: `apps/web/src/app/` (páginas) e `apps/web/src/app/scan/[id]/viewer/`
  (viewer)

## 10. Sugestão de entregáveis a pedir no prompt do designer

1. **Identidade mínima viável**: logo/marca "Logikos Twins", paleta (dark-first),
   tipografia, tom de voz pt-BR.
2. **Design system enxuto**: botões, chips, cards, inputs, toasts/erros, estados de
   carregamento — mapeável para Tailwind 4 (`@theme` tokens).
3. **As 4 telas-chave em alta fidelidade, mobile primeiro**: captura (todos os
   estados da §3.2), status/processando, viewer (com todas as ferramentas da §3.3),
   home/galeria. Desktop como adaptação.
4. **O momento "uau"**: a transição processando → mapa pronto, e a busca semântica
   (voo + evidência) — são os dois momentos de venda da demo.
5. Especificação de handoff (espaçamentos/tokens) aplicável direto no Tailwind.
