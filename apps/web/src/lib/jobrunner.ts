import { env } from "./env";

/**
 * Porta `JobRunner` — o único módulo que fala com o RunPod (ADR-0004).
 *
 * No dev, `RUNPOD_BASE_URL` aponta para o fake-runpod, que implementa o mesmo
 * contrato. Na FASE PLUG-IN, muda-se a URL e a chave; este arquivo não muda.
 */

export type RunJobInput = {
  scanId: string;
  videoUrl: string;
  params: { fps: number };
};

export type JobStatus = {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  output: JobOutput | null;
  error: string | null;
};

// O formato de retorno do worker — o mesmo do handler real (D3) e do sósia.
export type JobOutput = {
  scan_id: string;
  outputs: Record<string, string>;
  metrics: Record<string, unknown>;
};

function baseUrl(): string {
  const e = env();
  return `${e.RUNPOD_BASE_URL}/v2/${e.RUNPOD_ENDPOINT_ID}`;
}

function authHeaders(): Record<string, string> {
  // O fake ignora a autenticação; o RunPod real exige. Enviar sempre mantém o
  // caminho idêntico nos dois ambientes.
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env().RUNPOD_API_KEY}`,
  };
}

/** Dispara o job de reconstrução. Devolve o id do job no runner. */
export async function startJob(input: RunJobInput): Promise<string> {
  const e = env();
  // O webhook carrega o segredo na query — é como o scan volta a andar sem polling.
  // WEBHOOK_BASE_URL cobre o caso do compose (o runner não resolve localhost).
  const webhookBase = e.WEBHOOK_BASE_URL ?? e.APP_URL;
  const webhook = `${webhookBase}/api/webhooks/runpod?token=${encodeURIComponent(e.RUNPOD_WEBHOOK_SECRET)}`;

  const body = {
    input: {
      scan_id: input.scanId,
      video_url: input.videoUrl,
      params: input.params,
    },
    webhook,
    // 60 min — o default de 10 min do RunPod mataria vídeos longos (plano §3.2).
    policy: { executionTimeout: 3_600_000 },
  };

  const res = await fetch(`${baseUrl()}/run`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`runner recusou o job: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { id: string; status: string };
  if (!json.id) throw new Error("runner não devolveu id de job");
  return json.id;
}

/** Consulta o estado de um job — usado pela reconciliação. */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${baseUrl()}/status/${jobId}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`status do job ${jobId}: HTTP ${res.status}`);
  }
  return (await res.json()) as JobStatus;
}
