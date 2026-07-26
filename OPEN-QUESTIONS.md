# OPEN-QUESTIONS.md

Dúvidas **não-bloqueantes** acumuladas durante a execução, para revisão humana. O que for
bloqueante interrompe a execução e vai direto ao Vitor; o que está aqui foi decidido com um
default razoável e segue registrado.

Formato: pergunta · contexto · **default adotado** (para seguir sem travar) · quando decidir.

---

## Produto

### Q1 — Extintor não é classe COCO

**Contexto.** A decisão 6 do `PROMPT-EXECUCAO.md` pede o caso "ativos de segurança". Com
YOLOX treinado em COCO, existe `fire hydrant` (hidrante), mas **não existe extintor** — a
classe simplesmente não está nas 80 do COCO.

**Default adotado.** A demo de ativos de segurança usa **hidrante**, que funciona de
verdade. Extintor fica documentado como pós-demo: exige ajuste fino com dataset próprio
(algumas centenas de imagens anotadas) ou o Recognition da Logikos, se ele já tiver a classe.

**Quando decidir.** Antes de gravar o vídeo comercial — o roteiro depende de qual ativo
aparece. Se o Recognition já detecta extintor, o caso fica muito mais forte e a D5.5 resolve.

### Q2 — Qual dos três casos vira o roteiro principal da demo?

**Contexto.** Os três (pessoas/EPI, ativos de segurança, inventário) serão implementados na
medida das classes disponíveis, mas um vídeo de 3 min conta **uma** história bem.

**Default adotado.** Pessoas/EPI como fio condutor (classe `person` do COCO funciona sem
ajuste, e é o módulo âncora da [cliente âncora]), com inventário como demonstração secundária de busca.

**Quando decidir.** Ao gravar o material comercial (pós-D7).

---

## Técnico

### Q3 — `--save_glb` funciona junto com `--no_render`?

**Contexto.** Marcado `[CODE]` no plano §9.10. Se funcionar, o GLB nativo é um atalho para o
viewer (GLTFLoader) além do nosso PLY.

**Default adotado.** Caminho principal é NPZ → nosso PLY (ADR-0006), que dá controle sobre
filtro e downsample. O GLB não é necessário para nada.

**Quando decidir.** F0 do plug-in, com GPU real. Marcado `[TESTAR no plug-in]` no worker.

### Q4 — Vídeo vertical e metadados de rotação

**Contexto.** Plano §9.15. O celular na vertical grava com metadado de rotação que o OpenCV
frequentemente ignora, produzindo frames deitados — o que degrada a reconstrução.

**Default adotado.** A normalização com `ffmpeg` na D3 aplica a rotação dos metadados
(`-autorotate`, padrão do ffmpeg) antes de o OpenCV ver o arquivo, e a página `/new` orienta
o celular na horizontal.

**Quando decidir.** Validar com vídeo real de celular na F0.

### Q5 — Blur de rostos: qual detector de licença permissiva?

**Contexto.** D6 exige blur opcional; a licença precisa ser verificada **antes** de adotar.
Candidato: YuNet (OpenCV Zoo). O OpenCV é Apache-2.0, mas **modelos do Zoo têm licenças
individuais** e nem todos acompanham o repositório.

**Default adotado.** Nenhum ainda — a verificação é parte da D6 e o resultado vai para
`LICENSES.md`. Se o YuNet não for permissivo, alternativa é o detector Haar/DNN que
acompanha o próprio OpenCV.

**Quando decidir.** Na D6, antes de escrever a integração.

### Q6 — Cold start real do endpoint serverless

**Contexto.** Plano §9.12. Imagem grande + FlashBoot + network volume. Se passar de 2 min, a
experiência da demo sofre.

**Default adotado.** Scale-to-zero (0 workers ativos), aceitando cold start. Para
apresentações, aquecer manualmente ~10 min antes.

**Quando decidir.** Plug-in, medindo. Se for ruim, avaliar 1 worker "active" nas horas de demo
— decisão de custo, vai para `DECISIONS.md` com o número que a justificar.

---

## Registrado e resolvido

*(entradas migram para cá quando decididas, com link para o ADR ou a entrada de `DECISIONS.md`)*
