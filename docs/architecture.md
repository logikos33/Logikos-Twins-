# Arquitetura — Logikos Twins

> **Regra:** este documento é parte do código. Diagrama desatualizado é tratado como bug e
> corrigido **no mesmo commit** que muda a arquitetura.

---

## C4 nível 1 — Contexto

```mermaid
graph LR
    U["Operador<br/>(celular, em campo)"]
    V["Cliente / gestor<br/>(navegador)"]
    LT["<b>Logikos Twins</b><br/>captura → mapa 3D navegável<br/>com medição, anotação e detecções"]
    REC["Recognition (Logikos)<br/><i>sistema irmão</i><br/>detector proprietário"]
    GPU["RunPod Serverless<br/><i>GPU sob demanda</i>"]
    OBJ["Storage S3-compatível<br/><i>R2 (prod) · MinIO (dev)</i>"]

    U -->|grava o ambiente andando| LT
    V -->|abre o link do scan| LT
    LT -->|job de reconstrução| GPU
    LT -->|vídeo e artefatos| OBJ
    LT -.->|pesos/classes próprias| REC
```

O produto responde a uma pergunta que nenhuma planta baixa responde: **"onde está isso, no
espaço real?"** — filmando com um celular comum, sem hardware proprietário.

---

## C4 nível 2 — Contêineres

```mermaid
graph TB
    subgraph browser["Navegador (celular ou desktop)"]
        CAP["Página /new<br/>getUserMedia + MediaRecorder<br/>envio em chunks durante a gravação"]
        VIEW["Página /scan/[id]<br/>viewer Three.js<br/>medição · pins · detecções"]
    end

    subgraph railway["Railway — sem GPU"]
        WEB["apps/web · Next.js (App Router)<br/>rotas de API + páginas + viewer"]
        DB[("Postgres<br/>scans · annotations · detections")]
    end

    subgraph storage["Storage S3-compatível"]
        S3[("bucket<br/>videos/{id}.mp4<br/>scans/{id}/*.ply · poses.json<br/>meta.json · keyframes/")]
    end

    subgraph gpu["GPU sob demanda"]
        RP["RunPod Serverless<br/><i>dev: fake-runpod</i>"]
        WK["worker · Python<br/>LingBot-Map + pós-processamento<br/>+ detector (YOLOX / Recognition)"]
    end

    CAP -->|"1· POST /api/scans"| WEB
    WEB -->|"2· presigned multipart"| CAP
    CAP -->|"3· PUT partes (direto, não passa pela web)"| S3
    CAP -->|"4· complete → /start automático"| WEB
    WEB -->|"5· POST /run {scan_id, video_url, params, webhook}"| RP
    RP --> WK
    WK -->|"6· GET vídeo"| S3
    WK -->|"7· PUT artefatos"| S3
    WK -->|"7b· batch de detecções (?token=segredo)"| WEB
    RP -->|"8· webhook ?token="| WEB
    WEB --> DB
    VIEW -->|"9· GET /api/scans/[id] → presigned GETs"| WEB
    VIEW -->|"10· GET artefatos"| S3
```

### Por que assim

- **Mídia nunca trafega pela web.** O vídeo vai do celular direto ao bucket por presigned
  URL, e os artefatos voltam do worker direto ao bucket. O Railway move JSON, não gigabytes —
  é o que mantém o custo em dezenas de dólares por mês em vez de centenas.
- **A GPU só existe enquanto processa.** Scale-to-zero: entre um scan e outro, o custo de GPU
  é exatamente zero.
- **O webhook não é a única forma de saber que terminou.** Há reconciliação por polling para
  jobs presos — webhook é otimização, não fonte de verdade.

---

## Regra de dependência (arquitetura hexagonal nos pontos de troca)

```mermaid
graph LR
    subgraph nucleo["Núcleo (lógica pura, testável sem I/O)"]
        SVC["services/<br/>scan · job · detecção · escala"]
    end
    subgraph portas["Portas (interfaces)"]
        P1["Storage"]
        P2["JobRunner"]
        P3["Detector"]
        P4["Engine"]
    end
    subgraph adap["Adapters (conhecem fornecedor)"]
        A1["S3 (MinIO / R2)"]
        A2["fake-runpod / RunPod"]
        A3["YOLOX / Recognition"]
        A4["LingBot-Map"]
    end
    SVC --> P1 & P2 & P3 & P4
    P1 --> A1
    P2 --> A2
    P3 --> A3
    P4 --> A4
```

