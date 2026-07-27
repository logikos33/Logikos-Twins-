"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRecorder } from "@/lib/capture/useRecorder";
import { FileFallback } from "./FileFallback";
import {
  IconCamOff,
  IconChev,
  IconClock,
  IconHelp,
  IconLoop,
  IconPhoneH,
  IconPrint,
  IconShield,
  IconSteps,
  IconX,
} from "@/components/icons";
import { LogoSymbol } from "@/components/Logo";

function formatElapsed(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// A dispensa do card de instruções persiste: quem já sabe filmar não pode ser
// atrasado (briefing §5) — mas o "?" no topo reabre o protocolo a qualquer momento.
const INSTR_KEY = "twins.instr.dismissed";

/**
 * Página de GRAVAÇÃO, não de upload (ADR-0008): abre a câmera, grava com envio em
 * segundo plano e, ao parar, o processamento dispara sozinho. O botão de upload não
 * existe no fluxo do celular — o fallback de arquivo fica atrás de um link discreto.
 */
export function CaptureClient({ maxSeconds }: { maxSeconds: number }) {
  const router = useRouter();
  const { state, videoRef, openCamera, start, stop } = useRecorder(maxSeconds);
  const [showFallback, setShowFallback] = useState(false);
  const [blurFaces, setBlurFaces] = useState(false);
  const [instrOpen, setInstrOpen] = useState(true);

  // A câmera abre assim que a página monta — a primeira coisa que o usuário vê é
  // o próprio ambiente, não um formulário.
  useEffect(() => {
    void openCamera();
  }, [openCamera]);

  // Estado inicial vem do localStorage DEPOIS da hidratação (evita mismatch SSR);
  // o timeout 0 tira o setState do corpo síncrono do efeito (regra do lint).
  useEffect(() => {
    if (window.localStorage.getItem(INSTR_KEY) !== "1") return;
    const t = setTimeout(() => setInstrOpen(false), 0);
    return () => clearTimeout(t);
  }, []);

  // Gravação concluída → direto para a página do scan, que mostra o processamento.
  useEffect(() => {
    if (state.phase === "done" && state.scanId && state.shareToken) {
      router.push(`/scan/${state.scanId}?token=${state.shareToken}`);
    }
  }, [state.phase, state.scanId, state.shareToken, router]);

  const remaining = maxSeconds - state.elapsedS;
  const nearLimit = state.phase === "recording" && remaining <= 15;
  const maxMin = Math.floor(maxSeconds / 60);

  const recordingHint = useMemo(() => {
    if (state.phase !== "recording") return null;
    if (nearLimit)
      return `encerrando em 0:${remaining.toString().padStart(2, "0")} · feche a volta`;
    return "1 passo por segundo · feche a volta";
  }, [state.phase, nearLimit, remaining]);

  if (showFallback || state.unsupported) {
    return (
      <FileFallback
        reason={
          state.unsupported
            ? "Este navegador não suporta gravação pela página — envie um arquivo de vídeo."
            : undefined
        }
        onBack={state.unsupported ? undefined : () => setShowFallback(false)}
      />
    );
  }

  const showInstructions = state.phase === "ready" && instrOpen;

  return (
    <div className="relative flex min-h-dvh flex-col bg-ink">
      {/* Preview da câmera em tela cheia */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Cantoneiras do viewfinder — viram magenta durante a gravação */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-3.5 opacity-50 ${
          state.phase === "recording" ? "text-magenta/75" : "text-signal/65"
        }`}
      >
        <i className="absolute top-0 left-0 h-5 w-5 rounded-tl-md border-t-[1.5px] border-l-[1.5px] border-current" />
        <i className="absolute top-0 right-0 h-5 w-5 rounded-tr-md border-t-[1.5px] border-r-[1.5px] border-current" />
        <i className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-current" />
        <i className="absolute right-0 bottom-0 h-5 w-5 rounded-br-md border-r-[1.5px] border-b-[1.5px] border-current" />
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col justify-between">
        {/* Topo: fechar · rótulo · ajuda */}
        <header className="flex items-center justify-between bg-gradient-to-b from-ink/70 to-transparent p-2.5 pb-5">
          <Link
            href="/"
            aria-label="Fechar"
            className="grid h-(--tap) w-(--tap) place-items-center rounded-full bg-graphite/55 text-signal backdrop-blur-sm"
          >
            <IconX className="h-[22px] w-[22px]" />
          </Link>
          <span className="k-label text-[10px] text-mist">novo scan</span>
          <button
            aria-label="Rever instruções"
            onClick={() => setInstrOpen(true)}
            className="grid h-(--tap) w-(--tap) place-items-center rounded-full bg-graphite/55 text-signal backdrop-blur-sm"
          >
            <IconHelp className="h-[22px] w-[22px]" />
          </button>
        </header>

        {/* Pill de gravação: timer mono + partes enviadas */}
        {state.phase === "recording" && (
          <div className="absolute top-3.5 left-1/2 z-10 -translate-x-1/2">
            <div
              className={`flex items-center gap-2.5 rounded-full border bg-graphite/85 px-4 py-2 backdrop-blur ${
                nearLimit ? "border-magenta/60" : "border-line"
              }`}
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-magenta" />
              <span
                className={`font-mono text-[22px] font-medium tracking-wide tabular-nums ${
                  nearLimit ? "text-magenta" : ""
                }`}
              >
                {formatElapsed(state.elapsedS)}
              </span>
              <span className="h-4 w-px bg-line-strong" />
              <span className="font-mono text-xs whitespace-nowrap text-cyan">
                enviando {state.partsSent} ✓
              </span>
            </div>
            {recordingHint && (
              <p
                className={`mt-2 rounded-full px-3 py-1 text-center text-xs ${
                  nearLimit ? "bg-magenta/10 text-danger-soft" : "bg-ink/60 text-mist"
                }`}
              >
                {recordingHint}
              </p>
            )}
          </div>
        )}

        {/* Card de instruções (protocolo + LGPD — contrato nº 7) */}
        {showInstructions && (
          <div className="absolute inset-x-2.5 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-20 rounded-xl border border-line bg-graphite/95 p-4 shadow-sheet backdrop-blur-md sm:right-6 sm:left-auto sm:w-[380px] sm:bottom-6">
            <h2 className="font-display text-[17px] font-bold">
              Como capturar <span className="text-cyan">bem</span>
            </h2>
            <ul className="mt-2.5 space-y-2 text-[13px]">
              <li className="flex items-center gap-2.5">
                <IconPhoneH className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">Segure na horizontal.</b> Aponte para onde
                  quer mapear.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconSteps className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">Ande devagar:</b>{" "}
                  <span className="font-mono text-mist">1 passo/s</span>. Sem giros
                  bruscos.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconLoop className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">Feche a volta.</b> Termine perto de onde
                  começou.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconClock className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">Limite:</b>{" "}
                  <span className="font-mono text-mist">até {maxMin} min</span>. O envio
                  acontece durante a filmagem.
                </span>
              </li>
            </ul>

            <div className="-mx-4 my-3 h-px bg-line" />

            <label className="flex min-h-(--tap) cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Borrar rostos</span>
                <span className="block text-xs text-mist">
                  LGPD · desfoque automático no processamento
                </span>
              </span>
              <span className="relative h-[30px] w-[50px] flex-none">
                <input
                  type="checkbox"
                  checked={blurFaces}
                  onChange={(e) => setBlurFaces(e.target.checked)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="absolute inset-0 rounded-full border border-line-strong bg-surface-2 transition peer-checked:border-cyan peer-checked:bg-cyan/20" />
                <span className="absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-mist transition-all peer-checked:left-[23px] peer-checked:bg-cyan" />
              </span>
            </label>

            <a
              href="/api/marker"
              className="flex min-h-(--tap) items-center gap-2.5 text-sm font-medium"
            >
              <IconPrint className="h-5 w-5 flex-none text-cyan" />
              <span>
                Marcador de escala (PDF A4)
                <span className="block text-xs font-normal text-mist">
                  imprima e deixe no chão · escala automática em metros
                </span>
              </span>
              <IconChev className="ml-auto h-5 w-5 flex-none text-faint" />
            </a>

            <p className="mt-2 text-xs leading-relaxed text-mist">
              <IconShield className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />O vídeo bruto é
              apagado após 7 dias; o mapa 3D e as fotos de evidência permanecem. Ao
              gravar, você concorda com o processamento das imagens.
            </p>

            <button
              onClick={() => {
                setInstrOpen(false);
                window.localStorage.setItem(INSTR_KEY, "1");
              }}
              className="mt-3 w-full rounded-[10px] bg-cyan py-2.5 text-sm font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.98]"
            >
              Entendi, vamos filmar
            </button>
          </div>
        )}

        {/* Erro (ex.: permissão de câmera negada) */}
        {state.phase === "error" && state.error && (
          <div className="mx-auto flex max-w-sm flex-col items-center px-6 text-center">
            <span className="grid h-[72px] w-[72px] place-items-center rounded-full border-[1.5px] border-magenta/50">
              <IconCamOff className="h-8 w-8 text-magenta" />
            </span>
            <h1 className="mt-4 font-display text-[22px] font-bold">
              Sem acesso à câmera
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-mist">{state.error}</p>
            <button
              onClick={() => void openCamera()}
              className="mt-5 w-full rounded-md bg-cyan py-3 font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.97]"
            >
              Tentar de novo
            </button>
            <button
              onClick={() => setShowFallback(true)}
              className="mt-2.5 w-full rounded-md border border-line-strong py-3 font-semibold transition hover:border-cyan active:scale-[0.97]"
            >
              Enviar um arquivo de vídeo
            </button>
            <p className="mt-5 text-[11px] text-faint">
              Nada foi gravado nem enviado — o vídeo só sai do aparelho durante a
              gravação.
            </p>
          </div>
        )}

        {/* Rodapé: botão de gravar/parar + fallback discreto */}
        <footer className="flex flex-col items-center gap-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          {state.phase === "requesting-camera" && (
            <div className="mb-6 flex flex-col items-center gap-3">
              <LogoSymbol className="h-12 w-12 animate-pulse text-signal/90" />
              <p className="font-display text-lg font-medium">Abrindo a câmera…</p>
              <p className="max-w-[260px] text-center text-[13px] text-mist">
                Autorize o acesso quando o navegador pedir.
              </p>
            </div>
          )}

          {state.phase === "ready" && !showInstructions && (
            <span className="rounded-full bg-graphite/60 px-3 py-1.5 text-xs text-signal">
              horizontal · 1 passo/s · feche a volta
            </span>
          )}

          {(state.phase === "ready" || state.phase === "recording") &&
            !showInstructions && (
              <button
                onClick={() =>
                  void (state.phase === "recording" ? stop() : start(blurFaces))
                }
                aria-label={
                  state.phase === "recording" ? "Parar e processar" : "Começar a gravar"
                }
                className="relative grid h-[78px] w-[78px] place-items-center rounded-full"
              >
                <span className="absolute inset-0 rounded-full border-[2.5px] border-signal/85" />
                {state.phase === "recording" && (
                  <span className="absolute -inset-[9px] animate-[rec-halo_1.6s_var(--ease-out-soft)_infinite] rounded-full border-2 border-magenta/50 motion-reduce:animate-none" />
                )}
                <span
                  className={`bg-magenta transition-all duration-200 active:scale-90 ${
                    state.phase === "recording"
                      ? "h-[30px] w-[30px] rounded-[9px]"
                      : "h-[62px] w-[62px] rounded-full"
                  }`}
                />
              </button>
            )}

          {state.phase === "recording" && (
            <span className="k-label text-[9px] text-faint">
              tela ativa · não vai apagar
            </span>
          )}

          {state.phase === "finishing" && (
            <div className="mx-4 w-full max-w-xs rounded-lg border border-line bg-graphite/95 p-5 text-center shadow-card backdrop-blur">
              <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-[3px] border-surface-2 border-t-cyan motion-reduce:animate-none" />
              <p className="mt-3 font-display text-[17px] font-medium">
                Enviando as últimas partes…
              </p>
              <p className="mt-1 font-mono text-sm text-cyan">{state.partsSent} ✓</p>
              <p className="mt-2 text-xs text-mist">
                <b className="font-medium text-signal">Não feche esta página.</b> O
                processamento começa sozinho.
              </p>
            </div>
          )}

          {state.phase === "ready" && (
            <button
              onClick={() => setShowFallback(true)}
              className="min-h-(--tap) px-3 text-xs text-mist underline decoration-dotted underline-offset-2"
            >
              ou envie um arquivo de vídeo (desktop / drone)
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
