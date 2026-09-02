"use client";

/**
 * Tela ENTRY do contrato v1.2 — conversão de design/piloto-mobile/Entry.dc.html.
 * Rota-alvo /p/:token aguarda o modelo de projeto (#38); vive em /entry
 * (routeMap do contrato) e no /dev/states. Corte seco em toda troca de estado;
 * plug POR ITEM na lista (regra v1.2 — o export marcava só a 1ª instância).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoSymbol } from "@/components/Logo";
import { MapChip, type MapStatus } from "@/components/piloto/MapChip";
import { t } from "@/lib/piloto/strings";

export type EntryState = "loading" | "ready" | "empty" | "invalid-link" | "offline";

export interface EntryMap {
  id: string;
  name: string;
  date: string;
  st: MapStatus;
  href: string;
}

export interface EntryProps {
  state: EntryState;
  projectName: string;
  maps: EntryMap[];
}

export function EntryClient({ state, projectName, maps }: EntryProps) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);

  const showBody = state === "ready" || state === "offline" || state === "empty";
  const hasMaps = (state === "ready" || state === "offline") && maps.length > 0;

  return (
    <div
      data-screen="entry"
      data-state={state}
      data-plug="entry.load"
      className="flex h-dvh flex-col overflow-hidden bg-ink text-signal"
    >
      {state === "offline" && (
        <div className="flex h-[38px] flex-none items-center justify-center gap-2 bg-warning text-[12.5px] font-semibold text-ink">
          <span aria-hidden="true">⚠</span>
          {t("entry", "offlineBar")}
        </div>
      )}

      <header className="flex flex-none items-center gap-3 px-4 pb-1.5 pt-5">
        <LogoSymbol className="h-[30px] w-[30px]" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-xl font-medium">{projectName}</span>
          <span className="font-mono text-[10px] tracking-[0.3em] text-mist">
            {t("entry", "productTag")}
          </span>
        </div>
      </header>

      {state === "loading" && (
        <div className="flex flex-1 flex-col gap-3.5 p-4" aria-hidden="true">
          <div className="h-[52px] rounded-xl bg-graphite" />
          <div className="h-12 rounded-2xl bg-graphite opacity-70" />
          <div className="h-[82px] rounded-2xl bg-graphite opacity-55" />
          <div className="h-[82px] rounded-2xl bg-graphite opacity-40" />
          <div className="h-[82px] rounded-2xl bg-graphite opacity-25" />
        </div>
      )}

      {state === "invalid-link" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6 text-center">
          <LogoSymbol className="h-10 w-10 text-faint" />
          <p className="max-w-[240px] text-[14.5px]">{t("entry", "invalidLink")}</p>
        </div>
      )}

      {showBody && (
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-6 pt-3.5">
          <button
            data-plug="entry.capture.open"
            onClick={() => router.push("/new")}
            className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-cyan text-[15px] font-semibold text-ink active:scale-[0.97]"
          >
            <span aria-hidden="true">▣</span>
            {t("entry", "capture")}
          </button>

          <div className="overflow-hidden rounded-2xl border border-line bg-graphite">
            <button
              data-plug="entry.guide.toggle"
              onClick={() => setGuideOpen((v) => !v)}
              className="flex h-12 w-full items-center gap-2.5 px-3.5"
              aria-expanded={guideOpen}
            >
              <span aria-hidden="true" className="text-mist">
                ?
              </span>
              <span className="text-[13.5px] font-medium">{t("entry", "guideTitle")}</span>
              <span
                aria-hidden="true"
                className="ml-auto text-mist"
                style={{ transform: `rotate(${guideOpen ? 180 : 0}deg)` }}
              >
                ⌄
              </span>
            </button>
            {guideOpen && (
              <ul className="flex flex-col gap-3 px-3.5 pb-4 pt-0.5">
                {t("entry", "guide").map((dica) => (
                  <li key={dica} className="flex items-center gap-2.5 text-[13px]">
                    <span aria-hidden="true" className="text-mist">
                      •
                    </span>
                    {dica}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {state === "empty" && (
            <div className="flex min-h-[290px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong">
              <LogoSymbol className="h-[38px] w-[38px] text-faint" />
              <p className="max-w-[220px] text-center text-[13.5px] text-mist">
                {t("entry", "empty")}
              </p>
            </div>
          )}

          {hasMaps && (
            <>
              <h2 className="mt-1 font-mono text-[11px] uppercase tracking-[0.26em] text-mist">
                {t("entry", "mapsTitle")}
              </h2>
              {maps.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-graphite p-3"
                >
                  <div
                    aria-hidden="true"
                    className="h-14 w-14 flex-none rounded-lg border border-line bg-surface-2"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    <span className="font-mono text-[11px] text-mist">{m.date}</span>
                    <MapChip st={m.st} />
                  </div>
                  <button
                    data-plug="entry.map.open"
                    onClick={() => router.push(m.href)}
                    className="h-[38px] rounded-lg border border-line-strong px-3.5 text-[13px] font-medium hover:border-cyan"
                  >
                    {t("entry", "open")}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
