import { env } from "@/lib/env";
import { CaptureClient } from "./CaptureClient";

export const dynamic = "force-dynamic";

export default function NewScanPage() {
  // O limite vem do servidor: é a mesma variável que valida o /complete —
  // o cliente não inventa o próprio teto.
  return <CaptureClient maxSeconds={env().MAX_VIDEO_SECONDS} />;
}
