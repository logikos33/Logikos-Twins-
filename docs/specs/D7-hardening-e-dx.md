# Spec — D7 Hardening e DX

- **Status:** em execução
- **Etapa:** D7
- **ADRs relacionados:** [0003](../adr/0003-storage-adapter-s3.md) (retenção opera no storage), [0004](../adr/0004-fake-runpod-sosia-de-contrato.md)

## Objetivo

A demo aguenta ser mostrada a terceiros sem vergonha e sem risco: a promessa de LGPD
(vídeo morre em 7 dias) é um JOB rodando, não uma frase; o custo é visível num painel;
abuso tem teto; e o caminho do plug-in está escrito passo a passo.

## Escopo

- **Retenção**: varredura periódica (no mesmo instrumentation hook da reconciliação)
  apaga o vídeo bruto de scans com mais de `VIDEO_RETENTION_MINUTES` (padrão 7 dias;
  minutos no dev para testar), marca `video_deleted_at`, PRESERVA artefatos. Usa
  `outputs.video_key` (a chave real pós-normalização) com fallback para `videoKey`.
- **Painel `/admin`** (via `ADMIN_TOKEN` na query/header): lista de scans com status,
  custo estimado acumulado (`metrics.cost_usd_est`), erros recentes, contagem por dia.
- **Galeria protegida**: `/` completa passa a exigir `?admin=<token>`; sem token, a
  página vira só o call-to-action de novo scan (o acesso a um scan continua pelo link).
- **Limites**: `MAX_SCANS_PER_DAY` (por instância, contagem no banco) sem admin token
  → 429 com mensagem legível.
- **Logs JSON** na web: eventos de ciclo de vida (scan criado, job disparado, webhook,
  reconciliação, retenção) com `scan_id` — correlação web↔worker.
- **`PLUGIN-CHECKLIST.md`**: passo a passo executável da FASE PLUG-IN, com tudo que
  ficou marcado `[TESTAR no plug-in]` inventariado.
- Revisão final do `README.md`.

## Não-escopo

- Lifecycle nativo de bucket (R2) — vai como item do PLUGIN-CHECKLIST (é config de
  conta, não código).
- Autenticação de usuário final — fora do produto da demo (decisão 3).

## Fatias verticais

1. Retenção + testes (o serviço puro decide "o que apagar"; o job aplica).
2. Limite diário + teste de contrato (429).
3. Painel /admin + galeria protegida.
4. Logs JSON estruturados na web.
5. PLUGIN-CHECKLIST.md + README final.

## Critérios de aceite

- [ ] Scan com vídeo além do prazo → objeto some do storage, `video_deleted_at`
      preenchido, artefatos e viewer intactos (provado no compose com TTL de minutos).
- [ ] Scans dentro do prazo e scans já limpos não são tocados (idempotência).
- [ ] 21º scan do dia sem token → 429; com ADMIN_TOKEN → passa.
- [ ] `/admin` mostra scans, custo acumulado e erros; sem token → 404.
- [ ] Galeria `/` sem token não lista scans de terceiros.
- [ ] 10 uploads consecutivos sem intervenção manual (script) — DoD do desenvolvimento.
- [ ] PLUGIN-CHECKLIST.md cobre: contas/billing caps, bucket+CORS+ETag+lifecycle,
      volume de pesos, imagem+endpoint, F0/runbook, deploy Railway, smoke real,
      inventário de `[TESTAR no plug-in]`.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Retenção vence | scan `done` com createdAt > TTL | vídeo apagado, artefatos ficam |
| Retenção não vence | scan recente | intocado |
| Já limpo | `video_deleted_at` preenchido | não tenta de novo |
| Limite | 20 scans hoje + POST sem token | 429 |
| Admin bypass | POST com header X-Admin-Token válido | 201 |
| Painel sem token | GET /admin | 404 |

## Riscos

| Risco | Mitigação |
|---|---|
| Apagar o objeto errado (chave divergente pós-normalização) | Usa `outputs.video_key` primeiro; testes cobrem webm→mp4 |
| Job de retenção rodando N vezes em N réplicas | Operação idempotente (delete + marca); mesmo padrão aceito na reconciliação |
| Painel vazar por token fraco | ADMIN_TOKEN min 8 chars na validação de env; PLUGIN-CHECKLIST manda trocar por segredo forte |
