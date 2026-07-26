import { z } from "zod";

/**
 * Configuração validada na borda do processo.
 *
 * A validação falha alto e cedo, na primeira leitura, em vez de produzir um
 * `undefined` que só vira erro três camadas adiante — um endpoint S3 vazio
 * falharia como "connection refused" no meio de um upload, longe da causa.
 */
const serverSchema = z.object({
  APP_NAME: z.string().default("Logikos Twins"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),

  // Storage S3-compatível: MinIO no dev, R2 no plug-in. Ver ADR-0003.
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // MinIO exige bucket no caminho; o R2 usa bucket no host. É a única assimetria
  // entre os dois ambientes, e ela vive aqui.
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  // Endereço que o NAVEGADOR usa para falar com o storage. No compose, os containers
  // se enxergam por `http://minio:9000`, mas o celular/navegador não resolve esse nome —
  // presigned URLs precisam ser assinadas para o host público.
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),

  // Job runner: fake-runpod no dev, RunPod no plug-in. Ver ADR-0004.
  RUNPOD_BASE_URL: z.string().url().default("http://localhost:8080"),
  RUNPOD_ENDPOINT_ID: z.string().default("local"),
  RUNPOD_API_KEY: z.string().default("dev-nao-usado"),
  RUNPOD_WEBHOOK_SECRET: z.string().min(8),
  // URL que o RUNNER usa para chamar o webhook de volta. No compose, o fake-runpod
  // não resolve `localhost:3000` (seria ele mesmo) — precisa de `http://web:3000`.
  // Em produção é a própria APP_URL; por isso o default.
  WEBHOOK_BASE_URL: z.string().url().optional(),

  ADMIN_TOKEN: z.string().min(8),

  MAX_VIDEO_MB: z.coerce.number().int().positive().default(300),
  MAX_VIDEO_SECONDS: z.coerce.number().int().positive().default(180),
  EXTRACT_FPS: z.coerce.number().int().positive().default(8),
  MAX_SCANS_PER_DAY: z.coerce.number().int().positive().default(20),
  // Retenção do vídeo BRUTO (artefatos 3D nunca são apagados). 7 dias em produção;
  // no dev usa-se minutos para conseguir testar a retenção sem esperar uma semana.
  VIDEO_RETENTION_MINUTES: z.coerce.number().int().positive().default(10080),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Configuração inválida — variáveis de ambiente faltando ou malformadas:\n${issues}\n\n` +
        `Copie .env.example para .env na raiz do repositório e ajuste.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Endpoint que o navegador deve usar (ver comentário de S3_PUBLIC_ENDPOINT). */
export function publicS3Endpoint(): string {
  const e = env();
  return e.S3_PUBLIC_ENDPOINT ?? e.S3_ENDPOINT;
}
