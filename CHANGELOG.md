# CHANGELOG

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Ainda sem versionamento semântico — a demo não foi lançada.

---

## [Não lançado]

### D0 — Bootstrap · 2026-07-26

**Adicionado**

- Monorepo com `apps/web` (Next.js 16 + TS strict + Prisma), `worker/`, `fake-runpod/`,
  `scripts/` e `docs/`.
- Ambiente de desenvolvimento completo por `docker compose`: Postgres, MinIO (papel do R2,
  com bucket e CORS configurados no boot) e o sósia do RunPod — **sem nenhuma credencial
  externa**.
- Sósia do RunPod implementando o contrato real: fila, cold start simulado, `/run`,
  `/status` e webhook com a política de retry do serviço (200 obrigatório, 2 tentativas,
  10 s), mais um interruptor para derrubar o webhook de propósito e exercitar a
  reconciliação.
- Adapter de storage S3 único para MinIO e R2, com multipart e assinatura separada para o
  navegador (uma URL assinada para `minio:9000` não funcionaria no celular).
- **Gate de licença** que reprova AGPL no caminho servido, com testes provando que ele
  falha quando deve.
- **Gate de vulnerabilidades** com exceções explícitas, justificadas e com prazo de
  validade — exceção vencida reprova o build.
- **Gate de processo**: a CI confere que a etapa declarada em `STATUS.md` tem spec escrita.
- Governança: `CLAUDE.md`, `docs/architecture.md` (C4 + fluxos em Mermaid), ADRs 0001–0008,
  template de spec e template de PR.
- `Makefile` com os comandos canônicos (`dev`, `check`, `fixture`, `reset`, `help`).

**Registrado**

- O repositório remoto `logikos33/Logikos-Twins-` estava **vazio** — não havia `main`
  publicada, ao contrário do que o plano de execução afirmava.
- A pasta de trabalho estava **dentro de outro repositório git** (o home do Vitor, que
  aponta para `epi-recognition-system`). Isolada com `.git` próprio.
- Commit do LingBot-Map pinado em `1f480ae` (Apache-2.0, verificado).

Ver `DECISIONS.md`.

### D1 — Dados e captura ao vivo · 2026-07-26

**Adicionado**

- Schema Prisma (scans, annotations, detections) e primeira migration; estados
  `recording`/`uploading` acrescentados ao ciclo do plano (a gravação ao vivo cria um
  intervalo em que o scan existe mas ainda está sendo filmado).
- Rotas de scan: criação com multipart aberto, assinatura de partes durante a gravação,
  complete com validação de limites, e consulta com presigned GETs. Token errado → 404.
- Página `/new` como página de GRAVAÇÃO (ADR-0008): câmera traseira, overlay guiado com
  protocolo de captura, timer com auto-parada no limite, wake lock, envio em segundo
  plano durante a gravação e aviso LGPD. Sem botão de upload no fluxo do celular.
- `PartBuffer` (≥ 5 MB por parte, exceção só na última) e `UploadQueue` (sequencial,
  backoff exponencial) como lógica pura — 13 testes de unidade, incluindo o bug de
  progresso que o teste pegou antes do navegador.
- Fallback de arquivo pelo MESMO pipeline de partes (desktop, drone, navegador sem
  suporte) e página `/scan/[id]` com polling.
- `docs/protocolo-captura.md`.

**Corrigido**

- Postgres do compose movido para a porta 5433 do host: a máquina tem um Postgres nativo
  sombreando a 5432 para conexões localhost (ver DECISIONS.md).

**Registrado**

- Prisma 7 mudou o modelo de configuração (prisma.config.ts + driver adapter) — seguido o
  modelo novo; cliente gerado fora do git.
- Expor `ETag` no CORS do bucket é pré-condição do upload direto — item obrigatório do
  plug-in para o R2.

### D2 — Jobs ponta a ponta · 2026-07-26

**Adicionado**

