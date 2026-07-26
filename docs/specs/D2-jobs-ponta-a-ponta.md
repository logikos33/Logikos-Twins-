# Spec — D2 Fluxo de jobs ponta a ponta (com fake)

- **Status:** em execução
- **Etapa:** D2
- **ADRs relacionados:** [0004](../adr/0004-fake-runpod-sosia-de-contrato.md), [0006](../adr/0006-artefato-ply-preview.md)

## Objetivo

Do toque em **parar** até o mapa pronto, sem nenhum clique: o scan dispara o job sozinho,
os estados avançam ao vivo na tela, e a falha de webhook não perde nenhum job. No modo
default (`synthetic`), tudo isso roda em segundos, com os artefatos da cena sintética.

## Escopo

- **Cena sintética** (`scripts/make_fixture.py`): sala 6×4×3 com objetos, trajetória
  circular, NPZs no schema do plano §3.3 + artefatos prontos (`cloud_preview.ply`,
  `poses.json`, `meta.json`, `keyframes/`). Dimensões conhecidas por construção — vira o
  teste de medição da D4 e de desprojeção da D5.
- Adapter `JobRunner`: `startJob(scan)` monta o payload real do contrato
  (`{input:{scan_id, video_url, params}, webhook, policy:{executionTimeout}}`) e chama
  `POST /v2/{endpoint}/run`; `getJobStatus(jobId)` consulta `/status`.
- Disparo automático: `complete` bem-sucedido → `startJob` → `queued`.
- Webhook `POST /api/webhooks/runpod?token=` — valida o segredo, atualiza
  status/outputs/metrics, responde 200 rápido.
- Reconciliação: varredura periódica de scans presos em `queued`/`processing` há mais de
  60 s sem webhook → consulta `/status` e converge o estado.
- Página `/scan/[id]`: estados ao vivo com mensagens amigáveis.

## Não-escopo

- Worker real e conversão NPZ→PLY de verdade — **D3** (o modo `synthetic` devolve
  artefatos pré-gerados).
- Viewer 3D dos artefatos — **D4**.
- Cron de retenção e painel admin — **D7**.

## Contratos afetados

- **Payload do job e corpo do webhook** — fixados aqui, iguais aos do RunPod real.
- `scans.runpod_job_id`, `outputs`, `metrics` passam a ser escritos.
- Env novas: nenhuma (todas já declaradas).
- A reconciliação roda **dentro do processo web** (setInterval no instrumentation hook do
  Next) — sem serviço novo. Registrar limitação: em múltiplas réplicas rodaria N vezes;
  aceitável (a operação é idempotente) e documentado.

## Fatias verticais

1. `make_fixture.py` + teste geométrico da cena (regressão permanente).
2. Adapter `JobRunner` + disparo automático no complete.
3. Webhook com validação de segredo + testes de contrato.
4. Reconciliação por polling + teste do cenário "webhook morto".
5. Página de status ao vivo.

## Critérios de aceite

- [ ] Gravar/enviar → `done` com artefatos aparecendo, **sem nenhum clique além de parar**.
- [ ] `FAKE_DROP_WEBHOOKS=true` (webhook nunca chega) → o polling recupera o job e o scan
      chega a `done` sozinho.
- [ ] Webhook com token errado → 401, sem efeito no banco.
- [ ] Job que falha no fake → scan em `error` com mensagem legível.
- [ ] `make fixture` gera cena com dimensões exatas conhecidas; teste automatizado
      verifica a geometria (paredes onde deveriam estar).
- [ ] Estados visíveis na página mudam ao vivo (poll 3 s): queued → processing → done.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Payload do run | scan `uploaded` | POST /run com scan_id, video_url presignado, params e webhook com token |
| Webhook válido | COMPLETED + outputs | scan `done`, outputs/metrics gravados |
| Webhook token errado | token inválido | 401, banco intacto |
| Webhook FAILED | status FAILED + error | scan `error` com a mensagem |
| Reconciliação | job COMPLETED mas webhook descartado | scan converge para `done` em ≤ ~60 s |
| Fixture | `make fixture` | PLY ≤ 35 MB; caixa 6×4×3 verificável nos pontos |

## Riscos

| Risco | Mitigação |
|---|---|
| Reconciliação e webhook atualizando o mesmo scan ao mesmo tempo | Transições idempotentes: só avançar estado, nunca regredir; update condicional por status |
| setInterval no processo web não sobrevive a restart | Aceito no dev; em produção o Railway reinicia o processo e o interval volta junto |
| Fixture grande no git | `fixtures/` está no .gitignore — sempre gerada, nunca versionada |
