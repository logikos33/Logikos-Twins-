# ADR-0005 — Detector plugável, com YOLOX (Apache-2.0) como base

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

A tese do produto é ancorar as detecções **do Recognition da Logikos** no mapa 3D. Mas o
Recognition é um repositório privado, com stack própria, e a demo precisa funcionar mesmo
sem ele por perto. Além disso, existe uma restrição dura de licença: **nada de AGPL ou
copyleft forte no caminho servido** (regra de ouro 3) — o que bane o stack ultralytics
(YOLOv5/v8/v11, AGPL-3.0), o detector mais óbvio do mercado.

## Opções consideradas

1. **Ultralytics YOLO** — melhor DX e ecossistema, e **AGPL-3.0**. Vetado por licença; a
   restrição não é negociável e já vale no projeto Recognition (que tem gate de licença em CI).
2. **Só o Recognition** — perde-se a capacidade de desenvolver e testar sem o repositório
   privado; a demo fica refém de uma integração ainda não feita.
3. **Interface `Detector` com duas implementações** — YOLOX (Megvii, **Apache-2.0**, export
   ONNX oficial, pesos COCO) como base que funciona sozinha, e `RecognitionDetector` como
   implementação principal quando disponível.

## Decisão

Opção 3. Um protocolo mínimo:

```python
class Detector(Protocol):
    def detect(self, image: np.ndarray) -> list[Detection]: ...
    # Detection = {label: str, score: float, bbox: [x1, y1, x2, y2]}
```

Selecionado por `DETECTOR=recognition|yolox`, com **fallback automático para YOLOX** se o
Recognition não carregar. Inferência via ONNX Runtime (CPU no dev, GPU no plug-in).

## Consequências

- A D5 entrega valor sem depender do repositório privado; a D5.5 troca a implementação sem
  tocar no pipeline de desprojeção, no cluster ou no viewer.
- Classes extras do Recognition (EPI, classes industriais próprias) enriquecem os pins
  automaticamente — o viewer não conhece a lista de rótulos, ela vem dos dados.
- A auditoria de licença do Recognition é **pré-condição da D5.5**, não uma formalidade: se
  ele depender de componente AGPL, a integração vira chamada a serviço separado (isolamento
  por processo) em vez de import, ou o backbone é substituído. Resultado vai para `LICENSES.md`.
- Limitação assumida e documentada: extintor **não** é classe COCO. Com YOLOX, o caso
  "ativos de segurança" cobre hidrante (COCO `fire hydrant`); extintor exige ajuste fino e
  fica registrado como pós-demo em `OPEN-QUESTIONS.md`.
