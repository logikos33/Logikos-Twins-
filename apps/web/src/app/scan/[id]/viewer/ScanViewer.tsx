"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ViewerEngine, type ViewerMode } from "./engine";
import { calibrationFactor, distance, formatMeasurement } from "@/lib/viewer/scale";
import type { ScaleInfo, Vec3 } from "@/lib/viewer/scale";
import { nearestKeyframe, type PosesFile } from "@/lib/viewer/poses";
import { LogoSymbol } from "@/components/Logo";
import { notImplemented } from "@/lib/piloto/plugs";
import { t as ts } from "@/lib/piloto/strings";
import {
  IconBack,
  IconCube,
  IconCut,
  IconEye,
  IconEyeOff,
  IconFly,
  IconLayers,
  IconOrbit,
  IconPin,
  IconPlan,
  IconRoute,
  IconRuler,
  IconSearch,
  IconShare,
  IconX,
} from "@/components/icons";

/**
 * O "controle do mapa" (spec D4). O React cuida da UI; a cena vive em ViewerEngine.
 *
 * Linguagem do HUD (docs/design/DESIGN-TOKENS §9): controles ancorados nas BORDAS,
 * recolhíveis, nunca cobrindo o centro — o mapa É o produto (contrato nº 5). Botão
 * "esconder interface" deixa só a nuvem. Toda medição/contagem em JetBrains Mono.
 *
 * Ferramentas: navegar (orbit/fly/top) · medir (com calibração) · anotar (pins com
 * foto do keyframe mais próximo) · camadas · corte por altura · replay do percurso.
 */

type Tool = "navigate" | "measure" | "pin";

type Annotation = {
  id: string;
  type: string;
  position: Vec3 | { a: Vec3; b: Vec3 };
  data: { text?: string; keyframe?: number } | null;
};

type SemanticDetection = {
  id: string;
  label: string;
  score: number;
  frameIdx: number;
  worldPos: Vec3;
};

// Cor estável por classe: hash do rótulo → paleta categórica dos tokens (o viewer
// não conhece a lista de classes — elas vêm dos dados; YOLOX hoje, Recognition
// amanhã). O ciano fica fora da paleta de propósito: é o acento reservado da UI.
const CLASS_PALETTE = [
  0x5aa9ff, 0x3ddc97, 0xb78bfa, 0xff9f43, 0xffd166, 0xff7ab8, 0xf87171, 0xa3e635,
] as const;

function labelColor(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 3600;
  return CLASS_PALETTE[h % CLASS_PALETTE.length]!;
}
const cssColor = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

type Props = {
  /** Convidado (/s/:token): tela SHARED do contrato — somente-leitura. */
  readOnly?: boolean;
  scanId: string;
  token: string;
  cloudUrl: string;
  posesUrl: string;
  initialScale: ScaleInfo | null;
};

