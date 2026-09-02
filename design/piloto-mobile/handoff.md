# Handoff — Twins piloto mobile (Claude Design → engenharia)

Protótipo: `Logikos Twins — Piloto.dc.html` (visões **Fluxo** e **Estados**; a visão Estados é o `/dev/states`).
Telas: `Entry` `Capture` `Job` `Viewer` `Shared` `Admin` (`.dc.html`, uma por tela do contrato).
Fonte da verdade: `docs/piloto/ui-contract.json` · textos em `strings.json` (chaves por tela).
Engine 3D do protótipo: `viewer-engine.js` (three.js MIT via CDN; nuvem procedural em metros reais).

## Tokens (aplicados nesta rodada)
Base = `apps/web/src/app/globals.css` do repo, com **overrides do brief do piloto**:
- Sem magenta e sem glitch em nenhuma tela. Erro/falha: `#FF5A36`. Gravando: botão ciano.
- Estados: ok `#3DDC84` · atenção `#FFB020` · erro `#FF5A36` · processando = Névoa `#8A8F98` + ícone.
- Neutros do manual: bg `#0A0A0F` · surface `#14141C` · surface-2 `#23242F` · texto `#F4F6F8` · secundário `#8A8F98` · desabilitado `#5C6470` · linhas `rgba(244,246,248,.08/.16)`.
- Ciano `#00E5FF` só interativo (CTA, foco, seleção, ponto de medida, resultado de busca); hover `#0091AD`. Nunca fundo, nunca estado.
- Raios 8/12/16/24 · alvo mínimo 44px · botão de gravar 78px.
- Fontes woff2 variáveis oficiais em `fonts/` (Space Grotesk · Inter · JetBrains Mono). Números medidos sempre Mono + `tabular-nums`, vírgula decimal (`2,41 m`; ≥10 m com 1 casa).
- ⚠ Divergência a registrar como D- no repo: `DESIGN-TOKENS.md` §3.2 usa magenta para gravar/erro; o brief do piloto proíbe. Este handoff segue o brief.

## Breakpoints
- Mobile retrato 390×844 (referência) — layout fluido, testado até 360.
- Paisagem 844×390: capture e viewer/shared com controles em coluna à direita (zona do polegar).
- Admin 1440 (referência desktop). No protótipo o admin é fixo 1440; para 390: tabelas viram cards empilhados por linha, nav vira dropdown — regra anotada, não implementada.

## Componentes compartilhados (mesmo desenho em todas as telas)
Chip de estado (cor+ícone+palavra; preenchido = texto ink) · barra âmbar de rede · folha inferior (surface, raio 16 no topo) · anel de progresso em 12 passos (neutro, nunca %) · lista de etapas (check verde / ativo Névoa / pendente faint) · contador Mono · rótulo técnico Mono uppercase tracking 0.26em · vazio com grid grego · símbolo Λ oficial (geometria de `Logo.tsx`) · ícones do grid 24 de `icons.tsx`.

