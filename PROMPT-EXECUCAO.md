# PROMPT DE EXECUÇÃO — Logikos Twins · Demo "Mapa 3D pelo celular"

> **Como usar:** no repositório já criado **`github.com/logikos33/Logikos-Twins-`** (branch `main`), mantenha este arquivo e o `plano-demo-handoff.md` na raiz e instrua o agente de código: *"Leia PROMPT-EXECUCAO.md e execute as etapas D0 a D7 até o fim, registrando divergências em DECISIONS.md. Não inicie a FASE PLUG-IN."*
>
> **Pasta de trabalho:** `/Users/vitoremanuel/Documents/Logikos Twins` é, ao mesmo tempo, **o clone local deste repositório e o arquivo de referências do projeto**. Na D0, transforme a pasta no clone do remoto (o `main` já existe publicado), preservando os arquivos que já estão nela e aplicando a convenção `referencias/` descrita na Governança — git recebe só código e documentação de engenharia; discussões, pesquisas e apresentações ficam na pasta, mas fora do versionamento.
> O `plano-demo-handoff.md` é o anexo técnico (arquitetura, contratos, formatos, fases de produto); este arquivo é a ordem de execução. Em conflito entre os dois, vale este.

---

## Missão

Implementar **100% do desenvolvimento** da demo descrita no `plano-demo-handoff.md` **sem nenhuma credencial ou conta externa**: todo o fluxo — upload do vídeo pelo celular → processamento → mapa 3D navegável com medição, anotações e detecções ancoradas — deve rodar completo em ambiente local (`docker compose up`). Contas, chaves, GPU real e deploy entram somente na **FASE PLUG-IN**, executada depois, com o Vitor presente. O código deve ser escrito de forma que o plug-in seja apenas troca de variáveis de ambiente + build/push da imagem — zero refatoração.

## Regras de ouro

1. **Mock-first.** Nunca pedir chave, criar conta ou depender de serviço externo durante o desenvolvimento. Tudo tem equivalente local (ver "Ambiente de desenvolvimento").
2. **Realidade > plano.** Se uma API, flag ou limite for diferente do documentado, a realidade vence — registre a divergência e a decisão em `DECISIONS.md`.
3. **Licenças: proibido AGPL e copyleft forte** em qualquer dependência (modelos incluídos). Permitido: Apache-2.0, MIT, BSD-3. Concretamente: detector é **YOLOX (Megvii, Apache-2.0)** — fica **banido** o stack ultralytics (YOLOv5/v8/v11, AGPL-3.0). LingBot-Map é Apache-2.0 ✔. Toda dependência não-trivial entra em `LICENSES.md` com sua licença; se só existir opção copyleft para algo, pare e pergunte.
4. **Custo mínimo sempre.** Nas escolhas de arquitetura, a opção mais barata que atende ganha (seção "Otimização de custo"). Nada de serviço pago de logs/telemetria/filas: stdout + Postgres resolvem.
5. **Segredos nunca em git.** `.env.example` completo e comentado; tudo configurável por env; nome via `APP_NAME="Logikos Twins"` (slug técnico `logikos-twins`); o domínio definitivo entra só no plug-in.
6. **Commits pequenos**, mensagens descritivas, testes onde há lógica de verdade (conversão NPZ→PLY, desprojeção 3D, escala, presign, webhook, retenção).
7. **Autonomia com registro.** Só interrompa se estiver realmente bloqueado; senão decida, registre e siga. Dúvidas não-bloqueantes acumulam em `OPEN-QUESTIONS.md` para revisão humana.
8. **Progresso visível.** Manter `STATUS.md` (etapa atual, o que falta, como testar agora) atualizado a cada etapa concluída — é por onde o Vitor acompanha.
9. **Spec antes de código, ADR antes de "porque sim".** Nenhuma etapa ou feature começa sem spec escrita; nenhuma escolha arquitetural fica sem ADR. O processo completo está na seção "Governança de engenharia" — ela é gate, não sugestão.

## Decisões já tomadas (não rediscutir)

