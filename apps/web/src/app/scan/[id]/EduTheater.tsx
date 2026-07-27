"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O "teatro" da espera: enquanto o servidor reconstrói, um canvas 2D leve conta em
 * três cenas O QUE está acontecendo (câmera → pontos → detecções), sincronizado com
 * os cartões educativos. É storytelling explícito ("como funciona"), nunca uma
 * alegação de progresso — o progresso honesto mora no stepper da página.
 *
 * ~1,8 mil pontos projetados em 2D: nada de WebGL, nada de shader (contrato nº 6).
 */

type P3 = { x: number; y: number; z: number; b: number };

const CARDS = [
  {
    t: "O caminho da câmera",
    b: "Cada quadro do vídeo vira uma posição de câmera. O sistema reconstrói por onde você andou — sem GPS, sem sensor extra.",
  },
  {
    t: "Milhões de pontos, escala real",
    b: "Os quadros são triangulados em pontos 3D. Com o marcador impresso (ou uma medida sua), tudo sai em metros.",
  },
  {
    t: "Detecções ancoradas no espaço",
    b: "Objetos reconhecidos no vídeo ganham coordenadas 3D. Depois, pergunte ao mapa: “onde está o extintor?”",
  },
];

const DETS = [
  { x: 1.15, y: 0.86, z: 0.5, c: "#ffd166", label: "mesa" },
  { x: 2.95, y: 1.18, z: 1.35, c: "#f87171", label: "extintor" },
  { x: -2.25, y: 1.95, z: -0.75, c: "#5aa9ff", label: "estante" },
];

function buildScene(): { pts: P3[]; traj: P3[] } {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pts: P3[] = [];
  const cluster = (n: number, fx: () => Omit<P3, "b">) => {
    for (let i = 0; i < n; i++) pts.push({ ...fx(), b: 0.35 + rnd() * 0.65 });
  };
  cluster(620, () => ({
    x: -3 + rnd() * 6,
    y: 0.02 + rnd() * 0.05,
    z: -2.3 + rnd() * 4.6,
  }));
  cluster(300, () => ({
    x: -3.05 + rnd() * 0.12,
    y: rnd() * 2.1,
    z: -2.3 + rnd() * 4.6,
  }));
  cluster(300, () => ({ x: -3 + rnd() * 6, y: rnd() * 2.1, z: -2.35 + rnd() * 0.12 }));
  cluster(230, () => ({ x: 0.5 + rnd() * 1.3, y: rnd() * 0.78, z: 0.1 + rnd() * 0.8 }));
  cluster(260, () => ({ x: -2.6 + rnd() * 0.7, y: rnd() * 1.9, z: -1.0 + rnd() * 0.5 }));
  cluster(130, () => ({ x: 1.9 + rnd() * 0.8, y: rnd() * 0.55, z: -1.8 + rnd() * 0.6 }));
  const traj: P3[] = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    traj.push({
      x: Math.cos(a) * 2.0 + Math.sin(a * 2) * 0.28,
      y: 1.35,
      z: Math.sin(a) * 1.45 + Math.cos(a * 3) * 0.2,
      b: 1,
    });
  }
  return { pts, traj };
}

export function EduTheater() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scene, setScene] = useState(0);
  const sceneRef = useRef(0);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  // Auto-avanço a cada 8 s; os pontos do carrossel trocam manualmente.
  useEffect(() => {
    const id = setInterval(() => setScene((s) => (s + 1) % 3), 8000);
    return () => clearInterval(id);
  }, [scene]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { pts, traj } = buildScene();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let DPR = 1;
    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      const r = cv.getBoundingClientRect();
      W = Math.max(10, r.width);
      H = Math.max(10, r.height);
      cv.width = W * DPR;
      cv.height = H * DPR;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    let yaw = -0.6;
    const project = (p: { x: number; y: number; z: number }) => {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const x = p.x * cy - p.z * sy;
      let z = p.x * sy + p.z * cy;
      const pitch = -0.42;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const y2 = p.y * cp - z * sp;
      z = p.y * sp + z * cp + 6.2;
      if (z < 0.4) return null;
      const f = (H * 1.35) / z;
      return { sx: W / 2 + x * f, sy: H * 0.62 - y2 * f, s: f, z };
    };

    const drawPoints = (alpha: number, frac: number) => {
      const n = Math.floor(pts.length * frac);
      for (let i = 0; i < n; i++) {
        const p = pts[i]!;
        const q = project(p);
        if (!q) continue;
        ctx.fillStyle = `rgba(190,214,224,${alpha * p.b * Math.min(1, 4.4 / q.z)})`;
        const s = Math.max(1, q.s * 0.018);
        ctx.fillRect(q.sx, q.sy, s, s);
      }
    };
    const drawTraj = (upto: number, alpha: number) => {
      ctx.strokeStyle = `rgba(0,229,255,${0.85 * alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < upto; i++) {
        const q = project(traj[i]!);
        if (!q) continue;
        if (started) ctx.lineTo(q.sx, q.sy);
        else {
          ctx.moveTo(q.sx, q.sy);
          started = true;
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = (now - t0) / 1000;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      yaw = -0.6 + (reduced ? 0 : t * 0.12);
      const loop = (t % 7) / 7;
      const s = sceneRef.current;

      if (s === 0) {
        drawPoints(0.16, 1);
        const upto = Math.floor(loop * traj.length);
        drawTraj(upto, 1);
        const head = project(traj[Math.min(upto, traj.length - 1)]!);
        if (head) {
          ctx.fillStyle = "#00e5ff";
          ctx.beginPath();
          ctx.arc(head.sx, head.sy, 3.4, 0, 7);
          ctx.fill();
        }
      } else if (s === 1) {
        drawPoints(0.85, Math.min(1, loop * 1.25));
        drawTraj(traj.length, 0.25);
      } else {
        drawPoints(0.3, 1);
        drawTraj(traj.length, 0.2);
        DETS.forEach((d, i) => {
          const at = Math.min(1, Math.max(0, loop * 3.4 - i * 0.9));
          if (at <= 0) return;
          const q = project(d);
          if (!q) return;
          const r = 9 * q.s * 0.02 + 5;
          const x = q.sx;
          const y = q.sy - (1 - at) * 18;
          ctx.globalAlpha = at;
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.72, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r * 0.72, y);
          ctx.closePath();
          ctx.strokeStyle = d.c;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          if (at > 0.85) {
            ctx.font = "10px var(--font-jetbrains-mono, monospace)";
            ctx.fillStyle = "#f4f6f8";
            ctx.textAlign = "center";
            ctx.fillText(d.label, x, y - r - 6);
          }
          ctx.globalAlpha = 1;
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const card = CARDS[scene]!;

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line bg-graphite shadow-card">
        <canvas ref={canvasRef} className="block h-[220px] w-full sm:h-[260px]" />
        <span className="k-label absolute top-2.5 left-3 text-[9px] text-faint">
          como funciona · {scene + 1}/3
        </span>
      </div>

      <div className="mt-3 min-h-[92px] rounded-lg border border-line bg-graphite p-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <i className="h-2 w-2 rotate-45 rounded-[2px] bg-cyan" />
          {card.t}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-mist">{card.b}</p>
      </div>
      <div className="mt-2.5 flex justify-center gap-2">
        {CARDS.map((_, i) => (
          <button
            key={i}
            aria-label={`Cartão ${i + 1}`}
            onClick={() => setScene(i)}
            className="grid h-6 w-6 place-items-center"
          >
            <i
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === scene ? "scale-125 bg-cyan" : "bg-surface-2"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
