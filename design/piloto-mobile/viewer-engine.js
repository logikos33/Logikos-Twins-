// Logikos Twins — engine 3D do protótipo (three.js MIT). Nuvem procedural ~80k pontos,
// controles de toque (órbita/zoom/pan/toque duplo), raycast, voo em passos, LOD por drawRange.
let THREE_;
async function three() {
  if (!THREE_) THREE_ = await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js');
  return THREE_;
}

export async function createEngine(canvas, eventEl) {
  const THREE = await three();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a0a0f, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 300);

  // ---- nuvem procedural (metros reais) ----
  let s = 987654321;
  const R = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const pos = [], col = [];
  const put = (x, y, z, l) => { pos.push(x, y, z); const c = l !== undefined ? l + R() * 0.14 : 0.5 + R() * 0.3; col.push(c * 0.94, c * 0.97, c * 1.06); };
  const j = () => (R() - 0.5) * 0.03;
  for (let i = 0; i < 30000; i++) put(-6 + R() * 12, j(), -4 + R() * 8, 0.3 + R() * 0.16);
  for (let i = 0; i < 9000; i++) put(-6 + j(), R() * 3, -4 + R() * 8, 0.4);
  for (let i = 0; i < 9000; i++) put(-6 + R() * 12, R() * 3, -4 + j(), 0.4);
  const objects = [];
  const boxAt = (label, cx, cz, w, h, d, n, lum) => {
    for (let i = 0; i < n; i++) {
      const f = Math.floor(R() * 5); let x = (R() - 0.5) * w, y = R() * h, z = (R() - 0.5) * d;
      if (f === 0) y = h; else if (f === 1) x = -w / 2; else if (f === 2) x = w / 2; else if (f === 3) z = -d / 2; else z = d / 2;
      put(cx + x + j(), Math.max(0.01, y) + j() * 0.4, cz + z + j(), lum);
    }
    objects.push({ id: label + '-' + objects.length, label, pos: [cx, h * 0.55, cz], r: Math.max(w, d, h) * 0.62 });
  };
  boxAt('máquina', -3.4, -1.2, 2.2, 1.5, 1.5, 5200, 0.52);
  boxAt('máquina', 2.6, -2.2, 1.8, 2.3, 1.2, 5200, 0.52);
  boxAt('máquina', 4.3, 1.6, 1.3, 1.3, 1.3, 3600, 0.52);
  boxAt('mesa', -1.2, 2.4, 1.6, 0.78, 0.8, 2400, 0.6);
  boxAt('mesa', 0.9, 2.9, 1.6, 0.78, 0.8, 2400, 0.6);
  boxAt('mesa', -0.3, -2.7, 1.4, 0.78, 0.7, 2200, 0.6);
  boxAt('empilhadeira', 3.7, 3.0, 1.1, 1.9, 2.0, 3800, 0.46);
  boxAt('extintor', -5.5, -3.4, 0.26, 0.62, 0.26, 700, 0.64);
  const n = pos.length / 3, order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const k = Math.floor(R() * (i + 1)); const t = order[i]; order[i] = order[k]; order[k] = t; }
  const p2 = new Float32Array(n * 3), c2 = new Float32Array(n * 3);
  order.forEach((src, dst) => { for (let k = 0; k < 3; k++) { p2[dst * 3 + k] = pos[src * 3 + k]; c2[dst * 3 + k] = col[src * 3 + k]; } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p2, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(c2, 3));
  const mat = new THREE.PointsMaterial({ size: 0.032, vertexColors: true, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  const lodCount = Math.floor(n * 0.28);
  geo.setDrawRange(0, 0);

  // trajetória da câmera (fake)
  const tp = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 1.7 - 2.4; tp.push(new THREE.Vector3(Math.cos(a) * 3.6, 1.35, Math.sin(a) * 2.2)); }
  const tGeo = new THREE.BufferGeometry().setFromPoints(tp);
  const traj = new THREE.Line(tGeo, new THREE.LineDashedMaterial({ color: 0x00e5ff, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.8 }));
  traj.computeLineDistances(); traj.visible = false; scene.add(traj);

  // ---- órbita ----
  const target = new THREE.Vector3(0, 0.8, 0);
  let theta = 0.7, phi = 1.08, dist = 10.5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function apply() {
    phi = clamp(phi, 0.22, 1.45); dist = clamp(dist, 1.4, 40);
    camera.position.set(target.x + dist * Math.sin(phi) * Math.cos(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.sin(theta));
    camera.lookAt(target);
  }
  apply();

  const ptrs = new Map();
  let moved = 0, downT = 0, lastTap = 0, pinchD = 0, lpTimer = 0, flyIv = 0;
  const cb = {};
  const rect = () => eventEl.getBoundingClientRect();
  eventEl.addEventListener('pointerdown', e => {
    try { eventEl.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; downT = performance.now();
    if (flyIv) { clearInterval(flyIv); flyIv = 0; }
    if (cb.interact) cb.interact(true);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
    clearTimeout(lpTimer);
    if (ptrs.size === 1 && cb.longpress) { const cx = e.clientX, cy = e.clientY; lpTimer = setTimeout(() => { if (moved < 12 && ptrs.size === 1) cb.longpress({ x: cx, y: cy }); }, 550); }
  });
  eventEl.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 1) { theta += dx * 0.0055; phi -= dy * 0.0055; apply(); }
    else if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()];
      const d2 = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) dist *= pinchD / Math.max(1, d2);
      pinchD = d2;
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      target.addScaledVector(right, -dx * dist * 0.0011); target.addScaledVector(up, dy * dist * 0.0011);
      apply(); return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const end = e => {
    ptrs.delete(e.pointerId); clearTimeout(lpTimer);
    if (ptrs.size === 0) {
      if (cb.interact) cb.interact(false);
      if (performance.now() - downT < 260 && moved < 12) {
        const now = performance.now();
        if (now - lastTap < 320) { const hit = pick(e.clientX, e.clientY); if (hit) { target.copy(hit); apply(); } lastTap = 0; }
        else { lastTap = now; if (cb.tap) cb.tap({ x: e.clientX, y: e.clientY }); }
      }
    }
  };
  eventEl.addEventListener('pointerup', end);
  eventEl.addEventListener('pointercancel', end);
  eventEl.addEventListener('wheel', e => { e.preventDefault(); dist *= 1 + Math.sign(e.deltaY) * 0.09; apply(); }, { passive: false });

  const ray = new THREE.Raycaster(); ray.params.Points.threshold = 0.15;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pick(cx, cy) {
    const r = rect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObject(points);
    if (hits.length) return [hits[0].point.x, hits[0].point.y, hits[0].point.z];
    const gp = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, gp)) return [gp.x, gp.y, gp.z];
    return null;
  }
  function project(v) {
    const r = rect();
    const p = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, front: p.z < 1 };
  }

  let raf = 0, disposed = false;
  function loop() { if (disposed) return; raf = requestAnimationFrame(loop); renderer.render(scene, camera); if (cb.frame) cb.frame(); }
  function size() { const r = rect(); if (r.width > 4 && r.height > 4) { renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); } }
  const ro = new ResizeObserver(size); ro.observe(eventEl); size(); loop();

  return {
    counts: { lod: lodCount, full: n },
    reveal(onStep, done) {
      let i = 0; const total = 12;
      const iv = setInterval(() => { i++; const c = Math.floor(lodCount * i / total); geo.setDrawRange(0, c); if (onStep) onStep(c, lodCount); if (i >= total) { clearInterval(iv); if (done) done(); } }, 110);
    },
    setLod(m, onStep, done) {
      const to = m === 'full' ? n : lodCount, from = geo.drawRange.count === Infinity ? 0 : geo.drawRange.count;
      let i = 0; const total = 10;
      const iv = setInterval(() => { i++; const c = Math.floor(from + (to - from) * i / total); geo.setDrawRange(0, c); if (onStep) onStep(c, to); if (i >= total) { clearInterval(iv); if (done) done(); } }, 90);
    },
    pick, project,
    flyToSteps(p, o) {
      const steps = (o && o.steps) || 4, ms = (o && o.ms) || 560, dEnd = Math.max(2.4, ((o && o.r) || 1) * 3);
      const t0 = { x: target.x, y: target.y, z: target.z, d: dist };
      let k = 0;
      if (flyIv) clearInterval(flyIv);
      flyIv = setInterval(() => {
        k++; const f = k / steps;
        target.set(t0.x + (p[0] - t0.x) * f, t0.y + (p[1] - t0.y) * f, t0.z + (p[2] - t0.z) * f);
        dist = t0.d + (dEnd - t0.d) * f; apply();
        if (cb.flystep) cb.flystep(k, steps);
        if (k >= steps) { clearInterval(flyIv); flyIv = 0; }
      }, ms / steps);
    },
    getObjects: () => objects.map(o => ({ ...o })),
    setTrajectory(v) { traj.visible = v; },
    setPointsVisible(v) { points.visible = v; },
    on(name, fn) { cb[name] = fn; },
    dispose() { disposed = true; cancelAnimationFrame(raf); if (flyIv) clearInterval(flyIv); ro.disconnect(); geo.dispose(); mat.dispose(); tGeo.dispose(); renderer.dispose(); }
  };
}