| # | Tema | Decisão |
|---|---|---|
| 1 | Nome | **Logikos Twins** — fixado pelo repositório `logikos33/Logikos-Twins-`; slug `logikos-twins`; domínio fica para o plug-in |
| 2 | Orçamento | **O mais econômico possível** — otimização de custo é requisito, não detalhe |
| 3 | Acesso | Link secreto por scan (`share_token` na URL) + `ADMIN_TOKEN` para galeria/painel. Sem login de usuário |
| 4 | Escala métrica | **Ambos**: calibração manual (2 pontos + distância conhecida) no MVP (D4); marcador ArUco automático em D6 com fallback manual |
| 5 | Detector | Dois estágios: **YOLOX** (Apache-2.0, COCO, ONNX Runtime) como base que funciona sozinha, e o **Recognition da Logikos como detector principal** assim que integrado (seção "Integração com o Recognition"). Interface plugável (`DETECTOR=recognition\|yolox`). A regra de licença (nada de AGPL) vale para TODO o stack, inclusive o que vier do Recognition |
| 6 | Casos demo | Os três, na medida das classes disponíveis: **pessoas/EPI** (pessoa ✔ COCO), **ativos de segurança** (hidrante ✔ COCO; extintor exige ajuste fino — fica documentado como pós-demo), **inventário** (objetos COCO: cadeira, monitor, mochila, garrafa etc.) |
| 7 | LGPD | Vídeo bruto apagado após **7 dias** (artefatos 3D permanecem); **blur de rostos opcional por scan** (D6); aviso de privacidade na página de upload |
| 8 | Áudio | **Descartado**: o worker re-muxa o vídeo sem trilha de áudio (`ffmpeg -c copy -an`) e substitui o objeto armazenado; nenhum código lê áudio |
| 9 | Infra | Web/API/Postgres no Railway (`us-east4`), GPU no RunPod Serverless, storage S3-compatível (R2 na produção, MinIO no dev). Detalhes e contratos: `plano-demo-handoff.md` seções 2–4 |
| 10 | Captura | **Gravação ao vivo na própria página** (getUserMedia + MediaRecorder), com envio automático em chunks durante a gravação e processamento disparado sozinho ao parar — **não existe botão de upload no fluxo do celular**. Upload de arquivo fica apenas como fallback (desktop, vídeos de drone N0, navegador incompatível). O mapa crescendo ao vivo (N1) permanece na F3 |

## Integração com o Recognition (Logikos) — autorizada

O Vitor **autorizou expressamente criar vínculo entre os produtos**: o Logikos Twins pode importar código, pesos e pacotes do projeto Recognition da Logikos — como dependência direta, submódulo git ou biblioteca comum extraída (ex.: `logikos-vision`), o que fizer mais sentido tecnicamente. Registrar o formato escolhido em `DECISIONS.md`.

Contexto operacional: o repositório do Recognition é **privado** e não estava acessível na preparação deste prompt — mas você (agente) roda na máquina do Vitor com as credenciais git dele. Procedimento:

1. **Antes da etapa D5**, pergunte ao Vitor a URL exata do repositório do Recognition (ou localize-o se já estiver clonado no ambiente de trabalho) e clone-o ao lado deste repo.
2. **Inspecione e mapeie**: framework e formato dos pesos, classes/labels disponíveis, pré/pós-processamento, como a inferência é chamada hoje (script? API? serviço?), e dependências com suas licenças.
3. **Auditoria de licença obrigatória**: se o Recognition depender de componente AGPL/copyleft forte (ex.: stack ultralytics), **não incorporar esse componente ao Logikos Twins** — nesse caso, isole (chamar o Recognition como serviço separado) ou substitua o backbone, e leve a decisão ao Vitor antes de prosseguir. Registrar o resultado da auditoria em `LICENSES.md`.
4. **Integre pela interface**: implemente `RecognitionDetector` cumprindo o mesmo `Detector` protocol do YOLOX (`detect(image) -> [{label, score, bbox}]`), selecionável por `DETECTOR=recognition|yolox` — com fallback automático para YOLOX se o Recognition não carregar.
5. **Aproveite o que existir além de detecção** (ex.: reconhecimento facial, EPI, classes industriais próprias): classes extras do Recognition enriquecem os pins semânticos e a busca do mapa — é exatamente a tese do produto. O que for específico demais para a demo, documente como pós-demo em `OPEN-QUESTIONS.md`.

