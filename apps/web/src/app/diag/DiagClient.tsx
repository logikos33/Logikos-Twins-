"use client";
/* eslint-disable react-hooks/set-state-in-effect -- página de diagnóstico: lê o
   ambiente do navegador UMA vez no mount e imprime; não há cascata possível. */

import { useEffect, useState } from "react";
import {
  MIME_CANDIDATES,
  detectInAppBrowser,
  captureVerdict,
  readCaptureEnv,
} from "@/lib/capture/support";

/**
 * Página de diagnóstico — SÓ leitura local. Nenhum dado sai do aparelho:
 * sem fetch, sem telemetria, sem deviceId/label (LGPD). Texto grande e
 * copiável para print/copy-paste.
 */

type Row = [string, string];

export function DiagClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [mimes, setMimes] = useState<Row[]>([]);
  const [devices, setDevices] = useState<string>("…");
  const [camTest, setCamTest] = useState<string>("");

  useEffect(() => {
    const e = readCaptureEnv();
    const inApp = detectInAppBrowser(e.userAgent);
    setRows([
      ["userAgent", e.userAgent],
      ["isSecureContext", String(window.isSecureContext)],
      ["location.protocol", window.location.protocol],
      ["location.host", window.location.host],
      ["typeof navigator.mediaDevices", typeof navigator.mediaDevices],
      ["typeof getUserMedia", typeof navigator.mediaDevices?.getUserMedia],
      ["typeof MediaRecorder", typeof MediaRecorder],
      ["webview embutido", inApp ?? "não detectado"],
      ["veredito", captureVerdict(e)],
    ]);
    setMimes(
      MIME_CANDIDATES.map((m) => [
        m,
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
          ? "✔"
          : "✘",
      ]),
    );
    // Só o TIPO dos dispositivos — nunca deviceId nem label (LGPD).
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((ds) => {
        const kinds = ds.map((d) => d.kind);
        const conta = kinds.reduce<Record<string, number>>((acc, k) => {
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {});
        setDevices(JSON.stringify(conta));
      })
      .catch((err) => setDevices(`erro: ${String(err)}`));
  }, []);

  async function testarCamera() {
    setCamTest("testando…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setCamTest("OK — câmera abriu e foi liberada");
    } catch (err) {
      const nome = err instanceof DOMException ? err.name : "Error";
      setCamTest(`${nome}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-5 py-8 select-text">
      <h1 className="font-display text-xl font-bold">diag · captura</h1>
      <p className="text-xs text-mist">
        Nada desta página é enviado a lugar nenhum — ela só mostra o que este navegador
        informa. Tire um print e mande.
      </p>
      <dl className="flex flex-col gap-1.5 font-mono text-[13px] leading-relaxed break-all">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-graphite px-3 py-2">
            <dt className="text-[10px] tracking-wider text-faint uppercase">{k}</dt>
            <dd className="text-signal">{v}</dd>
          </div>
        ))}
        <div className="rounded-md border border-line bg-graphite px-3 py-2">
          <dt className="text-[10px] tracking-wider text-faint uppercase">
            MediaRecorder.isTypeSupported
          </dt>
          {mimes.map(([m, ok]) => (
            <dd key={m} className="text-signal">
              {ok} {m}
            </dd>
          ))}
        </div>
        <div className="rounded-md border border-line bg-graphite px-3 py-2">
          <dt className="text-[10px] tracking-wider text-faint uppercase">
            enumerateDevices (só kind)
          </dt>
          <dd className="text-signal">{devices}</dd>
        </div>
      </dl>
      <button
        onClick={() => void testarCamera()}
        className="rounded-md bg-cyan py-3 font-semibold text-ink hover:bg-cyan-deep active:scale-[0.98]"
      >
        Testar câmera
      </button>
      {camTest && (
        <p className="rounded-md border border-line bg-graphite px-3 py-2 font-mono text-[13px] break-all">
          {camTest}
        </p>
      )}
    </main>
  );
}