**Invariantes, verificadas em revisão:**

1. `apps/web` **nunca** importa de `worker/`. Eles conversam só pelos contratos da §4 do plano.
2. Nenhum módulo fora de um adapter menciona MinIO, R2, RunPod, YOLOX ou LingBot-Map pelo nome.
3. A rota HTTP valida a borda (Zod) e delega. Rota não fala com Prisma nem com storage.
4. O núcleo não faz I/O — é o que permite testar desprojeção, escala e conversão sem subir nada.

É essa disciplina que faz a FASE PLUG-IN ser troca de variáveis de ambiente em vez de
refatoração. Ver ADR-0003 (Storage), ADR-0004 (JobRunner), ADR-0005 (Detector).

---

## Fluxos principais

### Captura (D1) — sem botão de upload

```mermaid
sequenceDiagram
    participant U as Usuário
    participant P as Página /new
    participant W as Web
    participant S as Storage

    U->>P: toca em "gravar"
    P->>W: POST /api/scans
    W->>S: CreateMultipartUpload
    W-->>P: {scan_id, upload_id, share_token}
    P->>P: MediaRecorder timeslice 3s + Wake Lock
    loop a cada ~5 MB acumulados (mínimo do multipart S3)
        P->>W: POST /api/scans/[id]/parts (presign da parte N)
        P->>S: PUT parte N (direto)
    end
    U->>P: toca em "parar"
    P->>S: PUT última parte
    P->>W: POST /api/scans/[id]/complete
    W->>S: CompleteMultipartUpload
    W->>W: dispara /start automaticamente
    Note over U,S: o usuário nunca viu um botão de upload
```

### Processamento (D2/D3)

```mermaid
stateDiagram-v2
    [*] --> recording
    recording --> uploading: parou de gravar
    uploading --> queued: multipart completo → /start
    queued --> processing: worker pegou o job
    processing --> postprocessing: inferência 3D pronta
    postprocessing --> done: artefatos no bucket
    processing --> error: falha
    postprocessing --> error: falha
    queued --> error: timeout / job perdido
    done --> [*]
```

O estado avança por **webhook** (rápido) ou por **reconciliação em polling** (rede de
segurança, a cada 60 s para jobs parados). Os dois caminhos convergem no mesmo serviço —
não há lógica de transição duplicada.

### Detecção ancorada (D5) — o diferencial

```mermaid
graph LR
    KF["keyframe i<br/>(JPEG)"] --> DET["Detector<br/>bbox + label + score"]
    DET --> PX["pixel central<br/>(u, v)"]
    NPZ["NPZ do frame i<br/>depth · intrinsic K · extrinsic c2w"] --> PROJ
    PX --> PROJ["desprojeção<br/>u,v,depth → K⁻¹ → c2w"]
    PROJ --> WP["world_pos (x, y, z)"]
    WP --> CLU["cluster por rótulo + raio<br/>(mesmo objeto visto em N frames = 1 pin)"]
    CLU --> DB[("detections")]
    DB --> UI["pin semântico no viewer<br/>+ foto-evidência + busca"]
```

É aqui que "nuvem de pontos bonita" vira **mapa que responde perguntas**.

Os clusters vão do worker à API pela rota batch (autenticada pelo mesmo segredo do
webhook) e vivem na tabela `detections`; a escala automática por ArUco (D6) viaja no
retorno do job e sobrescreve a calibração manual quando o marcador foi visto.

---

## Ambientes

| | Desenvolvimento | Produção (FASE PLUG-IN) |
|---|---|---|
| Web | `next dev` no compose | Railway, região `us-east4` |
| Banco | Postgres no compose | Postgres do Railway |
| Storage | **MinIO** (`S3_FORCE_PATH_STYLE=true`) | **Cloudflare R2** (`false`) |
| Job runner | **fake-runpod** (`synthetic` ou `local-worker`) | RunPod Serverless, GPU L4/4090 |
| Detector | YOLOX ONNX em CPU | YOLOX/Recognition em GPU |
| Pesos do motor | não usados (fixture sintética) | network volume, 4,6 GB |

**Os artefatos são os mesmos nos dois ambientes.** A diferença é inteiramente de variáveis de
ambiente — nenhum `if (production)` no código.