A base YOLOX da D5 continua obrigatória (garante que a demo funciona mesmo sem o outro repo por perto); a integração do Recognition entra como **D5.5**, logo após, sem quebrar a interface.

## Governança de engenharia — anti-retrabalho (obrigatório)

O objetivo desta seção é um só: **minimizar retrabalho** e manter arquitetura e código fáceis de revisar e manter — por humanos e por agentes de IA. Nada aqui é burocracia opcional; os itens são gates de qualidade.

### Artefatos vivos (criados na D0, atualizados sempre)

- **`CLAUDE.md`** (raiz) — contexto permanente para agentes de IA: mapa do repositório, comandos canônicos (subir, testar, lint, gerar fixture), convenções do projeto, armadilhas conhecidas, e a instrução fixa *"antes de qualquer tarefa, leia a spec da etapa atual e os ADRs relevantes"*. É a prática central de dev com IA para evitar re-explicação e regressão de estilo entre sessões. Atualizar sempre que uma convenção mudar.
- **`docs/architecture.md`** — visão C4 (contexto + contêineres) em Mermaid, limites de módulo, fluxos principais (upload, job, viewer, detecção) e a **regra de dependência**: `apps/web` nunca importa de `worker/`; módulos se falam apenas pelos contratos do plano §4. Diagrama desatualizado é tratado como bug — atualiza no mesmo commit que muda a arquitetura.
- **`docs/adr/`** — Architecture Decision Records em formato MADR curto (Contexto → Opções consideradas → Decisão → Consequências), numerados (`0001-....md`) e **imutáveis** (mudou de ideia? novo ADR com "supersedes #NNNN"). Escreve-se ADR quando houver alternativas reais: lib/framework, schema, protocolo, formato de artefato, trade-off de custo — tudo que em 6 meses renderia um "por que assim?". Na D0, criar os ADRs iniciais a partir das decisões já tomadas (monorepo; Next.js+Prisma; adapter S3 MinIO↔R2; fake-runpod como sósia de contrato; YOLOX + `Detector` plugável; PLY preview ≤ 35 MB; windowed mode do motor).
- **`docs/specs/`** — as specs do ritual SDD abaixo, uma por etapa/feature.
- **`DECISIONS.md`** — segue como log cronológico leve (divergências plano×realidade, microdecisões). Quando uma entrada for arquitetural, promover a ADR e linkar — sem duplicar conteúdo.
- `LICENSES.md`, `OPEN-QUESTIONS.md`, `STATUS.md`, `CHANGELOG.md` — já definidos nas regras.
- **`referencias/` — materiais do projeto FORA do git.** A pasta de trabalho também é o lar das referências do projeto: discussões nossas, pesquisas, apresentações e informações de apoio vivem em `referencias/`, **nunca versionadas**. Na D0, mover para lá os arquivos já presentes na pasta que não são de execução: `pesquisa-lingbot-map.md` e `lingbot-map-proposta.pptx`. Divisão clara: **versionado** = código, `docs/` (specs, ADRs, arquitetura) e os arquivos de execução da raiz (`README.md`, `PROMPT-EXECUCAO.md`, `plano-demo-handoff.md`, `CLAUDE.md`, `STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`, `LICENSES.md`, `OPEN-QUESTIONS.md`); **não versionado** = tudo que for discussão/apoio/apresentação. O `.gitignore` da D0 implementa isso além dos ignores usuais de código (node_modules, `.env*`, builds, caches, artefatos de teste):

  ```gitignore
  # Referências do projeto (discussões, pesquisas, apresentações) — nunca versionar
  /referencias/
  /*.pptx
  /*.docx
  /*.xlsx
  /*.key
  /*.pdf
  ```

### Ritual SDD — Spec-Driven Development (toda etapa D0–D7 e toda feature futura)

1. **Spec primeiro** (`docs/specs/D4-viewer.md`): objetivo, escopo e não-escopo, contratos afetados, critérios de aceite verificáveis, casos de teste, riscos. Curta (1–2 páginas) e específica — sem prosa vaga.
2. **Plano de fatias** dentro da spec: fatias verticais pequenas, cada uma entregável e testável por si.
3. **Implementar fatia a fatia**, com testes junto (nunca "depois"); um commit por fatia, Conventional Commits (`feat(viewer): medição com calibração de escala`).
4. **Verificar contra a spec**: checklist de aceite marcado no próprio arquivo; mudanças de rumo atualizam a spec + `DECISIONS.md`/ADR.
5. **Fechar a etapa**: branch `dN-nome` → PR com descrição (o quê, por quê, como testar, capturas quando visual) → gates verdes → merge → atualizar `STATUS.md`, `CHANGELOG.md` e `architecture.md`.

