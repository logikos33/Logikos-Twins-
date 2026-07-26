# Spec — D5 Recognition ancorado (YOLOX) · D5.5 integração Recognition

- **Status:** em execução
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

- [ ] Busca "onde está X?" na cena sintética acha o objeto plantado com erro
      < 5% do tamanho da cena (teste automatizado usando o detector synthetic).
- [ ] YOLOX-s roda numa foto real em CPU no dev e devolve detecções COCO plausíveis.
- [ ] Objetos vistos em vários keyframes viram 1 cluster (não N pins).
- [ ] Rota batch recusa chamadas sem o segredo (401).
- [ ] Viewer: filtro por classe e voo de câmera funcionais na cena sintética.

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
