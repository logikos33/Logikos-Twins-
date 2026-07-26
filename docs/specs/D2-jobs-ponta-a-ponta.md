# Spec — D2 Fluxo de jobs ponta a ponta (com fake)

- **Status:** fechada
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

- [x] Gravar/enviar → `done` com artefatos aparecendo, **sem nenhum clique além de parar**
      (E2E no compose: complete → `queued` automático → `done` em 9 s, webhook na 1ª tentativa).
- [x] Webhook morto → o polling recupera: provado AO VIVO — antes do ajuste de
      `WEBHOOK_BASE_URL`, o webhook falhava por rede ("All connection attempts failed",
      3 tentativas) e a reconciliação convergiu o scan para `done` com outputs/metrics.
      É o cenário `FAKE_DROP_WEBHOOKS` acontecendo de verdade.
- [x] Webhook com token errado/ausente → 401 (verificado por curl); corpo malformado com
      token certo → 200 ignorado (retry não ajudaria; a reconciliação cobre).
- [x] Job FAILED → scan `error` com a mensagem do runner (teste de unidade da transição;
      exercitado também ao vivo na D0 com a fixture incompleta).
- [x] `make fixture` gera a sala 6×4×3 com objetos plantados; 10 testes geométricos,
      incluindo a identidade desprojeção(depth,K,c2w) ≡ world_points (mediana < 0,02 u)
      — a conta da D5 pré-validada. CI gera a fixture antes do pytest.
- [x] Estados ao vivo na página (poll 3 s), rótulos amigáveis por estado.

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
