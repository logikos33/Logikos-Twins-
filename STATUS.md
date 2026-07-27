# STATUS

**Etapa atual:** D7
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
| **D3** | Worker real completo, rodando sem GPU | ✅ concluída |
| **D4** | Viewer "controle do mapa": medição, pins, trajetória | ✅ concluída |
| **D5** | Detecções ancoradas em 3D (+ D5.5 Recognition) | ✅ concluída² |
| **D6** | Escala automática por ArUco + blur de rostos | ✅ concluída |
| **D7** | Retenção, painel admin, limites, logs | ✅ concluída |
| **PLUG-IN** | Contas, GPU real, deploy | 🔒 **só com o Vitor presente** |

¹ Um critério da D1 aguarda validação física: gravar 60 s **de um celular de verdade**
exige HTTPS na rede local (mkcert ou túnel — instruções em `docs/protocolo-captura.md`).
O caminho de código é o mesmo já provado por E2E via API + verificação em navegador.

² A D5.5 (integração do Recognition real) aguarda o repositório privado: a interface,
o fallback automático e o procedimento (com auditoria de licença como pré-condição)
estão prontos em `worker/pipeline/recognition_detector.py`.

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

## O que a D3 deixou pronto

- Worker completo: handler (SDK runpod) + pipeline com download, normalização ffmpeg
  (WebM/MOV → MP4 H.264, rotação materializada, **áudio removido e bruto substituído**),
  inferência (real na GPU / fixtures no dev), NPZ→artefatos (filtro conf ≥ 1.5,
  voxel-downsample próprio em numpy, PLY binário com teto de 35 MB imposto), upload
  e métricas com `video_key` real.
- **E2E do worker REAL no compose** (`FAKE_MODE=local-worker`): WebM com áudio entrou
  pelo fluxo de partes; MP4 mudo ficou no storage; 1,6 M pontos publicados; `done`.
- Dockerfile CUDA 12.8 com o motor pinado em `1f480ae`, sem kaolin. mypy strict verde.
- Achado: celulares gravam rotação como Display Matrix (`-display_rotation`), não como
  tag `rotate` — o teste gera vídeo do jeito real.

## O que a D4 deixou pronto

- Viewer Three.js completo (React fora da cena): PLY com progresso, órbita / voo /
  planta baixa, trajetória + replay, corte por altura, camadas, galeria com thumbs
  e compartilhamento.
- **Medição com calibração verificada ao vivo**: 7,09 u calibrados como 5,67 m →
  fator 0,79999 → remedição exibiu 5,67 m. Pin com foto do keyframe mais próximo
  funcionando (aberto em navegador, foto carregada por redirect assinado).
- Mobile 375×812 verificado.

## O que a D5 deixou pronto

- **A tese funciona de ponta a ponta**: detector → desprojeção → cluster → pins
  semânticos → busca "onde está X?" com voo de câmera e card de evidência — provado
  ao vivo na cena sintética, no modo DEFAULT do compose.
- YOLOX-s ONNX validado contra ground truth do COCO em CPU (gatos 0,93; person 0,78).
- Detector plugável com fallback automático; stub do Recognition com o procedimento
  da D5.5 documentado.
- Ancoragem testada: pin a < 5% da cena, medido à caixa do objeto (métrica registrada).

## O que a D6 deixou pronto

- Escala automática por ArUco provada no E2E (fator a 1,5% do gabarito, zero cliques),
  com fallback manual intacto; PDF do marcador em `/api/marker`.
- Blur de rostos opcional por scan com YuNet (MIT verificado na fonte — Q5 resolvido),
  testado com foto real; falha de blur é fatal por decisão (privacidade não degrada
  em silêncio).

## O que a D7 deixou pronto — e o fechamento do desenvolvimento

- **Retenção provada ao vivo**: 18 vídeos brutos apagados num tick (TTL de 1 min no
  teste), artefatos preservados, logs JSON com scan_id.
- Limite diário (429 + bypass por ADMIN_TOKEN), painel `/admin` (sem token → 404),
  galeria protegida, logs de ciclo de vida.
- **10/10 uploads consecutivos sem intervenção** — o DoD do desenvolvimento.
- `PLUGIN-CHECKLIST.md`: a FASE PLUG-IN passo a passo, para executar COM o Vitor.

### Portão do plug-in: ABERTO

`docker compose up` do zero → gravar/enviar → estados ao vivo → mapa navegável →
medir (manual e ArUco) → pin com foto → detecções e busca → compartilhar → admin.
Gates de licença/vulnerabilidade/spec verdes; **nenhuma credencial real usada em
lugar nenhum**. Specs D0–D7 fechadas com critérios marcados; a FASE PLUG-IN espera
o Vitor (PLUGIN-CHECKLIST.md).
