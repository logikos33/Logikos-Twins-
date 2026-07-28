"use client";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { PosesFile } from "@/lib/viewer/poses";
import { cameraPosition } from "@/lib/viewer/poses";
import type { Vec3 } from "@/lib/viewer/scale";

/**
 * Motor do viewer — todo o Three.js vive aqui, fora do React.
 *
 * O React cuida de UI (botões, painéis, estado); esta classe cuida de cena, câmeras,
 * picking e camadas. A fronteira é por eventos/métodos — mexer num slider do React
 * nunca recria a cena, e o loop de render não passa pelo React.
 *
 * A cena usa o referencial do MOTOR (Z para cima, como os NPZs); a conversão para o
 * Y-up do Three é feita uma vez, rotacionando o grupo raiz — assim TODAS as
 * coordenadas expostas (picks, pins, poses) permanecem no referencial dos dados.
 */

export type ViewerMode = "orbit" | "fly" | "top";

export type PickEvent = { point: Vec3 };

type Layers = {
  cloud: boolean;
  trajectory: boolean;
  pins: boolean;
  detections: boolean;
};

export class ViewerEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private root = new THREE.Group(); // Z-up → Y-up acontece aqui, uma vez
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private cloud: THREE.Points | null = null;
  private trajectoryGroup = new THREE.Group();
  private pinsGroup = new THREE.Group();
  private detectionsGroup = new THREE.Group();
  private replayMarker: THREE.Mesh | null = null;
  private clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity);
  private raycaster = new THREE.Raycaster();
  private poses: PosesFile | null = null;
  private mode: ViewerMode = "orbit";
  private bboxSize = 10;
  private center = new THREE.Vector3();
  private disposed = false;
  private replayT: number | null = null;
  private flyKeys = new Set<string>();

  onPick: ((e: PickEvent) => void) | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Dados são Z-up (motor/OpenCV); o Three é Y-up. Uma rotação no grupo raiz.
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);
    this.root.add(this.trajectoryGroup, this.pinsGroup, this.detectionsGroup);
    this.scene.background = new THREE.Color(0x0a0a0f); // Preto Logikos [manual]

    this.resize();
    window.addEventListener("resize", this.resize);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    this.renderer.setAnimationLoop(this.tick);
  }

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  async loadCloud(url: string, onProgress: (pct: number) => void): Promise<number> {
    const loader = new PLYLoader();
    const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
      loader.load(
        url,
        resolve,
        (ev) => {
          if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(this.center);
    this.bboxSize = Math.max(size.x, size.y, size.z);

    const material = new THREE.PointsMaterial({
      // Tamanho relativo à cena: fixo em pixels ficaria ou invisível ou borrado
      // dependendo da escala arbitrária do scan.
      size: this.bboxSize / 400,
      vertexColors: true,
      clippingPlanes: [this.clipPlane],
    });
    this.cloud = new THREE.Points(geometry, material);
    this.root.add(this.cloud);

    // Enquadra a cena: câmera a uma diagonal de distância, olhando o centro.
    const c = this.center
      .clone()
      .applyMatrix4(this.root.matrixWorld ?? new THREE.Matrix4());
    this.root.updateMatrixWorld();
    const worldCenter = this.center.clone().applyQuaternion(this.root.quaternion);
    this.controls.target.copy(worldCenter);
    this.camera.position
      .copy(worldCenter)
      .add(
        new THREE.Vector3(this.bboxSize * 0.9, this.bboxSize * 0.7, this.bboxSize * 0.9),
      );
    this.camera.near = this.bboxSize / 1000;
    this.camera.far = this.bboxSize * 20;
    this.camera.updateProjectionMatrix();
    void c;

    return geometry.getAttribute("position").count;
  }

  setPoses(poses: PosesFile): void {
    this.poses = poses;
    this.trajectoryGroup.clear();

    const pts = poses.frames.map((f) => {
      const p = cameraPosition(f);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 }), // Ciano Visão
    );
    this.trajectoryGroup.add(line);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(this.bboxSize / 120, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb224 }), // âmbar dos tokens
    );
    marker.visible = false;
    this.replayMarker = marker;
    this.trajectoryGroup.add(marker);
  }

  // -------------------------------------------------------------------------
  // Modos e camadas
  // -------------------------------------------------------------------------

  setMode(mode: ViewerMode): void {
    this.mode = mode;
    const worldCenter = this.center.clone().applyQuaternion(this.root.quaternion);

    if (mode === "top") {
      // "Planta baixa": olhando de cima, rotação travada — só pan e zoom.
      this.camera.position.set(
        worldCenter.x,
        worldCenter.y + this.bboxSize * 1.6,
        worldCenter.z,
      );
      this.controls.target.copy(worldCenter);
      this.controls.enableRotate = false;
    } else {
      this.controls.enableRotate = true;
      if (mode === "orbit") {
        this.controls.target.copy(worldCenter);
      }
    }
    // No modo fly, o OrbitControls continua ativo para o olhar (rotate em volta de
    // um alvo próximo); o deslocamento vem do teclado no tick.
  }

  setLayers(layers: Layers): void {
    if (this.cloud) this.cloud.visible = layers.cloud;
    this.trajectoryGroup.visible = layers.trajectory;
    this.pinsGroup.visible = layers.pins;
    this.detectionsGroup.visible = layers.detections;
  }

  /** Corte por altura: fração 0–1 da altura da cena (1 = nada cortado). */
  setClipHeight(fraction: number): void {
    if (!this.cloud) return;
    const bbox = this.cloud.geometry.boundingBox!;
    if (fraction >= 0.999) {
      this.clipPlane.constant = Infinity;
      return;
    }
    // O plano corta no referencial do MUNDO (Y-up); converte a altura Z dos dados.
    const zCut = bbox.min.z + (bbox.max.z - bbox.min.z) * fraction;
    this.clipPlane.constant = zCut;
    this.clipPlane.normal.set(0, -1, 0);
  }

  // -------------------------------------------------------------------------
  // Replay do percurso
  // -------------------------------------------------------------------------

  startReplay(): void {
    if (!this.poses || !this.replayMarker) return;
    this.replayT = 0;
    this.replayMarker.visible = true;
  }

  stopReplay(): void {
    this.replayT = null;
    if (this.replayMarker) this.replayMarker.visible = false;
  }

  // -------------------------------------------------------------------------
  // Pins
  // -------------------------------------------------------------------------

  setPins(pins: { id: string; position: Vec3; color?: number }[]): void {
    this.pinsGroup.clear();
    for (const pin of pins) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(this.bboxSize / 150, 12, 12),
        new THREE.MeshBasicMaterial({ color: pin.color ?? 0xf4f6f8 }), // Branco Sinal
      );
      mesh.position.set(pin.position.x, pin.position.y, pin.position.z);
      mesh.userData.pinId = pin.id;
      this.pinsGroup.add(mesh);
    }
  }

  /** Pins semânticos de detecção (D5): octaedros coloridos por classe. */
  setDetections(items: { id: string; position: Vec3; color: number }[]): void {
    this.detectionsGroup.clear();
    for (const item of items) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(this.bboxSize / 110),
        new THREE.MeshBasicMaterial({
          color: item.color,
          transparent: true,
          opacity: 0.85,
        }),
      );
      mesh.position.set(item.position.x, item.position.y, item.position.z);
      mesh.userData.detectionId = item.id;
      this.detectionsGroup.add(mesh);
    }
  }

  /** Voo suave da câmera até um ponto (a busca "onde está X?" — D5). */
  flyTo(point: Vec3): void {
    const target = new THREE.Vector3(point.x, point.y, point.z).applyQuaternion(
      this.root.quaternion,
    );
    // Posição final: recuada do alvo na direção atual da câmera, a uma distância
    // proporcional à cena — perto o bastante para "apontar", longe o bastante
    // para dar contexto.
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(this.bboxSize * 0.35);
    this.flyAnim = {
      fromPos: this.camera.position.clone(),
      toPos: target.clone().add(offset),
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      t: 0,
    };
  }

  private flyAnim: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
  } | null = null;

  setMeasureLine(a: Vec3 | null, b: Vec3 | null): void {
    const existing = this.root.getObjectByName("measure-line");
    if (existing) this.root.remove(existing);
    if (!a || !b) return;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(b.x, b.y, b.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00e5ff }));
    line.name = "measure-line";
    this.root.add(line);
  }

  // -------------------------------------------------------------------------
  // Interno
  // -------------------------------------------------------------------------

  private pointerDownAt: { x: number; y: number; t: number } | null = null;

  private pointerDown = (ev: PointerEvent): void => {
    this.pointerDownAt = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  };

  /**
   * Pick no pointerUP e só se não houve arraste: um clique de órbita não pode
   * virar um ponto de medição acidental.
   */
  private pointerUp = (ev: PointerEvent): void => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || !this.cloud || !this.onPick) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    if (moved > 6 || performance.now() - down.t > 500) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // Threshold proporcional: nuvem esparsa longe da câmera ainda é clicável.
    this.raycaster.params.Points.threshold = this.bboxSize / 150;

    const hits = this.raycaster.intersectObject(this.cloud, false);
    const hit = hits[0];
    if (!hit) return;
    // Converte do referencial do mundo (Y-up) de volta ao dos dados (Z-up).
    const local = this.root.worldToLocal(hit.point.clone());
    this.onPick({ point: { x: local.x, y: local.y, z: local.z } });
  };

  private keyDown = (ev: KeyboardEvent): void => {
    if (this.mode === "fly") this.flyKeys.add(ev.key.toLowerCase());
  };
  private keyUp = (ev: KeyboardEvent): void => {
    this.flyKeys.delete(ev.key.toLowerCase());
  };

  private tick = (): void => {
    if (this.disposed) return;

    // Voo por teclado (WASD + QE para altura), relativo à direção da câmera.
    if (this.mode === "fly" && this.flyKeys.size > 0) {
      const speed = this.bboxSize / 200;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const right = new THREE.Vector3().crossVectors(dir, this.camera.up).normalize();
      const move = new THREE.Vector3();
      if (this.flyKeys.has("w")) move.add(dir);
      if (this.flyKeys.has("s")) move.sub(dir);
      if (this.flyKeys.has("a")) move.sub(right);
      if (this.flyKeys.has("d")) move.add(right);
      if (this.flyKeys.has("q")) move.y -= 1;
      if (this.flyKeys.has("e")) move.y += 1;
      move.normalize().multiplyScalar(speed);
      this.camera.position.add(move);
      this.controls.target.add(move);
    }

    // Voo da busca: interpolação suave (ease in-out) em ~1 s.
    if (this.flyAnim) {
      this.flyAnim.t += 1 / 60;
      const raw = Math.min(1, this.flyAnim.t);
      const k = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      this.camera.position.lerpVectors(this.flyAnim.fromPos, this.flyAnim.toPos, k);
      this.controls.target.lerpVectors(this.flyAnim.fromTarget, this.flyAnim.toTarget, k);
      if (raw >= 1) this.flyAnim = null;
    }

    // Replay: o marcador percorre a trajetória em ~12 s.
    if (this.replayT !== null && this.poses && this.replayMarker) {
      this.replayT += 1 / (60 * 12);
      if (this.replayT >= 1) this.replayT = 0;
      const frames = this.poses.frames;
      const fIdx = Math.min(frames.length - 1, Math.floor(this.replayT * frames.length));
      const p = cameraPosition(frames[fIdx]!);
      this.replayMarker.position.set(p.x, p.y, p.z);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private resize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.cloud?.geometry.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
