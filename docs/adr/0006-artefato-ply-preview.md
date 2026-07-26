# ADR-0006 — `cloud_preview.ply` binário, alvo de 1,8 M pontos, teto de 35 MB

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O motor produz uma nuvem por frame; um vídeo de 2 min a 8 fps gera centenas de milhões de
pontos brutos. O viewer roda **no celular**, muitas vezes em 4G, e é o primeiro contato do
cliente com a demo. Um artefato pesado demais transforma "mapa 3D em segundos" numa barra de
progresso.

## Opções consideradas

1. **Servir a nuvem completa** — fiel, e inviável: 50–200 M pontos, centenas de MB, e o
   navegador do celular morre antes de renderizar.
2. **GLB nativo do motor** (`--save_glb`) — atalho conveniente (GLTFLoader), mas tira o
   controle sobre filtragem e downsample, e a compatibilidade com `--no_render` é incerta
   (marcado `[CODE]` no plano §9.10).
3. **NPZ → nossa conversão para PLY binário** — controle total sobre o filtro de confiança
   e o alvo de pontos.

## Decisão

Opção 3 como caminho principal. `cloud_preview.ply`: XYZ + RGB, **binário** (não ASCII),
filtrado por `world_points_conf ≥ 1.5`, voxel-downsampled buscando **~1,8 M pontos**, com
teto duro de **35 MB**. `cloud_full.ply.gz` é opcional, para download, gerado só se couber
no tempo.

O voxel é calculado **relativo à bounding box da cena**, não em metros: a escala do motor é
arbitrária até a calibração (D4), então "voxel de 2 cm" não significa nada nesta etapa. A
busca ajusta o voxel iterativamente até cair na faixa-alvo.

## Consequências

- PLY binário é ~4× menor que ASCII e carrega muito mais rápido no `PLYLoader`.
- O filtro de confiança é o que separa "nuvem" de "nuvem com fantasmas": pontos de baixa
  confiança são ruído estrutural, não detalhe.
- O teto de 35 MB é verificável e vira **teste**, não intenção: se a conversão estourar, o
  worker reduz o alvo e refaz — não sobe um artefato que o celular não aguenta.
- Consequência de custo, registrada porque justifica a escolha: cada MB a menos é egress
  economizado a cada visualização — e no R2 o egress é zero, mas o tempo do cliente não é.
- `--save_glb` continua sendo testado no plug-in como possível atalho complementar; se
  funcionar bem com `--no_render`, entra como artefato adicional, nunca como substituto.
