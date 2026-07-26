# Spec — D3 Worker real (código completo, sem GPU)

- **Status:** em execução
- **Etapa:** D3
- **ADRs relacionados:** [0006](../adr/0006-artefato-ply-preview.md), [0007](../adr/0007-modo-windowed-do-motor.md), [0008](../adr/0008-captura-ao-vivo-sem-botao-de-upload.md)

## Objetivo

Todo o código que rodará na GPU do RunPod existe, está testado em CPU sobre a cena
sintética, e a imagem Docker builda. Na FASE PLUG-IN, o que falta é apenas: GPU real,
pesos reais, push da imagem. Zero código novo.

## Escopo

- `worker/handler.py` — handler do SDK `runpod`, orquestra o pipeline e devolve
  `{scan_id, outputs, metrics}` (o formato que o webhook/sósia já usam).
- `worker/pipeline/`:
  - `download.py` — baixa o vídeo da URL presignada.
  - `normalize.py` — `ffmpeg`: WebM/MOV→MP4 H.264 (o container varia por navegador,
    ADR-0008), aplica rotação de metadados (`-autorotate`), **remove o áudio**
    (decisão 8) e re-sobe o bruto sem trilha, substituindo o objeto.
  - `infer.py` — chama `demo_render/batch_demo.py` por subprocess com as flags do
    ADR-0007; no dev (sem GPU/pesos), o modo `fixture` pula a inferência e usa os NPZs
    da cena sintética.
  - `npz_to_artifacts.py` — NPZs → `cloud_preview.ply` (filtro `world_points_conf ≥ 1.5`,
    voxel-downsample com alvo 1,8 M pontos e teto 35 MB), `poses.json`, `meta.json`,
    `keyframes/*.jpg` (JPEG de verdade, qualidade 70), `thumb.jpg`.
  - `upload.py` — sobe artefatos ao storage sob `scans/{id}/`.
- `worker/Dockerfile` — base CUDA 12.8, Python 3.10, torch cu128, clone do LingBot-Map
  no commit pinado `1f480ae`, deps mínimas (sem kaolin — `--no_render`).
- Testes pytest do pipeline sobre a fixture.
- `FAKE_MODE=local-worker` executa este handler de ponta a ponta.

## Não-escopo

- Execução com GPU e pesos reais — plug-in (F0). Pontos que só GPU valida ficam
  marcados `[TESTAR no plug-in]` no código.
- Detector YOLOX — **D5** (mas o pipeline já deixa os keyframes que ele consome).

## Contratos afetados

- Formato de retorno do handler = o que o sósia já emite (nenhuma mudança na web).
- `outputs` ganha as chaves definitivas: `cloud_preview_key`, `poses_key`, `meta_key`,
  `thumb_key`, `keyframes_prefix`.
- Env do worker: `MODEL_PATH`, `S3_*`, `WORKER_MODE=real|fixture`, `FIXTURE_NPZ_DIR`.

## Fatias verticais

1. `npz_to_artifacts.py` puro + testes (conversão, filtro, downsample, teto de 35 MB).
2. `normalize.py` + testes com vídeos pequenos gerados por ffmpeg no teste.
3. `handler.py` + `download.py`/`upload.py` + teste de integração com MinIO do compose.
4. Dockerfile + build na CI.
5. `local-worker` ponta a ponta no compose.

## Critérios de aceite

- [ ] pytest verde no worker, sem GPU, cobrindo conversão/filtro/downsample/normalização.
- [ ] `FAKE_MODE=local-worker`: gravar/enviar → worker real processa as fixtures →
      artefatos válidos no MinIO → scan `done`.
- [ ] Vídeo WebM de teste é normalizado para MP4 sem áudio (verificável por ffprobe).
- [ ] O objeto bruto no storage é SUBSTITUÍDO pela versão sem áudio.
- [ ] `docker build` do worker completa na CI.
- [ ] `cloud_preview.ply` gerado pelo worker respeita o teto de 35 MB e o alvo de pontos.
- [ ] Todo ponto que só GPU valida está marcado `[TESTAR no plug-in]`.

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Conversão | NPZs da fixture | PLY binário legível, pontos = pontos com conf ≥ 1.5 (pós-downsample) |
| Filtro | frame com conf 0 e 2 | só os pontos de conf 2 sobrevivem |
| Downsample | alvo menor que o total | número de pontos dentro de ±20% do alvo |
| Teto | PLY > 35 MB simulado | reduz alvo e refaz, nunca sobe acima do teto |
| Normalização | WebM VP9 com áudio | MP4 H.264 sem trilha de áudio |
| Rotação | MP4 com rotação 90° nos metadados | frames já rotacionados na saída |
| Handler | job da fixture | retorno {scan_id, outputs, metrics} com todas as chaves |

## Riscos

| Risco | Mitigação |
|---|---|
| Flags do batch_demo divergirem do documentado | Confinadas em `infer.py`; validação real na F0 (`[TESTAR no plug-in]`) |
| open3d indisponível no Python do dev | O worker roda em container 3.10/3.11; downsample tem implementação própria por grade de voxel (numpy puro) para os testes fora do container |
| Imagem gigante (torch + CUDA) | Sem kaolin (ADR-0007); wheels cu128 direto do índice PyTorch; uma única stage |
| ffmpeg ausente na imagem | Instalado no Dockerfile; teste de integração falha alto se faltar |