- **Cena sintética** (`scripts/make_fixture.py`, só numpy): sala 6×4×3 com objetos em
  posições declaradas, 48 NPZs no schema exato do motor, trajetória circular, PLY
  binário de 4 MB, poses.json, keyframes. 10 testes geométricos como regressão
  permanente — incluindo a identidade desprojeção(depth,K,c2w) ≡ world_points, que é a
  conta que a D5 usa para ancorar detecções (mediana de erro < 0,02 u).
- Adapter `JobRunner` (payload real do RunPod: input/webhook/policy), disparo
  automático do job ao concluir o upload, webhook autenticado com comparação de tempo
  constante, e reconciliação por polling (60 s) no instrumentation hook do Next.
- Estados ao vivo na página do scan; 10 testes novos de transição de estado.

**Provado**

- Caminho rápido: parar a gravação → `done` em 9 s (webhook na 1ª tentativa).
- Rede de segurança AO VIVO: com o webhook inalcançável (bug real de rede interna do
  compose, depois corrigido via `WEBHOOK_BASE_URL`), a reconciliação convergiu o scan
  para `done` sozinha — exatamente o cenário que o DoD pedia.

**Registrado**

- `WEBHOOK_BASE_URL` (interno vs público) — mesma classe do `S3_PUBLIC_ENDPOINT`; em
  produção fica vazio e usa a APP_URL.

### D3 — Worker real (sem GPU) · 2026-07-26

**Adicionado**

- Worker completo: `handler.py` (SDK runpod) + `pipeline/` — download, normalização
  ffmpeg (container unificado, rotação materializada nos pixels, **áudio removido e o
  objeto bruto substituído** pela versão muda — decisão 8/LGPD), inferência plugável
  (motor real na GPU; NPZs da fixture no dev), conversão NPZ→artefatos com filtro de
  confiança, voxel-downsample próprio (numpy puro) e teto de 35 MB imposto como
  invariante, upload com `video_key` real para a retenção.
- Dockerfile CUDA 12.8: motor pinado em `1f480ae`, sem kaolin (ADR-0007), ffmpeg na
  imagem. `[TESTAR no plug-in]` marcado onde só GPU valida.
- mypy strict no ferramental Python (18 arquivos) + gate na CI; 31 testes Python.

**Provado**

- E2E do worker REAL no compose: WebM/VP9 com áudio → MP4 H.264 mudo no storage
  (ffprobe: só stream de vídeo), 1,6 M pontos (22,9 MB) publicados, scan `done` em
  1,2 s de pipeline.

**Registrado**

- ffmpeg moderno descarta a tag `rotate`; rotação real de celular é Display Matrix
  (`-display_rotation`) — o teste reproduz o mecanismo verdadeiro.

### D4 — Viewer "controle do mapa" · 2026-07-26

**Adicionado**

- Viewer Three.js com arquitetura React-fora-da-cena (a cena vive em ViewerEngine;
  o React só faz UI): PLY com barra de progresso, órbita / voo WASD / planta baixa,
  trajetória da câmera + replay animado, corte por altura, camadas ligáveis.
- **Medição com calibração de escala**: dois picks + distância real → fator salvo em
  `scans.scale`; medições passam a exibir metros. Verificado ao vivo: 7,09 u
  calibrados como 5,67 m → fator 0,79999 (0,001% do exato) → remedição exibiu 5,67 m.
- **Pins de anotação com foto-evidência**: clique na nuvem → pin + texto + JPEG do
  keyframe cuja câmera estava mais próxima (rota de keyframe com redirect assinado).
- Rotas: PUT scale, GET/POST annotations, GET keyframe; galeria `/` com thumbnails
  e link de compartilhamento; picking com rejeição de arraste (clique de órbita não
  vira ponto de medição).
- 8 testes novos de lógica pura (escala, formatação, keyframe mais próximo).

**Verificado em navegador**

- Fluxo completo na cena sintética: medição, calibração, pin com foto, planta baixa
  com corte a 50%, mobile 375×812 sem scroll horizontal.
