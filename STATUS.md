# STATUS

**Etapa atual:** D3
**Última atualização:** 2026-07-26

> Este arquivo é por onde o Vitor acompanha. Uma etapa fechada é atualizada aqui no mesmo
> commit em que fecha.

---

## Onde estamos

| Etapa | O que entrega | Situação |
|---|---|---|
| **D0** | Bootstrap: monorepo, compose sem credenciais, governança, CI | ✅ concluída |
| **D1** | Banco + captura ao vivo na página (sem botão de upload) | ✅ concluída¹ |
| **D2** | Fluxo de jobs ponta a ponta com o sósia do RunPod | ✅ concluída |
| **D3** | Worker real completo, rodando sem GPU | ⏳ em andamento |
| D4 | Viewer "controle do mapa": medição, pins, trajetória | ⬜ |
| D5 | Detecções ancoradas em 3D (+ D5.5 Recognition) | ⬜ |
| D6 | Escala automática por ArUco + blur de rostos | ⬜ |
| D7 | Retenção, painel admin, limites, logs | ⬜ |
| **PLUG-IN** | Contas, GPU real, deploy | 🔒 **só com o Vitor presente** |

¹ Um critério da D1 aguarda validação física: gravar 60 s **de um celular de verdade**
exige HTTPS na rede local (mkcert ou túnel — instruções em `docs/protocolo-captura.md`).
O caminho de código é o mesmo já provado por E2E via API + verificação em navegador.

---

## Como testar agora

```bash
cp .env.example .env
make dev
```

Sobe Postgres, MinIO (no papel do R2), o sósia do RunPod e a web. **Nenhuma credencial é
pedida em momento algum** — esse é o ponto.

Depois disso:

| O quê | Onde |
|---|---|
| Aplicação | http://localhost:3000 |
| Healthcheck | http://localhost:3000/api/health |
| Console do MinIO | http://localhost:9001 (`twins-dev` / `twins-dev-secret`) |
| Sósia do RunPod | http://localhost:8080/health |

Para rodar os mesmos gates que a CI roda:

```bash
make check
```

---

## O que a D0 deixou pronto

- Repositório **isolado** do repositório git que existe no home do Vitor (era uma armadilha
  real — ver `DECISIONS.md`), com `referencias/` fora do versionamento.
- Ambiente completo por `docker compose`, sem nenhuma conta externa.
- Governança instalada: `CLAUDE.md`, `docs/architecture.md`, ADRs 0001–0008, template de
  spec, template de PR.
- **Gate de licença que reprova de verdade** — com testes que provam as duas direções
  (passa hoje; reprova se alguém reintroduzir ultralytics/AGPL).
- **Gate de vulnerabilidades** com lista de exceções explícita e com prazo: exceção vencida
  reprova o build, para a lista não virar depósito.
- Gate de processo: a CI confere que a etapa declarada aqui tem spec escrita.

## O que a D1 deixou pronto

- Schema Prisma completo (scans, annotations, detections) + primeira migration aplicada.
- Rotas: `POST /api/scans` (abre multipart), `POST .../parts` (assina parte),
  `POST .../complete` (fecha e valida limites), `GET /api/scans/[id]` (estado +
  artefatos). Token errado → **404**, nunca 403 — não se vaza existência.
- Página `/new`: gravação com câmera traseira, envio em segundo plano DURANTE a
  gravação (PartBuffer ≥ 5 MB + UploadQueue sequencial com backoff — ambos puros e
  testados), wake lock, auto-parada no limite, e fallback de arquivo pelo MESMO pipeline.
- Página `/scan/[id]` com polling de estado.
- E2E provado: criar → 2 partes → complete → objeto de 8 MiB no MinIO (ETag multipart).
- `docs/protocolo-captura.md` (inclui como testar a câmera no celular: mkcert/túnel).

## O que a D2 deixou pronto

- **Cena sintética**: sala 6×4×3 com objetos plantados, 48 NPZs no schema do motor,
  PLY de 4 MB, poses, keyframes. 10 testes geométricos — incluindo a identidade de
  desprojeção que a D5 vai usar, já validada com mediana < 0,02 u.
- Adapter `JobRunner` com o payload real (`input/webhook/policy`), disparo automático
  no fim do upload, webhook autenticado (comparação de tempo constante) e
  **reconciliação por polling** que converge scans órfãos.
- **A rede de segurança foi provada ao vivo**: com o webhook inalcançável, o polling
  levou o scan a `done` sozinho. Do toque em "parar" ao `done`: 9 s no caminho rápido.
- 26 testes na web; a CI passou a gerar a fixture antes do pytest.

## O que falta para a D3

- `worker/handler.py` (SDK runpod) + `pipeline/`: download, normalização ffmpeg
  (WebM→MP4), strip de áudio + re-upload, subprocess do `batch_demo.py`,
  `npz_to_artifacts` (filtro conf ≥ 1.5, voxel-downsample → 1,8 M pontos, PLY binário),
  poses/meta/keyframes, upload, métricas.
- Dockerfile CUDA 12.8 buildável (execução GPU só no plug-in; `[TESTAR no plug-in]`).
- `FAKE_MODE=local-worker` processando as fixtures ponta a ponta.