Regra de ouro do SDD: **código e spec nunca contam histórias diferentes** — divergiu, pare e atualize a spec antes de seguir.

### Padrões de código (com referência explícita nas configs)

- **Web (TypeScript):** `strict: true`; ESLint + Prettier com config commitada; validação de borda com Zod em toda rota; camadas finas `route → service → adapter/repository` (página só apresenta); nomes descritivos em vez de comentários — comentário existe para explicar *por quê*, não *o quê*.
- **Worker (Python):** `ruff` (lint + format) + `mypy`; type hints em tudo; núcleo do pipeline em funções puras (testáveis sem I/O); exceções específicas com mensagens acionáveis.
- **Ports & adapters nos pontos de troca** (é o que torna o plug-in só-envs): `Storage` (MinIO↔R2), `JobRunner` (fake-runpod↔RunPod), `Detector` (YOLOX↔Recognition), `Engine` (LingBot-Map↔motores futuros). Nada fora do adapter conhece o fornecedor concreto.
- **Proibido:** abstração especulativa (YAGNI), código morto, TODO sem entrada em `OPEN-QUESTIONS.md`, `any`/`# type: ignore` sem justificativa em comentário, warning silenciado sem registro.
- **Testes (pirâmide pragmática):** unidade para lógica real (conversão NPZ→PLY, desprojeção, escala, presign, webhook); integração para o fluxo de jobs no compose; o teste geométrico da cena sintética como regressão permanente. Sem meta de cobertura vazia — mas todo bug corrigido ganha antes o teste que o reproduz.

### Infra como código

- Dev: `docker-compose.yml` com healthchecks e ordem de dependência; comandos canônicos únicos (`make dev|test|lint|fixture|reset` ou scripts npm equivalentes) — ninguém decora sequência de passos.
- Migrations Prisma versionadas (nunca editar migration aplicada); seeds idempotentes.
- Produção **preparada como código na D7 e aplicada só no plug-in**: `railway.json` (build/start/healthcheck), `scripts/infra/runpod_endpoint.py` (cria/atualiza o endpoint via API — nada de clicar em console sem registro), lifecycle do bucket em script. `dev`/`prod` separados apenas por env, mesmos artefatos.
- Observabilidade mínima e gratuita: logs JSON com `scan_id` correlacionando web↔worker, rota `/api/health`, painel admin como fonte de custos.
- Segurança: presigned URLs de expiração curta, webhook com segredo, rate limit nas rotas públicas, headers básicos (CSP), `npm audit`/`pip-audit` na CI — vulnerabilidade alta bloqueia merge.

### Gates de CI (bloqueantes desde a D0)

lint + typecheck + testes + build da web + build da imagem do worker (sem GPU) + auditoria de dependências + checagem de que a etapa em curso tem spec em `docs/specs/`. PR template com checklist: `[ ] spec atualizada · [ ] ADR se decisão nova · [ ] testes · [ ] LICENSES.md se dependência nova · [ ] architecture.md se fluxo mudou`.

## Ambiente de desenvolvimento (sem credenciais)

`docker-compose.yml` na raiz com:

- **postgres:16** — banco local (mesmo schema da produção, Prisma migrations).
- **minio** — S3-compatível fazendo o papel do R2. O código usa SDK S3 com `S3_ENDPOINT` configurável; em produção só mudam endpoint e chaves (R2 é S3-compatível). Bucket criado por script de bootstrap.
- **fake-runpod** — serviço FastAPI próprio que implementa o contrato do RunPod Serverless: `POST /v2/:endpoint/run` (enfileira e responde `{id, status}`), `GET /v2/:endpoint/status/:id`, e chamada de webhook ao concluir (com os mesmos retries: 2×, 10 s, exige HTTP 200). Dois modos por env: `FAKE_MODE=synthetic` (default — devolve os artefatos da cena sintética após um delay configurável, simulando fila e cold start) e `FAKE_MODE=local-worker` (executa o worker real em CPU dentro do container, usando fixtures — lento, mas prova o código de verdade).
- **web** — Next.js em modo dev (ou rodando fora do compose, à escolha).

