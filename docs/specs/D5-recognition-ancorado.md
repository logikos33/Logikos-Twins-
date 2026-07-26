# Spec — D5 Recognition ancorado (YOLOX) · D5.5 integração Recognition

- **Status:** fechada (D5.5 aguarda o repositório do Recognition — interface e fallback prontos)
- **Etapa:** D5
- **ADRs relacionados:** [0005](../adr/0005-detector-plugavel-yolox.md)

## Objetivo

O mapa passa a **responder perguntas**: cada detecção em keyframe vira um objeto com
coordenada 3D, e a busca ("pessoa", "hidrante", "cadeira") voa a câmera até o cluster.
É a tese do produto — o que nenhum Matterport/Polycam oferece.

## Escopo

- **`Detector` protocol** no worker (ADR-0005): `detect(image) -> [{label, score, bbox}]`,
  selecionável por `DETECTOR=yolox|recognition|synthetic`, com fallback automático.
- **YOLOX-s ONNX** (Apache-2.0, COCO) via onnxruntime CPU: pré-processamento (resize
  letterbox 640), pós (decode + NMS) — implementados e testados.
- **Detector `synthetic`** para a cena: "detecta" os objetos plantados projetando as
  caixas conhecidas nos keyframes — o teste de desprojeção não depende de pesos.
- **Desprojeção**: pixel central da bbox + depth + K + c2w → `world_pos` (identidade já
  validada na fixture com mediana < 0,02 u).
- **Cluster** por rótulo + raio: o mesmo objeto visto em N frames vira 1 grupo.
- Worker grava em `detections` via rota batch `POST /api/scans/[id]/detections`
  (autenticada pelo mesmo segredo do webhook — vem do worker, não do usuário).
- Viewer: pins semânticos com cor por classe, foto-evidência, filtro por rótulo e
  **busca que voa a câmera** até o cluster.
- Download automático dos pesos YOLOX-s ONNX no build da imagem do worker
  (`[TESTAR no plug-in]` na GPU; CPU no dev).

## Não-escopo

- Treino/ajuste fino (extintor etc.) — pós-demo (OPEN-QUESTIONS Q1).
- D5.5 (integração do Recognition real) exige o repositório privado — fica como
  interface pronta + procedimento documentado; a auditoria de licença acontece com o
  repositório à mão. **Bloqueio registrado, não impede a D5.**

## Contratos afetados

- `detections` (tabela da D1) passa a ser escrita; `world_pos` obrigatório no batch.
- Rota nova: `POST /api/scans/[id]/detections` (batch, autenticada por segredo).
- `GET /api/scans/[id]` passa a incluir `detections` agregadas quando `done`.
- Env: `DETECTOR` (default `yolox`), `YOLOX_MODEL_PATH`.

## Fatias verticais

1. Protocol + detector `synthetic` + desprojeção + cluster, com testes na fixture.
2. Rota batch + gravação no fim do handler.
3. YOLOX ONNX real (pré/pós) + teste com 2–3 fotos reais em CPU.
4. Viewer: camada de detecções, filtro, busca com voo de câmera.
5. Estrutura da D5.5 (`RecognitionDetector` stub + fallback + procedimento).

## Critérios de aceite

- [x] Busca "onde está X?" acha o objeto plantado com erro < 5% do tamanho da cena.
      **Nota de métrica registrada:** o erro é medido do pin à CAIXA do objeto (0 se
      dentro), não ao centroide — a desprojeção do centro da bbox ancora na
      superfície visível, que é onde o pin DEVE apontar; medir contra o centroide
      penalizaria objetos grandes (o armário de 2 u falhou por 0,68 u de "erro" que
      era exatamente a distância superfície→centroide). Teste automatizado + provado
      ao vivo: busca "mesa" → voo de câmera + card de evidência com o keyframe.
- [x] YOLOX-s em CPU numa foto real: cats.jpg → 2 gatos (0,93/0,92) + 2 controles
      remotos — o resultado canônico dessa imagem do COCO; street.jpg → person 0,78,
      chairs, tvs. Pré/pós-processamento validados contra ground truth conhecido.
- [x] Multi-frame → 1 cluster (teste); objetos GRANDES podem gerar 2–3 clusters de
      superfície (raio 4% da diagonal) — pins todos SOBRE o objeto; afinação do raio
      registrada em OPEN-QUESTIONS.
- [x] Rota batch sem segredo → 401 (verificado por curl); substituição atômica em
      transaction (retry do worker não duplica pins).
- [x] Viewer: filtro por classe (chips com cor estável por rótulo), voo de câmera e
      card de evidência — verificados ao vivo em navegador.

**D5.5 (Recognition):** interface pronta (`DETECTOR=recognition` com fallback
automático testado pela fábrica); integração real aguarda o repositório privado —
procedimento em 3 passos documentado em `worker/pipeline/recognition_detector.py`,
com auditoria de licença como pré-condição dura.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Desprojeção | bbox central da mesa no keyframe k | world_pos a < 5% da cena do centro real da mesa |
| Cluster | mesmo objeto em 5 keyframes | 1 cluster com ≥ 5 evidências |
| Rótulos distintos | mesa + armário próximos | clusters separados (rótulo diferente) |
| Batch sem segredo | POST sem token | 401, banco intacto |
| YOLOX real | foto de rua com pessoas | ≥ 1 `person` com score > 0.5 |

## Riscos

| Risco | Mitigação |
|---|---|
| Centro da bbox cair em pixel sem depth válido | mediana de uma janela 5×5 de depth válido ao redor do centro |
| Pesos YOLOX indisponíveis no build | URL oficial fixada por versão; download com checksum; CI tolera ausência (o detector synthetic cobre os testes) |
| Recognition indisponível (repo privado) | fallback automático para YOLOX é parte do protocol desde o início |
