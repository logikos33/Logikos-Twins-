# Spec — D6 Escala ArUco + blur de rostos

- **Status:** fechada
- **Etapa:** D6
- **ADRs relacionados:** [0005](../adr/0005-detector-plugavel-yolox.md) (a regra de licença vale para o detector de faces)

## Objetivo

Escala métrica **sem fricção**: quem imprime o marcador e o deixa no chão recebe o mapa
já em metros, sem clicar em nada. E privacidade opcional: rostos borrados nos keyframes
quando o scan pedir.

## Escopo

- Detecção de marcador **ArUco DICT_4X4_50** (OpenCV `cv2.aruco`, já na imagem) nos
  keyframes; tamanho físico padrão: **150 mm** de lado (impresso em A4, documentado
  no próprio PDF).
- Escala automática: cantos do marcador desprojetados com depth+K+c2w → comprimento do
  lado em unidades de cena → fator = 0,15 m / lado. Mediana entre todas as vistas do
  marcador (robustez). Grava `scale.method='aruco'` — SOBRESCREVE a manual; o fallback
  manual continua existindo quando não há marcador.
- **Gerador do PDF do marcador** (`scripts/make_aruco_pdf.py`, sem dependência nova —
  PDF escrito à mão com o bitmap do marcador), servido pela página de gravação.
- **Blur de rostos opcional por scan** (`blurFaces` na criação do scan): detector de
  faces com licença VERIFICADA antes de adotar (Q5); aplicado APENAS a
  `keyframes/*.jpg` e `thumb.jpg` — o vídeo bruto morre na retenção (D7).
- Fixture ganha um marcador ArUco plantado no chão da sala (textura no piso) para o
  teste automatizado de escala.

## Não-escopo

- Blur no vídeo bruto (morre em 7 dias; custo sem benefício).
- Múltiplos marcadores / marcador como origem de coordenadas (pós-demo).

## Contratos afetados

- `scans.scale.method` ganha o valor `'aruco'` (o schema já aceita — Json).
- `Scan.blurFaces` (boolean, default false) — migration nova.
- `POST /api/scans` aceita `blurFaces`; a página de gravação ganha o toggle.
- Worker: etapa `aruco_scale` após a conversão; etapa `blur` antes do upload dos
  keyframes. Retorno do worker ganha `scale` (a web grava se vier).
- Env: nenhuma nova.

## Fatias verticais

1. Fixture com marcador plantado + detecção ArUco + escala automática + testes.
2. Worker: integração da etapa de escala; web grava `scale` vindo do worker.
3. PDF do marcador + link na página `/new`.
4. Migration `blurFaces` + toggle na UI + blur nos keyframes (com licença verificada).

## Critérios de aceite

- [x] Cena com marcador → escala automática: teste (fator ± 2% do gabarito) E provado
      no E2E do compose — scan `done` com `scale {factor: 0.27694, method: aruco,
      views: 3}` vs 0.27273 esperado (1,5%), sem nenhum clique.
- [x] Sem marcador → `detect_scale` devolve None (teste); a calibração manual da D4
      permanece intacta.
- [x] PDF do marcador (gerado à mão, sem dependência) em `/api/marker`, linkado no
      card de instruções da página de gravação, com instruções de impressão a 100%.
- [x] Toggle "Borrar rostos" por scan; blur verificado com FOTO REAL (rosto
      irreconhecível, resto intacto); falha do blur é FATAL de propósito — privacidade
      prometida não degrada em silêncio.
- [x] Licença do YuNet verificada NA FONTE antes da adoção (MIT — LICENSE e README do
      diretório do modelo no OpenCV Zoo) e registrada em LICENSES.md; Q5 resolvido.

**Achado registrado:** truncagem `astype(int)` vs `np.floor` no compositor do marcador
— pixels logo fora da borda esquerda/superior caíam na célula 0 e engrossavam o
quadrado preto em dois lados, desalinhando a grade de bits do detector. Duas horas de
depuração que o comentário no código poupa da próxima vez.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Escala automática | fixture com marcador de 0,55 u no chão, "lado real" 0,15 m | fator 0,2727 ± 2% |
| Múltiplas vistas | marcador visível em N keyframes | mediana dos fatores, não a 1ª vista |
| Sem marcador | fixture normal | `scale` inalterada |
| Manual + aruco | calibração manual seguida de reprocesso com marcador | aruco vence |
| Blur | keyframe com rosto (foto real) | rosto irreconhecível; resto da imagem intacta |

## Riscos

| Risco | Mitigação |
|---|---|
| Licença do modelo de faces do OpenCV Zoo não ser permissiva | Verificação ANTES (Q5); alternativa: Haar cascade do próprio OpenCV (Apache-2.0), pior mas suficiente para blur |
| Marcador pequeno demais nos frames de 518 px | Documentar no PDF: A4, chão, a ≤ 3 m do trajeto |
| Depth ruim nos cantos do marcador | Mediana por janela (mesma técnica da desprojeção de bbox) e mediana entre vistas |
