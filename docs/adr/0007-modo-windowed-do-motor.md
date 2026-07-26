# ADR-0007 — Modo `windowed` do LingBot-Map com janela de 128 frames

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O LingBot-Map é um modelo feed-forward de reconstrução em streaming. O `batch_demo.py`
oferece modos de execução; processar um vídeo inteiro de uma vez é limitado por VRAM
(o paper reporta ~13,3 GB no streaming), e a demo precisa aceitar vídeos de até 3 minutos
(≈1.440 frames a 8 fps) numa GPU de 24 GB.

## Opções consideradas

1. **Vídeo inteiro numa passada** — melhor consistência global, VRAM proporcional ao número
   de frames. Estoura em vídeos longos, que é justamente o caso de uso.
2. **Frame a frame puro** — VRAM mínima, e deriva acumulada: sem sobreposição, as janelas
   não se alinham e o mapa "escorrega".
3. **Janelas com sobreposição** (`--mode windowed`) — VRAM limitada pelo tamanho da janela,
   e a sobreposição de keyframes é o que costura as janelas num mapa único.

## Decisão

Opção 3, com os parâmetros de partida do plano §3.3:

```
--fps 8 --mode windowed --window_size 128 --keyframe_interval 2 --overlap_keyframes 8
--conf_threshold 1.5 --no_render --save_predictions
```

`--no_render` é decisão de peso: os imports do stack de renderização (`kaolin` + extensões
CUDA) são **lazy**, feitos dentro da função de render. Com `--no_render`, o worker nunca os
executa — e a imagem Docker não precisa do kaolin.

## Consequências

- Imagem do worker significativamente menor e mais simples de construir (sem compilar
  extensões CUDA do kaolin) — menos superfície de falha no build e cold start menor.
- VRAM previsível: limitada pela janela, não pela duração do vídeo. Cabe com folga em 24 GB.
- Os NPZs por frame trazem `chunk_scales` e `chunk_transforms` (metadados de janela); a
  conversão precisa respeitá-los para compor a nuvem no mesmo referencial de mundo.
- **Estes números são um ponto de partida, não uma verdade medida.** Throughput real
  (frames/s) e pico de VRAM só se conhecem com GPU real — é a F0 do plug-in. `fps` e
  `keyframe_interval` serão recalibrados por **custo por scan** depois da medição, e o
  resultado vira ADR novo se mudar.
- `--mask_sky` (que exigiria `onnxruntime-gpu`) fica fora: é para cena externa, e a demo
  começa indoor.
