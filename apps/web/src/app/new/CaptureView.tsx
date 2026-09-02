"use client";

/**
 * Tela CAPTURE do contrato v1.2 — apresentação PURA (testável sem câmera).
 * Conversão de design/piloto-mobile/Capture.dc.html FUNDIDA com os
 * comportamentos de produto da tela real que o export não cobre (card de
 * instruções com blur/PDF/LGPD, upload desktop, "Abrindo a câmera…") — D- no
 * ESTADO. Cores D-1: zero magenta; gravando = --color-record com pulso SÓ no
 * ponto REC (steps); nenhum outro loop.
 */

import type { ReactNode } from "react";
import Link from "next/link";
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
  IconUpFile,
  IconX,
} from "@/components/icons";
import { LogoSymbol } from "@/components/Logo";
import { t } from "@/lib/piloto/strings";

export type CaptureState =
  | "permission-prompt"
  | "permission-denied"
  | "unsupported"
  | "https-required"
  | "idle"
  | "recording"
  | "stopping"
  | "portrait-hint";

export interface CaptureViewProps {
  state: CaptureState;
  elapsedS: number;
  maxSeconds: number;
  partsSent: number;
  partsQueued: number;
  instrOpen: boolean;
  blurFaces: boolean;
  /** Texto técnico do erro real (mostrado sob o headline em permission-denied). */
  errorDetail?: string | null;
  onStart: () => void;
  onStop: () => void;
  onTorch: () => void;
  onFallback: () => void;
  onAllow: () => void;
  onDismissHint: () => void;
  onToggleInstr: (open: boolean) => void;
  onToggleBlur: (on: boolean) => void;
  /** Slot do <video> real (o /dev/states injeta o mock de câmera). */
  camSlot: ReactNode;
}

const CONTROL_STATES: readonly CaptureState[] = [
  "idle",
  "recording",
  "stopping",
  "portrait-hint",
];