**Cena sintética (peça-chave do mock-first):** `scripts/make_fixture.py` gera uma cena 3D fake porém geometricamente honesta — uma "sala" (caixa ~6×4×3 em unidades arbitrárias) com paredes, piso, alguns "objetos" (caixas menores) como nuvem de pontos colorida, uma trajetória de câmera circular dentro dela, e grava: (a) o diretório de NPZs por frame **exatamente no schema documentado** (`world_points`, `world_points_conf`, `depth`, `depth_conf`, `extrinsic` c2w, `intrinsic`, `images` — seção 3.3 do plano); (b) os artefatos prontos (`cloud_preview.ply`, `poses.json`, `meta.json`, `keyframes/`). Como as dimensões da cena são conhecidas por construção, ela vira **teste automatizado de medição e desprojeção** (ex.: a parede tem 6,0 unidades; calibrando com uma referência de 2,0, a medição da parede deve dar 6,0±2%).

## Etapas de desenvolvimento

Executar em ordem. Cada etapa tem Definition of Done (DoD) — não avance com DoD aberto.

**D0 — Bootstrap.** Monorepo (`apps/web` Next.js+TS+Prisma, `worker/` Python, `fake-runpod/`, `scripts/`, `docs/`), docker-compose acima, `.env.example`, lint/format, CI com os gates da seção Governança, `README.md` com "como rodar em 5 comandos" — **e o esqueleto de governança completo**: `CLAUDE.md`, `docs/architecture.md` inicial (C4 em Mermaid), `docs/adr/` com os ADRs 0001+ das decisões já tomadas, template de spec em `docs/specs/`, PR template com o checklist. Inclui a convenção da pasta de trabalho: conectar a pasta local ao remoto `logikos33/Logikos-Twins-` (clone/`git init` + remote, preservando o conteúdo existente), criar `referencias/` movendo para lá os materiais de apoio já presentes, e escrever o `.gitignore` completo (código + bloco de referências da Governança). *DoD: `docker compose up` sobe limpo; CI verde; governança instalada; `git status` limpo com as referências fora do versionamento; spec da D1 escrita antes de iniciar a D1.*

**D1 — Dados e captura ao vivo na página.** Schema do banco (plano §4.2) + migrations; rotas `/api/scans` (cria o scan e credencia **envio por partes** — multipart presigned no MinIO/S3) e `/api/scans/[id]` (estado + presigned GETs). A página `/new` é uma **página de gravação, não de upload**: abre a câmera traseira (`getUserMedia`, `facingMode: environment`), mostra overlay guiado com o protocolo de captura (timer, "ande devagar", "feche loops", limite de 3 min) e grava com `MediaRecorder` em fatias (`timeslice` ~3 s); cada fatia sobe **em segundo plano ainda durante a gravação** (bufferizando até o mínimo de ~5 MB por parte do multipart), com wake lock para a tela não apagar e indicador discreto "gravando · enviando". Ao tocar em **parar**, a página finaliza o objeto e o processamento **dispara automaticamente** — o usuário nunca vê botão de upload. Fallback obrigatório: `<input type=file>` para desktop, vídeos de drone (N0) e navegadores sem suporte à captura. Validações permanecem (duração ≤ 3 min, `MAX_VIDEO_MB=300`). Nota de dev: câmera exige contexto seguro — `localhost` ok; para testar no celular pela rede local, HTTPS com mkcert ou túnel (documentar no README). *DoD: gravar 60 s pelo celular na própria página e, sem nenhuma outra ação, o scan aparecer processando com o vídeo completo no MinIO.*

