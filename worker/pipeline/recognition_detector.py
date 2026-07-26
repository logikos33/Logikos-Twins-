"""Integração do Recognition da Logikos (D5.5 — autorizada pelo Vitor).

O produto irmão é o detector PRINCIPAL assim que integrado; classes próprias (EPI,
classes industriais) enriquecem os pins e a busca — é a tese do produto.

Estado atual: o repositório do Recognition é privado e a integração exige três
passos com ele à mão (PROMPT-EXECUCAO § Integração):

1. Clonar/localizar o repositório e mapear: formato dos pesos, classes, pré/pós,
   como a inferência é chamada hoje.
2. **Auditoria de licença** (pré-condição dura): se houver componente AGPL no
   caminho (ex.: stack ultralytics), NÃO importar — isolar como serviço separado ou
   trocar o backbone. Resultado vai a LICENSES.md.
3. Implementar `detect()` aqui, cumprindo o MESMO protocol do YOLOX.

Enquanto isso, este módulo falha ao carregar com mensagem clara — e a fábrica
(`make_detector`) cai para o YOLOX automaticamente, como o ADR-0005 especifica.
O contrato do fallback tem teste; a demo nunca fica sem detector.
"""

from __future__ import annotations

import numpy as np

from pipeline.detect import Detection


class RecognitionDetector:
    def __init__(self) -> None:
        raise NotImplementedError(
            "RecognitionDetector aguarda o repositório do Recognition (D5.5): "
            "mapear pesos/classes, auditar licenças (nada de AGPL no caminho servido) "
            "e implementar detect(). Até lá, DETECTOR=recognition cai para o YOLOX."
        )

    def detect(self, image: np.ndarray) -> list[Detection]:  # pragma: no cover
        raise NotImplementedError