## Cobertura do contrato (plug → onde)
| Plug | Tela · estado | Elemento |
|---|---|---|
| entry.load | entry · raiz | div raiz da tela |
| entry.capture.open | entry · ready/empty/offline | botão "Gravar novo mapa" |
| entry.map.open | entry · ready | "Abrir" do card de mapa (1ª instância) |
| entry.guide.toggle | entry · ready | cabeçalho "Como gravar bem" |
| capture.start | capture · idle/portrait-hint | botão de gravar |
| capture.stop | capture · recording/stopping | botão de parar |
| capture.torch | capture · controles | botão lanterna |
| capture.fallback-file | capture · todos com ação | "Enviar vídeo (do celular)" |
| capture.guide.dismiss | capture · portrait-hint | "Continuar assim" |
| job.poll | job · raiz | div raiz da tela |
| job.cancel | job · queued | "Cancelar" |
| job.retry | job · failed | "Tentar de novo" |
| job.map.open | job · completed | "Abrir mapa" |
| viewer.load | viewer · raiz (no estado error: botão "Tentar de novo") | raiz / retry |
| viewer.lod.toggle | viewer · topo | chip "Leve · 9 MB / Cheia · 38 MB" |
| measure.start | viewer · toolbar | "Medir" |
| measure.point | viewer · superfície | camada de toque sobre o mapa |
| measure.remove | viewer · tool-measure | "Remover" (1ª medida) |
| annotate.start | viewer · toolbar | "Anotar" |
| annotate.photo | viewer · folha do pino | bloco "Foto" |
| annotate.save | viewer · folha do pino | "Salvar" |
| annotate.remove | viewer · folha do pino | "Remover" |
| search.query | viewer · tool-search | input "Onde está…?" |
| search.focus | viewer · tool-search | 1º resultado da lista |
| layers.toggle | viewer · toolbar | "Camadas" |
| share.create | viewer · topo | botão Compartilhar |
| share.copy | viewer · share | "Copiar" |
| share.whatsapp | viewer · share | "WhatsApp" |
| share.revoke | viewer · share | "Revogar" |
| export.request | viewer · share | "Exportar PLY/LAS" (só operador) |
| shared.load | shared · raiz | div raiz da tela |
| shared.search.query | shared · busca | input "Onde está…?" |
| shared.search.focus | shared · busca | 1º resultado |
| shared.layers.toggle | shared · toolbar | "Camadas" |
| admin.login | admin · login | "Entrar" |
| admin.project.create | admin · projects | "Novo projeto" |
| admin.project.link.copy | admin · projects e project-detail | "Copiar link" (1ª linha) |
| admin.project.link.revoke | admin · projects e project-detail | "Revogar" (1ª linha) |
| admin.job.filter | admin · jobs | grupo de chips de filtro |
| admin.job.open | admin · jobs | ID do job (1ª linha) |
| admin.job.archive | admin · job-detail | "Arquivar" |
| admin.job.purge | admin · confirm-destructive | "Apagar arquivos" (confirmação do modal) |
| admin.job.rerun | admin · job-detail | "Reprocessar" |
| admin.link.revoke | admin · links | "Revogar" (1ª linha) |
| admin.config.save | admin · config | "Salvar" |
| admin.export.request | admin · job-detail | "Exportar PLY/LAS" |

**Convenções de unicidade** (para o teste de cobertura): o plug existe **uma vez por estado renderizado**; em listas, marcado na **1ª instância** (produção aplica por item); `capture.fallback-file` aparece uma vez em cada estado que oferece a ação; `viewer.load`/`shared.load` ficam na raiz, exceto no estado `error` do viewer, onde vivem no botão de retry.

## Propostas de contrato (ações que faltaram — não inventei nomes no DOM)
- `capture.permission.request` — botão "Permitir" do estado permission-prompt.
- `job.recapture` — "Gravar de novo" (failed) e "Gravar novo mapa" (cancelled).
- `search.open` / `shared.search.open` — botão "Buscar" da toolbar (abre a busca; `search.query` é o input).
- `layers.set` — linhas individuais do painel Camadas (`layers.toggle` abre o painel).
- `viewer.pin.open` — toque num pino existente (abre o cartão da anotação).
- `admin.project.open` — abrir project-detail a partir da tabela.
- `admin.job.provenance.copy` — copiar hash de proveniência.
- `Config.usdBrlRate` e `Config.costAlertUsd` — campos exibidos no config (custo em R$ e linha âmbar dependem deles).

## Onde o protótipo simplificou
- Câmera simulada (placeholder Grafite marcado `CÂMERA · MOCK`); Wake Lock/getUserMedia/MediaRecorder são engenharia.
- Nuvem procedural ~80 mil pontos (galpão 12×8 m: piso, 2 paredes, 3 máquinas, 3 mesas, empilhadeira, extintor) em metros reais — medição devolve distância real.
- Visão **Estados** renderiza Viewer/Shared em mock 2D (limite de contextos WebGL); o 3D real (órbita/zoom/pan por toque, toque duplo centraliza, raycast, voo em passos, LOD por lotes) roda na visão **Fluxo**.
- Textos literais nos templates espelham `strings.json` 1:1 (produção lê do dicionário).
- Fake: cotação 5,40 · tarifa 0,00086 US$/s · limiar de alerta 0,75 · nomes de cliente/projeto.
- Sem porcentagem inventada em lugar nenhum: progresso é etapa/partes/bytes/pontos.
- Motion: protótipo estático por padrão (sem loops, sem pulsar); transições de estado são cortes secos. `prefers-reduced-motion` sem efeito porque nada anima continuamente.

## AÇÕES-VITOR
- Exportar este projeto (HTML standalone) para `design/piloto-mobile/` e copiar `docs/piloto/ui-contract.json` (se as propostas acima entrarem, versionar o contrato antes).
- Validar no celular real: alvo ≥30 FPS com nuvem cheia; alvos de toque; leitura a 1 m.
