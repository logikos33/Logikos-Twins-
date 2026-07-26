# LICENSES.md

**Regra dura:** permitido **Apache-2.0, MIT, BSD-3** e equivalentes permissivos. **Proibido
AGPL e copyleft forte** em qualquer dependência, modelos incluídos. Se a única opção para
algo for copyleft, **pare e pergunte** — não contorne.

A regra é verificada automaticamente por [`scripts/license_gate.py`](./scripts/license_gate.py),
que roda na CI e tem testes provando que ele reprova de verdade
([`worker/tests/test_license_gate.py`](./worker/tests/test_license_gate.py)).

---

## Banidos, e por quê

| Pacote | Licença | Observação |
|---|---|---|
| `ultralytics` (YOLOv5/v8/v11) | **AGPL-3.0** | O detector mais óbvio do mercado — e por isso o mais fácil de alguém instalar sem pensar. Substituto: **YOLOX**. Ver ADR-0005. |
| `super-gradients` | restritiva p/ uso comercial | — |

A AGPL é o problema porque alcança uso em rede: servir o produto a um cliente já dispararia
a obrigação de abrir o código. Não é uma questão de gosto por licenças.

---

## Componentes principais

| Componente | Licença | Papel |
|---|---|---|
| **LingBot-Map** (Robbyant/Ant Group) | **Apache-2.0** ✔ | Motor de reconstrução 3D. Commit pinado `1f480aeb8a47a24656090d46d053115b7fe60435`, verificado via API do GitHub em 2026-07-26. |
| **YOLOX** (Megvii) | **Apache-2.0** ✔ | Detector base, export ONNX oficial. Ver ADR-0005. |
| **Recognition** (Logikos) | proprietário, interno | Detector principal a partir da D5.5. **Auditoria de licença das dependências dele é pré-condição da integração** — se trouxer componente AGPL, isola-se como serviço separado ou troca-se o backbone. Resultado desta auditoria será registrado aqui. |

---

## Web (`apps/web`)

| Pacote | Licença |
|---|---|
| next | MIT |
| react, react-dom | MIT |
| three | MIT |
| @prisma/client, prisma | Apache-2.0 |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | Apache-2.0 |
| zod | MIT |
| tailwindcss | MIT |
| typescript | Apache-2.0 |
| eslint | MIT |
| prettier | MIT |
| vitest | MIT |

## Worker (`worker/`)

| Pacote | Licença |
|---|---|
| runpod | MIT |
| boto3 / botocore | Apache-2.0 |
| numpy | BSD-3-Clause |
| opencv-python-headless | Apache-2.0 (OpenCV 4.5+) |
| open3d | MIT |
| onnxruntime | MIT |
| torch | BSD-3-Clause |

> **Nota sobre o OpenCV:** o pacote é Apache-2.0, mas **modelos distribuídos pelo OpenCV Zoo
> têm licenças individuais**, que não se herdam do repositório. Isso é relevante na D6, para o
> detector de rostos do blur — a verificação é pré-condição de adotar qualquer modelo de lá,
> e está registrada em `OPEN-QUESTIONS.md` (Q5).

## Sósia do RunPod (`fake-runpod/`) — desenvolvimento apenas

| Pacote | Licença |
|---|---|
| fastapi | MIT |
| uvicorn | BSD-3-Clause |
| httpx | BSD-3-Clause |
| pydantic | MIT |

---

## Modelos e pesos

| Artefato | Origem | Licença |
|---|---|---|
| `lingbot-map.pt` (4,63 GB) | HF `robbyant/lingbot-map` | Apache-2.0 (segue o repositório) |
| YOLOX-s ONNX (COCO) | GitHub `Megvii-BaseDetection/YOLOX` | Apache-2.0 |
| Detector de rostos (blur, D6) | **a definir** | **verificar ANTES de adotar** — ver `OPEN-QUESTIONS.md` Q5 |

---

## Ao adicionar uma dependência

1. Confira a licença **antes** de instalar.
2. Registre aqui, na tabela do componente certo.
3. Se for copyleft forte, **não instale** — traga a questão.
4. O gate da CI pega o caso conhecido; ele **não** substitui esta conferência, porque só
   conhece os nomes que já estão na lista.
