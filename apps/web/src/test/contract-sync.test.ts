import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import local from "../lib/piloto/ui-contract.json";

/**
 * A CANÔNICA vive em docs/piloto/ui-contract.json (raiz do monorepo); o app
 * carrega uma CÓPIA local (o Railway builda só apps/web). Este teste roda onde
 * o monorepo existe (CI/dev) e falha se as duas divergirem — cópia desatualizada
 * nunca passa despercebida.
 */
const CANONICA = join(__dirname, "../../../../docs/piloto/ui-contract.json");

describe("cópia do contrato sincronizada com a canônica", () => {
  it.skipIf(!existsSync(CANONICA))("apps/web === docs/piloto", () => {
    const canon = JSON.parse(readFileSync(CANONICA, "utf8"));
    expect(local).toEqual(canon);
  });
});
