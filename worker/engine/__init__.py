"""Motor de reconstrução residente (bloco 1 do piloto).

O modelo carrega UMA vez por processo do worker e fica quente entre jobs —
substitui o subprocess do `demo_render/batch_demo.py`, que pagava 4,6 GB de
checkpoint por job e arrastava o extra [demo]/viser para a imagem.
"""
