# Spec — D1 Dados e captura ao vivo

- **Status:** em execução
- **Etapa:** D1
- **ADRs relacionados:** [0002](../adr/0002-nextjs-prisma-postgres.md), [0003](../adr/0003-storage-adapter-s3.md), [0008](../adr/0008-captura-ao-vivo-sem-botao-de-upload.md)

## Objetivo

O operador abre uma página no celular, toca em **gravar**, filma o ambiente andando, toca em
**parar** — e o scan já está em processamento. **Ele nunca vê um botão de upload**, porque
o vídeo subiu enquanto ele filmava.

## Escopo

- Schema Prisma completo (plano §4.2: `scans`, `annotations`, `detections`) + primeira migration.
- `POST /api/scans` — cria o scan, abre o multipart, devolve `{scan_id, share_token, upload_id}`.
- `POST /api/scans/[id]/parts` — assina a parte N do multipart.
- `POST /api/scans/[id]/complete` — fecha o multipart e marca o scan pronto para processar.
- `GET /api/scans/[id]` — estado + presigned GETs dos artefatos.
- Página `/new`: preview da câmera traseira, overlay de captura guiada, timer, envio em
  segundo plano, wake lock, e fallback `<input type=file>`.
- `docs/protocolo-captura.md`.

## Não-escopo

- Disparo do job e estados de processamento — **D2** (aqui o scan para em `uploaded`).
- Viewer, medição, pins — **D4**.
- Limites de uso e retenção — **D7**.

## Contratos afetados

**Tabelas** conforme plano §4.2, com um acréscimo justificado: `scans.upload_id` e
`scans.video_ext`. O plano não previa multipart (assumia um PUT único de arquivo pronto);
a decisão 10 mudou isso, e o `upload_id` precisa sobreviver entre requisições porque cada
parte é assinada num request separado. `video_ext` existe porque o container varia por
navegador (ADR-0008) e a chave do objeto precisa refletir o que foi realmente gravado.

**Estados adicionados ao ciclo:** `recording` e `uploading`, antes de `queued`. O plano
começava em `uploading`; com gravação ao vivo, existe um intervalo em que o scan já existe
mas ainda está sendo filmado.

**Variáveis de ambiente:** nenhuma nova além das já declaradas em `.env.example`.

## Fatias verticais

1. **Schema + migration + cliente Prisma.** `make dev` aplica sozinho.
2. **Adapter de storage: multipart.** Testes sobre a lógica de particionamento (o mínimo de
   5 MB, a ordenação das partes) sem tocar em rede.
3. **Rotas de scan** (`POST /api/scans`, `parts`, `complete`, `GET`), com validação Zod e
   testes de contrato.
4. **Gravação na página `/new`** — `getUserMedia`, `MediaRecorder` com `timeslice`, buffer e
   envio em segundo plano, wake lock.
5. **Overlay de captura guiada** — timer, limite de 3 min, instruções do protocolo, aviso de
   privacidade (LGPD).
6. **Fallback de arquivo** para desktop, drone e navegador sem suporte.
7. **`docs/protocolo-captura.md`.**

## Critérios de aceite

- [ ] Gravar 60 s pelo celular e, **sem nenhuma outra ação**, o scan aparecer com o vídeo
      completo e íntegro no MinIO.
- [ ] Ao parar, o tempo restante de upload é pequeno — a maior parte já subiu durante a
      gravação (verificável pelos horários das partes).
- [ ] Nenhuma parte, exceto a última, tem menos de 5 MB.
- [ ] As partes são confirmadas em ordem crescente mesmo quando enviadas em paralelo.
- [ ] Vídeo acima de `MAX_VIDEO_SECONDS` ou `MAX_VIDEO_MB` é recusado com mensagem legível,
      e a gravação para sozinha ao atingir o limite.
- [ ] Fechar a aba no meio deixa o scan em estado consistente (`recording`), sem multipart
      pendurado depois da faxina.
- [ ] Navegador sem `MediaRecorder` cai no fallback de arquivo sem tela quebrada.
- [ ] `share_token` é imprevisível (aleatório criptográfico, não sequencial).

## Casos de teste

| Caso | Entrada | Esperado |
|---|---|---|
| Particionamento | blobs de 1 MB chegando a cada 3 s | partes de ≥ 5 MB, exceto a última |
| Ordenação | partes confirmadas fora de ordem (3, 1, 2) | `CompleteMultipartUpload` recebe 1, 2, 3 |
| Última parte pequena | total de 12 MB | 2 partes de 5 MB + 1 de 2 MB, aceitas |
| Vídeo curto demais | 2 s de gravação | recusa com mensagem, sem criar job |
| Limite de duração | gravação chega a 180 s | para sozinha e conclui o envio |
| Token | 1.000 tokens gerados | nenhuma colisão, nenhum padrão sequencial |
| Scan inexistente | `GET /api/scans/<uuid aleatório>` | 404, sem vazar se o id existiu |

## Riscos

| Risco | Mitigação |
|---|---|
| Container varia por navegador (MP4 vs WebM) | Guardar `video_ext` conforme o `mimeType` real; normalização com `ffmpeg` fica na D3 |
| `getUserMedia` exige contexto seguro — não funciona no celular por IP local | Documentar mkcert/túnel no README e no protocolo de captura |
| Tela apaga durante a gravação e interrompe tudo | Wake Lock API, com degradação silenciosa onde não houver suporte |
| Aba fechada no meio deixa multipart pendurado (custo) | Faxina no bootstrap do MinIO; lifecycle do bucket em produção |
| Celular fraco: gravar 1080p e enviar ao mesmo tempo pode engasgar | `timeslice` de 3 s (não menor) e envio sequencial das partes, não paralelo agressivo |
| Perda de rede no meio da gravação | Parte falhada volta para a fila com backoff; o multipart tolera atraso entre partes |