function fmt(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CaptureView(p: CaptureViewProps) {
  const controls = CONTROL_STATES.includes(p.state);
  const showCam = controls || p.state === "permission-prompt";
  const nearLimit = p.state === "recording" && p.maxSeconds - p.elapsedS <= 20;
  const isStart = p.state === "idle" || p.state === "portrait-hint";
  const isStop = p.state === "recording" || p.state === "stopping";
  const hint =
    p.state !== "recording"
      ? null
      : nearLimit
        ? t("capture", "hintEnding").replace(
            "{ss}",
            String(p.maxSeconds - p.elapsedS).padStart(2, "0"),
          )
        : p.elapsedS < 5
          ? t("capture", "tip0")
          : p.elapsedS < 15
            ? t("capture", "tip5")
            : t("capture", "hintClose");

  return (
    <div
      data-screen="capture"
      data-state={p.state}
      className="relative flex h-dvh flex-col overflow-hidden bg-ink text-signal"
    >
      {showCam && <div className="absolute inset-0">{p.camSlot}</div>}

      {/* cantoneiras do viewfinder — record, nunca magenta (D-1) */}
      {controls && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-3.5 opacity-50 ${
            p.state === "recording" ? "text-record/80" : "text-signal/65"
          }`}
        >
          <i className="absolute top-0 left-0 h-5 w-5 rounded-tl-md border-t-[1.5px] border-l-[1.5px] border-current" />
          <i className="absolute top-0 right-0 h-5 w-5 rounded-tr-md border-t-[1.5px] border-r-[1.5px] border-current" />
          <i className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-current" />
          <i className="absolute right-0 bottom-0 h-5 w-5 rounded-br-md border-r-[1.5px] border-b-[1.5px] border-current" />
        </div>
      )}

      <div className="relative z-10 flex h-full flex-col justify-between">
        <header className="flex items-center justify-between bg-gradient-to-b from-ink/70 to-transparent p-2.5 pb-5">
          <Link
            href="/"
            aria-label={t("capture", "close")}
            className="grid h-(--tap) w-(--tap) place-items-center rounded-full bg-graphite/55 backdrop-blur-sm"
          >
            <IconX className="h-[22px] w-[22px]" />
          </Link>
          <span className="k-label text-[10px] text-mist">{t("capture", "screenLabel")}</span>
          <button
            aria-label={t("capture", "reopenGuide")}
            onClick={() => p.onToggleInstr(true)}
            className="grid h-(--tap) w-(--tap) place-items-center rounded-full bg-graphite/55 backdrop-blur-sm"
          >
            <IconHelp className="h-[22px] w-[22px]" />
          </button>
        </header>

        {p.state === "recording" && (
          <div className="absolute top-3.5 left-1/2 z-10 -translate-x-1/2">
            <div
              className={`flex items-center gap-2.5 rounded-full border bg-graphite/85 px-4 py-2 backdrop-blur ${
                nearLimit ? "border-warning/70" : "border-line"
              }`}
            >
              <span className="h-2.5 w-2.5 animate-[rec-dot_1s_steps(2,end)_infinite] rounded-full bg-record motion-reduce:animate-none" />
              <span
                className={`font-mono text-[22px] font-medium tracking-wide tabular-nums ${
                  nearLimit ? "text-warning" : ""
                }`}
              >
                {fmt(p.elapsedS)}
                <span className="text-mist"> / {fmt(p.maxSeconds)}</span>
              </span>
              <span className="h-4 w-px bg-line-strong" />
              <span className="font-mono text-xs whitespace-nowrap text-cyan">
                {t("capture", "sendingCount").replace("{n}", String(p.partsSent))}
              </span>
            </div>
            {hint && (
              <p
                className={`mt-2 rounded-full px-3 py-1 text-center text-xs ${
                  nearLimit ? "bg-warning/15 text-warning" : "bg-ink/60 text-mist"
                }`}
              >
                {hint}
              </p>
            )}
          </div>
        )}

        {p.state === "permission-prompt" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-ink/55 p-6">
            <div className="flex w-[300px] flex-col items-center gap-3.5 rounded-2xl border border-line bg-graphite p-5 text-center">
              <IconCamOff className="h-7 w-7 text-mist" />
              <p className="text-[14.5px]">{t("capture", "permissionPrompt")}</p>
              <button
                data-plug="capture.permission.request"
                onClick={p.onAllow}
                className="w-full rounded-[10px] bg-cyan py-2.5 text-sm font-semibold text-ink hover:bg-cyan-deep active:scale-[0.98]"
              >
                {t("capture", "allow")}
              </button>
              <button
                data-plug="capture.fallback-file"
                onClick={p.onFallback}
                className="w-full py-1 text-xs text-mist underline decoration-dotted underline-offset-2"
              >
                {t("capture", "fallback")}
              </button>
            </div>
          </div>
        )}

        {p.state === "permission-denied" && (
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center px-6 text-center">
            <span className="grid h-[72px] w-[72px] place-items-center rounded-full border-[1.5px] border-danger/60">
              <IconCamOff className="h-8 w-8 text-danger" />
            </span>
            <h1 className="mt-4 font-display text-[22px] font-bold">
              {t("capture", "deniedTitle")}
            </h1>
            <ol className="mt-3 space-y-1.5 text-left text-sm text-mist">
              {t("capture", "deniedSteps").map((passo, i) => (
                <li key={passo} className="flex gap-2">
                  <span className="font-mono text-cyan">{i + 1}.</span>
                  {passo}
                </li>
              ))}
            </ol>
            {p.errorDetail && (
              <p className="mt-3 text-xs text-faint">{p.errorDetail}</p>
            )}
            <button
              data-plug="capture.fallback-file"
              onClick={p.onFallback}
              className="mt-5 w-full rounded-md bg-cyan py-3 font-semibold text-ink hover:bg-cyan-deep active:scale-[0.97]"
            >
              {t("capture", "fallback")}
            </button>
            <p className="mt-5 text-[11px] text-faint">{t("capture", "nothingSent")}</p>
          </div>
        )}

        {p.state === "unsupported" && (
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center px-6 text-center">
            <LogoSymbol className="h-10 w-10 text-faint" />
            <p className="mt-4 text-[14.5px]">{t("capture", "unsupported")}</p>
            <button
              data-plug="capture.fallback-file"
              onClick={p.onFallback}
              className="mt-5 w-full rounded-md bg-cyan py-3 font-semibold text-ink hover:bg-cyan-deep active:scale-[0.97]"
            >
              {t("capture", "fallback")}
            </button>
          </div>
        )}

        {p.state === "https-required" && (
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center px-6 text-center">
            <IconShield className="h-9 w-9 text-warning" />
            <p className="mt-4 text-[14.5px]">{t("capture", "httpsRequired")}</p>
          </div>
        )}

        {p.state === "portrait-hint" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ink/80 p-6 text-center">
            <IconPhoneH className="h-10 w-10 rotate-90 text-cyan" />
            <p className="font-display text-lg font-medium">{t("capture", "portraitHint")}</p>
            <p className="text-sm text-mist">{t("capture", "portraitHintSub")}</p>
            <button
              data-plug="capture.guide.dismiss"
              onClick={p.onDismissHint}
              className="mt-2 rounded-md border border-line-strong px-5 py-2.5 text-sm font-semibold hover:border-cyan"
            >
              {t("capture", "portraitDismiss")}
            </button>
          </div>
        )}

        {p.state === "stopping" && (
          <div className="mx-auto w-full max-w-xs rounded-lg border border-line bg-graphite/95 p-5 text-center shadow-card backdrop-blur">
            <p className="font-display text-[17px] font-medium">
              {p.elapsedS >= p.maxSeconds
                ? t("capture", "limitReached")
                : t("capture", "sendingLast")}
            </p>
            <p className="mt-2 font-mono text-sm text-cyan">
              {t("capture", "partsShort")
                .replace("{sent}", String(p.partsSent))
                .replace("{total}", String(p.partsSent + p.partsQueued))}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded bg-surface-2">
              <div
                className="h-full bg-cyan"
                style={{
                  width: `${Math.round((p.partsSent / Math.max(1, p.partsSent + p.partsQueued)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-3 text-xs text-mist">
              <b className="font-medium text-signal">{t("capture", "dontClose")}</b>{" "}
              {t("capture", "startsAlone")}
            </p>
          </div>
        )}

        {p.instrOpen && controls && (
          <div className="absolute inset-x-2.5 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-20 rounded-xl border border-line bg-graphite/95 p-4 shadow-sheet backdrop-blur-md sm:right-6 sm:left-auto sm:w-[380px] sm:bottom-6">
            <h2 className="font-display text-[17px] font-bold">{t("capture", "instrTitle")}</h2>
            <ul className="mt-2.5 space-y-2 text-[13px]">
              <li className="flex items-center gap-2.5">
                <IconPhoneH className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">{t("capture", "instrHorizontal")}</b>{" "}
                  {t("capture", "instrHorizontalSub")}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconSteps className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">{t("capture", "instrPace")}</b>{" "}
                  <span className="font-mono text-mist">{t("capture", "instrPaceSub")}</span>
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconLoop className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">{t("capture", "instrLoop")}</b>{" "}
                  {t("capture", "instrLoopSub")}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <IconClock className="h-5 w-5 flex-none text-cyan" />
                <span>
                  <b className="font-semibold">{t("capture", "instrLimit")}</b>{" "}
                  <span className="font-mono text-mist">
                    {t("capture", "instrLimitSub").replace(
                      "{m}",
                      String(Math.floor(p.maxSeconds / 60)),
                    )}
                  </span>
                </span>
              </li>
            </ul>
            <div className="-mx-4 my-3 h-px bg-line" />
            <label className="flex min-h-(--tap) cursor-pointer items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">{t("capture", "blurTitle")}</span>
                <span className="block text-xs text-mist">{t("capture", "blurSub")}</span>
              </span>
              <span className="relative h-[30px] w-[50px] flex-none">
                <input
                  type="checkbox"
                  checked={p.blurFaces}
                  onChange={(e) => p.onToggleBlur(e.target.checked)}
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
                {t("capture", "markerTitle")}
                <span className="block text-xs font-normal text-mist">
                  {t("capture", "markerSub")}
                </span>
              </span>
              <IconChev className="ml-auto h-5 w-5 flex-none text-faint" />
            </a>
            <p className="mt-2 text-xs leading-relaxed text-mist">
              <IconShield className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" />
              {t("capture", "lgpd")}
            </p>
            <button
              onClick={() => p.onToggleInstr(false)}
              className="mt-3 w-full rounded-[10px] bg-cyan py-2.5 text-sm font-semibold text-ink transition hover:bg-cyan-deep active:scale-[0.98]"
            >
              {t("capture", "instrGo")}
            </button>
          </div>
        )}

        {controls && !p.instrOpen && (
          <footer className="flex items-end justify-between px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
            <button
              data-plug="capture.torch"
              onClick={p.onTorch}
              aria-label={t("capture", "torch")}
              className="mb-3.5 grid h-[46px] w-[46px] place-items-center rounded-full border border-line-strong bg-graphite/65"
            >
              <span aria-hidden="true">▽</span>
            </button>

            {isStart && (
              <button
                data-plug="capture.start"
                onClick={p.onStart}
                aria-label={t("capture", "recStart")}
                className="relative grid h-[78px] w-[78px] place-items-center rounded-full active:scale-[0.97]"
              >
                <span className="absolute inset-0 rounded-full border-[2.5px] border-signal/60 bg-ink/35" />
                <span className="h-[58px] w-[58px] rounded-full bg-record" />
              </button>
            )}
            {isStop && (
              <button
                data-plug="capture.stop"
                onClick={p.onStop}
                aria-label={t("capture", "recStop")}
                className="relative grid h-[78px] w-[78px] place-items-center rounded-full bg-cyan shadow-[0_0_0_3px_var(--color-ink),0_0_0_5px_var(--color-cyan)] active:scale-[0.97]"
              >
                <span className="h-[26px] w-[26px] rounded-[5px] bg-ink" />
              </button>
            )}

            <button
              data-plug="capture.fallback-file"
              onClick={p.onFallback}
              className="flex w-16 flex-col items-center gap-1 text-[10px] text-mist"
            >
              <span className="grid h-[46px] w-[46px] place-items-center rounded-full border border-line-strong bg-graphite/65 text-signal">
                <IconUpFile className="h-5 w-5" />
              </span>
              {t("capture", "fallbackShort")}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
