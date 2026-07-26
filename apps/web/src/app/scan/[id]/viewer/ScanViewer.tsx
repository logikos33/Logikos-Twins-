"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewerEngine, type ViewerMode } from "./engine";
import { calibrationFactor, distance, formatMeasurement } from "@/lib/viewer/scale";
import type { ScaleInfo, Vec3 } from "@/lib/viewer/scale";
import { nearestKeyframe, type PosesFile } from "@/lib/viewer/poses";

/**
 * O "controle do mapa" (spec D4). O React cuida da UI; a cena vive em ViewerEngine.
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

// Cor estável por classe: hash do rótulo → matiz. O viewer não conhece a lista de
// classes (elas vêm dos dados — YOLOX hoje, Recognition amanhã).
function labelColor(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  const c = 0.9;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    (Math.round((r * 0.8 + 0.2) * 255) << 16) |
    (Math.round((g * 0.8 + 0.2) * 255) << 8) |
    Math.round((b * 0.8 + 0.2) * 255)
  );
}

type Props = {
  scanId: string;
  token: string;
  cloudUrl: string;
  posesUrl: string;
  initialScale: ScaleInfo | null;
};

export function ScanViewer({ scanId, token, cloudUrl, posesUrl, initialScale }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ViewerEngine | null>(null);

  const [progress, setProgress] = useState(0);
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

  const posesRef = useRef<PosesFile | null>(null);
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
        data: { text: pinText || undefined, keyframe },
      }),
    });
    if (res.ok) {
      const { annotation } = (await res.json()) as { annotation: Annotation };
      setAnnotations((prev) => [...prev, annotation]);
    }
    setPendingPin(null);
    setPinText("");
  }, [pendingPin, pinText, scanId, token]);

  /** A busca da tese: "onde está X?" → voa até o melhor cluster do rótulo. */
  const runSearch = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return;
      const matches = detections.filter((d) => d.label.toLowerCase().includes(q));
      if (matches.length === 0) return;
      const best = matches.reduce((a, b) => (b.score > a.score ? b : a));
      setLabelFilter(best.label);
      setOpenDetection(best);
      engineRef.current?.flyTo(best.worldPos);
    },
    [detections],
  );

  const shareLink = useCallback(() => {
    const url = `${window.location.origin}/scan/${scanId}?token=${token}`;
    if (navigator.share) {
      void navigator.share({ title: "Mapa 3D — Logikos Twins", url });
    } else {
      void navigator.clipboard.writeText(url);
      alert("Link copiado!");
    }
  }, [scanId, token]);

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const btn = (active: boolean) =>
    `rounded-full px-3 py-2 text-xs font-medium transition ${
      active ? "bg-white text-neutral-950" : "bg-neutral-800/80 text-neutral-200"
    }`;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-neutral-950">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Carregamento */}
      {!ready && !loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-neutral-950">
          <p className="text-sm text-neutral-300">Carregando o mapa…</p>
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-white transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">{progress}%</p>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl bg-red-950/80 p-4 text-sm text-red-200">
            {loadError}
          </div>
        </div>
      )}

      {/* Barra superior: ferramentas */}
      <div className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3">
        <div className="flex gap-1 rounded-full bg-neutral-900/80 p-1 backdrop-blur">
          <button
            className={btn(tool === "navigate")}
            onClick={() => setTool("navigate")}
          >
            Navegar
          </button>
          <button
            className={btn(tool === "measure")}
            onClick={() => {
              setTool("measure");
              setMeasurePts([]);
            }}
          >
            Medir
          </button>
          <button className={btn(tool === "pin")} onClick={() => setTool("pin")}>
            Anotar
          </button>
        </div>

        <div className="flex gap-1 rounded-full bg-neutral-900/80 p-1 backdrop-blur">
          <button className={btn(mode === "orbit")} onClick={() => setMode("orbit")}>
            Órbita
          </button>
          <button className={btn(mode === "fly")} onClick={() => setMode("fly")}>
            Voar
          </button>
          <button className={btn(mode === "top")} onClick={() => setMode("top")}>
            Planta
          </button>
        </div>

        <button
          className={btn(replaying)}
          onClick={() => {
            const engine = engineRef.current;
            if (!engine) return;
            if (replaying) {
              engine.stopReplay();
            } else {
              engine.startReplay();
            }
            setReplaying(!replaying);
          }}
        >
          ▶ Percurso
        </button>

        <button className={btn(false)} onClick={shareLink}>
          Compartilhar
        </button>

        {/* Busca semântica — só aparece quando o scan tem detecções */}
        {detections.length > 0 && (
          <form
            className="flex items-center gap-1 rounded-full bg-neutral-900/80 py-1 pl-3 pr-1 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(search);
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="onde está…?"
              className="w-28 bg-transparent text-xs outline-none placeholder:text-neutral-500"
            />
            <button
              type="submit"
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-950"
            >
              Buscar
            </button>
          </form>
        )}
      </div>

      {/* Detecção aberta (via busca ou filtro) */}
      {openDetection && (
        <div className="absolute bottom-24 right-3 z-10 w-64 rounded-2xl bg-neutral-900/95 p-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{openDetection.label}</p>
              <p className="text-xs text-neutral-400">
                confiança {(openDetection.score * 100).toFixed(0)}%
              </p>
            </div>
            <button
              className="text-xs text-neutral-400"
              onClick={() => setOpenDetection(null)}
            >
              ✕
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica */}
          <img
            alt={`Evidência: ${openDetection.label}`}
            src={`/api/scans/${scanId}/keyframes/${openDetection.frameIdx}?token=${encodeURIComponent(token)}`}
            className="mt-2 w-full rounded-lg"
          />
        </div>
      )}

      {/* Medição ativa */}
      {tool === "measure" && (
        <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-2xl bg-neutral-900/90 px-4 py-3 text-sm backdrop-blur">
          {measurePts.length < 2 ? (
            <p className="text-neutral-300">
              Toque em {measurePts.length === 0 ? "dois pontos" : "mais um ponto"} da
              nuvem
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg">
                {formatMeasurement(measureDistance!, scale)}
              </span>
              {(!scale || scale.method === "none") && !calibrating && (
                <button
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-950"
                  onClick={() => setCalibrating(true)}
                >
                  Esta distância eu conheço
                </button>
              )}
              {calibrating && (
                <span className="flex items-center gap-2">
                  <input
                    autoFocus
                    inputMode="decimal"
                    placeholder="metros reais"
                    value={calibValue}
                    onChange={(e) => setCalibValue(e.target.value)}
                    className="w-24 rounded-lg bg-neutral-800 px-2 py-1 text-sm outline-none"
                  />
                  <button
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-950"
                    onClick={() => void saveCalibration()}
                  >
                    Calibrar
                  </button>
                </span>
              )}
              <button
                className="text-xs text-neutral-400 underline"
                onClick={() => setMeasurePts([])}
              >
                limpar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pin em criação */}
      {pendingPin && (
        <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-neutral-900/90 px-4 py-3 text-sm backdrop-blur">
          <input
            autoFocus
            placeholder="o que há aqui?"
            value={pinText}
            onChange={(e) => setPinText(e.target.value)}
            className="w-44 rounded-lg bg-neutral-800 px-2 py-1 text-sm outline-none"
          />
          <button
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-950"
            onClick={() => void savePin()}
          >
            Fixar pin
          </button>
          <button
            className="text-xs text-neutral-400 underline"
            onClick={() => setPendingPin(null)}
          >
            cancelar
          </button>
        </div>
      )}

      {/* Pin aberto: texto + foto-evidência */}
      {openPin && (
        <div className="absolute bottom-24 left-1/2 z-10 w-72 -translate-x-1/2 rounded-2xl bg-neutral-900/95 p-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">{openPin.data?.text ?? "Sem descrição"}</p>
            <button className="text-xs text-neutral-400" onClick={() => setOpenPin(null)}>
              ✕
            </button>
          </div>
          {openPin.data?.keyframe != null && (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica; next/image não otimiza storage externo
            <img
              alt="Foto do local anotado"
              src={`/api/scans/${scanId}/keyframes/${openPin.data.keyframe}?token=${encodeURIComponent(token)}`}
              className="mt-2 w-full rounded-lg"
            />
          )}
        </div>
      )}

      {/* Rodapé: camadas, corte, lista de pins */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1 rounded-full bg-neutral-900/80 p-1 backdrop-blur">
          {(
            [
              ["cloud", "Nuvem"],
              ["trajectory", "Trajeto"],
              ["pins", "Pins"],
              ["detections", "Detecções"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={btn(layers[key])}
              onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-full bg-neutral-900/80 px-3 py-2 backdrop-blur">
          <span className="text-xs text-neutral-300">Corte</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={clip}
            onChange={(e) => setClip(Number(e.target.value))}
            className="w-28"
          />
        </label>

        {/* Filtro por classe detectada */}
        {detections.length > 0 && (
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-neutral-900/80 p-1 backdrop-blur">
            {[...new Set(detections.map((d) => d.label))].map((label) => (
              <button
                key={label}
                className={btn(labelFilter === label)}
                onClick={() => setLabelFilter(labelFilter === label ? null : label)}
              >
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: `#${labelColor(label).toString(16).padStart(6, "0")}`,
                  }}
                />
                {label}
              </button>
            ))}
          </div>
        )}

        {annotations.filter((a) => a.type === "pin").length > 0 && (
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-neutral-900/80 p-1 backdrop-blur">
            {annotations
              .filter((a) => a.type === "pin")
              .map((a) => (
                <button
                  key={a.id}
                  className={btn(openPin?.id === a.id)}
                  onClick={() => setOpenPin(openPin?.id === a.id ? null : a)}
                >
                  📍 {a.data?.text?.slice(0, 16) ?? "pin"}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
