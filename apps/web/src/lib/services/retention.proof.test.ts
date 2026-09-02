import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

/**
 * PROVA DE PURGA (LGPD, bloco 4): objeto de teste no R2 real + scan de teste
 * vencido no DB real → runRetention() REAL (o mesmo job que roda a cada 5 min
 * em produção) → objeto some do R2 e videoDeletedAt é gravado.
 *
 * Só roda com LGPD_PROOF_ENV=<json de env> (railway variables --json). No CI é
 * skip — nunca toca produção por acidente. O scan de teste é apagado no final;
 * nenhum objeto pré-existente do R2 é tocado (a chave é tmp/ recém-criada).
 */

const ENVFILE = process.env.LGPD_PROOF_ENV;

describe.skipIf(!ENVFILE)("prova de purga do vídeo bruto (R2 + DB reais)", () => {
  const chave = `tmp/lgpd-proof-${randomBytes(6).toString("hex")}`;
  let scanId: string | null = null;
  let cleanup: (() => Promise<void>) | null = null;

  afterAll(async () => {
    await cleanup?.();
  });

  it("vídeo com mais de 7 dias é apagado do R2 e marcado no DB", async () => {
    for (const [k, v] of Object.entries(
      JSON.parse(readFileSync(ENVFILE!, "utf8")) as Record<string, string>,
    )) {
      process.env[k] ??= v;
    }
    // imports DEPOIS do env — env() e o PrismaClient congelam na primeira leitura
    const storage = await import("@/lib/storage");
    const { db } = await import("@/lib/db");
    const { runRetention } = await import("./retention");

    cleanup = async () => {
      if (scanId) await db.scan.delete({ where: { id: scanId } }).catch(() => undefined);
      await storage.deleteObject(chave).catch(() => undefined);
      await db.$disconnect();
    };

    await storage.putObject(chave, Buffer.from("prova-lgpd"), "video/mp4");
    expect(await storage.objectExists(chave)).toBe(true);

    const scan = await db.scan.create({
      data: {
        status: "done",
        createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000), // 8 dias > TTL de 7
        shareToken: `lgpd-proof-${randomBytes(9).toString("base64url")}`,
        videoKey: chave,
        title: "prova de retenção — apagar",
      },
    });
    scanId = scan.id;

    const purgados = await runRetention();
    expect(purgados).toBeGreaterThanOrEqual(1);

    expect(await storage.objectExists(chave)).toBe(false);
    const depois = await db.scan.findUnique({ where: { id: scan.id } });
    expect(depois?.videoDeletedAt).not.toBeNull();
  }, 60_000);
});
