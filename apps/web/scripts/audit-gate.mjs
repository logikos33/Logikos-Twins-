#!/usr/bin/env node
/**
 * Gate de auditoria de dependências.
 *
 * `npm audit` sozinho não serve como gate: o ecossistema Next/ESLint carrega avisos
 * transitivos cuja "correção" oferecida é voltar para uma versão major antiga
 * (o npm chega a sugerir `next@9.3.3`). Um gate que falha sempre é um gate que todo
 * mundo aprende a ignorar.
 *
 * Este script reprova qualquer vulnerabilidade high/critical que NÃO esteja numa
 * lista de exceções explícita, com motivo e prazo de validade. Exceção vencida
 * reprova o build — é o que impede a lista de virar depósito permanente.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const allowlistPath = path.join(here, "..", "audit-allowlist.json");

const BLOCKING = new Set(["high", "critical"]);

function loadAllowlist() {
  try {
    return JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch {
    return { exceptions: [] };
  }
}

function runAudit() {
  try {
    // `--omit=dev`: uma falha em ferramenta de build não é superfície de ataque do
    // produto servido. O que roda em produção é o que precisa estar limpo.
    return JSON.parse(
      execSync("npm audit --json --omit=dev", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    );
  } catch (err) {
    // npm audit sai com código != 0 quando encontra algo; o JSON vem no stdout mesmo assim.
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

const allowlist = loadAllowlist();
const today = new Date().toISOString().slice(0, 10);

const expired = allowlist.exceptions.filter((e) => e.expires < today);
if (expired.length > 0) {
  console.error("\n✗ Exceções de auditoria VENCIDAS — revise ou renove com justificativa:\n");
  for (const e of expired) {
    console.error(`  · ${e.package} (venceu em ${e.expires}) — ${e.reason}`);
  }
  console.error("\nEditar apps/web/audit-allowlist.json\n");
  process.exit(1);
}

const allowed = new Set(allowlist.exceptions.map((e) => e.package));
const report = runAudit();
const offenders = Object.entries(report.vulnerabilities ?? {})
  .filter(([name, v]) => BLOCKING.has(v.severity) && !allowed.has(name))
  .map(([name, v]) => ({ name, severity: v.severity }));

if (offenders.length > 0) {
  console.error("\n✗ Vulnerabilidades high/critical sem exceção registrada:\n");
  for (const o of offenders) console.error(`  · ${o.name} [${o.severity}]`);
  console.error(
    "\nCorrija a dependência, ou registre uma exceção com motivo e prazo em" +
      " apps/web/audit-allowlist.json (e explique no PR).\n",
  );
  process.exit(1);
}

const n = allowlist.exceptions.length;
const label = n === 1 ? "1 exceção vigente" : `${n} exceções vigentes`;
console.log(`✓ Auditoria de produção limpa (${label}).`);
