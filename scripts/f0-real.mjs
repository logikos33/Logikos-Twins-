#!/usr/bin/env node
// F0-real: mede o pipeline COMPLETO pelo caminho do produto (create → upload
// proxy → complete → job GPU → done) para cada vídeo em pilot/inputs/*.mp4.
//
// Uso:  ENVFILE=<railway variables --json> node scripts/f0-real.mjs
// Sem vídeos em pilot/inputs/ ele diz o que falta e sai. Nunca imprime tokens.
// Custo: 1 job por vídeo — o RunPod cobra por segundo de GPU; confira o teto
// da rodada antes de rodar com muitos vídeos.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ENVFILE = process.env.ENVFILE;
if (!ENVFILE) {
  console.error("defina ENVFILE=<json de env> (railway variables --json > env.json)");
  process.exit(1);
}
const env = JSON.parse(readFileSync(ENVFILE, "utf8"));
const APP = env.APP_URL;
const DIR = process.env.INPUTS_DIR ?? "pilot/inputs";

if (!existsSync(DIR)) {
  console.error(`${DIR}/ não existe — crie e coloque os .mp4 reais do piloto.`);
  process.exit(1);
}
const videos = readdirSync(DIR).filter((f) => /\.(mp4|mov|webm)$/i.test(f));
if (videos.length === 0) {
  console.error(`${DIR}/ está vazio — F0-real segue pendente de vídeos.`);
  process.exit(1);
}

const PART = 5 * 1024 * 1024;
const resultados = [];

for (const nome of videos) {
  const video = readFileSync(join(DIR, nome));
  const t0 = Date.now();
  const sec = () => (Date.now() - t0) / 1000;
  console.log(`\n=== ${nome} (${(video.length / 1e6).toFixed(1)} MB) ===`);

  let res = await fetch(`${APP}/api/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": env.ADMIN_TOKEN },
    body: JSON.stringify({ mimeType: "video/mp4", title: `F0-real ${nome}` }),
  });
  if (!res.ok) {
    console.error(`  create falhou: ${res.status}`);
    continue;
  }
  const { scanId, shareToken } = await res.json();
  console.log(`  scan ${scanId}`);

  const parts = [];
  for (let i = 0; i * PART < video.length; i++) {
    const r = await fetch(
      `${APP}/api/scans/${scanId}/parts/upload?partNumber=${i + 1}&token=${encodeURIComponent(shareToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: video.subarray(i * PART, (i + 1) * PART),
      },
    );
    if (!r.ok) throw new Error(`upload parte ${i + 1}: ${r.status}`);
    parts.push(await r.json());
  }
  const tUpload = sec();
  console.log(`  upload ${tUpload.toFixed(1)}s (${parts.length} partes)`);

  res = await fetch(`${APP}/api/scans/${scanId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareToken, parts, durationS: null }),
  });
  if (!res.ok) {
    console.error(`  complete falhou: ${res.status} ${await res.text()}`);
    continue;
  }

  let status = "";
  let metrics = {};
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(
      `${APP}/api/scans/${scanId}?token=${encodeURIComponent(shareToken)}`,
    );
    if (!r.ok) continue;
    const s = await r.json();
    const st = s.scan?.status ?? s.status;
    if (st !== status) {
      status = st;
      console.log(`  [${sec().toFixed(0)}s] ${st}`);
    }
    if (st === "done" || st === "error") {
      metrics = s.scan?.metrics ?? s.metrics ?? {};
      break;
    }
  }
  resultados.push({
    video: nome,
    mb: +(video.length / 1e6).toFixed(1),
    upload_s: +tUpload.toFixed(1),
    total_s: +sec().toFixed(1),
    status,
    metrics,
  });
}

console.log("\n=== F0-REAL — resumo ===");
console.table(
  resultados.map(({ metrics, ...r }) => ({
    ...r,
    custo_usd: metrics.cost_usd_est ?? "—",
    exec_s: metrics.exec_s ?? metrics.execution_s ?? "—",
  })),
);
console.log(JSON.stringify(resultados, null, 1));
