# ADR-0004 — `fake-runpod` como sósia de contrato, não como stub

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O processamento roda em GPU alugada (RunPod Serverless), que custa dinheiro e exige conta.
Todo o desenvolvimento (D0–D7) precisa acontecer sem isso. A tentação óbvia é mockar a
chamada de job dentro da web — mas então o código que fala com o RunPod nunca executa, e os
bugs de integração (formato do payload, ordem dos estados, retry do webhook, job preso)
ficam todos represados para o dia do plug-in, que é exatamente o dia em que se quer zero
surpresa.

## Opções consideradas

1. **Mock em memória dentro da web** (stub da função `startJob`) — rápido, e prova nada.
   O caminho HTTP, a serialização, o webhook e a reconciliação não são exercitados.
2. **Gravar/reproduzir respostas reais** (VCR) — exigiria uma conta RunPod para gravar. Volta
   ao problema.
3. **Serviço HTTP local que implementa o contrato do RunPod** — a web fala HTTP de verdade,
   com o mesmo payload, e recebe webhook de verdade, com os mesmos retries.

## Decisão

Opção 3. `fake-runpod/` é um serviço FastAPI no compose que implementa:

- `POST /v2/{endpoint_id}/run` → enfileira, responde `{id, status: "IN_QUEUE"}`
- `GET  /v2/{endpoint_id}/status/{id}` → `IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED`
- chamada do `webhook` ao concluir, **com a política real: exige HTTP 200, 2 retries com 10 s**

Dois modos por variável de ambiente:

- `FAKE_MODE=synthetic` (default) — devolve os artefatos da cena sintética após um atraso
  configurável, simulando fila e cold start. Rápido, determinístico, é o que a CI usa.
- `FAKE_MODE=local-worker` — executa o **worker real** em CPU dentro do container, sobre as
  fixtures. Lento, mas prova o código de verdade (é o DoD da D3).

## Consequências

- O código da web que chama o RunPod é o código de produção. No plug-in, muda-se
  `RUNPOD_BASE_URL` e a chave — nada mais.
- Os cenários de falha são **testáveis à vontade**: derrubar o webhook para provar a
  reconciliação por polling (DoD da D2), simular cold start longo, simular `FAILED`.
- Custo: `fake-runpod` é código que não vai para produção e ainda assim precisa ser mantido
  em dia com o contrato. Mitigação: ele é pequeno, e o schema do payload é validado com o
  mesmo Zod/Pydantic dos dois lados.
- Risco residual honesto: o sósia reproduz o contrato **documentado** do RunPod. Se o RunPod
  real divergir da própria documentação, isso só aparece no plug-in. Os pontos de maior
  suspeita estão marcados `[TESTAR no plug-in]` no código.
