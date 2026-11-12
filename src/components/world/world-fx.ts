import * as THREE from "three";

/** 월드 분위기 연출 — 포털 입자 · 떠다니는 꽃가루 · 착지 먼지 · 해 · 뭉게구름 · 발밑 그림자 */

let dot: THREE.Texture | null = null;
export function dotTexture() {
  if (dot) return dot;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

let squareDot: THREE.Texture | null = null;
/** 마크 입자처럼 네모난 점 */
export function pixelDotTexture() {
  if (squareDot) return squareDot;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(1, 1, 6, 6);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fillRect(0, 2, 8, 4);
  g.fillRect(2, 0, 4, 8);
  squareDot = new THREE.CanvasTexture(c);
  squareDot.magFilter = THREE.NearestFilter;
  squareDot.minFilter = THREE.NearestFilter;
  return squareDot;
}

const rand = (i: number) => ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

/** 포털 칸마다 소용돌이치며 올라가는 입자 */
export class Sparkles {
  readonly points: THREE.Points;
  private base: Float32Array;
  private seed: Float32Array;
  private rise: number;
  private spread: number;

  constructor(cells: [number, number, number][], opts: { perCell: number; color: number; size: number; rise: number; spread: number; flat?: boolean }) {
    const n = Math.max(1, cells.length * opts.perCell);
    this.base = new Float32Array(n * 3);
    this.seed = new Float32Array(n * 2);
    this.rise = opts.rise;
    this.spread = opts.spread;
    let i = 0;
    for (const [x, y, z] of cells) {
      for (let k = 0; k < opts.perCell; k++, i++) {
        this.base[i * 3] = x + rand(i * 3 + 1);
        this.base[i * 3 + 1] = y + (opts.flat ? 0.8 : rand(i * 3 + 2) * 0.6);
        this.base[i * 3 + 2] = z + rand(i * 3 + 3);
        this.seed[i * 2] = rand(i * 7 + 5);
        this.seed[i * 2 + 1] = 0.25 + rand(i * 11 + 9) * 0.6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: opts.size,
        map: pixelDotTexture(),
        color: opts.color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.update(0);
  }

  update(t: number) {
    const pos = (this.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const n = this.seed.length / 2;
    for (let i = 0; i < n; i++) {
      const ph = this.seed[i * 2]!;
      const sp = this.seed[i * 2 + 1]!;
      const k = (t * sp + ph) % 1;
      const a = t * 2.2 + ph * 20;
      pos[i * 3] = this.base[i * 3]! + Math.sin(a) * this.spread * (0.4 + k);
      pos[i * 3 + 1] = this.base[i * 3 + 1]! + k * this.rise;
      pos[i * 3 + 2] = this.base[i * 3 + 2]! + Math.cos(a) * this.spread * (0.4 + k);
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.9;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

type Jet = { ox: number; oy: number; oz: number; vx: number; vy: number; vz: number; life: number; jitter: number };

const GRAVITY = 9.8;

/** 출발점 · 속도에서 높이 endY 에 닿을 때까지 걸리는 시간 */
function flightTime(oy: number, vy: number, endY: number) {
  const c = oy - endY;
  return (vy + Math.sqrt(vy * vy + 2 * GRAVITY * c)) / GRAVITY;
}

/**
 * 광장 분수 물줄기 — 꼭대기 분출 · 가운데 대야 둘레 아치 8개 · 수반 테두리에서 안쪽으로 쏘는 물줄기 16개.
 * 입자마다 고정된 위상으로 포물선을 따라 움직이니 매 프레임 계산만 하면 된다.
 */
export class FountainSpray {
  readonly points: THREE.Points;
  private jets: Jet[] = [];
  /** 입자마다 [물줄기 번호, 위상, 흩어짐 x, 흩어짐 z] */
  private seed: Float32Array;
  private count: number;

  constructor(cx: number, cz: number, count: number) {
    const add = (ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, endY: number, jitter: number) =>
      this.jets.push({ ox, oy, oz, vx, vy, vz, life: flightTime(oy, vy, endY), jitter });
    // 꼭대기 신호기 위로 솟는 큰 물기둥 → 가운데 대야로 떨어진다
    add(cx, 6.15, cz, 0, 7.4, 0, 3.9, 0.55);
    add(cx, 6.15, cz, 0, 5.6, 0, 3.9, 0.85);
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * Math.PI * 2;
      add(cx + Math.cos(a) * 2.2, 3.6, cz + Math.sin(a) * 2.2, Math.cos(a) * 1.6, 3.5, Math.sin(a) * 1.6, 0.9, 0.12);
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      add(cx + Math.cos(a) * 4.7, 1.55, cz + Math.sin(a) * 4.7, -Math.cos(a) * 1.4, 3.2, -Math.sin(a) * 1.4, 0.9, 0.08);
    }
    const weights = this.jets.map((_, i) => (i < 2 ? 6 : i < 10 ? 2.2 : 1));
    const total = weights.reduce((s, w) => s + w, 0);
    this.count = count;
    this.seed = new Float32Array(count * 4);
    let j = 0;
    let acc = weights[0]! / total;
    for (let i = 0; i < count; i++) {
      while (i / count > acc && j < this.jets.length - 1) acc += weights[++j]! / total;
      this.seed[i * 4] = j;
      this.seed[i * 4 + 1] = rand(i * 5 + 1);
      const a = rand(i * 5 + 2) * Math.PI * 2;
      const m = Math.sqrt(rand(i * 5 + 3));
      this.seed[i * 4 + 2] = Math.cos(a) * m;
      this.seed[i * 4 + 3] = Math.sin(a) * m;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 4, cz), 12);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.17,
        map: dotTexture(),
        color: 0xd9f6ff,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      }),
    );
    this.update(0);
  }

  update(t: number) {
    const pos = (this.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const jet = this.jets[this.seed[i * 4]!]!;
      const k = (t / jet.life + this.seed[i * 4 + 1]!) % 1;
      const s = k * jet.life;
      const jx = this.seed[i * 4 + 2]! * jet.jitter;
      const jz = this.seed[i * 4 + 3]! * jet.jitter;
      pos[i * 3] = jet.ox + (jet.vx + jx) * s;
      pos[i * 3 + 1] = jet.oy + jet.vy * s - 0.5 * GRAVITY * s * s;
      pos[i * 3 + 2] = jet.oz + (jet.vz + jz) * s;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** 플레이어 주변을 맴도는 꽃가루/반딧불 */
export class Motes {
  readonly points: THREE.Points;
  private offs: Float32Array;
  private count: number;
  private box = { x: 34, y: 12, z: 34 };

  constructor(count: number, color: number) {
    this.count = count;
    this.offs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this.offs[i * 4] = rand(i * 4 + 1) * this.box.x;
      this.offs[i * 4 + 1] = rand(i * 4 + 2) * this.box.y;
      this.offs[i * 4 + 2] = rand(i * 4 + 3) * this.box.z;
      this.offs[i * 4 + 3] = rand(i * 4 + 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.11,
        map: dotTexture(),
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  update(t: number, center: THREE.Vector3) {
    const pos = (this.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const { x: bx, y: by, z: bz } = this.box;
    const wrap = (v: number, size: number) => ((v % size) + size) % size - size / 2;
    for (let i = 0; i < this.count; i++) {
      const ph = this.offs[i * 4 + 3]!;
      const ox = this.offs[i * 4]! + Math.sin(t * 0.4 + ph * 30) * 1.2 + t * 0.25;
      const oy = this.offs[i * 4 + 1]! + t * (0.15 + ph * 0.25);
      const oz = this.offs[i * 4 + 2]! + Math.cos(t * 0.35 + ph * 20) * 1.2;
      pos[i * 3] = center.x + wrap(ox - center.x, bx);
      pos[i * 3 + 1] = center.y + 2 + wrap(oy - center.y, by);
      pos[i * 3 + 2] = center.z + wrap(oz - center.z, bz);
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(t * 1.3) * 0.2;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

type Puff = { s: THREE.Sprite; v: THREE.Vector3; life: number };

/** 착지 · 달리기 먼지 */
export class DustPuffs {
  readonly group = new THREE.Group();
  private pool: Puff[] = [];
  private next = 0;

  constructor(size = 24) {
    const tex = pixelDotTexture();
    for (let i = 0; i < size; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xe8e2d6, transparent: true, depthWrite: false }));
      s.visible = false;
      this.group.add(s);
      this.pool.push({ s, v: new THREE.Vector3(), life: 0 });
    }
  }

  burst(at: THREE.Vector3, n: number, power = 1, color = 0xe8e2d6) {
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.next]!;
      this.next = (this.next + 1) % this.pool.length;
      p.s.material.color.setHex(color);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 1.4) * power;
      p.v.set(Math.cos(a) * sp, 0.6 + Math.random() * 0.9, Math.sin(a) * sp);
      p.s.position.set(at.x + Math.cos(a) * 0.25, at.y + 0.08, at.z + Math.sin(a) * 0.25);
      p.life = 0.45 + Math.random() * 0.25;
      p.s.visible = true;
      const sz = 0.12 + Math.random() * 0.1;
      p.s.scale.set(sz, sz, sz);
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      p.v.multiplyScalar(Math.exp(-4 * dt));
      p.s.position.addScaledVector(p.v, dt);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.min(1, p.life * 2.4);
    }
  }

  dispose() {
    for (const p of this.pool) p.s.material.dispose();
  }
}

/** 하늘에 걸린 해 (카메라를 따라다녀서 항상 같은 방향에 보인다) */
export function makeSun() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  const halo = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  halo.addColorStop(0, "rgba(255,246,214,0.95)");
  halo.addColorStop(0.25, "rgba(255,226,160,0.45)");
  halo.addColorStop(1, "rgba(255,200,140,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#fffbe8";
  g.fillRect(48, 48, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
  s.scale.set(70, 70, 1);
  s.renderOrder = -1;
  return s;
}

/** 여러 상자를 겹친 마크풍 뭉게구름 */
export function makeCloud(seed: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const parts = 3 + Math.floor(rand(seed) * 4);
  for (let i = 0; i < parts; i++) {
    const w = 5 + rand(seed + i * 3) * 9;
    const d = 4 + rand(seed + i * 5) * 7;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4 + rand(seed + i) * 0.8, d), mat);
    m.position.set((rand(seed + i * 7) - 0.5) * 12, i === 0 ? 0 : (rand(seed + i * 9) - 0.3) * 0.9, (rand(seed + i * 11) - 0.5) * 8);
    g.add(m);
  }
  return g;
}

let shadowTex: THREE.Texture | null = null;
export function blobShadow(size = 0.95) {
  if (!shadowTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