**D2 — Fluxo de jobs ponta a ponta (com fake).** Rota `/start` — **acionada automaticamente ao finalizar a gravação** (botão manual só existe no fallback de arquivo) — chama fake-runpod `/run` com o payload real do contrato (`{input:{scan_id, video_url, params}, webhook, policy}`); webhook `/api/webhooks/runpod?token=` atualiza o scan; reconciliação por polling para jobs presos (cron a cada 60 s); página `/scan/[id]` mostra estados ao vivo (recording→uploading→queued→processing→postprocessing→done/error) com mensagens amigáveis. *DoD: gravar na página → "done" com artefatos sintéticos aparecendo, sem clique além de parar a gravação; matar o webhook no meio e o polling recupera.*

**D3 — Worker real (código completo, sem GPU).** Em `worker/`: `handler.py` (SDK runpod) + `pipeline/` — download do vídeo, **normalização de container/codec** (a gravação no navegador varia: Safari produz MP4/H.264, Chrome Android produz WebM/VP8-9 — converter com `ffmpeg` para MP4/H.264 antes do OpenCV; `ffmpeg` entra na imagem do worker), strip de áudio e re-upload do bruto sem trilha, chamada do `demo_render/batch_demo.py` (subprocess; flags validadas no plano §3.3: `--video_path --fps 8 --mode windowed --window_size 128 --keyframe_interval 2 --overlap_keyframes 8 --no_render --save_predictions`), `npz_to_artifacts.py` (filtro `world_points_conf ≥ 1.5`, voxel-downsample com alvo 1,8 M pontos, PLY binário, `poses.json`, `meta.json`, `keyframes/*.jpg`), upload dos artefatos, retorno com métricas. Dockerfile buildável (base CUDA 12.8; ver sketch no plano §6) — **build local ok, execução GPU fica para o plug-in**. Testes pytest usando NPZs da cena sintética. `[TESTAR no plug-in]` marcado no código onde só GPU real valida (ex.: `--save_glb` com `--no_render`). *DoD: pytest verde; `FAKE_MODE=local-worker` processa as fixtures e produz artefatos válidos de ponta a ponta; imagem builda.*

**D4 — Viewer "controle do mapa".** Three.js na página `/scan/[id]`: carregamento do `cloud_preview.ply` com progresso; câmeras orbit / first-person (WASD) / top-down "planta"; trajetória desenhada + replay animado do percurso; clipping por altura (slider); **medição** ponto-a-ponto com **calibração de escala manual** (2 cliques + valor real → fator em `scans.scale`; medições exibem metros dali em diante); **pins de anotação** (clique → pin + texto + foto do keyframe mais próximo via `poses.json`); camadas ligáveis (nuvem/trajetória/pins/detecções); galeria `/` com thumbnail; link de compartilhamento. Mobile-friendly (a demo será mostrada em celular/tablet). *DoD: tudo funcional na cena sintética; teste automatizado de medição na cena (erro < 2%); usável em tela de celular.*

**D5 — Recognition ancorado (YOLOX).** No worker, após a inferência 3D: YOLOX-s ONNX (Apache-2.0) nos keyframes via ONNX Runtime (CPU no dev, GPU no plug-in); para cada detecção, desprojetar o centro da bbox com `depth`+`intrinsic`+`extrinsic` → `world_pos`; cluster por rótulo+raio (objetos vistos em vários frames viram 1 pin); gravar em `detections`; interface do detector plugável (`Detector` protocol) — é por ela que o Recognition da Logikos entra na **D5.5** (ver seção "Integração com o Recognition"). No viewer: pins semânticos com foto-evidência, filtro por classe, busca ("pessoa", "hidrante", "cadeira") que voa a câmera até o cluster. Na cena sintética, "plantar" objetos com posições conhecidas para testar a desprojeção; adicionalmente testar o YOLOX em 2–3 fotos reais (CPU). *DoD: busca "onde está X?" funciona na cena sintética com erro de posição < 5% do tamanho da cena; YOLOX roda em foto real no dev.*

**D6 — Escala ArUco + blur (upgrades).** Detecção de marcador ArUco (OpenCV `aruco`, DICT_4X4_50, tamanho A4 padrão documentado) nos keyframes → quando presente, escala automática (sobrescreve `scale.method='aruco'`; fallback = manual); gerar o PDF do marcador para impressão (link na página `/new`); blur de rostos **opcional por scan** usando detector de faces com licença permissiva (avaliar YuNet/OpenCV — **verificar licença antes de adotar**; aplicar somente aos `keyframes/*.jpg` e thumbnails — o vídeo bruto morre em 7 dias). *DoD: vídeo sintético/real com marcador → medidas automáticas; toggle de blur funcional; licença do detector de faces registrada.*

