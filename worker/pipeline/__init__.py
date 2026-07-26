"""Pipeline do worker de reconstrução.

Módulos em ordem de execução: download → normalize → infer → npz_to_artifacts → upload.
O núcleo (conversão, filtro, downsample) são funções puras testáveis sem I/O; o I/O
vive nas bordas.
"""