export function ScanViewer({
  readOnly = false,
  scanId,
  token,
  cloudUrl,
  posesUrl,
  initialScale,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ViewerEngine | null>(null);

  const [progress, setProgress] = useState(0);
  // Tamanho REAL da nuvem carregada (Content-Length do artefato — contrato).
  const [cloudMb, setCloudMb] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("navigate");
  const [mode, setMode] = useState<ViewerMode>("orbit");
  const [scale, setScale] = useState<ScaleInfo | null>(initialScale);
  const [clip, setClip] = useState(1);
  const [replaying, setReplaying] = useState(false);
  const [layers, setLayers] = useState({
    cloud: true,
    trajectory: true,
    pins: true,
    detections: true,
  });

  // Painéis do HUD — um aberto por vez; tudo dismissível (o mapa é o produto).
  const [hudHidden, setHudHidden] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [cutOpen, setCutOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);

  // Medição em andamento: até 2 pontos.
  const [measurePts, setMeasurePts] = useState<Vec3[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  const [calibValue, setCalibValue] = useState("");

  // Pin em criação.
  const [pendingPin, setPendingPin] = useState<Vec3 | null>(null);
  const [pinText, setPinText] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [openPin, setOpenPin] = useState<Annotation | null>(null);

  // Detecções semânticas (D5) + busca.
  const [detections, setDetections] = useState<SemanticDetection[]>([]);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDetection, setOpenDetection] = useState<SemanticDetection | null>(null);
  // Resultados da última busca, para "próxima ›" (1 de N do cartão de evidência).
  const [matches, setMatches] = useState<SemanticDetection[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);

  const posesRef = useRef<PosesFile | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Etiqueta do pin em criação (annotate.tag.set — vai no data JSON, sem migration).
  const [pinTag, setPinTag] = useState<string | null>(null);
  // Sheet de compartilhamento (dono): links SOMENTE-LEITURA com validade (#47).
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDays, setShareDays] = useState<1 | 7 | 30>(7);
  const [shareLinks, setShareLinks] = useState<
    { id: string; token: string; expiresAt: string; views: number; state: string }[]
  >([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // O callback de pick do engine vive fora do ciclo do React; a ferramenta ativa
  // chega até ele por ref, atualizada em efeito (não durante o render — regra dos hooks).
  const toolRef = useRef<Tool>(tool);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // ---------------------------------------------------------------------------
  // Bootstrap da cena
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const engine = new ViewerEngine(container);
    engineRef.current = engine;

    engine.onPick = ({ point }) => {
      const activeTool = toolRef.current;
      if (activeTool === "measure") {
        setMeasurePts((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
      } else if (activeTool === "pin") {
        setPendingPin(point);
      }
    };

    (async () => {
      try {
        void fetch(cloudUrl, { method: "HEAD" })
          .then((r) => {
            const len = Number(r.headers.get("content-length"));
            if (Number.isFinite(len) && len > 0) setCloudMb(len / 1024 / 1024);
          })
          .catch(() => undefined);
        await engine.loadCloud(cloudUrl, setProgress);
        const poses = (await (await fetch(posesUrl)).json()) as PosesFile;
        posesRef.current = poses;
        engine.setPoses(poses);
        setReady(true);
      } catch (err) {
        setLoadError(
          `Não foi possível carregar o mapa: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // cloudUrl/posesUrl são estáveis por scan — o efeito roda uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega anotações existentes.
  useEffect(() => {
    fetch(`/api/scans/${scanId}/annotations?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : { annotations: [] }))
      .then((d: { annotations: Annotation[] }) => setAnnotations(d.annotations))
      .catch(() => setAnnotations([]));
  }, [scanId, token]);

  // Carrega detecções semânticas (D5).
  useEffect(() => {
    fetch(`/api/scans/${scanId}/detections?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : { detections: [] }))
      .then(
        (d: {
          detections: {
            id: string;
            label: string;
            score: number;
            frameIdx: number;
            worldPos: Vec3 | null;
          }[];
        }) =>
          setDetections(
            d.detections
              .filter((x) => x.worldPos)
              .map((x) => ({ ...x, worldPos: x.worldPos! })),
          ),
      )
      .catch(() => setDetections([]));
  }, [scanId, token]);

  // Sincroniza detecções com a cena (respeitando o filtro de classe).
  useEffect(() => {
    const visible = labelFilter
      ? detections.filter((d) => d.label === labelFilter)
      : detections;
    engineRef.current?.setDetections(
      visible.map((d) => ({
        id: d.id,
        position: d.worldPos,
        color: labelColor(d.label),
      })),
    );
  }, [detections, labelFilter, ready]);

  // Sincroniza pins com a cena.
  useEffect(() => {
    const pins = annotations
      .filter((a) => a.type === "pin")
      .map((a) => ({ id: a.id, position: a.position as Vec3 }));
    engineRef.current?.setPins(pins);
  }, [annotations, ready]);

  // Linha de medição na cena.
  useEffect(() => {
    engineRef.current?.setMeasureLine(measurePts[0] ?? null, measurePts[1] ?? null);
  }, [measurePts]);

  useEffect(() => {
    engineRef.current?.setLayers(layers);
  }, [layers, ready]);

  useEffect(() => {
    engineRef.current?.setClipHeight(clip);
  }, [clip, ready]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode, ready]);

  // ---------------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------------

  const measureDistance =
    measurePts.length === 2 ? distance(measurePts[0]!, measurePts[1]!) : null;

  const saveCalibration = useCallback(async () => {
    const real = Number.parseFloat(calibValue.replace(",", "."));
    if (!measurePts[0] || !measurePts[1] || !Number.isFinite(real) || real <= 0) return;
    try {
      const factor = calibrationFactor(measurePts[0], measurePts[1], real);
      const res = await fetch(`/api/scans/${scanId}/scale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareToken: token,
          factor,
          method: "reference_distance",
          refPoints: [measurePts[0], measurePts[1]],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setScale({ factor, method: "reference_distance" });
      setCalibrating(false);
      setCalibValue("");
      setMeasurePts([]);
    } catch (err) {
      setLoadError(`Falha ao salvar a calibração: ${String(err)}`);
    }
  }, [calibValue, measurePts, scanId, token]);

  const savePin = useCallback(async () => {
    if (!pendingPin) return;
    const poses = posesRef.current;
    const keyframe = poses ? nearestKeyframe(poses, pendingPin) : undefined;
    const res = await fetch(`/api/scans/${scanId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shareToken: token,
        type: "pin",
        position: pendingPin,
        data: { text: pinText || undefined, keyframe, tag: pinTag ?? undefined },
      }),
    });
    if (res.ok) {
      const { annotation } = (await res.json()) as { annotation: Annotation };
      setAnnotations((prev) => [...prev, annotation]);
    }
    setPendingPin(null);
    setPinText("");
    setPinTag(null);
  }, [pendingPin, pinText, pinTag, scanId, token]);

  /** Voa até uma detecção e abre o cartão de evidência. */
  const openEvidence = useCallback((list: SemanticDetection[], idx: number) => {
    const det = list[idx];
    if (!det) return;
    setMatches(list);
    setMatchIdx(idx);
    setOpenDetection(det);
    engineRef.current?.flyTo(det.worldPos);
  }, []);

  /** A busca da tese: "onde está X?" → voa até o melhor cluster do rótulo. */
  const runSearch = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return;
      const found = detections
        .filter((d) => d.label.toLowerCase().includes(q))
        .sort((a, b) => b.score - a.score);
      if (found.length === 0) return;
      setLabelFilter(found[0]!.label);
      openEvidence(found, 0);
    },
    [detections, openEvidence],
  );

  // D- (#47): o share antigo distribuía o link do DONO (poder total). Agora a
  // sheet gera link de CONVIDADO com validade; o do dono nunca sai daqui.
  const shareLink = useCallback(() => {
    setShareOpen((v) => !v);
    if (!shareOpen) {
      void fetch(`/api/scans/${scanId}/share?token=${encodeURIComponent(token)}`)
        .then((r) => (r.ok ? r.json() : { links: [] }))
        .then((d: { links: typeof shareLinks }) => setShareLinks(d.links))
        .catch(() => undefined);
    }
  }, [scanId, token, shareOpen]);

  const createGuestLink = useCallback(async () => {
    const res = await fetch(`/api/scans/${scanId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken: token, days: shareDays }),
    });
    if (!res.ok) return;
    const link = (await res.json()) as { id: string; token: string; expiresAt: string };
    setShareUrl(`${window.location.origin}/s/${link.token}`);
    setShareLinks((ls) => [{ ...link, views: 0, state: "valid" }, ...ls]);
  }, [scanId, token, shareDays]);

  const revokeGuestLink = useCallback(
    async (id: string) => {
      await fetch(`/api/share-links/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareToken: token }),
      });
      setShareLinks((ls) =>
        ls.map((l) => (l.id === id ? { ...l, state: "revoked" } : l)),
      );
    },
    [token],
  );

  const closeSheets = useCallback(() => {
    setCamOpen(false);
    setCutOpen(false);
    setLayersOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const uniqueLabels = [...new Set(detections.map((d) => d.label))];
  const countByLabel = (label: string) =>
    detections.filter((d) => d.label === label).length;

  const scaleChip =
    !scale || scale.method === "none"
      ? { text: ts("viewer", "scaleDefine"), dot: "bg-warning" }
      : {
          text:
            scale.method === "aruco"
              ? ts("viewer", "scaleAruco")
              : ts("viewer", "scaleManual"),
          dot: "bg-success",
        };

  const stkBtn = (active: boolean) =>
    `grid h-(--tap) w-(--tap) place-items-center rounded-[14px] border backdrop-blur-md transition ${
      active
        ? "border-cyan bg-graphite/80 text-cyan"
        : "border-line bg-graphite/70 text-signal hover:border-line-strong"
    }`;

  const hud = hudHidden ? "pointer-events-none opacity-0" : "opacity-100";

  // Estado do CONTRATO derivado do estado real (v1.2): erro/carregando vencem;
  // depois a ferramenta/painel ativo; senão ready.
  const effState = loadError
    ? "error"
    : !ready
      ? "loading-lod"
      : shareOpen
        ? "share"
        : layersOpen
          ? "layers"
          : searchFocus
            ? "tool-search"
            : tool === "measure"
              ? "tool-measure"
              : tool === "pin" || pendingPin || openPin
                ? "tool-annotate"
                : "ready";

  return (
    <div
      data-screen={readOnly ? "shared" : "viewer"}
      data-state={effState}
      data-plug={
        effState === "error" ? undefined : readOnly ? "shared.load" : "viewer.load"
      }
      className="relative h-dvh w-full overflow-hidden bg-ink"
    >
      <div
        ref={containerRef}
        data-plug={readOnly ? undefined : "measure.point"}
        className="absolute inset-0"
      />

      {/* Carregamento — nunca tela preta (contrato §3.3) */}
      {!ready && !loadError && (
        <div className="grid-grego absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-ink px-6">
          <LogoSymbol className="h-14 w-14 animate-pulse text-signal" />
          <p className="mt-2 font-display text-lg font-medium">
            {ts("viewer", "loadingTitle")}
          </p>
          <p className="font-mono text-[13px] text-cyan">{progress}%</p>
          <div className="h-1 w-64 max-w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-cyan transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-mist">{ts("viewer", "loadingNote")}</p>
        </div>
      )}
      {loadError && (
        <div className="grid-grego absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid h-[70px] w-[70px] place-items-center rounded-full border-[1.5px] border-danger/60">
              <IconX className="h-7 w-7 text-danger" />
            </span>
            <h2 className="mt-4 font-display text-lg font-medium">
              {ts("viewer", "errTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">{loadError}</p>
            <p className="mt-1 text-sm text-mist">
              <b className="font-medium text-signal">{ts("viewer", "errLinkOk")}</b>{" "}
              {ts("viewer", "errRetryTail")}
            </p>
            <button
              data-plug="viewer.load"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-cyan px-6 py-3 font-semibold text-ink transition hover:bg-cyan-deep"
            >
              {ts("common", "retry")}
            </button>
          </div>
        </div>
      )}

      {/* ── Topo: voltar · título · escala · compartilhar · esconder UI ── */}
      <div
        className={`absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-ink/80 to-transparent p-2 pb-4 transition-opacity duration-300 ${hud}`}
      >
        <Link
          href="/"
          aria-label={ts("viewer", "back")}
          className="grid h-(--tap) w-(--tap) flex-none place-items-center rounded-full bg-graphite/55 backdrop-blur-sm"
        >
          <IconBack className="h-[21px] w-[21px]" />
        </Link>
        <div className="min-w-0">
          <b className="block truncate font-display text-[15px] font-medium">
            {ts("viewer", "title")}
          </b>
        </div>
        <span className="flex-1" />
        <button
          onClick={() => {
            if (!scale || scale.method === "none") {
              setTool("measure");
              setMeasurePts([]);
            }
          }}
          className="inline-flex h-[34px] flex-none items-center gap-1.5 rounded-full border border-line bg-graphite/60 px-3 font-mono text-[11px] whitespace-nowrap backdrop-blur-sm"
          title={
            !scale || scale.method === "none"
              ? ts("viewer", "scaleTipNone")
              : scale.method === "aruco"
                ? ts("viewer", "scaleTipAruco")
                : ts("viewer", "scaleTipManual")
          }
        >
          <i className={`h-[7px] w-[7px] rounded-full ${scaleChip.dot}`} />
          {scaleChip.text}
        </button>
        <button
          data-plug="viewer.lod.toggle"
          onClick={() => notImplemented("viewer.lod.toggle", 47)({})}
          aria-label={ts("viewer", "lodAria")}
          title={ts("viewer", "lodFullSoon")}
          className="inline-flex h-[34px] flex-none items-center rounded-full border border-line bg-graphite/60 px-3 font-mono text-[11px] whitespace-nowrap backdrop-blur-sm"
        >
          {cloudMb != null
            ? ts("viewer", "lodChip").replace(
                "{mb}",
                cloudMb.toFixed(1).replace(".", ","),
              )
            : "…"}
        </button>
        {readOnly && (
          <span className="inline-flex h-[34px] flex-none items-center rounded-full border border-line bg-graphite/60 px-3 font-mono text-[11px] text-mist backdrop-blur-sm">
            {ts("shared", "readOnlyBadge")}
          </span>
        )}
        {!readOnly && (
          <button
            data-plug="share.create"
            onClick={shareLink}
            aria-label={ts("viewer", "share")}
            className="grid h-(--tap) w-(--tap) flex-none place-items-center rounded-full bg-graphite/55 backdrop-blur-sm"
          >
            <IconShare className="h-[20px] w-[20px]" />
          </button>
        )}
        <button
          onClick={() => {
            setHudHidden(true);
            closeSheets();
          }}
          aria-label={ts("viewer", "hideUi")}
          className="grid h-(--tap) w-(--tap) flex-none place-items-center rounded-full bg-graphite/55 backdrop-blur-sm"
        >
          <IconEyeOff className="h-[20px] w-[20px]" />
        </button>
      </div>

      {/* restaurar interface */}
      {hudHidden && (
        <button
          onClick={() => setHudHidden(false)}
          aria-label={ts("viewer", "showUi")}
          className="absolute right-2.5 bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] z-10 grid h-(--tap) w-(--tap) place-items-center rounded-full bg-graphite/60 text-mist"
        >
          <IconEye className="h-5 w-5" />
        </button>
      )}

      {/* ── Busca semântica (só quando o scan tem detecções) ── */}
      {detections.length > 0 && (
        <div
          className={`absolute top-[68px] left-2.5 z-10 w-[min(270px,72vw)] transition-opacity duration-300 ${hud}`}
        >
          <form
            className={`flex h-(--tap) items-center gap-2 rounded-full border bg-graphite/80 pr-2 pl-3.5 backdrop-blur-md ${
              searchFocus ? "border-cyan" : "border-line"
            }`}
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(search);
              setSearchFocus(false);
            }}
          >
            <button
              type="button"
              data-plug={readOnly ? undefined : "search.open"}
              aria-label={ts("viewer", "searchOpenAria")}
              onClick={() => searchInputRef.current?.focus()}
              className="grid h-9 w-6 flex-none place-items-center text-mist"
            >
              <IconSearch className="h-[17px] w-[17px]" />
            </button>
            <input
              ref={searchInputRef}
              data-plug={readOnly ? "shared.search.query" : "search.query"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
              placeholder={ts("viewer", "searchPlaceholder")}
              aria-label={ts("viewer", "searchAria")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-mist"
            />
          </form>
          {searchFocus && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {uniqueLabels
                .filter((l) => !search.trim() || l.includes(search.trim().toLowerCase()))
                .map((label, i) => (
                  <button
                    key={label}
                    data-plug={
                      search.trim()
                        ? i === 0
                          ? readOnly
                            ? "shared.search.focus"
                            : "search.focus"
                          : undefined
                        : readOnly
                          ? undefined
                          : "search.example"
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearch(label);
                      runSearch(label);
                      setSearchFocus(false);
                    }}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-line bg-graphite/90 px-3 text-[13px] backdrop-blur-sm hover:border-line-strong"
                  >
                    <i
                      className="h-[7px] w-[7px] rotate-45 rounded-[2px]"
                      style={{ backgroundColor: cssColor(labelColor(label)) }}
                    />
                    {label}
                    <b className="font-mono text-[11px] font-normal text-mist">
                      {countByLabel(label)}
                    </b>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* dica do modo voar */}
      {mode === "fly" && (
        <p
          className={`absolute top-[68px] left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-line bg-graphite/80 px-3 py-1.5 font-mono text-[11px] whitespace-nowrap text-mist backdrop-blur-sm transition-opacity sm:block ${hud}`}
        >
          {ts("viewer", "flyHint")}
        </p>
      )}

      {/* ── Pilha direita: modos de câmera + corte por altura ── */}
      <div
        className={`absolute top-[68px] right-2.5 z-10 flex flex-col items-end gap-2 transition-opacity duration-300 ${hud}`}
      >
        <button
          aria-label={ts("viewer", "camMode")}
          onClick={() => {
            setCamOpen((v) => !v);
            setCutOpen(false);
          }}
          className={stkBtn(camOpen)}
        >
          <IconCube className="h-5 w-5" />
        </button>
        {camOpen && (
          <div className="flex flex-col gap-1 rounded-2xl border border-line bg-graphite/95 p-1.5 backdrop-blur-md">
            {(
              [
                ["orbit", ts("viewer", "camOrbit"), IconOrbit],
                ["fly", ts("viewer", "camFly"), IconFly],
                ["top", ts("viewer", "camTop"), IconPlan],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setCamOpen(false);
                }}
                className={`flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-[13px] transition ${
                  mode === m
                    ? "bg-cyan font-semibold text-ink"
                    : "text-mist hover:text-signal"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          aria-label={ts("viewer", "cutAria")}
          onClick={() => {
            setCutOpen((v) => !v);
            setCamOpen(false);
          }}
          className={stkBtn(cutOpen || clip < 0.999)}
        >
          <IconCut className="h-5 w-5" />
        </button>
        {cutOpen && (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-graphite/95 px-2 py-3 backdrop-blur-md">
            <span className="font-mono text-[9px] tracking-wider text-mist">
              {ts("viewer", "cutTop")}
            </span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={clip}
              onChange={(e) => setClip(Number(e.target.value))}
              aria-label={ts("viewer", "cutAria")}
              className="h-[150px] w-7 cursor-grab accent-cyan"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
            <span className="font-mono text-[9px] tracking-wider text-mist">
              {ts("viewer", "cutFloor")}
            </span>
            <span className="font-mono text-[11px] text-cyan">
              {clip >= 0.999 ? ts("viewer", "cutNone") : `${Math.round(clip * 100)}%`}
            </span>
          </div>
        )}
      </div>

      {/* ── Pilha esquerda: camadas + replay do percurso ── */}
      <div
        className={`absolute bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] left-2.5 z-10 flex flex-col gap-2 transition-opacity duration-300 ${hud}`}
      >
        <button
          data-plug={readOnly ? "shared.layers.toggle" : "layers.toggle"}
          aria-label={ts("viewer", "layers")}
          onClick={() => setLayersOpen((v) => !v)}
          className={stkBtn(layersOpen)}
        >
          <IconLayers className="h-5 w-5" />
        </button>
        <button
          aria-label={ts("viewer", "replayAria")}
          onClick={() => {
            const engine = engineRef.current;
            if (!engine) return;
            if (replaying) engine.stopReplay();
            else engine.startReplay();
            setReplaying(!replaying);
          }}
          className={stkBtn(replaying)}
        >
          <IconRoute className="h-5 w-5" />
        </button>
      </div>

      {/* sheet de camadas — máx. ~45%, dismissível (contrato nº 5) */}
      {layersOpen && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[45%] overflow-auto rounded-t-3xl border-t border-line-strong bg-graphite px-5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] shadow-sheet sm:right-4 sm:bottom-4 sm:left-auto sm:w-[340px] sm:rounded-3xl sm:border">
          <button
            aria-label={ts("viewer", "layersClose")}
            onClick={() => setLayersOpen(false)}
            className="mx-auto mb-3 block h-6 w-full"
          >
            <i className="mx-auto block h-1 w-9 rounded-full bg-surface-2" />
          </button>
          <h3 className="font-display text-[17px] font-medium">
            {ts("viewer", "layers")}
          </h3>
          {(
            [
              ["cloud", ts("viewer", "layerCloud")],
              ["trajectory", ts("viewer", "layerTrajectory")],
              ["pins", ts("viewer", "layerPins")],
              ["detections", ts("viewer", "layerDetections")],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              data-plug="layers.set"
              className="flex min-h-(--tap) cursor-pointer items-center justify-between text-sm"
            >
              {label}
              <span className="relative h-[30px] w-[50px] flex-none">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="absolute inset-0 rounded-full border border-line-strong bg-surface-2 transition peer-checked:border-cyan peer-checked:bg-cyan/20" />
                <span className="absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-mist transition-all peer-checked:left-[23px] peer-checked:bg-cyan" />
              </span>
            </label>
          ))}
          {uniqueLabels.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3">
              {uniqueLabels.map((label) => (
                <span
                  key={label}
                  className="flex items-center gap-2 text-[13px] text-mist"
                >
                  <i
                    className="h-2 w-2 rotate-45 rounded-[2px]"
                    style={{ backgroundColor: cssColor(labelColor(label)) }}
                  />
                  {label}
                  <b className="ml-auto font-mono text-[11px] font-normal">
                    {countByLabel(label)}
                  </b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Cartão de evidência (busca/detecção) ── */}
      {openDetection && (
        <div className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+124px)] z-[15] flex gap-3 rounded-lg border border-line bg-graphite/95 p-2.5 shadow-card backdrop-blur-md sm:top-[120px] sm:right-4 sm:bottom-auto sm:left-auto sm:w-[300px] sm:flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica */}
          <img
            alt={ts("viewer", "evidenceAlt").replace("{label}", openDetection.label)}
            src={`/api/scans/${scanId}/keyframes/${openDetection.frameIdx}?token=${encodeURIComponent(token)}`}
            className="h-[74px] w-[104px] flex-none rounded-[10px] border border-line object-cover sm:h-auto sm:w-full"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="flex items-center gap-2 pr-8 text-[15px] font-semibold">
              <i
                className="h-[9px] w-[9px] flex-none rotate-45 rounded-[2px]"
                style={{ backgroundColor: cssColor(labelColor(openDetection.label)) }}
              />
              <span className="truncate">
                {openDetection.label}
                {matches.length > 1 && (
                  <span className="font-normal text-mist">
                    {" "}
                    ·{" "}
                    {ts("viewer", "ofN")
                      .replace("{i}", String(matchIdx + 1))
                      .replace("{n}", String(matches.length))}
                  </span>
                )}
              </span>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-mist">
              {ts("viewer", "confidence")}{" "}
              <b className="font-medium text-cyan">
                {(openDetection.score * 100).toFixed(0)}%
              </b>{" "}
              · {ts("viewer", "frame")} {openDetection.frameIdx}
            </p>
            {matches.length > 1 && (
              <div className="mt-auto flex gap-1.5 pt-1.5">
                <button
                  onClick={() => openEvidence(matches, (matchIdx + 1) % matches.length)}
                  className="h-[34px] rounded-lg border border-line-strong px-3 font-mono text-xs transition hover:border-cyan hover:text-cyan"
                >
                  {ts("viewer", "nextMatch")}
                </button>
              </div>
            )}
          </div>
          <button
            aria-label={ts("viewer", "closeAria")}
            onClick={() => {
              setOpenDetection(null);
              setMatches([]);
            }}
            className="absolute top-1.5 right-1.5 grid h-9 w-9 place-items-center rounded-lg text-mist hover:text-signal"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Medição ativa ── */}
      {tool === "measure" && !hudHidden && (
        <div className="absolute top-[68px] left-1/2 z-10 max-w-[92vw] -translate-x-1/2 rounded-lg border border-cyan-deep/60 bg-graphite/95 px-4 py-3 text-sm backdrop-blur-md">
          {measurePts.length < 2 ? (
            <p className="text-mist">
              {measurePts.length === 0
                ? ts("viewer", "measureTapTwo")
                : ts("viewer", "measureTapMore")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg text-signal">
                <b className="text-cyan">{formatMeasurement(measureDistance!, scale)}</b>
              </span>
              {(!scale || scale.method === "none") && !calibrating && (
                <button
                  className="rounded-[10px] bg-cyan px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-cyan-deep"
                  onClick={() => setCalibrating(true)}
                >
                  {ts("viewer", "iKnowThis")}
                </button>
              )}
              {calibrating && (
                <span className="flex items-center gap-2">
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder={ts("viewer", "metersReal")}
                    value={calibValue}
                    onChange={(e) => setCalibValue(e.target.value)}
                    className="w-24 rounded-[10px] border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-sm outline-none focus:border-cyan"
                  />
                  <button
                    className="rounded-[10px] bg-cyan px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-cyan-deep"
                    onClick={() => void saveCalibration()}
                  >
                    {ts("viewer", "apply")}
                  </button>
                </span>
              )}
              <button
                data-plug="measure.remove"
                className="min-h-9 font-mono text-xs text-mist underline decoration-dotted underline-offset-2"
                onClick={() => setMeasurePts([])}
              >
                {ts("viewer", "clear")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Pin em criação ── */}
      {pendingPin && (
        <div className="absolute top-[68px] left-1/2 z-10 flex max-w-[92vw] -translate-x-1/2 flex-col gap-2 rounded-lg border border-line bg-graphite/95 px-3.5 py-3 text-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              placeholder={ts("viewer", "pinPlaceholder")}
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
              className="w-44 rounded-[10px] border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-cyan"
            />
            <button
              data-plug="annotate.save"
              className="rounded-[10px] bg-cyan px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-cyan-deep"
              onClick={() => void savePin()}
            >
              {ts("viewer", "savePin")}
            </button>
            <button
              data-plug="annotate.remove"
              className="min-h-9 font-mono text-xs text-mist underline decoration-dotted underline-offset-2"
              onClick={() => {
                setPendingPin(null);
                setPinTag(null);
              }}
            >
              {ts("viewer", "cancelLower")}
            </button>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={ts("viewer", "tagAria")}
          >
            {ts("viewer", "tags").map((tag) => (
              <button
                key={tag}
                data-plug="annotate.tag.set"
                onClick={() => setPinTag(pinTag === tag ? null : tag)}
                className={`h-8 rounded-full border px-3 text-xs transition ${
                  pinTag === tag
                    ? "border-cyan bg-cyan/15 text-cyan"
                    : "border-line text-mist hover:border-line-strong"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Pin aberto: texto + foto-evidência ── */}
      {openPin && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+124px)] left-1/2 z-[15] w-[min(300px,92vw)] -translate-x-1/2 rounded-lg border border-line bg-graphite/95 p-3 shadow-card backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">
              {openPin.data?.text ?? ts("viewer", "pinNoText")}
            </p>
            <button
              aria-label={ts("viewer", "closeAria")}
              className="grid h-9 w-9 flex-none place-items-center rounded-lg text-mist hover:text-signal"
              onClick={() => setOpenPin(null)}
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
          {openPin.data?.keyframe != null && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica; next/image não otimiza storage externo */}
              <img
                data-plug="annotate.photo"
                alt={ts("viewer", "pinPhotoAlt")}
                src={`/api/scans/${scanId}/keyframes/${openPin.data.keyframe}?token=${encodeURIComponent(token)}`}
                className="mt-2 w-full rounded-[10px] border border-line"
              />
              <p className="mt-1.5 font-mono text-[10px] text-faint">
                {ts("viewer", "pinPhotoNote")}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Chips: classes detectadas + pins (roláveis, acima do dock) ── */}
      <div
        className={`absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-10 flex flex-col gap-1.5 transition-opacity duration-300 ${hud}`}
      >
        {annotations.filter((a) => a.type === "pin").length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-16 [-webkit-mask-image:linear-gradient(90deg,transparent,#000_56px,#000_calc(100%-16px),transparent)] [scrollbar-width:none]">
            {annotations
              .filter((a) => a.type === "pin")
              .map((a) => (
                <button
                  key={a.id}
                  data-plug="viewer.pin.open"
                  onClick={() => setOpenPin(openPin?.id === a.id ? null : a)}
                  className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] backdrop-blur-sm transition ${
                    openPin?.id === a.id
                      ? "border-cyan bg-graphite/90 text-cyan"
                      : "border-line bg-graphite/80 text-signal"
                  }`}
                >
                  <IconPin className="h-3.5 w-3.5" />
                  {a.data?.text?.slice(0, 16) ?? "pin"}
                </button>
              ))}
          </div>
        )}
        {detections.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-16 [-webkit-mask-image:linear-gradient(90deg,transparent,#000_56px,#000_calc(100%-16px),transparent)] [scrollbar-width:none]">
            <button
              onClick={() => setLabelFilter(null)}
              className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] backdrop-blur-sm transition ${
                labelFilter === null
                  ? "border-cyan bg-graphite/90 text-cyan"
                  : "border-line bg-graphite/80 text-signal"
              }`}
            >
              {ts("viewer", "allChips")}{" "}
              <b className="font-mono text-[11px] font-normal text-mist">
                {detections.length}
              </b>
            </button>
            {uniqueLabels.map((label) => (
              <button
                key={label}
                onClick={() => setLabelFilter(labelFilter === label ? null : label)}
                style={{
                  color: labelFilter === label ? cssColor(labelColor(label)) : undefined,
                }}
                className={`inline-flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] backdrop-blur-sm transition ${
                  labelFilter === label
                    ? "bg-graphite/90"
                    : "border-line bg-graphite/80 text-signal"
                }`}
              >
                <i
                  className="h-2 w-2 flex-none rotate-45 rounded-[2px]"
                  style={{ backgroundColor: cssColor(labelColor(label)) }}
                />
                {label}
                <b className="font-mono text-[11px] font-normal text-mist">
                  {countByLabel(label)}
                </b>
              </button>
            ))}
          </div>
        )}
      </div>

      {shareOpen && !readOnly && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-auto rounded-t-3xl border-t border-line-strong bg-graphite px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] shadow-sheet sm:right-4 sm:bottom-4 sm:left-auto sm:w-[360px] sm:rounded-3xl sm:border">
          <h3 className="font-display text-[17px] font-medium">
            {ts("viewer", "shareSheetTitle")}
          </h3>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-mist">{ts("viewer", "shareValidity")}</span>
            {([1, 7, 30] as const).map((d) => (
              <button
                key={d}
                data-plug="share.validity.set"
                onClick={() => setShareDays(d)}
                className={`h-8 rounded-full border px-3 text-xs ${
                  shareDays === d
                    ? "border-cyan bg-cyan/15 text-cyan"
                    : "border-line text-mist"
                }`}
              >
                {d === 1
                  ? ts("viewer", "shareDay1")
                  : d === 7
                    ? ts("viewer", "shareDay7")
                    : ts("viewer", "shareDay30")}
              </button>
            ))}
            <button
              onClick={() => void createGuestLink()}
              className="ml-auto rounded-[10px] bg-cyan px-3.5 py-2 text-xs font-semibold text-ink hover:bg-cyan-deep"
            >
              {ts("viewer", "shareCreate")}
            </button>
          </div>
          {shareUrl && (
            <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 p-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {shareUrl}
              </span>
              <button
                data-plug="share.copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 1500);
                }}
                className="rounded-lg border border-line-strong px-2.5 py-1.5 font-mono text-[11px] text-cyan"
              >
                {shareCopied ? ts("job", "copied") : ts("viewer", "shareCopy")}
              </button>
              <a
                data-plug="share.whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line-strong px-2.5 py-1.5 font-mono text-[11px] text-success"
              >
                {ts("viewer", "shareWhatsapp")}
              </a>
            </div>
          )}
          <ul className="mt-3 flex flex-col gap-1.5">
            {shareLinks.length === 0 && !shareUrl && (
              <li className="text-xs text-mist">{ts("viewer", "shareNone")}</li>
            )}
            {shareLinks.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 font-mono text-[11px] text-mist"
              >
                <span className="truncate">/s/{l.token.slice(0, 10)}…</span>
                <span>{l.expiresAt.slice(0, 10)}</span>
                <span>{ts("viewer", "shareViews").replace("{n}", String(l.views))}</span>
                <span className={l.state !== "valid" ? "text-faint" : "text-success"}>
                  {l.state}
                </span>
                {l.state === "valid" && (
                  <button
                    data-plug="share.revoke"
                    onClick={() => void revokeGuestLink(l.id)}
                    className="ml-auto text-danger-soft underline decoration-dotted"
                  >
                    {ts("viewer", "shareRevoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Dock de ferramentas (centro, alcance do polegar) ── */}
      <div
        className={`absolute bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] left-1/2 z-10 flex -translate-x-1/2 rounded-full border border-line bg-graphite/85 p-1 backdrop-blur-md transition-opacity duration-300 ${hud}`}
        role="tablist"
        aria-label={ts("viewer", "dockAria")}
      >
        {(
          [
            ["navigate", ts("viewer", "dockNavigate"), IconOrbit, undefined],
            ...(readOnly
              ? []
              : ([
                  ["measure", ts("viewer", "dockMeasure"), IconRuler, "measure.start"],
                  ["pin", ts("viewer", "dockPin"), IconPin, "annotate.start"],
                ] as const)),
          ] as const
        ).map(([tl, label, Icon, plug]) => (
          <button
            key={tl}
            role="tab"
            aria-selected={tool === tl}
            data-plug={plug}
            onClick={() => {
              setTool(tl);
              if (tl === "measure") setMeasurePts([]);
            }}
            className={`flex h-[52px] w-[66px] flex-col items-center justify-center gap-0.5 rounded-full transition ${
              tool === tl ? "bg-cyan text-ink" : "text-mist hover:text-signal"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="font-mono text-[9px] tracking-wider uppercase">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