**D7 — Hardening e DX.** Retenção: job diário apaga vídeos brutos com >7 dias (artefatos ficam) — no dev, TTL em minutos para testar; painel `/admin` (via `ADMIN_TOKEN`): lista de scans, custo estimado acumulado (de `metrics`), erros; limites (`MAX_SCANS_PER_DAY` sem token); textos de privacidade/LGPD na página de upload; logs estruturados (JSON) no worker e na web; `PLUGIN-CHECKLIST.md` gerado/refinado (abaixo); revisão final do `README.md` com diagrama. *DoD: 10 uploads consecutivos no ambiente local sem intervenção; retenção comprovada; checklist de plug-in completo.*

## Definition of Done do desenvolvimento (portão para o plug-in)

`docker compose up` do zero → em menos de 10 minutos: enviar um vídeo real de celular pela página, acompanhar os estados, abrir o mapa (sintético no modo default; real no modo `local-worker` com paciência de CPU), medir com calibração, criar pin, ver detecções na cena sintética, compartilhar link, painel admin ok, testes e lint verdes, `LICENSES.md`/`DECISIONS.md`/`STATUS.md`/`PLUGIN-CHECKLIST.md` atualizados, **specs D0–D7 fechadas com checklist de aceite marcado, ADRs consistentes com o código e `docs/architecture.md` fiel ao que foi construído**. **Nenhuma credencial real usada em lugar nenhum.**

## FASE PLUG-IN (não executar agora — será feita com o Vitor)

Ordem prevista (detalhes e runbook no plano §5/F0 e §6): (1) criar contas Cloudflare R2, RunPod e Railway com **alertas/limites de billing no mínimo**; (2) bucket R2 + lifecycle 7 dias no prefixo `videos/` + chaves; (3) network volume RunPod (50 GB, US-East) e upload do checkpoint via API S3-compatível (`scripts/populate_volume`); (4) build + push da imagem do worker (GHCR) e criação do endpoint serverless — **começar com L4/A5000 (US$ 0,69/h)**, FlashBoot, 0 workers ativos, `executionTimeout` 60 min, máx. 1 worker; (5) **F0 de validação** num pod community (~US$ 0,34/h): rodar o runbook, medir min/frame, VRAM e qualidade com vídeo nosso; comparar L4 vs 4090 por **custo por scan** e fixar a GPU; (6) deploy do web no Railway `us-east4` + Postgres + envs + webhook URL + domínio provisório `*.up.railway.app`; (7) smoke test real com 3 vídeos; ajustar `EXTRACT_FPS`/caps por custo; (8) escolher nome/domínio definitivo (candidatos do item 1) e trocar `APP_NAME`; (9) ativar limites de uso e revisar custos na primeira semana.

## Otimização de custo (regras vivas — valem em todas as etapas)

Medir **custo por scan**, nunca por hora (uma GPU 60% mais cara que processa 2× mais rápido é mais barata). Extração a 8 fps com teste de 6 fps; cap de 3 min de vídeo; resolução de inferência fixa em 518. Scale-to-zero sempre (0 workers ativos; aceitar cold start na demo ou aquecer manualmente 10 min antes de uma apresentação). Pesos no network volume (nunca re-baixar 4,6 GB). R2 pelo egress zero e free tier; lifecycle agressivo no vídeo bruto. Railway no menor plano que aguente, um único serviço web. `cloud_preview.ply ≤ 35 MB`. Nada de SaaS pago acessório. Toda decisão de custo relevante → `DECISIONS.md` com o número que a justificou.

## Referências dentro do repositório

`plano-demo-handoff.md` (arquitetura §2, validações §3, contratos §4, fases de produto §5, sketches §6, custos §7, perguntas §9) · `docs/protocolo-captura.md` (criar na D1 a partir do plano §5/F1) · Repo do motor: `github.com/Robbyant/lingbot-map` (pinar commit em `DECISIONS.md`) · Checkpoints: HF `robbyant/lingbot-map` · YOLOX: `github.com/Megvii-BaseDetection/YOLOX` (Apache-2.0, export ONNX oficial).
