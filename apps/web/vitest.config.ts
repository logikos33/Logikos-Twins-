import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // O viewer e a captura são exercitados por testes de unidade sobre a lógica pura
    // (geometria, escala, buffering de partes) — não por render de WebGL, que não roda
    // de forma confiável em CI headless.
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
