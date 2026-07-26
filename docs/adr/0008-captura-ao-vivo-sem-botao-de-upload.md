# ADR-0008 — Gravação ao vivo na página, com envio em chunks e disparo automático

- **Status:** Aceita
- **Data:** 2026-07-26

## Contexto

O plano original (§5/F1) previa uma página `/new` com instruções e `<input type=file>`: o
usuário grava no app de câmera, sai, escolhe o arquivo, espera o upload, clica em processar.
São quatro momentos de fricção e três telas fora da nossa. A decisão 10 do
`PROMPT-EXECUCAO.md` reescreve isso: **a gravação acontece na própria página, e não existe
botão de upload no fluxo do celular**.

Isso muda o problema técnico. Não se trata mais de enviar um arquivo pronto, mas de enviar
um vídeo **enquanto ele ainda está sendo gravado**.

## Opções consideradas

1. **Gravar tudo em memória e enviar no fim** — simples, e ruim: um vídeo de 3 min a 1080p
   pode passar de 200 MB em memória no celular, e o usuário encara o upload inteiro parado
   olhando uma barra depois de já ter terminado o trabalho.
2. **Streaming real para o servidor** (WebSocket/WebRTC) — o vídeo passaria pela web, que é
   exatamente o que a arquitetura evita (mídia nunca trafega pelo Railway); e exigiria
   remontar o arquivo do lado de lá.
3. **`MediaRecorder` com `timeslice` + multipart upload direto ao storage** — os chunks são
   emitidos durante a gravação e viram partes de um multipart S3, enviadas em segundo plano
   direto ao bucket. Ao parar, falta enviar apenas o último pedaço.

## Decisão

Opção 3. `getUserMedia({ video: { facingMode: 'environment' } })` + `MediaRecorder` com
`timeslice` de ~3 s; os blobs são acumulados até o mínimo de **5 MB** (restrição do
multipart S3 — ADR-0003) e cada bloco vira uma parte enviada por presigned URL. Ao tocar em
**parar**: envia a última parte, completa o multipart e **dispara o processamento sozinho**.

Wake Lock mantém a tela acesa durante a captura. Fallback obrigatório com `<input type=file>`
para desktop, vídeos de drone (N0) e navegadores sem suporte.

## Consequências

- O tempo de upload deixa de ser tempo de espera: quando o usuário para de gravar, quase
  tudo já subiu. É a diferença entre "envie seu vídeo" e "filme e pronto".
- Consequência incômoda e assumida: **o container gravado varia por navegador**. Safari
  produz MP4/H.264; Chrome no Android produz WebM/VP8-9. O worker passa a precisar de
  `ffmpeg` para normalizar antes do OpenCV — isso é causa direta desta decisão e está
  registrado como tarefa da D3, não como detalhe de implementação.
- `getUserMedia` exige **contexto seguro**: `localhost` funciona, mas testar no celular pela
  rede local exige HTTPS (mkcert) ou túnel. Documentado no README.
- Um scan pode ficar órfão se o usuário fechar a aba no meio da gravação: o multipart fica
  incompleto. Tratado pelo status `recording`/`uploading` com expiração, e pelo lifecycle do
  bucket, que aborta multiparts inacabados.
- O `<input type=file>` **não** é um caminho de segunda classe no código: ele produz o mesmo
  objeto no storage e dispara o mesmo `/start`. A diferença existe só na UI.
