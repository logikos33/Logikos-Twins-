"""Gate do caminho servido: nada de [vis]/[demo], open3d ou subprocess do motor.

Duas camadas (bloco 1 do piloto):
- estática: varre os .py de produção do worker por imports proibidos — pega
  regressão no grep antes de custar um cold start quebrado no RunPod;
- runtime: importa `engine.lingbot` num subprocess pelado (só stdlib+numpy no
  caminho de import) — prova que o módulo não puxa torch/lingbot_map/viser no
  import, que é o que permite CI e dev sem GPU.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parent.parent

# Módulos banidos do caminho servido — checados em LINHAS DE IMPORT (docstrings
# podem citar os nomes como contexto histórico sem disparar o gate).
FORBIDDEN_MODULES = ("lingbot_map.vis", "viser", "open3d", "kaolin", "ultralytics")


def _prod_files() -> list[Path]:
    files = [WORKER / "handler.py"]
    for pkg in ("pipeline", "engine"):
        files.extend(sorted((WORKER / pkg).glob("*.py")))
    return files


class TestGateEstatico:
    def test_nenhum_import_proibido_no_caminho_servido(self) -> None:
        ofensas: list[str] = []
        for path in _prod_files():
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                stripped = line.strip()
                if not stripped.startswith(("import ", "from ")):
                    continue
                ofensas.extend(
                    f"{path.relative_to(WORKER)}:{i}: {mod}"
                    for mod in FORBIDDEN_MODULES
                    if mod in stripped
                )
        assert not ofensas, "caminho servido contaminado:\n" + "\n".join(ofensas)

    def test_infer_nao_volta_ao_subprocess(self) -> None:
        """O bloco 1 matou o subprocess do demo de render — não pode regredir.
        (frames.py e normalize.py usam subprocess LEGITIMAMENTE, para o ffmpeg.)"""
        text = (WORKER / "pipeline" / "infer.py").read_text(encoding="utf-8")
        assert "subprocess" not in text
        assert "batch_demo" not in text

    def test_a_lista_cobre_arquivos_de_verdade(self) -> None:
        # Se a estrutura mudar e o glob varrer o vazio, o gate viraria teatro.
        files = _prod_files()
        assert len(files) >= 10
        assert any(f.name == "lingbot.py" for f in files)


class TestGateDeRuntime:
    def test_engine_importa_sem_o_extra_demo_vis(self) -> None:
        """Import de engine.lingbot não pode exigir torch/lingbot_map/viser."""
        code = (
            "import sys\n"
            # Sabotagem deliberada: se o import de módulo tocar qualquer um
            # destes, o teste quebra mesmo na máquina que os tem instalados.
            "for m in ('torch', 'lingbot_map', 'viser', 'flashinfer', 'open3d'):\n"
            "    sys.modules[m] = None\n"
            "from engine import lingbot\n"
            "cfg = lingbot.EngineConfig(model_path='x')\n"
            "kw = lingbot.model_kwargs(cfg)\n"
            "assert kw['use_sdpa'] is False\n"
            "assert lingbot.effective_keyframe_interval(1200, cfg) == 4\n"
        )
        proc = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            cwd=WORKER,
        )
        assert proc.returncode == 0, proc.stderr[-2000:]
