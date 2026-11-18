// DOES 브랜드 GIF — three.js 로 장면 전체(배경 · 받침대 · 빛번짐 포함)를 그린다.
// 글자(픽셀 제목 · Noto 설명)는 compose.py 가 기존 글꼴로 위에 얹는다.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(2);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
let FONT = null;

let scene, camera, update, composer;

/* ───────────────────────── 공용 도구 ───────────────────────── */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t) => Math.pow(clamp(t), 2);
const easeInOut = (t) => (t = clamp(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeBack = (t) => {
  t = clamp(t);
  const c1 = 2.0;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const seg = (t, a, b) => clamp((t - a) / (b - a));
const bump = (t, a, b) => (t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* 재질 */
const plastic = (color, o = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: o.r ?? 0.32,
    metalness: 0,
    clearcoat: o.cc ?? 1,
    clearcoatRoughness: o.ccr ?? 0.12,
    sheen: o.sheen ?? 0.25,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.5,
    map: o.map ?? null,
    emissive: o.e ?? 0x000000,
    emissiveIntensity: o.ei ?? 1,
    side: o.side ?? THREE.FrontSide,
    transparent: o.opacity !== undefined,
    opacity: o.opacity ?? 1,
  });
const satin = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xfff4d0), sheenRoughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 });
const gold = (o = {}) => new THREE.MeshPhysicalMaterial({ color: o.c ?? 0xffbf3c, metalness: 1, roughness: o.r ?? 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1, emissive: 0x3a2200, emissiveIntensity: 0.25 });
const chrome = (c = 0xdfe3f0, r = 0.12) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: r });
const glow = (c, i = 2.5) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
const gemMat = (c) =>
  new THREE.MeshPhysicalMaterial({
    color: c,
    metalness: 0,
    roughness: 0.02,
    transmission: 0.9,
    thickness: 1.2,
    ior: 2.2,
    dispersion: 4,
    iridescence: 0.5,
    iridescenceIOR: 1.4,
    clearcoat: 1,
    flatShading: true,
    emissive: c,
    emissiveIntensity: 0.12,
    attenuationColor: new THREE.Color(c),
    attenuationDistance: 1.5,
  });
const matte = (c, r = 0.85, map = null) => new THREE.MeshStandardMaterial({ color: c, roughness: r, map });

function mesh(geo, mat, cast = true, recv = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}
const rbox = (w, h, d, r = 0.08, seg = 5) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const tube = (pts, r, seg = 64, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, 16, closed);

function canvasTex(w, h, draw, nearest = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  return t;
}

function text3d(str, size, depth, mat, o = {}) {
  const g = new TextGeometry(str, { font: FONT, size, depth, curveSegments: 10, bevelEnabled: true, bevelThickness: o.bt ?? size * 0.08, bevelSize: o.bs ?? size * 0.05, bevelSegments: 5 });
  g.computeBoundingBox();
  g.center();
  return mesh(g, mat);
}

function starShape(R = 0.3, r = 0.13, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + Math.PI / 2;
    const k = i % 2 ? r : R;
    i ? s.lineTo(Math.cos(a) * k, Math.sin(a) * k) : s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return s;
}
const extrude = (shape, depth, bevel = 0.04, segs = 4) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 24 });
  g.center();
  return g;
};

/* ─────────── 스튜디오: 배경 · 빛 · 받침대 · 빛망울 ─────────── */

const radialTex = canvasTex(256, 256, (c, w) => {
  const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, w);
});
const sparkTex = canvasTex(256, 256, (c, w) => {
  const m = w / 2;
  const g = c.createRadialGradient(m, m, 0, m, m, m * 0.35);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, w, w);
  c.fillStyle = "#fff";
  c.beginPath();
  c.moveTo(m, 0);
  c.quadraticCurveTo(m, m, w, m);
  c.quadraticCurveTo(m, m, m, w);
  c.quadraticCurveTo(m, m, 0, m);
  c.quadraticCurveTo(m, m, m, 0);
  c.fill();
});

function addSprite(s, tex, color, scale, pos, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(scale);
  sp.position.set(...pos);
  s.add(sp);
  return sp;
}

function studio(s, o = {}) {
  const top = o.top ?? "#1d1640";
  const bot = o.bot ?? "#0a0b18";
  s.background = canvasTex(16, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  s.environment = envTex;
  s.environmentIntensity = o.env ?? 0.42;

  s.add(new THREE.HemisphereLight(0xe6ecff, 0x2a1b40, o.hemi ?? 0.7));
  const key = new THREE.DirectionalLight(0xfff6ea, o.key ?? 2.0);
  key.position.set(3.5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
  s.add(key);
  const rimA = new THREE.DirectionalLight(o.rim ?? 0xb57bff, 2.4);
  rimA.position.set(-6, 3, -5);
  s.add(rimA);
  const rimB = new THREE.DirectionalLight(o.rim2 ?? 0x5fb4ff, 1.6);
  rimB.position.set(6, 2, -4);
  s.add(rimB);
  const fill = new THREE.DirectionalLight(0xa9c4ff, 0.5);
  fill.position.set(-4, 1, 7);
  s.add(fill);

  // 뒤쪽 큰 빛 번짐 + 빛망울
  const halo = addSprite(s, radialTex, new THREE.Color(o.glow ?? 0x7c3aed), o.haloSize ?? 9, [o.hx ?? 0, o.hy ?? 1.2, -4], o.haloOpacity ?? 0.55);
  const r = rng(o.seed ?? 7);
  const bokeh = [];
  const cols = [0x8b5cf6, 0x60a5fa, 0xf472b6, 0xa78bfa, 0x38bdf8];
  for (let i = 0; i < (o.bokeh ?? 26); i++) {
    const sp = addSprite(s, radialTex, new THREE.Color(cols[i % cols.length]), 0.3 + r() * 0.9, [(r() - 0.5) * (o.spread ?? 22), (r() - 0.3) * 9, -6 - r() * 8], 0.1 + r() * 0.25);
    sp.userData = { ph: r() * TAU, base: sp.material.opacity, y: sp.position.y, sp: 0.5 + r() };
    bokeh.push(sp);
  }
  // 작은 별
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 160; i++) pts.push((r() - 0.5) * 40, (r() - 0.2) * 16, -14 - r() * 6);
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false }));
  s.add(stars);

  let podium = null;
  if (o.podium !== false) {
    podium = new THREE.Group();
    const R = o.podiumR ?? 1.5;
    const base = mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.18, 0.22, 96), plastic(0x1c1634, { r: 0.4, cc: 0.6 }));
    base.position.y = -0.36;
    const topc = mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.28, 96), plastic(0x2a2150, { r: 0.25, cc: 1, ccr: 0.05 }));
    topc.position.y = -0.14;
    const ring = mesh(new THREE.TorusGeometry(R * 1.02, 0.025, 12, 128), glow(o.ring ?? 0xa855f7, 3), false);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.03;
    const ring2 = mesh(new THREE.TorusGeometry(R * 1.165, 0.018, 12, 128), glow(o.ring2 ?? 0x60a5fa, 2.2), false);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -0.25;
    podium.add(base, topc, ring, ring2);
    podium.position.y = o.podiumY ?? 0;
    s.add(podium);
  }
  // 배경은 움직이지 않게 둔다 — GIF 가 바뀐 부분만 저장해서 용량이 크게 준다
  const anim = () => {};
  return { anim, halo, podium, key };
}

function sparkles(s, list, color = 0xffffff) {
  const sp = list.map(([x, y, z, sz, ph]) => {
    const m = addSprite(s, sparkTex, new THREE.Color(color), sz, [x, y, z], 1);
    m.userData = { sz, ph };
    return m;
  });
  return (t, on = 1) =>
    sp.forEach((m) => {
      const k = Math.max(0, Math.sin(t * TAU * 2 + m.userData.ph));
      m.scale.setScalar(m.userData.sz * (0.2 + k) * on + 0.0001);
      m.material.opacity = k * on;
      m.material.rotation = t * 3;
    });
}

function confetti(s, count, seed, box) {
  const r = rng(seed);
  const cols = [0xffd650, 0xff6e96, 0x78beff, 0x82e6a0, 0xc88cff, 0xff9a4a];
  const geos = [new THREE.PlaneGeometry(0.08, 0.16), new THREE.CircleGeometry(0.06, 12), new THREE.PlaneGeometry(0.05, 0.22)];
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geos[i % 3], new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.35, metalness: 0.3, emissive: cols[i % cols.length], emissiveIntensity: 0.25 }));
    m.userData = { x: box.x0 + r() * (box.x1 - box.x0), z: box.z0 + r() * (box.z1 - box.z0), y0: r(), sp: 0.6 + r() * 0.8, rx: r() * TAU, ry: r() * TAU, sw: r() * TAU };
    s.add(m);
    items.push(m);
  }
  return (t, visible = 1) => {
    for (const m of items) {
      const u = m.userData;
      m.visible = visible > 0;
      const fall = (u.y0 + t * u.sp * 1.6) % 1;
      m.position.set(u.x + Math.sin(t * 9 + u.sw) * 0.15, box.y1 - fall * (box.y1 - box.y0), u.z);
      m.rotation.set(u.rx + t * 14, u.ry + t * 9, t * 6);
    }
  };
}

/* ───────────────────────── 소품 ───────────────────────── */

function coinMesh(r = 0.32) {
  const g = new THREE.Group();
  const th = r * 0.24;
  const prof = [
    [0, th / 2 - 0.01], [r * 0.78, th / 2 - 0.01], [r * 0.82, th / 2 + 0.012], [r * 0.95, th / 2 + 0.012], [r, th / 2 - 0.01],
    [r, -th / 2 + 0.01], [r * 0.95, -th / 2 - 0.012], [r * 0.82, -th / 2 - 0.012], [r * 0.78, -th / 2 + 0.01], [0, -th / 2 + 0.01],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = mesh(new THREE.LatheGeometry(prof, 64), gold());
  g.add(body);
  for (const side of [1, -1]) {
    const st = mesh(extrude(starShape(r * 0.45, r * 0.2), th * 0.25, th * 0.12, 2), gold({ c: 0xffd56a, r: 0.18 }));
    st.rotation.x = (-Math.PI / 2) * side;
    st.position.y = side * (th / 2);
    g.add(st);
  }
  return g;
}

function diamondMesh(color = 0x8fdcff, size = 1) {
  const pts = [new THREE.Vector2(0, -1.0), new THREE.Vector2(0.98, 0.12), new THREE.Vector2(0.98, 0.2), new THREE.Vector2(0.6, 0.5), new THREE.Vector2(0, 0.5)];
  const geo = new THREE.LatheGeometry(pts, 10).toNonIndexed();
  geo.computeVertexNormals();
  const m = mesh(geo, gemMat(color));
  m.scale.setScalar(size);
  return m;
}

function capsuleMesh(r, top, bottom) {
  const g = new THREE.Group();
  const a = mesh(new THREE.SphereGeometry(r, 48, 24, 0, TAU, 0, Math.PI / 2), plastic(top, { r: 0.15 }));
  const b = mesh(new THREE.SphereGeometry(r, 48, 24, 0, TAU, Math.PI / 2, Math.PI / 2), plastic(bottom, { r: 0.2 }));
  const band = mesh(new THREE.TorusGeometry(r * 1.0, r * 0.05, 10, 64), plastic(0xffffff, { r: 0.3 }));
  band.rotation.x = Math.PI / 2;
  g.add(a, b, band);
  const shine = addSprite(g, radialTex, new THREE.Color(0xffffff), r * 0.5, [-r * 0.35, r * 0.5, r * 0.75], 0.5);
  g.userData = { a, b, band, shine };
  return g;
}

function smoke(s, seed, color = 0x8a8aa0) {
  const r = rng(seed);
  const balls = [];
  for (let i = 0; i < 11; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(0.3 + r() * 0.2, 3), new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.9 }), false, false);
    m.userData = { a: (i / 11) * TAU, sp: 0.6 + r() * 0.6, up: 0.4 + r() * 0.8 };
    s.add(m);
    balls.push(m);
  }
  return (cx, cy, cz, t) => {
    for (const m of balls) {
      const u = m.userData;
      m.visible = t > 0 && t < 1;
      const k = easeOut(t);
      m.position.set(cx + Math.cos(u.a) * k * u.sp, cy + Math.sin(u.a) * k * u.sp * 0.5 + k * u.up, cz);
      m.scale.setScalar(0.3 + k * 1.1);
      m.material.opacity = 0.9 * (1 - t);
    }
  };
}

/* 선물상자 — 물방울 무늬 상자 + 새틴 리본 + 진짜 매듭 */
function dotsTex(base, dot) {
  return canvasTex(512, 512, (c, w) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, w);
    c.fillStyle = dot;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
      c.beginPath();
      c.arc((x + (y % 2) * 0.5) * 64, y * 64 + 32, 11, 0, TAU);
      c.fill();
    }
  });
}
function bowLoop(side) {
  const s = side;
  return tube([[0, 0, 0], [0.25 * s, 0.22, 0.12], [0.55 * s, 0.38, 0.08], [0.68 * s, 0.22, -0.02], [0.45 * s, 0.06, -0.06], [0.12 * s, 0.02, -0.02]], 0.09, 80, true);
}
function makeGift() {
  const g = new THREE.Group();
  const pink = plastic(0xffffff, { map: dotsTex("#f05aa6", "#ffc4e1"), r: 0.35 });
  const lidMat = plastic(0xffffff, { map: dotsTex("#ff7dbb", "#ffd6ea"), r: 0.3 });
  const rib = satin(0xffc83d);
  const body = mesh(rbox(1.6, 1.15, 1.6, 0.08), pink);
  body.position.y = 0.575;
  g.add(body);
  for (const [w, d] of [[0.28, 1.62], [1.62, 0.28]]) {
    const b = mesh(rbox(w, 1.16, d, 0.03), rib);
    b.position.y = 0.58;
    g.add(b);
  }
  const lid = new THREE.Group();
  lid.add(mesh(rbox(1.76, 0.38, 1.76, 0.1), lidMat));
  for (const [w, d] of [[0.3, 1.78], [1.78, 0.3]]) lid.add(mesh(rbox(w, 0.4, d, 0.04), rib));
  const bow = new THREE.Group();
  for (const s of [-1, 1]) {
    const loop = mesh(bowLoop(s), rib);
    loop.scale.set(1, 1, 1.6);
    bow.add(loop);
    const tail = mesh(tube([[0, 0, 0], [0.15 * s, -0.04, 0.25], [0.3 * s, -0.12, 0.45], [0.38 * s, -0.2, 0.6]], 0.07, 40), rib);
    bow.add(tail);
  }
  const knot = mesh(new THREE.SphereGeometry(0.15, 32, 16), rib);
  knot.scale.set(1, 0.8, 1);
  bow.add(knot);
  bow.position.y = 0.24;
  lid.add(bow);
  lid.position.y = 1.32;
  g.add(lid);
  const inner = new THREE.PointLight(0xffd27a, 0, 4);
  inner.position.y = 1.1;
  g.add(inner);
  return { g, lid, inner };
}

function heartShape(k = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9 * k);
  s.bezierCurveTo(-0.3 * k, -0.6 * k, -1.2 * k, -0.1 * k, -1.2 * k, 0.45 * k);
  s.bezierCurveTo(-1.2 * k, 1.05 * k, -0.4 * k, 1.2 * k, 0, 0.62 * k);
  s.bezierCurveTo(0.4 * k, 1.2 * k, 1.2 * k, 1.05 * k, 1.2 * k, 0.45 * k);
  s.bezierCurveTo(1.2 * k, -0.1 * k, 0.3 * k, -0.6 * k, 0, -0.9 * k);
  return s;
}
function makeHeart(k = 1, color = 0xf43f5e) {
  const geo = new THREE.ExtrudeGeometry(heartShape(k), { depth: 0.35 * k, bevelEnabled: true, bevelThickness: 0.3 * k, bevelSize: 0.24 * k, bevelSegments: 16, curveSegments: 64 });
  geo.center();
  return mesh(geo, plastic(color, { r: 0.2, sheen: 0.6 }));
}

/* 편지봉투 — 편지지가 살짝 올라오고 밀랍 도장 + 알림 배지 */
function makeEnvelope() {
  const g = new THREE.Group();
  const W = 2.2, H = 1.45;
  const back = mesh(rbox(W, H, 0.1, 0.06), plastic(0xd9d2f7, { r: 0.5, cc: 0.3 }));
  g.add(back);
  const letter = new THREE.Group();
  const paper = mesh(rbox(W - 0.3, H - 0.15, 0.03, 0.02), new THREE.MeshStandardMaterial({
    roughness: 0.8,
    map: canvasTex(512, 340, (c, w) => {
      c.fillStyle = "#fffdf6";
      c.fillRect(0, 0, w, 340);
      c.fillStyle = "#c9c2e8";
      for (let i = 0; i < 6; i++) c.fillRect(46, 70 + i * 40, i === 5 ? 200 : 420, 10);
      c.fillStyle = "#f472b6";
      c.beginPath();
      c.arc(56, 36, 14, 0, TAU);
      c.fill();
    }),
  }));
  letter.add(paper);
  letter.position.set(0, 0, 0.07);
  g.add(letter);
  const pocket = new THREE.Shape();
  pocket.moveTo(-W / 2, -H / 2);
  pocket.lineTo(W / 2, -H / 2);
  pocket.lineTo(W / 2, H / 2 - 0.05);
  pocket.lineTo(0, -0.08);
  pocket.lineTo(-W / 2, H / 2 - 0.05);
  pocket.closePath();
  const pk = mesh(new THREE.ExtrudeGeometry(pocket, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), plastic(0xfaf8ff, { r: 0.45, cc: 0.5 }));
  pk.position.z = 0.1;
  g.add(pk);
  const flapS = new THREE.Shape();
  flapS.moveTo(-W / 2, 0);
  flapS.lineTo(W / 2, 0);
  flapS.lineTo(0, -0.8);
  flapS.closePath();
  const flap = mesh(new THREE.ExtrudeGeometry(flapS, { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 3 }), plastic(0xece8ff, { r: 0.45, cc: 0.5 }));
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, H / 2 - 0.02, 0.16);
  flapPivot.add(flap);
  g.add(flapPivot);
  const seal = new THREE.Group();
  const wax = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 40), plastic(0xe11d48, { r: 0.3 }));
  wax.rotation.x = Math.PI / 2;
  const heart = mesh(extrude(heartShape(0.11), 0.03, 0.015, 2), plastic(0xff6b8a, { r: 0.3 }));
  heart.position.z = 0.05;
  seal.add(wax, heart);
  seal.position.set(0, -0.12, 0.22);
  g.add(seal);
  const badge = new THREE.Group();
  const bd = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 48), plastic(0xff3b5c, { e: 0xff1840, ei: 0.25 }));
  bd.rotation.x = Math.PI / 2;
  const num = text3d("1", 0.3, 0.06, plastic(0xffffff));
  num.position.z = 0.1;
  badge.add(bd, num);
  badge.position.set(W / 2 - 0.05, H / 2 - 0.02, 0.28);
  g.add(badge);
  return { g, badge, letter, flapPivot, seal };
}

/* 쇼핑백 — 접힌 윗단 · 줄 손잡이 · 꼬리표 · 안에 상자랑 코인이 빼꼼 */
function makeBag() {
  const g = new THREE.Group();
  const tex = canvasTex(512, 512, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#f9a8d4");
    gr.addColorStop(1, "#ec4899");
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 6; i++) c.fillRect(0, 80 + i * 70, w, 26);
  });
  const body = mesh(rbox(1.6, 1.75, 0.9, 0.05), plastic(0xffffff, { map: tex, r: 0.45, cc: 0.5 }));
  body.position.y = 0.875;
  g.add(body);
  const cuff = mesh(rbox(1.62, 0.26, 0.92, 0.04), plastic(0xfdf2f8, { r: 0.5, cc: 0.3 }));
  cuff.position.y = 1.64;
  g.add(cuff);
  const peek = mesh(rbox(0.6, 0.5, 0.5, 0.06), plastic(0x60a5fa));
  peek.position.set(-0.3, 1.75, 0);
  peek.rotation.z = 0.2;
  g.add(peek);
  const c1 = coinMesh(0.24);
  c1.position.set(0.38, 1.85, 0.05);
  c1.rotation.set(Math.PI / 2, 0.3, -0.4);
  g.add(c1);
  for (const z of [0.32, -0.32]) {
    g.add(mesh(tube([[-0.42, 1.72, z], [-0.38, 2.15, z], [0, 2.32, z], [0.38, 2.15, z], [0.42, 1.72, z]], 0.04, 48), satin(0xffc83d)));
  }
  const st = mesh(extrude(starShape(0.3, 0.13), 0.05, 0.03, 3), gold());
  st.position.set(0, 0.82, 0.48);
  g.add(st);
  const tag = new THREE.Group();
  const tg = mesh(rbox(0.3, 0.42, 0.03, 0.04), plastic(0xfff7d6, { r: 0.6, cc: 0.2 }));
  tg.position.y = -0.21;
  const str = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), matte(0xffc83d));
  str.position.y = 0.1;
  tag.add(tg, str);
  tag.position.set(0.62, 1.55, 0.5);
  g.add(tag);
  return { g, tag };
}

/* ? 타일 — 반짝이는 블록 + 입체 물음표 + 주위를 도는 숫자 큐브 */
function makeTile() {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.6, 1.6, 1.6, 0.22, 6), plastic(0x3b82f6, { r: 0.22 })));
  const face = mesh(rbox(1.3, 1.3, 0.1, 0.12), plastic(0x93c5fd, { r: 0.25 }));
  face.position.z = 0.78;
  g.add(face);
  const q = text3d("?", 0.95, 0.22, plastic(0xffffff, { r: 0.18 }));
  q.position.z = 0.92;
  g.add(q);
  for (const [x, y] of [[-0.62, 0.62], [0.62, 0.62], [-0.62, -0.62], [0.62, -0.62]]) {
    const rv = mesh(new THREE.SphereGeometry(0.06, 16, 10), gold());
    rv.position.set(x, y, 0.84);
    g.add(rv);
  }
  const cubes = ["1", "7", "3"].map((d, i) => {
    const c = new THREE.Group();
    c.add(mesh(rbox(0.42, 0.42, 0.42, 0.08), plastic([0xf472b6, 0x22c55e, 0xfbbf24][i])));
    const n = text3d(d, 0.22, 0.05, plastic(0xffffff));
    n.position.z = 0.22;
    c.add(n);
    return c;
  });
  return { g, cubes };
}

/* 왕관 — 지그재그 띠를 원통에 감고 보석 · 진주 · 벨벳 · 털 */
function makeCrown() {
  const g = new THREE.Group();
  const R = 1.0, H = 0.62, n = 5;
  const L = TAU * R;
  const band = new THREE.Group();
  const pieces = 80;
  const topY = (x) => {
    const u = ((x / L) * n) % 1;
    const d = Math.abs(u - 0.5);
    return H + Math.max(0, 0.5 - d * 2.2) * 1.5;
  };
  for (let i = 0; i < pieces; i++) {
    const x0 = (i / pieces) * L, x1 = ((i + 1) / pieces) * L;
    const ps = new THREE.Shape();
    ps.moveTo(x0, 0);
    ps.lineTo(x1 + 0.003, 0);
    ps.lineTo(x1 + 0.003, topY(x1));
    ps.lineTo(x0, topY(x0));
    ps.closePath();
    const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.09, bevelEnabled: false });
    const p = pg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const a = x / R;
      const rr = R + z;
      p.setXYZ(k, Math.sin(a) * rr, y, Math.cos(a) * rr);
    }
    pg.computeVertexNormals();
    band.add(mesh(pg, gold({ r: 0.18 })));
  }
  band.position.y = -0.3;
  g.add(band);
  for (const y of [-0.3, 0.3]) {
    const rim = mesh(new THREE.TorusGeometry(R + 0.06, 0.07, 16, 96), gold({ c: 0xffcf5a, r: 0.15 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    g.add(rim);
  }
  const velvet = mesh(new THREE.SphereGeometry(R * 0.96, 48, 24, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x9d174d, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xff7ab0), sheenRoughness: 0.4 }));
  velvet.scale.y = 0.75;
  g.add(velvet);
  const fur = mesh(new THREE.TorusGeometry(R + 0.08, 0.15, 24, 96), new THREE.MeshPhysicalMaterial({ color: 0xe6e2f0, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.8 }));
  fur.rotation.x = Math.PI / 2;
  fur.position.y = -0.36;
  g.add(fur);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const sp = mesh(new THREE.SphereGeometry(0.035, 8, 6), matte(0x18181b, 0.6));
    sp.position.set(Math.sin(a) * (R + 0.22), -0.33, Math.cos(a) * (R + 0.22));
    g.add(sp);
  }
  const cols = [0x60a5fa, 0xf43f5e, 0x34d399, 0xc084fc, 0xfbbf24];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * TAU;
    const pearl = mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xfff8ee, roughness: 0.15, iridescence: 1, clearcoat: 1 }));
    pearl.position.set(Math.sin(a) * (R + 0.045), -0.3 + H + 0.75 + 0.06, Math.cos(a) * (R + 0.045));
    g.add(pearl);
    const gem = diamondMesh(cols[i], 0.15);
    gem.position.set(Math.sin(a) * (R + 0.16), 0.0, Math.cos(a) * (R + 0.16));
    gem.lookAt(gem.position.clone().multiplyScalar(3));
    gem.rotateX(Math.PI / 2);
    g.add(gem);
  }
  return g;
}

/* 사람 캐릭터 (초대) */
function makePerson(color, hair) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.42, 0.5, 12, 32), plastic(color, { r: 0.3 }));
  body.position.y = 0.72;
  g.add(body);
  const collar = mesh(new THREE.TorusGeometry(0.25, 0.05, 10, 40), plastic(0xffffff));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.18;
  g.add(collar);
  const head = mesh(new THREE.SphereGeometry(0.4, 48, 32), plastic(0xffe0c8, { r: 0.45, cc: 0.3, sheen: 0.6 }));
  head.position.y = 1.62;
  g.add(head);
  const hairM = mesh(new THREE.SphereGeometry(0.42, 48, 24, 0, TAU, 0, Math.PI * 0.42), plastic(hair, { r: 0.35 }));
  hairM.position.y = 1.64;
  hairM.rotation.x = -0.25;
  g.add(hairM);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.055, 16, 12), plastic(0x1e1830, { r: 0.1 }));
    eye.position.set(s * 0.14, 1.62, 0.37);
    eye.scale.set(1, 1.25, 0.6);
    g.add(eye);
    const hl = mesh(new THREE.SphereGeometry(0.018, 8, 6), glow(0xffffff, 1));
    hl.position.set(s * 0.14 + 0.02, 1.645, 0.405);
    g.add(hl);
    const blush = mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.7 }), false, false);
    blush.position.set(s * 0.24, 1.53, 0.335);
    blush.rotation.y = s * 0.55;
    g.add(blush);
  }
  const smile = mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 24, Math.PI), plastic(0x1e1830));
  smile.rotation.z = Math.PI;
  smile.position.set(0, 1.52, 0.385);
  g.add(smile);
  const arms = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.4, 1.0, 0);
    const arm = mesh(new THREE.CapsuleGeometry(0.1, 0.36, 8, 16), plastic(color, { r: 0.3 }));
    arm.position.y = -0.22;
    const hand = mesh(new THREE.SphereGeometry(0.11, 20, 12), plastic(0xffe0c8, { r: 0.45 }));
    hand.position.y = -0.46;
    piv.add(arm, hand);
    piv.rotation.z = s * 0.25;
    g.add(piv);
    arms.push(piv);
  }
  return { g, arms };
}

/* 트로피 */
function makeTrophy() {
  const g = new THREE.Group();
  const prof = [[0, 1.05], [0.18, 1.06], [0.42, 1.18], [0.62, 1.42], [0.76, 1.75], [0.82, 2.08], [0.9, 2.12], [0.92, 2.2], [0.84, 2.2], [0.76, 2.1], [0.7, 1.8], [0.56, 1.5], [0, 1.4]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 96), gold({ r: 0.16 })));
  const stemProf = [[0.0, 0.44], [0.32, 0.44], [0.3, 0.52], [0.12, 0.6], [0.09, 0.75], [0.16, 0.82], [0.16, 0.9], [0.09, 0.95], [0.11, 1.08], [0, 1.08]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(stemProf, 64), gold({ r: 0.2 })));
  for (const s of [-1, 1]) {
    g.add(mesh(tube([[s * 0.66, 1.95, 0], [s * 1.08, 2.0, 0], [s * 1.12, 1.62, 0], [s * 0.82, 1.38, 0], [s * 0.5, 1.3, 0]], 0.065, 64), gold({ r: 0.2 })));
  }
  const base1 = mesh(rbox(1.4, 0.26, 1.0, 0.06), plastic(0x2b1f4d, { r: 0.2 }));
  base1.position.y = 0.13;
  const base2 = mesh(rbox(1.0, 0.22, 0.75, 0.05), plastic(0x3b2a66, { r: 0.2 }));
  base2.position.y = 0.36;
  const plaque = mesh(rbox(0.6, 0.16, 0.02, 0.02), gold({ r: 0.3 }));
  plaque.position.set(0, 0.13, 0.51);
  g.add(base1, base2, plaque);
  const st = mesh(extrude(starShape(0.26, 0.11), 0.06, 0.03, 3), plastic(0xfff1b8, { e: 0xffd060, ei: 0.35 }));
  st.position.set(0, 1.72, 0.74);
  st.rotation.x = -0.22;
  g.add(st);
  const one = text3d("1", 0.12, 0.02, plastic(0x2b1f4d));
  one.position.set(0, 0.13, 0.535);
  g.add(one);
  return g;
}

/* 달력 + 고무도장 */
function calendarTex(gold_) {
  return canvasTex(512, 560, (c, w, h) => {
    c.fillStyle = "#fffdf8";
    c.fillRect(0, 0, w, h);
    c.fillStyle = gold_ ? "#f59e0b" : "#ef4444";
    c.fillRect(0, 0, w, 120);
    c.fillStyle = "#fff";
    c.font = "bold 64px DejaVu Sans";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(gold_ ? "JACKPOT" : "CHECK-IN", w / 2, 66);
    c.font = "bold 34px DejaVu Sans";
    ["S", "M", "T", "W", "T", "F", "S"].forEach((d, i) => {
      c.fillStyle = i === 0 ? "#ef4444" : "#8b8aa6";
      c.fillText(d, 42 + i * 71, 160);
    });
    let n = 1;
    for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) {
      if (n > 31) continue;
      const x = 42 + k * 71, y = 220 + r * 72;
      if (n < 15) {
        c.fillStyle = gold_ ? "rgba(245,158,11,0.2)" : "rgba(168,85,247,0.16)";
        c.beginPath();
        c.arc(x, y, 28, 0, TAU);
        c.fill();
      }
      c.fillStyle = k === 0 ? "#ef4444" : "#3b3561";
      c.fillText(String(n), x, y + 2);
      n++;
    }
  });
}
function makeCalendar(gold_) {
  const g = new THREE.Group();
  g.add(mesh(rbox(2.2, 2.4, 0.16, 0.08), plastic(0xe9e5f5, { r: 0.6, cc: 0.2 })));
  const face = mesh(new THREE.PlaneGeometry(2.1, 2.3), new THREE.MeshStandardMaterial({ map: calendarTex(gold_), roughness: 0.75, envMapIntensity: 0.3, color: 0xdedbe8 }));
  face.position.z = 0.082;
  g.add(face);
  const back = mesh(rbox(2.3, 2.5, 0.12, 0.08), plastic(gold_ ? 0xb45309 : 0x7c3aed));
  back.position.set(0.04, -0.04, -0.1);
  g.add(back);
  for (let i = 0; i < 9; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.09, 0.025, 10, 24), chrome());
    ring.position.set(-0.88 + i * 0.22, 1.18, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
  }
  const ink = mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({
    transparent: true,
    roughness: 0.6,
    map: canvasTex(256, 256, (c, w) => {
      c.strokeStyle = gold_ ? "#d97706" : "#16a34a";
      c.lineWidth = 16;
      c.beginPath();
      c.arc(w / 2, w / 2, 104, 0, TAU);
      c.stroke();
      c.lineWidth = 30;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(70, 132);
      c.lineTo(112, 176);
      c.lineTo(190, 88);
      c.stroke();
    }),
  }), false, false);
  ink.position.set(0.45, -0.35, 0.09);
  ink.rotation.z = -0.15;
  g.add(ink);
  return { g, ink };
}
function makeStamp(gold_) {
  const g = new THREE.Group();
  const rubber = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 48), plastic(gold_ ? 0xf59e0b : 0x22c55e, { r: 0.6 }));
  rubber.position.y = 0.05;
  const base = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.22, 48), plastic(0x7c4a2a, { r: 0.45, cc: 0.6 }));
  base.position.y = 0.21;
  const neck = mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.42, 32), plastic(0x9a6232, { r: 0.45 }));
  neck.position.y = 0.53;
  const knob = mesh(new THREE.SphereGeometry(0.26, 32, 20), plastic(gold_ ? 0xfbbf24 : 0xef4444, { r: 0.2 }));
  knob.position.y = 0.9;
  const band = mesh(new THREE.TorusGeometry(0.46, 0.03, 10, 48), gold());
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.3;
  g.add(rubber, base, neck, knob, band);
  return g;
}

/* ───────────────────────── 장면 ───────────────────────── */

const SCENES = {};
function cam(x, y, z, lx = 0, ly = 0, lz = 0, fov = 30) {
  camera.fov = fov;
  camera.position.set(x, y, z);
  camera.lookAt(lx, ly, lz);
  camera.updateProjectionMatrix();
}

/* 배너 아이콘 공용 틀: 받침대 위에 소품, 반짝이 */
function bannerFrame(s, o, set) {
  const st = studio(s, { glow: o.glow, ring: o.ring, ring2: o.ring2, rim: o.rim, podiumR: o.podiumR ?? 1.35, haloSize: 7, hy: 1.1, spread: 34 });
  const sp = sparkles(s, [[-1.6, 2.4, 0.5, 0.45, 0], [1.7, 2.1, 0.3, 0.35, 1.8], [1.5, 0.3, 1.2, 0.3, 3.1], [-1.5, 0.6, 1.0, 0.28, 4.4]], o.spark ?? 0xfff3c4);
  cam(0, 1.6, 6.7, 0, 1.0, 0);
  return (t) => {
    st.anim(t);
    sp(t);
    set(t);
  };
}

SCENES.gift = (s, o) => {
  const { g, lid, inner } = makeGift();
  g.scale.setScalar(0.92);
  s.add(g);
  const conf = o.open ? confetti(s, 60, 3, { x0: -2.4, x1: 2.4, z0: -1, z1: 1.5, y0: -0.2, y1: 3.6 }) : null;
  const coins = o.open ? [] : [coinMesh(0.22), coinMesh(0.18)];
  coins.forEach((c) => s.add(c));
  return bannerFrame(s, { glow: 0xdb2777, ring: 0xf472b6, rim: 0xff7ad0 }, (t) => {
    g.rotation.y = -0.5 + Math.sin(t * TAU) * 0.28;
    if (o.open) {
      const k = easeOut(seg(t, 0, 0.3));
      lid.position.set(-0.45 * k, 1.32 + k * 0.85 + Math.sin(t * TAU * 2) * 0.05 * k, 0.1 * k);
      lid.rotation.set(0.15 * k, 0, 0.45 * k);
      inner.intensity = 14 * k;
      conf(t);
    } else {
      const hop = Math.pow(Math.abs(Math.sin(t * TAU * 2)), 1.5) * 0.22;
      g.position.y = hop;
      const sq = hop < 0.02 ? 0.04 : 0;
      g.scale.set(0.92 * (1 + sq), 0.92 * (1 - sq), 0.92 * (1 + sq));
      lid.position.y = 1.32 + hop * 0.5;
      coins.forEach((c, i) => {
        const a = t * TAU + i * Math.PI;
        c.position.set(Math.cos(a) * 1.55, 1.3 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.9);
        c.rotation.set(Math.PI / 2 + 0.3, 0, t * TAU * 2 + i);
      });
    }
  });
};

SCENES.envelope = (s) => {
  const { g, badge, letter, flapPivot } = makeEnvelope();
  g.position.y = 1.15;
  s.add(g);
  return bannerFrame(s, { glow: 0x7c3aed }, (t) => {
    g.rotation.set(0.05, -0.32 + Math.sin(t * TAU) * 0.25, Math.sin(t * TAU) * 0.04);
    g.position.y = 1.15 + Math.sin(t * TAU) * 0.1;
    const open = 0.5 + 0.5 * Math.sin(t * TAU - 1);
    flapPivot.rotation.x = -open * 2.6;
    letter.position.y = open * 0.42;
    badge.scale.setScalar(1 + 0.18 * Math.pow(Math.max(0, Math.sin(t * TAU * 3)), 4));
  });
};

SCENES.bag = (s) => {
  const { g, tag } = makeBag();
  g.scale.setScalar(0.88);
  s.add(g);
  const coins = [coinMesh(0.2), coinMesh(0.17), coinMesh(0.15)];
  coins.forEach((c) => s.add(c));
  return bannerFrame(s, { glow: 0xdb2777, ring: 0xf472b6 }, (t) => {
    g.rotation.y = -0.45 + Math.sin(t * TAU) * 0.3;
    g.position.y = Math.pow(Math.abs(Math.sin(t * TAU * 2)), 1.5) * 0.1;
    tag.rotation.z = Math.sin(t * TAU * 2) * 0.25;
    coins.forEach((c, i) => {
      const a = t * TAU + (i * TAU) / 3;
      c.position.set(Math.cos(a) * 1.5, 1.1 + Math.sin(a * 2) * 0.3, Math.sin(a) * 0.9);
      c.rotation.set(Math.PI / 2 + 0.3, 0, t * TAU * 2 + i);
    });
  });
};

SCENES.tile = (s) => {
  const { g, cubes } = makeTile();
  g.position.y = 0.95;
  s.add(g);
  cubes.forEach((c) => s.add(c));
  return bannerFrame(s, { glow: 0x2563eb, ring: 0x60a5fa, ring2: 0x22c55e, rim: 0x60a5fa }, (t) => {
    g.rotation.y = Math.sin(t * TAU) * 0.5;
    g.position.y = 0.95 + Math.sin(t * TAU * 2) * 0.08;
    cubes.forEach((c, i) => {
      const a = t * TAU + (i * TAU) / 3;
      c.position.set(Math.cos(a) * 1.45, 1.0 + Math.sin(a + i) * 0.5, Math.sin(a) * 1.0);
      c.rotation.set(t * TAU + i, t * TAU * 2 + i, 0);
    });
  });
};

SCENES.crown = (s) => {
  const crown = makeCrown();
  crown.position.y = 0.6;
  s.add(crown);
  const conf = confetti(s, 50, 8, { x0: -2.6, x1: 2.6, z0: -1.2, z1: 1.5, y0: -0.4, y1: 3.4 });
  return bannerFrame(s, { glow: 0xd97706, ring: 0xfbbf24, ring2: 0x22c55e, rim: 0xffc53d }, (t) => {
    crown.rotation.set(0.25, t * TAU * 0.5, 0.06);
    crown.position.y = 0.6 + Math.sin(t * TAU * 2) * 0.08;
    conf(t);
  });
};

SCENES.heart = (s) => {
  const heart = makeHeart(0.82);
  heart.position.y = 1.1;
  s.add(heart);
  const minis = [0, 1, 2, 3].map((i) => {
    const m = makeHeart(0.16, [0xff7ab0, 0xf43f5e, 0xfda4af, 0xfb7185][i]);
    s.add(m);
    return m;
  });
  return bannerFrame(s, { glow: 0xe11d48, ring: 0xfb7185, ring2: 0x22c55e, rim: 0xff4d80, spark: 0xffe4ef }, (t) => {
    const beat = Math.pow(Math.max(0, Math.sin(t * TAU * 2)), 8) * 0.13 + Math.pow(Math.max(0, Math.sin(t * TAU * 2 - 0.9)), 10) * 0.07;
    heart.scale.setScalar(1 + beat);
    heart.rotation.y = Math.sin(t * TAU) * 0.4;
    minis.forEach((m, i) => {
      const k = (t + i / 4) % 1;
      m.position.set(Math.sin(i * 2.1 + 0.5) * 1.6, 0.4 + k * 2.6, 0.3 + Math.cos(i) * 0.5);
      m.rotation.set(0, Math.sin(k * TAU) * 0.6, Math.sin(i) * 0.3);
      m.scale.setScalar(Math.max(0.001, Math.sin(k * Math.PI)));
    });
  });
};

SCENES.invite = (s) => {
  const A = makePerson(0x60a5fa, 0x3b2a1a), B = makePerson(0xf472b6, 0x7c2d12);
  A.g.position.set(-0.55, 0, -0.1);
  B.g.position.set(0.55, 0, 0.15);
  A.g.scale.setScalar(0.95);
  s.add(A.g, B.g);
  const plus = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 48), plastic(0x22c55e, { r: 0.2 }));
  disc.rotation.x = Math.PI / 2;
  const h = mesh(rbox(0.46, 0.13, 0.1, 0.04), plastic(0xffffff));
  const v = mesh(rbox(0.13, 0.46, 0.1, 0.04), plastic(0xffffff));
  h.position.z = v.position.z = 0.1;
  plus.add(disc, h, v);
  s.add(plus);
  return bannerFrame(s, { glow: 0x2563eb, ring: 0x60a5fa, ring2: 0x22c55e }, (t) => {
    A.g.position.y = Math.pow(Math.abs(Math.sin(t * TAU * 2)), 1.5) * 0.16;
    B.g.position.y = Math.pow(Math.abs(Math.sin(t * TAU * 2 + 1.4)), 1.5) * 0.16;
    A.g.rotation.y = 0.35;
    B.g.rotation.y = -0.35;
    B.arms[1].rotation.z = 2.5 + Math.sin(t * TAU * 4) * 0.4;
    A.arms[1].rotation.z = 0.6;
    B.arms[0].rotation.z = -0.6;
    plus.position.set(1.3, 2.25 + Math.sin(t * TAU) * 0.08, 0.4);
    plus.rotation.y = Math.sin(t * TAU) * 0.6;
    plus.scale.setScalar(1 + 0.1 * Math.pow(Math.max(0, Math.sin(t * TAU * 2)), 3));
  });
};

SCENES.trophy = (s) => {
  const tr = makeTrophy();
  tr.scale.setScalar(0.92);
  s.add(tr);
  return bannerFrame(s, { glow: 0xd97706, ring: 0xfbbf24, rim: 0xffc53d }, (t) => {
    tr.rotation.y = Math.sin(t * TAU) * 0.55;
    tr.position.y = Math.sin(t * TAU * 2) * 0.05;
  });
};

/* 관리자 상태 구슬 */
SCENES.status = (s, o) => {
  const col = o.idle ? 0xf59e0b : o.online ? 0x22c55e : 0xef4444;
  const orb = new THREE.Group();
  const ball = mesh(new THREE.SphereGeometry(0.85, 64, 48), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.12, clearcoat: 1, transmission: 0.35, thickness: 1, emissive: col, emissiveIntensity: 0.35 }));
  const inner = mesh(new THREE.SphereGeometry(0.45, 32, 24), glow(col, o.online ? 2.2 : 1.2), false, false);
  const cap = mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.28, 48), chrome(0xd8dbe8, 0.2));
  cap.position.y = -0.92;
  orb.add(ball, inner, cap);
  orb.position.y = 1.15;
  s.add(orb);
  const rings = [0, 1, 2].map(() => {
    const r = mesh(new THREE.TorusGeometry(1, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), false, false);
    r.position.y = 1.15;
    s.add(r);
    return r;
  });
  const pl = new THREE.PointLight(col, 6, 5);
  pl.position.set(0, 1.2, 1.2);
  s.add(pl);
  // 자리 비움: 초승달 + 떠오르는 Z
  const zs = [];
  if (o.idle) {
    const moonMat = new THREE.MeshPhysicalMaterial({ color: 0xfff1b8, roughness: 0.3, clearcoat: 1, emissive: 0xffd36b, emissiveIntensity: 0.6 });
    const moon = new THREE.Group();
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 0.42, Math.PI * 0.35, Math.PI * 1.65, false);
    shape.absarc(0.2, 0, 0.32, Math.PI * 1.55, Math.PI * 0.45, true);
    moon.add(mesh(extrude(shape, 0.14, 0.05, 4), moonMat));
    moon.position.set(-0.95, 1.95, 0.4);
    moon.rotation.z = -0.4;
    s.add(moon);
    for (let i = 0; i < 3; i++) {
      const z = text3d("Z", 0.26 - i * 0.04, 0.06, plastic(0xfff7d6, { e: 0xffc94d, ei: 0.5 }));
      s.add(z);
      zs.push(z);
    }
  }
  return bannerFrame(s, { glow: o.idle ? 0xb45309 : o.online ? 0x15803d : 0xb91c1c, ring: col, ring2: o.idle ? 0xfde68a : o.online ? 0x60a5fa : 0xf472b6, rim: col }, (t) => {
    zs.forEach((z, i) => {
      const k = (t + i / 3) % 1;
      z.position.set(0.75 + k * 0.55, 1.6 + k * 1.0, 0.5);
      z.rotation.z = -0.25 + Math.sin(k * TAU) * 0.15;
      z.scale.setScalar(0.6 + k * 0.6);
      z.material.opacity = 1;
      z.visible = k < 0.92;
    });
    orb.position.y = 1.15 + Math.sin(t * TAU) * 0.08;
    orb.rotation.y = t * TAU;
    inner.material.emissiveIntensity = (o.online ? 2.2 : 1.0) + Math.sin(t * TAU * 2) * 0.6;
    rings.forEach((r, i) => {
      const k = (t * 2 + i / 3) % 1;
      r.scale.setScalar(0.9 + k * 1.1);
      r.material.opacity = o.online ? 0.7 * (1 - k) : 0.25 * (1 - k);
      r.rotation.set(Math.PI / 2 - 0.25, 0, 0);
    });
  });
};

/* 문의 티켓 말풍선 */
SCENES.bubble = (s) => {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  const w = 1.1, h = 0.72, r = 0.32;
  sh.moveTo(-w + r, -h);
  sh.lineTo(-0.15, -h);
  sh.lineTo(-0.42, -h - 0.42);
  sh.lineTo(-0.48, -h);
  sh.lineTo(-w + r, -h);
  sh.moveTo(-w + r, -h);
  sh.lineTo(w - r, -h);
  sh.quadraticCurveTo(w, -h, w, -h + r);
  sh.lineTo(w, h - r);
  sh.quadraticCurveTo(w, h, w - r, h);
  sh.lineTo(-w + r, h);
  sh.quadraticCurveTo(-w, h, -w, h - r);
  sh.lineTo(-w, -h + r);
  sh.quadraticCurveTo(-w, -h, -w + r, -h);
  const tail = new THREE.Shape();
  tail.moveTo(-0.6, -h + 0.05);
  tail.lineTo(-0.15, -h + 0.05);
  tail.lineTo(-0.62, -h - 0.45);
  tail.closePath();
  const body = mesh(extrude(sh, 0.3, 0.12, 6), plastic(0x38bdf8, { r: 0.22 }));
  const tl = mesh(new THREE.ExtrudeGeometry(tail, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.12, bevelSegments: 6 }), plastic(0x38bdf8, { r: 0.22 }));
  tl.position.z = -0.15;
  g.add(body, tl);
  const dots = [-0.5, 0, 0.5].map((x) => {
    const d = mesh(new THREE.SphereGeometry(0.15, 24, 16), plastic(0xffffff));
    d.position.set(x, 0, 0.28);
    g.add(d);
    return d;
  });
  const qb = new THREE.Group();
  const qd = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 40), plastic(0xfbbf24, { e: 0xf59e0b, ei: 0.2 }));
  qd.rotation.x = Math.PI / 2;
  const qt = text3d("?", 0.3, 0.05, plastic(0xffffff));
  qt.position.z = 0.08;
  qb.add(qd, qt);
  qb.position.set(1.05, 0.72, 0.25);
  g.add(qb);
  g.position.y = 1.25;
  s.add(g);
  return bannerFrame(s, { glow: 0x0369a1, ring: 0x38bdf8, rim: 0x38bdf8 }, (t) => {
    g.rotation.y = Math.sin(t * TAU) * 0.35;
    g.position.y = 1.25 + Math.sin(t * TAU) * 0.08;
    dots.forEach((d, i) => (d.position.y = Math.max(0, Math.sin(t * TAU * 2 - i * 0.9)) * 0.18));
    qb.rotation.z = Math.sin(t * TAU * 2) * 0.2;
  });
};

/* FRESH MFA: 방패 + 체크 + 잎 */
SCENES.shield = (s) => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.1);
  sh.bezierCurveTo(0.45, 0.95, 0.8, 0.95, 0.95, 0.9);
  sh.bezierCurveTo(0.95, 0.1, 0.7, -0.6, 0, -1.1);
  sh.bezierCurveTo(-0.7, -0.6, -0.95, 0.1, -0.95, 0.9);
  sh.bezierCurveTo(-0.8, 0.95, -0.45, 0.95, 0, 1.1);
  const g = new THREE.Group();
  const outer = mesh(extrude(sh, 0.28, 0.1, 8), plastic(0x22c55e, { r: 0.2 }));
  const inner = mesh(extrude(sh, 0.1, 0.05, 4), plastic(0xbbf7d0, { r: 0.3 }));
  inner.scale.setScalar(0.78);
  inner.position.z = 0.22;
  const chk = mesh(tube([[-0.38, 0.0, 0.36], [-0.1, -0.3, 0.36], [0.42, 0.35, 0.36]], 0.11, 48), plastic(0x15803d, { r: 0.2 }));
  g.add(outer, inner, chk);
  g.position.y = 1.2;
  s.add(g);
  const leafS = new THREE.Shape();
  leafS.moveTo(0, -0.22);
  leafS.quadraticCurveTo(0.18, 0, 0, 0.22);
  leafS.quadraticCurveTo(-0.18, 0, 0, -0.22);
  const leaves = [0, 1, 2, 3, 4].map((i) => {
    const l = mesh(extrude(leafS, 0.03, 0.02, 2), plastic([0x4ade80, 0x22c55e, 0x86efac][i % 3]));
    s.add(l);
    return l;
  });
  return bannerFrame(s, { glow: 0x15803d, ring: 0x22c55e, rim: 0x4ade80 }, (t) => {
    g.rotation.y = Math.sin(t * TAU) * 0.45;
    g.position.y = 1.2 + Math.sin(t * TAU * 2) * 0.06;
    leaves.forEach((l, i) => {
      const k = (t + i / 5) % 1;
      l.position.set(Math.sin(i * 2.3) * 1.5 + Math.sin(k * TAU * 2) * 0.2, 2.8 - k * 2.8, 0.5 + Math.cos(i) * 0.4);
      l.rotation.set(k * 6 + i, k * 4, k * 8);
    });
  });
};

/* 망토 진열대 */
SCENES.capes = (s) => {
  const cols = [[0x7c3aed, 0xfbbf24], [0xef4444, 0xfde68a], [0x0ea5e9, 0xe0f2fe], [0x22c55e, 0x14532d], [0xf472b6, 0xffffff]];
  const rail = mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 16), chrome());
  rail.rotation.z = Math.PI / 2;
  rail.position.y = 1.95;
  s.add(rail);
  for (const x of [-1.6, 1.6]) {
    const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 16), chrome());
    post.position.set(x, 0.98, 0);
    s.add(post);
  }
  const capes = cols.map(([a, b], i) => {
    const tex = canvasTex(10, 16, (c) => {
      c.fillStyle = "#" + a.toString(16).padStart(6, "0");
      c.fillRect(0, 0, 10, 16);
      c.fillStyle = "#" + b.toString(16).padStart(6, "0");
      if (i % 2) { c.fillRect(0, 6, 10, 3); c.fillRect(4, 0, 2, 16); }
      else { c.fillRect(3, 4, 4, 4); c.fillRect(2, 10, 6, 2); }
    }, true);
    const geo = new THREE.PlaneGeometry(0.52, 0.95, 6, 10);
    const m = mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    m.userData.base = geo.attributes.position.array.slice();
    const piv = new THREE.Group();
    piv.position.set(-1.2 + i * 0.6, 1.9, 0);
    m.position.y = -0.5;
    piv.add(m);
    const hook = mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 20, Math.PI * 1.5), chrome());
    hook.position.y = 0.03;
    piv.add(hook);
    s.add(piv);
    return { piv, m };
  });
  return bannerFrame(s, { glow: 0xb45309, ring: 0xfbbf24, rim: 0xffc53d }, (t) => {
    capes.forEach(({ piv, m }, i) => {
      piv.rotation.y = -0.5 + Math.sin(t * TAU + i * 0.9) * 0.25;
      const p = m.geometry.attributes.position;
      const b = m.userData.base;
      for (let k = 0; k < p.count; k++) {
        const y = b[k * 3 + 1];
        const d = (0.475 - y) / 0.95;
        p.setZ(k, Math.sin(t * TAU * 2 + i + y * 4) * 0.08 * d);
      }
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
    });
  });
};

/* 재고현황: 쌓인 상자 + 체크 배지 */
SCENES.crates = (s) => {
  const crateTex = canvasTex(128, 128, (c) => {
    c.fillStyle = "#c98a4b"; c.fillRect(0, 0, 128, 128);
    c.fillStyle = "#a96d36";
    for (let i = 0; i < 4; i++) c.fillRect(0, 8 + i * 32, 128, 4);
    c.fillStyle = "#7c4a22"; c.fillRect(0, 0, 128, 10); c.fillRect(0, 118, 128, 10); c.fillRect(0, 0, 10, 128); c.fillRect(118, 0, 10, 128);
  });
  const mat = plastic(0xffffff, { map: crateTex, r: 0.55, cc: 0.3 });
  const boxes = [[-0.7, 0.45, 0], [0.7, 0.45, 0.1], [0, 1.35, 0.05], [0.05, 0.45, -0.9]].map(([x, y, z], i) => {
    const b = mesh(rbox(0.9, 0.9, 0.9, 0.08), mat);
    b.position.set(x, y, z);
    b.rotation.y = (i - 1) * 0.15;
    s.add(b);
    return b;
  });
  const badge = new THREE.Group();
  const disc = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 48), plastic(0x22c55e, { r: 0.2 }));
  disc.rotation.x = Math.PI / 2;
  const chk = mesh(tube([[-0.18, 0.0, 0.1], [-0.05, -0.13, 0.1], [0.2, 0.15, 0.1]], 0.055, 32), plastic(0xffffff));
  badge.add(disc, chk);
  badge.position.set(1.15, 2.2, 0.4);
  s.add(badge);
  return bannerFrame(s, { glow: 0xb45309, ring: 0xfbbf24, ring2: 0x22c55e, rim: 0xffc53d }, (t) => {
    boxes.forEach((b, i) => (b.position.y = [0.45, 0.45, 1.35, 0.45][i] + Math.max(0, Math.sin(t * TAU * 2 - i * 0.8)) * 0.08));
    badge.rotation.y = Math.sin(t * TAU) * 0.6;
    badge.scale.setScalar(1 + 0.1 * Math.pow(Math.max(0, Math.sin(t * TAU * 2)), 3));
  });
};

/* 이용후기: 별 다섯 개 + 말풍선 */
SCENES.stars = (s) => {
  const starsG = [0, 1, 2, 3, 4].map((i) => {
    const m = mesh(extrude(starShape(0.32, 0.14), 0.12, 0.06, 4), gold({ c: 0xffc53d, r: 0.18 }));
    m.position.set(-1.2 + i * 0.6, 2.1, 0.3);
    s.add(m);
    return m;
  });
  const bub = new THREE.Group();
  const body = mesh(rbox(2.2, 1.2, 0.3, 0.3), plastic(0xffffff, { r: 0.3 }));
  const tail = mesh(new THREE.ConeGeometry(0.2, 0.4, 4), plastic(0xffffff, { r: 0.3 }));
  tail.rotation.z = Math.PI;
  tail.position.set(-0.6, -0.7, 0);
  bub.add(body, tail);
  for (let i = 0; i < 3; i++) {
    const line = mesh(rbox(i === 2 ? 1.0 : 1.6, 0.12, 0.05, 0.05), plastic(0xe5e7eb, { r: 0.4 }));
    line.position.set(i === 2 ? -0.3 : 0, 0.3 - i * 0.28, 0.17);
    bub.add(line);
  }
  const heart = makeHeart(0.16, 0xf43f5e);
  heart.position.set(0.85, -0.26, 0.2);
  bub.add(heart);
  bub.position.set(0, 0.95, 0.1);
  s.add(bub);
  return bannerFrame(s, { glow: 0xdb2777, ring: 0xf472b6, rim: 0xffc53d, spark: 0xfff3c4 }, (t) => {
    starsG.forEach((m, i) => {
      const k = Math.max(0, Math.sin(t * TAU * 2 - i * 0.6));
      m.position.y = 2.1 + k * 0.12;
      m.rotation.y = Math.sin(t * TAU + i) * 0.4;
    });
    bub.rotation.y = Math.sin(t * TAU) * 0.3;
    heart.scale.setScalar(1 + 0.15 * Math.pow(Math.max(0, Math.sin(t * TAU * 3)), 4));
  });
};

/* 도스소개: 입체 DOES 로고 + 보석 */
SCENES.logo = (s) => {
  const word = text3d("DOES", 0.62, 0.22, plastic(0xffffff, { r: 0.18 }), { bt: 0.06, bs: 0.035 });
  word.position.set(0, 1.0, 0.2);
  s.add(word);
  const gem = diamondMesh(0xc4b5fd, 0.36);
  gem.material.transmission = 0.15;
  gem.material.emissiveIntensity = 0.55;
  gem.position.set(0, 2.05, 0.2);
  s.add(gem);
  const ring = mesh(new THREE.TorusGeometry(1.5, 0.03, 12, 128), glow(0xa855f7, 2.5), false, false);
  ring.position.set(0, 1.05, -0.3);
  s.add(ring);
  return bannerFrame(s, { glow: 0x7c3aed, ring: 0xa855f7, rim: 0xa78bfa }, (t) => {
    word.rotation.y = Math.sin(t * TAU) * 0.35;
    gem.rotation.y = t * TAU;
    gem.position.y = 2.05 + Math.sin(t * TAU * 2) * 0.08;
    ring.rotation.set(0.25, Math.sin(t * TAU) * 0.35, 0);
    ring.scale.setScalar(1 + 0.03 * Math.sin(t * TAU * 2));
  });
};

/* ─────────── 결과: 출석 (달력에 고무도장 쾅) ─────────── */
SCENES.checkin = (s, o) => {
  const st = studio(s, { glow: o.gold ? 0xd97706 : 0x7c3aed, ring: o.gold ? 0xfbbf24 : 0xa855f7, podiumR: 1.9, podiumY: -1.35, haloSize: 9, hy: 0 });
  const { g: cal, ink } = makeCalendar(o.gold);
  s.add(cal);
  const stamp = makeStamp(o.gold);
  s.add(stamp);
  const conf = o.gold ? confetti(s, 80, 4, { x0: -3.8, x1: 3.8, z0: -1, z1: 2, y0: -1.4, y1: 2.6 }) : null;
  const sp = sparkles(s, [[-1.6, 1.4, 1, 0.5, 0], [1.9, 1.0, 1, 0.45, 2], [1.7, -0.9, 1.2, 0.4, 4], [-1.9, -0.6, 1, 0.38, 1]], o.gold ? 0xffe6a0 : 0xffffff);
  const coins = [];
  const r = rng(12);
  for (let i = 0; i < 10; i++) {
    const c = coinMesh(0.16);
    c.userData = { a: (i / 10) * TAU + r() * 0.3, sp: 1.6 + r() * 1.2, up: 2.4 + r() * 1.2 };
    s.add(c);
    coins.push(c);
  }
  cam(0, 3.2, 6.4, 0, -0.35, 0);
  const HIT = 0.36;
  return (t) => {
    st.anim(t);
    cal.position.y = -0.55 + 0.5 * (1 - easeOut(seg(t, 0, 0.18))) - 0.05 * bump(t, HIT, HIT + 0.08);
    cal.rotation.set(-0.95, Math.sin(t * TAU) * 0.05, 0);
    // 도장: 화면 쪽에서 달력으로 쾅 → 다시 물러남
    let d;
    if (t < 0.2) d = 3;
    else if (t < HIT) d = lerp(2.2, 0, easeIn(seg(t, 0.2, HIT)));
    else d = lerp(0, 1.4, easeOut(seg(t, HIT + 0.06, 0.62)));
    stamp.visible = t >= 0.2 && t < 0.62;
    const sq = t >= HIT && t < HIT + 0.06 ? 1 - 0.15 * Math.sin(seg(t, HIT, HIT + 0.06) * Math.PI) : 1;
    stamp.scale.set(1, sq, 1);
    // 달력 면의 법선 방향으로 내려찍는다
    const nrm = new THREE.Vector3(0, 0, 1).applyEuler(cal.rotation);
    const hitPt = new THREE.Vector3(0.45, -0.35, 0.09).applyEuler(cal.rotation).add(cal.position);
    stamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    stamp.position.copy(hitPt).addScaledVector(nrm, d);
    ink.visible = t >= HIT;
    ink.scale.setScalar(t >= HIT ? 1 + 0.25 * (1 - easeOut(seg(t, HIT, HIT + 0.08))) : 1);
    sp(t, t > HIT ? 1 : 0);
    if (conf) conf(t, t > HIT ? 1 : 0);
    coins.forEach((c) => {
      const u = c.userData;
      const k = seg(t, HIT, HIT + 0.45);
      c.visible = t > HIT && k < 1;
      c.position.set(0.45 + Math.cos(u.a) * u.sp * k, -0.6 + u.up * k - 4.5 * k * k, 0.6 + Math.sin(u.a) * 0.6 * k);
      c.rotation.set(t * 22 + u.a, t * 9, 0);
    });
  };
};

/* ─────────── 결과: 도박 (슬롯머신) ─────────── */
function reelTexture() {
  // 기호를 직접 그린다. 원통을 눕혀서 쓰므로 둘레 방향(u) = 화면 세로
  return canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = "#fffdf7";
    c.fillRect(0, 0, w, h);
    const cell = w / 4;
    const draw = [
      () => {
        c.font = "bold 190px DejaVu Sans";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineWidth = 14;
        c.strokeStyle = "#7f1d1d";
        c.strokeText("7", 0, 10);
        c.fillStyle = "#ef4444";
        c.fillText("7", 0, 10);
      },
      () => {
        c.strokeStyle = "#15803d";
        c.lineWidth = 10;
        c.beginPath();
        c.moveTo(-34, 10);
        c.quadraticCurveTo(-10, -60, 22, -74);
        c.moveTo(34, 18);
        c.quadraticCurveTo(20, -50, 22, -74);
        c.stroke();
        c.fillStyle = "#22c55e";
        c.beginPath();
        c.ellipse(40, -70, 26, 12, -0.4, 0, TAU);
        c.fill();
        for (const [x, y] of [[-34, 38], [34, 46]]) {
          c.fillStyle = "#dc2626";
          c.beginPath();
          c.arc(x, y, 38, 0, TAU);
          c.fill();
          c.fillStyle = "rgba(255,255,255,0.6)";
          c.beginPath();
          c.arc(x - 12, y - 12, 9, 0, TAU);
          c.fill();
        }
      },
      () => {
        c.fillStyle = "#f59e0b";
        c.beginPath();
        c.moveTo(-60, 50);
        c.quadraticCurveTo(-50, -70, 0, -74);
        c.quadraticCurveTo(50, -70, 60, 50);
        c.closePath();
        c.fill();
        c.fillStyle = "#b45309";
        c.fillRect(-70, 44, 140, 18);
        c.beginPath();
        c.arc(0, 74, 16, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.fillRect(-36, -40, 12, 70);
      },
      () => {
        c.fillStyle = "#3b82f6";
        c.beginPath();
        c.moveTo(-70, -30);
        c.lineTo(-40, -70);
        c.lineTo(40, -70);
        c.lineTo(70, -30);
        c.lineTo(0, 74);
        c.closePath();
        c.fill();
        c.fillStyle = "#93c5fd";
        c.beginPath();
        c.moveTo(-40, -70);
        c.lineTo(-20, -30);
        c.lineTo(20, -30);
        c.lineTo(40, -70);
        c.closePath();
        c.fill();
        c.fillStyle = "#1d4ed8";
        c.beginPath();
        c.moveTo(20, -30);
        c.lineTo(70, -30);
        c.lineTo(0, 74);
        c.closePath();
        c.fill();
      },
    ];
    for (let i = 0; i < 4; i++) {
      c.save();
      c.translate((i + 0.5) * cell, h / 2);
      c.rotate(Math.PI / 2);
      c.scale(0.9, 0.9);
      draw[i]();
      c.restore();
      c.fillStyle = "#ddd6fe";
      c.fillRect((i + 1) * cell - 4, 0, 8, h);
    }
  });
}
SCENES.slot = (s, o) => {
  const st = studio(s, { glow: o.win ? 0xd97706 : 0x7c3aed, podiumR: 2.3, podiumY: -1.65, haloSize: 10, hy: 0.2 });
  const g = new THREE.Group();
  s.add(g);
  g.add(mesh(rbox(3.2, 2.6, 1.6, 0.25), plastic(0x7c3aed, { r: 0.28 })));
  for (const [h2, y2] of [[0.42, 0.98], [1.0, -0.82]]) {
    const front = mesh(rbox(2.9, h2, 0.1, 0.08), plastic(0x8b5cf6, { r: 0.3 }));
    front.position.set(0, y2, 0.82);
    g.add(front);
  }
  const marquee = mesh(rbox(3.0, 0.75, 1.3, 0.3), plastic(0xa78bfa, { r: 0.25 }));
  marquee.position.y = 1.62;
  g.add(marquee);
  const sign = text3d("777", 0.36, 0.08, plastic(0xffd34d, { e: 0xffa000, ei: 0.4 }));
  sign.position.set(0, 1.64, 0.7);
  g.add(sign);
  const bulbs = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const b = mesh(new THREE.SphereGeometry(0.065, 16, 10), glow(0xffe08a, 2));
    b.position.set(Math.cos(a) * 1.35, 1.62 + Math.sin(a) * 0.28, 0.66);
    g.add(b);
    bulbs.push(b);
  }
  const winM = mesh(rbox(2.5, 1.2, 0.1, 0.05), plastic(0x1e1538, { r: 0.4 }));
  winM.position.set(0, 0.2, 0.3);
  g.add(winM);
  for (const [w2, h2, x2, y2] of [[2.66, 0.1, 0, 0.83], [2.66, 0.1, 0, -0.43], [0.1, 1.36, -1.28, 0.2], [0.1, 1.36, 1.28, 0.2], [0.06, 1.2, -0.4, 0.2], [0.06, 1.2, 0.4, 0.2]]) {
    const bar = mesh(rbox(w2, h2, 0.14, 0.04), chrome(0xe9d5ff, 0.18));
    bar.position.set(x2, y2, 1.0);
    g.add(bar);
  }
  const tex = reelTexture();
  const reels = [];
  for (let r = 0; r < 3; r++) {
    const reel = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.72, 64, 1, true), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, side: THREE.DoubleSide }), false);
    reel.rotation.z = Math.PI / 2;
    reel.rotation.order = "ZXY";
    reel.position.set(-0.8 + r * 0.8, 0.2, 0.36);
    g.add(reel);
    reels.push(reel);
  }
  const glass = mesh(new THREE.PlaneGeometry(2.45, 1.15), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1 }), false, false);
  glass.position.set(0, 0.2, 1.05);
  g.add(glass);
  const payline = mesh(new THREE.BoxGeometry(2.5, 0.03, 0.02), glow(0xff3b5c, 2), false, false);
  payline.position.set(0, 0.2, 1.06);
  g.add(payline);
  for (let i = 0; i < 3; i++) {
    const c = [0xef4444, 0xfbbf24, 0x22c55e][i];
    const btn = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 32), plastic(c, { e: c, ei: 0.25 }));
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.55 + i * 0.55, -0.68, 0.86);
    g.add(btn);
  }
  const tray = mesh(rbox(1.8, 0.3, 0.6, 0.1), chrome(0xd8dbe8, 0.2));
  tray.position.set(0, -1.12, 0.95);
  g.add(tray);
  const lever = new THREE.Group();
  const stick = mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.3, 16), chrome());
  stick.position.y = 0.65;
  const knob = mesh(new THREE.SphereGeometry(0.2, 32, 20), plastic(0xef4444, { r: 0.12 }));
  knob.position.y = 1.32;
  const hub = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 24), chrome());
  hub.rotation.z = Math.PI / 2;
  lever.add(stick, knob, hub);
  lever.position.set(1.72, 0.0, 0.1);
  g.add(lever);
  g.position.y = -0.1;

  const result = o.win ? [0, 0, 0] : [0, 0, 1];
  const stops = [0.38, 0.47, 0.56];
  const coins = [];
  const r = rng(21);
  for (let i = 0; i < 22; i++) {
    const c = coinMesh(0.17);
    c.userData = { a: -Math.PI / 2 + (r() - 0.5) * 2.6, sp: 1.6 + r() * 2.2, up: 2.2 + r() * 2.2, d: r() * 0.08 };
    s.add(c);
    coins.push(c);
  }
  const conf = o.win ? confetti(s, 70, 5, { x0: -3.6, x1: 3.6, z0: -1, z1: 2, y0: -1.6, y1: 2.8 }) : null;
  const puff = o.win ? null : smoke(s, 7);
  const sp = sparkles(s, [[-2.1, 1.6, 1, 0.5, 0], [2.3, 1.2, 1, 0.45, 2], [2.1, -1.0, 1.2, 0.4, 4]], 0xffe6a0);
  const symbolAngle = (i) => (o.symOffset ?? Math.PI * 1.5) + ((i + 0.5) / 4) * TAU;
  cam(0, 0.5, 8.0, 0, 0.25, 0);
  return (t0) => {
    // spin: 결과 없이 계속 도는 연출 (기다리는 화면용)
    const t = o.spin ? (t0 * 0.3) % 0.3 + 0.02 : t0;
    st.anim(t);
    const done = !o.spin && t >= 0.58;
    g.rotation.y = -0.2 + Math.sin(t * TAU) * 0.05;
    lever.rotation.x = t < 0.1 ? easeOut(t / 0.1) * 1.0 : 1.0 * (1 - easeOut(seg(t, 0.1, 0.2)));
    reels.forEach((reel, i) => {
      const target = symbolAngle(result[i]);
      if (t < stops[i]) reel.rotation.y = target + Math.pow(stops[i] - t, 1.3) * 70;
      else reel.rotation.y = target - Math.sin(Math.min(1, (t - stops[i]) / 0.05) * Math.PI) * 0.15;
    });
    bulbs.forEach((b, i) => {
      const on = o.win && done ? Math.floor(t * 40) % 2 === 0 : (Math.floor(t * 24) + i) % 3 === 0;
      b.material.emissiveIntensity = on ? 3 : 0.3;
    });
    payline.material.emissiveIntensity = done ? (o.win ? 4 : 0.6) : 1.5;
    g.position.x = !o.win && done ? Math.sin(t * 90) * 0.06 * (1 - seg(t, 0.58, 0.7)) : 0;
    coins.forEach((c) => {
      const u = c.userData;
      const k = o.win ? seg(t, 0.6 + u.d, 1) : 0;
      c.visible = o.win && k > 0 && k < 1;
      c.position.set(Math.cos(u.a) * u.sp * k * 1.4, -1.0 + u.up * k - 3.6 * k * k, 1.3 + k);
      c.rotation.set(t * 20 + u.a, t * 12, 0);
    });
    sp(t, o.win && done ? 1 : 0);
    if (conf) conf(t, done ? 1 : 0);
    if (puff) puff(0.0, 0.6, 1.4, seg(t, 0.6, 1));
  };
};

/* ─────────── 결과: 다이아 채굴 (픽셀 블록 · 픽셀 곡괭이) ─────────── */
function outline(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const out = [...cells];
  for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = `${x + dx},${y + dy}`;
    if (!set.has(k) && x + dx >= 0 && x + dx < 16 && y + dy >= 0 && y + dy < 16) {
      set.add(k);
      out.push([x + dx, y + dy, "#1b1530"]);
    }
  }
  return out;
}
function pickaxeCells() {
  const map = new Map();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 3.5, dy = y - 12.5;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(-dy, dx);
    if (d > 9.4 && d < 12.0 && a > 0.05 && a < Math.PI / 2 - 0.05) map.set(`${15 - x},${y}`, [15 - x, y, d > 11.1 ? "#d6fbff" : d > 10.2 ? "#4fd8ef" : "#2aa9c8"]);
  }
  for (let i = 1; i <= 10; i++) map.set(`${15 - i},${15 - i}`, [15 - i, 15 - i, i % 3 === 0 ? "#6b4423" : "#9a6232"]);
  return outline([...map.values()]);
}
function diamondCells() {
  const cells = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const cx = 7.5;
    let c = null;
    if (y >= 3 && y <= 6 && Math.abs(x - cx) <= 2.5 + (y - 3)) c = y === 3 ? "#e8fdff" : x < cx - 1 ? "#b8f4ff" : "#5fdcef";
    else if (y >= 7 && y <= 12 && Math.abs(x - cx) <= 5.5 - (y - 7) * 1.0) c = x < cx ? "#4fd8ef" : "#249cc0";
    if (c) cells.push([x, y, c]);
  }
  return outline(cells);
}
function voxelSprite(cells, size = 0.12, depth = 0.12, emissive = 0) {
  const g = new THREE.Group();
  const geo = new RoundedBoxGeometry(size, size, depth, 2, size * 0.12);
  const byColor = new Map();
  cells.forEach(([x, y, c]) => {
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push([x, y]);
  });
  for (const [c, list] of byColor) {
    const mat = plastic(c, { r: 0.35, cc: 0.5, e: c === "#1b1530" ? 0 : emissive ? c : 0, ei: emissive });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, y], i) => {
      m4.makeTranslation((x - 7.5) * size, (7.5 - y) * size, 0);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    g.add(im);
  }
  return g;
}
function stoneTex(seed, ore, crack = 0, dark = false) {
  return canvasTex(16, 16, (c) => {
    const r = rng(seed);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = (dark ? 62 : 118) + ((r() * 40) | 0);
      c.fillStyle = `rgb(${v},${v + 2},${v + (dark ? 16 : 10)})`;
      c.fillRect(x, y, 1, 1);
    }
    if (ore) {
      for (const [x, y] of [[3, 2], [10, 3], [6, 7], [12, 9], [2, 11], [8, 12]]) {
        c.fillStyle = "#1b4f63";
        c.fillRect(x - 1, y - 1, 4, 3);
        c.fillStyle = "#4fe0f5";
        c.fillRect(x, y, 2, 2);
        c.fillStyle = "#cffaff";
        c.fillRect(x, y, 1, 1);
      }
    }
    c.fillStyle = "#14101f";
    const cracks = [[[8, 0], [8, 3], [7, 5], [9, 7], [8, 9]], [[8, 9], [11, 10], [12, 13], [14, 15]], [[7, 5], [4, 6], [2, 9], [0, 10]]];
    for (let i = 0; i < crack; i++) {
      const pts = cracks[i];
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let j = 0; j <= n; j++) c.fillRect(Math.round(x0 + ((x1 - x0) * j) / n), Math.round(y0 + ((y1 - y0) * j) / n), 1, 1);
      }
    }
  }, true);
}
/* 광석 벽용 텍스처 (금 · 레드스톤 · 다이아) */
function oreWallTex(seed, ore) {
  return canvasTex(16, 16, (c) => {
    const r = rng(seed);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = 46 + ((r() * 26) | 0);
      c.fillStyle = `rgb(${v},${v + 3},${v + 14})`;
      c.fillRect(x, y, 1, 1);
    }
    const col = { gold: ["#7a5a10", "#f5c542", "#fff2a8"], red: ["#5a0e0e", "#e11d2a", "#ff8a8a"], dia: ["#1b4f63", "#4fe0f5", "#cffaff"] }[ore];
    if (!col) return;
    for (const [x, y] of [[3, 3], [10, 2], [7, 8], [12, 11], [2, 12]]) {
      c.fillStyle = col[0];
      c.fillRect(x - 1, y - 1, 4, 3);
      c.fillStyle = col[1];
      c.fillRect(x, y, 2, 2);
      c.fillStyle = col[2];
      c.fillRect(x, y, 1, 1);
    }
  }, true);
}
function torchCells() {
  const cells = [];
  for (let y = 6; y < 16; y++) cells.push([7, y, y > 12 ? "#6b4423" : "#9a6232"], [8, y, y > 12 ? "#5a3a1e" : "#8a5a2c"]);
  cells.push([7, 5, "#ffd23f"], [8, 5, "#ffb020"], [7, 4, "#fff3a0"], [8, 4, "#ffd23f"], [7, 3, "#ffe680"]);
  return cells;
}
function xpOrb() {
  const g = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.09, 2), new THREE.MeshStandardMaterial({ color: 0xc8ff6a, emissive: 0x9cff3a, emissiveIntensity: 2.2, roughness: 0.3 }), false, false);
  g.add(core);
  addSprite(g, radialTex, new THREE.Color(0x9cff3a), 0.5, [0, 0, 0], 0.7);
  return g;
}
function raysTex() {
  return canvasTex(512, 512, (c, w) => {
    const m = w / 2;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = a0 + TAU / 40;
      const g = c.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(m, m);
      c.arc(m, m, m, a0, a1);
      c.closePath();
      c.fill();
    }
  });
}
function raysPlane(s, color, size, pos) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: raysTex(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(...pos);
  s.add(m);
  return m;
}
function motes(s, count, seed, box, color = 0xbfd8ff) {
  const r = rng(seed);
  const list = [];
  for (let i = 0; i < count; i++) {
    const sp = addSprite(s, radialTex, new THREE.Color(color), 0.06 + r() * 0.08, [box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0), box.z0 + r() * (box.z1 - box.z0)], 0.3 + r() * 0.5);
    sp.userData = { y: sp.position.y, x: sp.position.x, ph: r() * TAU };
    list.push(sp);
  }
  return (t) => list.forEach((m) => {
    const u = m.userData;
    m.position.y = u.y + Math.sin(t * TAU + u.ph) * 0.12;
    m.position.x = u.x + Math.cos(t * TAU + u.ph) * 0.08;
  });
}

SCENES.mine = (s, o) => {
  const st = studio(s, { glow: 0x1d4ed8, podium: false, haloSize: 12, hy: 0.6, hx: -0.3, rim: 0x60a5fa, rim2: 0x38bdf8, top: "#0c1638", bot: "#05060f", bokeh: 0, key: 1.1, hemi: 0.25, env: 0.18 });
  s.fog = new THREE.Fog(0x070b1f, 7, 15);
  // 동굴 벽 (광석 섞인 돌)
  const plain = [5, 6, 7].map((k) => new THREE.MeshStandardMaterial({ map: oreWallTex(k, null), roughness: 0.95 }));
  const ores = {
    gold: new THREE.MeshStandardMaterial({ map: oreWallTex(11, "gold"), roughness: 0.8, emissive: 0x3a2a00, emissiveIntensity: 0.3 }),
    red: new THREE.MeshStandardMaterial({ map: oreWallTex(12, "red"), roughness: 0.8, emissive: 0x4a0000, emissiveIntensity: 0.6 }),
    dia: new THREE.MeshStandardMaterial({ map: oreWallTex(13, "dia"), roughness: 0.8, emissive: 0x00303a, emissiveIntensity: 0.6 }),
  };
  const r = rng(77);
  const box1 = new THREE.BoxGeometry(1, 1, 1);
  for (let x = -7; x <= 7; x++) for (let y = 0; y < 7; y++) {
    const pick = r();
    const mat = pick < 0.05 ? ores.dia : pick < 0.1 ? ores.gold : pick < 0.15 ? ores.red : plain[(((x + y * 3) % 3) + 3) % 3];
    const b = mesh(box1, mat, false, true);
    b.position.set(x * 1.0 - 0.3, -1.7 + y + 0.5, -3.2 - ((x * 5 + y * 7) % 3 === 0 ? 0.25 : 0));
    s.add(b);
  }
  // 바닥 블록
  const floorMats = [8, 9, 10].map((k) => new THREE.MeshStandardMaterial({ map: oreWallTex(k, null), roughness: 0.95 }));
  for (let x = -7; x <= 7; x++) for (let z = -3; z <= 2; z++) {
    const b = mesh(box1, floorMats[(((x * 7 + z * 13) % 3) + 3) % 3], false, true);
    b.userData.floor = true;
    b.position.set(x - 0.3, -2.2 - (((x * 7 + z * 3) % 4) === 0 ? 0.05 : 0), z);
    s.add(b);
  }
  // 횃불 두 개 (깜빡이는 따뜻한 빛)
  const torchLights = [];
  const torchGlows = [];
  for (const [tx, ty] of [[-3.3, 0.8], [2.9, 0.9]]) {
    const tq = voxelSprite(torchCells(), 0.07, 0.07, 1.6);
    tq.position.set(tx, ty, -2.55);
    tq.rotation.z = tx < 0 ? -0.25 : 0.25;
    s.add(tq);
    const pl = new THREE.PointLight(0xffa040, 9, 7, 1.4);
    pl.position.set(tx, ty + 0.5, -2.2);
    s.add(pl);
    torchGlows.push(addSprite(s, radialTex, new THREE.Color(0xff9a30), 1.8, [tx, ty + 0.35, -2.4], 0.45));
    torchLights.push(pl);
  }
  if (o.dbg) s.traverse((m) => { if (m.isMesh && m.geometry === box1 && (o.dbg === "nofloor") === !!m.userData.floor) m.visible = false; });
  const dust = motes(s, 14, 5, { x0: -4, x1: 4, y0: -1.4, y1: 2.2, z0: -2, z1: 1.5 });

  const texs = [0, 1, 2, 3].map((k) => stoneTex(3, true, k));
  const blockMat = new THREE.MeshStandardMaterial({ map: texs[0], roughness: 0.85 });
  const block = mesh(new THREE.BoxGeometry(2, 2, 2), blockMat);
  block.position.set(-0.6, -0.7, 0);
  s.add(block);
  const blockGlow = addSprite(s, radialTex, new THREE.Color(0x4fe0f5), 3.6, [-0.6, -0.6, -1.2], 0.25);
  const spot = new THREE.SpotLight(0xdbe8ff, 40, 14, 0.5, 0.6, 1.2);
  spot.position.set(1.5, 4.5, 4);
  spot.target.position.set(-0.3, -1, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  s.add(spot, spot.target);

  // 곡괭이 + 잔상 두 개
  const makePick = (op) => {
    const pk = new THREE.Group();
    const spr = voxelSprite(pickaxeCells(), 0.15, 0.15);
    if (op < 1) spr.traverse((m) => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = op; m.material.depthWrite = false; } });
    spr.position.set(-6.5 * 0.15, 6.5 * 0.15, 0);
    pk.add(spr);
    pk.position.set(2.15, -1.75, 0.9);
    s.add(pk);
    return pk;
  };
  const pick = makePick(1);
  const ghosts = [makePick(0.28), makePick(0.12)];

  const shards = [];
  const shardMat = new THREE.MeshStandardMaterial({ map: texs[3], roughness: 0.85 });
  for (let i = 0; i < 46; i++) {
    const m = mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), shardMat);
    m.userData = { p: new THREE.Vector3((r() - 0.5) * 1.8, (r() - 0.5) * 1.8, (r() - 0.5) * 1.8), v: new THREE.Vector3((r() - 0.5) * 6, 2 + r() * 4, (r() - 0.5) * 3 + 1.2), rv: r() * 12 };
    m.visible = false;
    s.add(m);
    shards.push(m);
  }
  const dia = voxelSprite(diamondCells(), 0.11, 0.11, 0.05);
  dia.visible = false;
  s.add(dia);
  const diaShadow = mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }), false, false);
  diaShadow.rotation.x = -Math.PI / 2;
  diaShadow.position.set(-0.6, -1.69, 0.4);
  diaShadow.visible = false;
  s.add(diaShadow);
  const rays = raysPlane(s, new THREE.Color(o.kind === "win" ? 0x8fe8ff : 0x8888aa), 6, [-0.6, -0.2, -0.6]);
  const orbs = [];
  for (let i = 0; i < 9; i++) {
    const ob = xpOrb();
    ob.userData = { a: (i / 9) * TAU + r() * 0.4, sp: 1.2 + r() * 1.2, up: 1.6 + r() * 1.5 };
    ob.visible = false;
    s.add(ob);
    orbs.push(ob);
  }
  const cobble = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ map: stoneTex(9, false, 2), roughness: 0.9 }));
  cobble.visible = false;
  s.add(cobble);
  const conf = o.kind === "win" ? confetti(s, 60, 9, { x0: -3.6, x1: 3.6, z0: -1, z1: 2, y0: -1.6, y1: 2.8 }) : null;
  const puff = o.kind === "none" ? smoke(s, 11) : null;
  const light = new THREE.PointLight(0x9fe7ff, 0, 8);
  light.position.set(-0.6, 0.3, 2);
  s.add(light);
  const sp = sparkles(s, [[-1.9, 0.9, 1.4, 0.5, 0], [0.7, 1.0, 1.4, 0.45, 2], [-1.6, -1.2, 1.6, 0.4, 4], [0.6, -1.0, 1.6, 0.38, 1]], 0xd8fbff);
  const chips = [];
  for (let i = 0; i < 12; i++) {
    const m = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), plastic(i % 3 ? 0x9aa0b0 : 0x4fe0f5, { e: i % 3 ? 0 : 0x4fe0f5, ei: 0.6 }), false);
    m.userData = { a: Math.PI * (0.05 + r() * 0.45), sp: 0.8 + r() };
    m.visible = false;
    s.add(m);
    chips.push(m);
  }
  cam(1.1, 1.0, 8.6, 0.2, -0.45, 0);
  const swingAt = (down) => -1.0 + easeIn(down) * 0.62;
  const setPick = (down, prevDown) => {
    pick.rotation.z = swingAt(down);
    ghosts[0].rotation.z = swingAt(prevDown[0]);
    ghosts[1].rotation.z = swingAt(prevDown[1]);
    const moving = Math.abs(prevDown[0] - down) > 0.05;
    ghosts.forEach((g) => (g.visible = moving));
  };
  const flyChips = (k) => chips.forEach((m) => {
    const u = m.userData;
    m.visible = k > 0 && k < 1;
    m.position.set(0.45 + Math.cos(u.a) * u.sp * k, -0.2 + Math.sin(u.a) * u.sp * k * 1.5 - 2 * k * k, 1.1);
    m.rotation.set(k * 9, k * 7, 0);
  });
  return (t) => {
    st.anim(t);

    block.rotation.y = 0.45;
    if (o.kind === "idle") {
      const dn = (tt) => { const ph = ((tt * 2) % 1 + 1) % 1; return ph < 0.55 ? ph / 0.55 : 1 - (ph - 0.55) / 0.45; };
      setPick(dn(t), [dn(t - 0.025), dn(t - 0.05)]);
      const ph = (t * 2) % 1;
      block.position.x = -0.6 - (ph > 0.5 && ph < 0.62 ? 0.06 : 0);
      flyChips(ph > 0.52 ? seg(ph, 0.52, 0.85) : 0);
      sp(t, 0.6);
      return;
    }
    if (t < 0.48) {
      const dn = (tt) => { const ph = (Math.max(0, tt) % 0.16) / 0.16; return ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4; };
      setPick(dn(t), [dn(t - 0.012), dn(t - 0.024)]);
      const ph = (t % 0.16) / 0.16;
      const hits = Math.floor(t / 0.16);
      const hitting = ph > 0.58 && ph < 0.72;
      blockMat.map = texs[Math.min(3, hits + (ph > 0.6 ? 1 : 0))];
      block.position.x = -0.6 - (hitting ? 0.08 : 0);
      block.scale.setScalar(hitting ? 0.97 : 1);
      blockGlow.material.opacity = 0.25 + (hitting ? 0.25 : 0);
      flyChips(ph > 0.58 ? seg(ph, 0.58, 0.95) : 0);
      sp(t, 0);
    } else {
      block.visible = false;
      blockGlow.material.opacity = 0;
      flyChips(0);
      setPick(0, [0, 0]);
      const k = seg(t, 0.48, 0.78);
      shards.forEach((m) => {
        const u = m.userData;
        m.visible = k < 1;
        m.position.set(-0.6 + u.p.x + u.v.x * k, -0.7 + u.p.y + u.v.y * k - 9 * k * k, u.p.z + u.v.z * k);
        m.rotation.set(u.rv * k, u.rv * k * 0.7, 0);
        m.scale.setScalar(Math.max(0.01, 1 - k * 0.7));
      });
      if (o.kind === "win") {
        const p = easeBack(seg(t, 0.52, 0.68));
        dia.visible = diaShadow.visible = t > 0.52;
        dia.scale.setScalar(1.15 * Math.max(0.05, p));
        const bob = Math.sin(t * TAU * 2) * 0.12;
        dia.position.set(-0.6, -0.55 + bob, 0.4);
        dia.rotation.y = t * TAU * 1.2;
        diaShadow.scale.setScalar(0.8 - bob);
        rays.material.opacity = 0.55 * seg(t, 0.52, 0.62);
        rays.rotation.z = 0.3;
        light.intensity = 6 * p;
        orbs.forEach((ob) => {
          const u = ob.userData;
          const kk = seg(t, 0.55, 0.95);
          ob.visible = kk > 0 && kk < 1;
          ob.position.set(-0.6 + Math.cos(u.a) * u.sp * kk, -0.6 + u.up * kk - 3 * kk * kk, 0.6 + Math.sin(u.a) * 0.8 * kk + kk);
        });
        conf(t, t > 0.55 ? 1 : 0);
        sp(t, t > 0.55 ? 1 : 0);
      } else {
        const p = easeBack(seg(t, 0.55, 0.7));
        cobble.visible = t > 0.55;
        cobble.scale.setScalar(Math.max(0.05, p));
        cobble.position.set(-0.6, -1.3 + Math.sin(t * TAU * 2) * 0.06, 0.4);
        cobble.rotation.set(0.3, t * TAU, 0);
        if (puff) puff(-0.6, -0.9, 0.6, seg(t, 0.5, 1));
        sp(t, 0);
      }
    }
  };
};

/* ─────────── 랜덤뽑기: 인형뽑기 기계 ─────────── */
const CAP_COLS = [[0xff5c78, 0xfff0f4], [0xffc440, 0xfffbe6], [0x60aaff, 0xf0f8ff], [0x7ee0a0, 0xf0fff6], [0xff8c46, 0xfff5eb], [0xc084fc, 0xfaf5ff]];
function grassBlock(size = 1) {
  const side = canvasTex(16, 16, (c) => {
    const r = rng(5);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = r();
      c.fillStyle = y < 3 + ((x * 7) % 3 === 0 ? 1 : 0) ? (v < 0.5 ? "#5fb94a" : "#4fa33d") : v < 0.33 ? "#7a4f2d" : v < 0.66 ? "#8b5a33" : "#9c6b40";
      c.fillRect(x, y, 1, 1);
    }
  }, true);
  const top = canvasTex(16, 16, (c) => {
    const r = rng(9);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = r();
      c.fillStyle = v < 0.33 ? "#4fa33d" : v < 0.66 ? "#62bf4c" : "#78d35e";
      c.fillRect(x, y, 1, 1);
    }
  }, true);
  const bottom = canvasTex(16, 16, (c) => {
    const r = rng(2);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      c.fillStyle = r() < 0.5 ? "#7a4f2d" : "#8b5a33";
      c.fillRect(x, y, 1, 1);
    }
  }, true);
  const ms = matte(0xffffff, 0.8, side), mt = matte(0xffffff, 0.8, top), mb = matte(0xffffff, 0.8, bottom);
  return mesh(new THREE.BoxGeometry(size, size, size), [ms, ms, mt, mb, ms, ms]);
}
function wallTex() {
  return canvasTex(512, 512, (c, w) => {
    const g = c.createLinearGradient(0, 0, 0, w);
    g.addColorStop(0, "#3b2a7a");
    g.addColorStop(1, "#22184a");
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.fillStyle = "rgba(255,255,255,0.13)";
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      c.save();
      c.translate(x * 90 + (y % 2) * 45 + 30, y * 90 + 40);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const k = i % 2 ? 8 : 18;
        c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
      }
      c.fill();
      c.restore();
    }
  });
}
function stripeTex() {
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#ec4899";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#f9a8d4";
    for (let x = -h; x < w + h; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 30, 0);
      c.lineTo(x + 30 - h, h);
      c.lineTo(x - h, h);
      c.fill();
    }
  });
}
SCENES.claw = (s, o) => {
  const st = studio(s, { glow: 0xbe185d, podium: false, haloSize: 9, hx: -1.2, hy: 0.4, rim: 0xff7ad0 });
  const floorDisc = mesh(new THREE.CircleGeometry(9, 96), new THREE.MeshPhysicalMaterial({ color: 0x0d0a1c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }), false, true);
  floorDisc.rotation.x = -Math.PI / 2;
  floorDisc.position.y = -1.6;
  s.add(floorDisc);
  for (const [x, rr, c] of [[-1.3, 1.55, 0xf472b6], [1.85, 1.05, 0x60a5fa]]) {
    const ring = mesh(new THREE.TorusGeometry(rr, 0.03, 12, 128), glow(c, 3), false, false);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, -1.58, 0.1);
    s.add(ring);
  }
  // 결과 받침대
  const ped = new THREE.Group();
  const pedBase = mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.3, 64), plastic(0x2a2150, { r: 0.25 }));
  pedBase.position.y = -1.45;
  const pedRing = mesh(new THREE.TorusGeometry(0.96, 0.025, 12, 96), glow(0xa855f7, 3), false, false);
  pedRing.rotation.x = Math.PI / 2;
  pedRing.position.y = -1.3;
  ped.add(pedBase, pedRing);
  ped.position.set(1.85, 0, 0.1);
  s.add(ped);
  // 스포트라이트 빛기둥
  const beam = mesh(new THREE.CylinderGeometry(0.25, 0.95, 3.6, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), false, false);
  beam.position.set(1.85, 0.4, 0.1);
  s.add(beam);
  const SC = 0.66;
  const M2 = new THREE.Group();
  M2.position.set(-1.3, -0.12, 0);
  M2.scale.setScalar(SC);
  s.add(M2);
  const pink = plastic(0xec4899, { r: 0.3 }), pinkL = plastic(0xf9a8d4, { r: 0.3 }), white = plastic(0xffffff, { r: 0.3 });
  const W = 2.6, H = 2.8, D = 2.0;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) {
    const post = mesh(rbox(0.18, H, 0.18, 0.06), pinkL);
    post.position.set(x, 0.4, z);
    M2.add(post);
  }
  const leds = [];
  for (const x of [-W / 2, W / 2]) for (let i = 0; i < 9; i++) {
    const l = mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(i % 2 ? 0x60a5fa : 0xf472b6, 2), false, false);
    l.position.set(x, -0.9 + i * 0.33, D / 2 + 0.1);
    M2.add(l);
    leds.push(l);
  }
  const roof = mesh(rbox(W + 0.36, 0.48, D + 0.36, 0.12), pink);
  roof.position.y = 0.4 + H / 2 + 0.22;
  M2.add(roof);
  const archS = new THREE.Shape();
  archS.moveTo(-(W + 0.2) / 2, 0);
  archS.lineTo(-(W + 0.2) / 2, 0.3);
  archS.absellipse(0, 0.3, (W + 0.2) / 2, 0.62, Math.PI, 0, true);
  archS.lineTo((W + 0.2) / 2, 0);
  archS.closePath();
  const arch = mesh(new THREE.ExtrudeGeometry(archS, { depth: 0.24, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 5, curveSegments: 48 }), plastic(0xfdf2f8, { r: 0.3 }));
  arch.position.set(0, roof.position.y + 0.22, D / 2 - 0.3);
  M2.add(arch);
  const archRim = mesh(new THREE.ExtrudeGeometry(archS, { depth: 0.12, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 48 }), plastic(0xec4899, { r: 0.3 }));
  archRim.position.set(0, roof.position.y + 0.22, D / 2 - 0.36);
  archRim.scale.set(1.04, 1.06, 1);
  M2.add(archRim);
  const signBoard = { position: new THREE.Vector3(0, roof.position.y + 0.62, D / 2 - 0.05) };
  const logo = text3d("DOES", 0.36, 0.1, plastic(0xa855f7, { e: 0x7e22ce, ei: 0.25 }));
  logo.position.set(0, signBoard.position.y, D / 2 + 0.12);
  M2.add(logo);
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    const b = mesh(new THREE.SphereGeometry(0.075, 12, 8), glow(0xffe08a, 2));
    const aa = Math.PI * (i / 13);
    b.position.set(-Math.cos(aa) * ((W + 0.2) / 2 + 0.02), roof.position.y + 0.52 + Math.sin(aa) * 0.62, D / 2 + 0.02);
    M2.add(b);
    bulbs.push(b);
  }
  const baseBox = mesh(rbox(W + 0.36, 1.25, D + 0.36, 0.14), plastic(0xffffff, { map: stripeTex(), r: 0.3 }));
  baseBox.position.y = -1.6;
  M2.add(baseBox);
  const panel = mesh(rbox(W + 0.5, 0.18, 0.7, 0.06), white);
  panel.position.set(0, -0.98, D / 2 + 0.25);
  M2.add(panel);
  const joy = new THREE.Group();
  const jstick = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 12), chrome());
  jstick.position.y = 0.2;
  const jball = mesh(new THREE.SphereGeometry(0.13, 24, 16), plastic(0xef4444, { r: 0.12 }));
  jball.position.y = 0.42;
  joy.add(jstick, jball);
  joy.position.set(0.45, -0.9, D / 2 + 0.3);
  M2.add(joy);
  const btn = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 32), glow(0x22c55e, 0.6));
  btn.position.set(0.95, -0.86, D / 2 + 0.3);
  M2.add(btn);
  const door = mesh(rbox(0.7, 0.55, 0.08, 0.06), plastic(0x2a1e3a, { r: 0.4 }));
  door.position.set(-0.75, -1.65, D / 2 + 0.2);
  M2.add(door);
  const doorFrame = mesh(rbox(0.82, 0.67, 0.06, 0.08), chrome(0xe9d5ff, 0.2));
  doorFrame.position.set(-0.75, -1.65, D / 2 + 0.17);
  M2.add(doorFrame);
  const wall = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.8 }), false, true);
  wall.position.set(0, 0.4, -D / 2 + 0.01);
  M2.add(wall);
  const floor = mesh(new THREE.BoxGeometry(W, 0.06, D), matte(0x2a2150, 0.7));
  floor.position.y = -0.95;
  M2.add(floor);
  const chuteWall = mesh(rbox(0.06, 0.7, D - 0.1, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05 }));
  chuteWall.position.set(-W / 2 + 0.78, -0.6, 0);
  M2.add(chuteWall);
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.1, roughness: 0.02, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const front = mesh(new THREE.PlaneGeometry(W, H), glassM, false, false);
  front.position.set(0, 0.4, D / 2);
  M2.add(front);
  for (const x of [-W / 2, W / 2]) {
    const side = mesh(new THREE.PlaneGeometry(D, H), glassM, false, false);
    side.rotation.y = Math.PI / 2;
    side.position.set(x, 0.4, 0);
    M2.add(side);
  }
  const streak = mesh(new THREE.PlaneGeometry(0.22, H * 1.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }), false, false);
  streak.position.set(0.5, 0.4, D / 2 + 0.01);
  streak.rotation.z = -0.35;
  M2.add(streak);
  const r = rng(41);
  for (let i = 0; i < 30; i++) {
    const [a, b] = CAP_COLS[i % CAP_COLS.length];
    const c = capsuleMesh(0.19, a, b);
    c.userData.a.material = new THREE.MeshPhysicalMaterial({ color: a, roughness: 0.08, transmission: 0.55, thickness: 0.4, clearcoat: 1, transparent: true });
    const toy = mesh(i % 2 ? new THREE.IcosahedronGeometry(0.09, 1) : extrude(starShape(0.1, 0.045), 0.04, 0.015, 2), plastic([0xffd23f, 0x60a5fa, 0xf472b6, 0x22c55e][i % 4]), false, false);
    toy.position.y = 0.04;
    c.add(toy);
    c.position.set(-W / 2 + 0.98 + r() * (W - 1.18), -0.74 + r() * 0.2 + (i > 18 ? 0.3 : 0), -D / 2 + 0.25 + r() * (D - 0.5));
    c.rotation.set(r() * TAU, r() * TAU, 0);
    M2.add(c);
  }
  const target = capsuleMesh(0.22, 0xa855f7, 0xfafaff);
  const TX = 0.55, TY = -0.45;
  target.position.set(TX, TY, 0.3);
  M2.add(target);
  const rail = mesh(rbox(W, 0.08, 0.08, 0.02), chrome());
  rail.position.set(0, 1.62, 0.3);
  M2.add(rail);
  const claw = new THREE.Group();
  const carriage = mesh(rbox(0.4, 0.22, 0.34, 0.06), chrome(0xc4c8d8, 0.2));
  const cable = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), chrome(0xf0f2f8, 0.1));
  const hub = new THREE.Group();
  const hubBody = mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.22, 32), plastic(0xf472b6, { r: 0.2 }));
  const hubCap = mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, TAU, 0, Math.PI / 2), chrome());
  hubCap.position.y = 0.1;
  hub.add(hubBody, hubCap);
  claw.add(carriage, cable, hub);
  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.Group();
    pg.rotation.y = (i / 3) * TAU;
    const arm = new THREE.Group();
    arm.position.set(0, -0.08, 0.14);
    const p1 = mesh(tube([[0, 0, 0], [0, -0.18, 0.08], [0, -0.38, 0.06], [0, -0.48, -0.06]], 0.032, 24), chrome(0xd8dbe8, 0.2));
    const tip = mesh(new THREE.SphereGeometry(0.045, 12, 8), plastic(0xf472b6));
    tip.position.set(0, -0.48, -0.06);
    arm.add(p1, tip);
    pg.add(arm);
    hub.add(pg);
    prongs.push(arm);
  }
  M2.add(claw);
  const RX = 1.85;
  const big = capsuleMesh(0.55, 0xa855f7, 0xfafaff);
  big.position.set(RX, -0.62, 0.3);
  s.add(big);
  let prize = null;
  if (o.kind === "win" || o.kind === "nitro") prize = diamondMesh(o.kind === "nitro" ? 0xd38cff : 0x8fdcff, 0.62);
  else if (o.kind === "coin" || o.kind === "charge") {
    prize = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const c = coinMesh(0.28);
      const a = (i / 6) * TAU;
      c.position.set(i === 6 ? 0 : Math.cos(a) * 0.42, i === 6 ? 0.1 : Math.sin(a) * 0.32, i === 6 ? 0.25 : 0);
      c.rotation.set(Math.PI / 2 - 0.25, 0, a);
      prize.add(c);
    }
  } else if (o.kind === "mc") prize = grassBlock(0.85);
  if (prize) {
    prize.visible = false;
    s.add(prize);
  }
  const conf = o.kind && o.kind !== "none" && o.kind !== "idle" ? confetti(s, 70, 13, { x0: 0.2, x1: 3.6, z0: -0.6, z1: 1.6, y0: -1.6, y1: 2.6 }) : null;
  const puff = o.kind === "none" ? smoke(s, 17) : null;
  const pcol = o.kind === "coin" || o.kind === "charge" ? 0xffd27a : o.kind === "mc" ? 0x9ef08a : o.kind === "nitro" ? 0xd38cff : 0x9fd8ff;
  const plight = new THREE.PointLight(pcol, 0, 7);
  plight.position.set(RX, 0.4, 1.8);
  s.add(plight);
  const halo2 = addSprite(s, radialTex, new THREE.Color(pcol), 4.5, [RX, 0.1, -1], 0);
  const rays = raysPlane(s, new THREE.Color(pcol), 5.5, [RX, 0.15, -0.8]);
  const sp = sparkles(s, [[RX - 1.1, 1.0, 1, 0.5, 0], [RX + 1.0, 0.8, 1, 0.45, 2], [RX + 0.8, -0.9, 1.2, 0.4, 4], [RX - 0.9, -0.7, 1.2, 0.35, 1]], 0xfff3c4);
  cam(0.9, 0.75, 8.4, 0.25, 0.1, 0);

  const setClaw = (x, y, open) => {
    claw.position.set(x, 0, 0.3);
    carriage.position.y = 1.62;
    const len = 1.62 - y - 0.1;
    cable.scale.y = Math.max(0.01, len);
    cable.position.y = 1.62 - len / 2;
    hub.position.y = y;
    prongs.forEach((p) => (p.rotation.x = 0.1 + open * 0.6));
  };
  const CH = -W / 2 + 0.38;
  const doorX = M2.position.x - 0.75 * SC;
  return (t) => {
    st.anim(t);
    bulbs.forEach((b, i) => (b.material.emissiveIntensity = (Math.floor(t * 30) + i) % 3 === 0 ? 3 : 0.4));
    leds.forEach((l, i) => (l.material.emissiveIntensity = (Math.floor(t * 24) + i) % 4 === 0 ? 3.5 : 0.6));
    beam.material.opacity = 0.035;
    if (o.kind === "idle") {
      setClaw(Math.sin(t * TAU) * 0.8, 0.95 + Math.sin(t * TAU * 2) * 0.05, 0.6);
      joy.rotation.z = -Math.cos(t * TAU) * 0.35;
      big.visible = false;
      sp(t, 0);
      return;
    }
    let x, y, op;
    if (t < 0.12) { x = CH + (TX - CH) * easeInOut(t / 0.12); y = 0.95; op = 0.8; }
    else if (t < 0.27) { x = TX; y = 0.95 + (TY + 0.5 - 0.95) * easeInOut(seg(t, 0.12, 0.27)); op = 0.8; }
    else if (t < 0.32) { x = TX; y = TY + 0.5; op = 0.8 - 0.8 * seg(t, 0.27, 0.32); }
    else if (t < 0.46) { x = TX; y = TY + 0.5 + (0.95 - TY - 0.5) * easeInOut(seg(t, 0.32, 0.46)); op = 0; }
    else if (t < 0.6) { x = TX + (CH - TX) * easeInOut(seg(t, 0.46, 0.6)); y = 0.95; op = 0; }
    else { x = CH; y = 0.95; op = Math.min(0.8, (t - 0.6) * 8); }
    setClaw(x, y, op);
    joy.rotation.z = t < 0.12 ? -0.35 : t > 0.46 && t < 0.6 ? 0.35 : 0;
    btn.material.emissiveIntensity = t > 0.12 && t < 0.3 ? 3 : 0.6;
    const sway = t >= 0.46 && t < 0.6 ? Math.sin(t * 80) * 0.05 : 0;
    if (t >= 0.32 && t < 0.6) { target.position.set(x + sway, y - 0.5, 0.3); target.visible = true; }
    else if (t >= 0.6 && t < 0.68) { target.position.set(CH, 0.45 - easeIn(seg(t, 0.6, 0.68)) * 1.6, 0.3); target.visible = true; }
    else if (t >= 0.68) target.visible = false;
    else target.visible = true;
    big.visible = t >= 0.68;
    if (t >= 0.68 && t < 0.78) {
      const k = easeOut(seg(t, 0.68, 0.78));
      big.position.set(lerp(doorX, RX, k), -1.1 + Math.sin(k * Math.PI) * 1.3 + k * 0.48, lerp(1.1, 0.3, k));
      big.rotation.set(k * 8, 0, k * 6);
      big.scale.setScalar(lerp(0.45, 1, k));
      sp(t, 0);
    } else if (t >= 0.78) {
      big.scale.setScalar(1);
      const shake = t < 0.84 ? Math.sin(t * 90) * 0.12 : 0;
      big.position.set(RX, -0.62, 0.3);
      big.rotation.set(0, 0, shake);
      const op2 = easeOut(seg(t, 0.84, 0.9));
      big.userData.a.position.set(-op2 * 0.15, op2 * 0.85, 0);
      big.userData.a.rotation.z = op2 * 0.7;
      big.userData.b.position.y = -op2 * 0.35;
      big.userData.band.visible = op2 < 0.1;
      big.userData.shine.visible = op2 < 0.1;
      halo2.material.opacity = o.kind === "none" ? 0 : 0.6 * op2;
      rays.material.opacity = o.kind === "none" ? 0 : 0.5 * op2;
      rays.rotation.z = t * 1.6;
      beam.material.opacity = 0.035 + 0.05 * op2;
      if (prize) {
        const p = easeBack(seg(t, 0.85, 0.95));
        prize.visible = t > 0.85;
        prize.scale.setScalar(Math.max(0.05, p));
        prize.position.set(RX, 0.05 + Math.sin(t * TAU * 3) * 0.06, 0.45);
        prize.rotation.set(o.kind === "mc" ? 0.45 : 0.2, Math.sin(t * TAU * 1.2) * 0.8 + 0.4, 0);
        plight.intensity = 26 * p;
      }
      if (conf) conf(t, t > 0.86 ? 1 : 0);
      if (puff) puff(RX, 0.0, 0.8, seg(t, 0.85, 1));
      sp(t, prize && t > 0.86 ? 1 : 0);
    } else sp(t, 0);
  };
};

/* ───────────────────────── 바깥에서 부르는 함수 ───────────────────────── */


/* ───────────────────────── 이모지 (투명 배경 · 정사각) ───────────────────────── */
const eRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
eRenderer.setPixelRatio(1);
eRenderer.outputColorSpace = THREE.SRGBColorSpace;
eRenderer.toneMapping = THREE.ACESFilmicToneMapping;
eRenderer.toneMappingExposure = 0.82;
eRenderer.setClearColor(0x000000, 0);
const ePmrem = new THREE.PMREMGenerator(eRenderer);
const eEnv = ePmrem.fromScene(new RoomEnvironment(), 0.03).texture;
let eScene, eCam, eUpdate;

function eLights(s) {
  s.environment = eEnv;
  s.environmentIntensity = 0.7;
  s.add(new THREE.HemisphereLight(0xffffff, 0x6a6a88, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-2, 4, 5);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.6);
  rim.position.set(3, 2, -4);
  s.add(key, rim);
}
const gemFacet = (c) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.15, roughness: 0.04, clearcoat: 1, flatShading: true, iridescence: 0.6, emissive: c, emissiveIntensity: 0.18, envMapIntensity: 1.8 });
function disc(color, r = 1, d = 0.36) {
  const g = new THREE.CylinderGeometry(r, r, d, 64, 1);
  const m = mesh(g, plastic(color, { r: 0.25 }));
  m.rotation.x = Math.PI / 2;
  const rim = mesh(new THREE.TorusGeometry(r, d * 0.5, 20, 80), plastic(color, { r: 0.25 }));
  const grp = new THREE.Group();
  grp.add(m, rim);
  return grp;
}
function checkShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0.05); s.lineTo(-0.2, -0.32); s.lineTo(0.58, 0.45); s.lineTo(0.42, 0.6); s.lineTo(-0.2, 0.02); s.lineTo(-0.4, 0.22); s.closePath();
  return s;
}
function crossShape(w = 0.2, L = 0.62) {
  const s = new THREE.Shape();
  s.moveTo(-w, L); s.lineTo(w, L); s.lineTo(w, w); s.lineTo(L, w); s.lineTo(L, -w); s.lineTo(w, -w); s.lineTo(w, -L); s.lineTo(-w, -L); s.lineTo(-w, -w); s.lineTo(-L, -w); s.lineTo(-L, w); s.lineTo(-w, w); s.closePath();
  return s;
}
function leaf(color, k = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(0.35 * k, 0.15 * k, 0.4 * k, 0.6 * k, 0, 0.9 * k); s.bezierCurveTo(-0.4 * k, 0.6 * k, -0.35 * k, 0.15 * k, 0, 0);
  const m = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.06 * k, bevelEnabled: true, bevelThickness: 0.05 * k, bevelSize: 0.05 * k, bevelSegments: 6, curveSegments: 32 }), plastic(color, { r: 0.3 }));
  return m;
}
function textTex(str, color, bg, w = 512, h = 256, font = "bold 170px DejaVu Sans") {
  return canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    c.font = font; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color; c.fillText(str, w / 2, h / 2 + 8);
  });
}

const EMOJI = {};
EMOJI.check = () => {
  const g = new THREE.Group();
  g.add(disc(0x22c55e));
  const ck = mesh(extrude(checkShape(), 0.16, 0.06, 6), plastic(0xffffff, { r: 0.2 }));
  ck.position.z = 0.28; ck.scale.setScalar(1.15);
  g.add(ck);
  return { g, anim: (t) => { g.rotation.y = Math.sin(t * TAU) * 0.5; g.position.y = Math.abs(Math.sin(t * TAU)) * 0.06; } };
};
EMOJI.cross = () => {
  const g = new THREE.Group();
  g.add(disc(0xef4444));
  const x = mesh(extrude(crossShape(0.16, 0.6), 0.16, 0.06, 6), plastic(0xffffff, { r: 0.2 }));
  x.rotation.z = Math.PI / 4; x.position.z = 0.28;
  g.add(x);
  g.rotation.y = -0.3;
  return { g };
};
EMOJI.plus = () => {
  const g = new THREE.Group();
  const p = mesh(extrude(crossShape(0.26, 0.85), 0.3, 0.12, 8), plastic(0x22c55e, { r: 0.22 }));
  g.add(p); g.rotation.set(0.2, -0.4, 0);
  return { g };
};
EMOJI.star = () => {
  const g = new THREE.Group();
  const st = mesh(extrude(starShape(1.05, 0.48), 0.32, 0.14, 8), gold({ c: 0xffc83d, r: 0.18 }));
  g.add(st);
  return { g, anim: (t) => { g.rotation.y = t * TAU; } };
};
EMOJI.gem = () => {
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0, -1.0), new THREE.Vector2(0.98, 0.12), new THREE.Vector2(0.98, 0.2), new THREE.Vector2(0.6, 0.5), new THREE.Vector2(0, 0.5)];
  const geo = new THREE.LatheGeometry(pts, 10).toNonIndexed();
  geo.computeVertexNormals();
  const d = mesh(geo, gemFacet(0x1fb2ff));
  d.scale.setScalar(1.05); d.position.y = 0.2;
  g.add(d); g.rotation.x = 0.35;
  return { g, anim: (t) => { d.rotation.y = t * (TAU / 5); } };
};
EMOJI.gift = () => {
  const gift = makeGift();
  gift.g.scale.setScalar(0.85); gift.g.position.y = -0.75;
  const g = new THREE.Group(); g.add(gift.g); g.rotation.set(0.35, -0.6, 0);
  return { g, anim: (t) => { gift.lid.position.y = 1.32 + Math.max(0, Math.sin(t * TAU * 2)) * 0.18; gift.lid.rotation.z = Math.sin(t * TAU * 2) * 0.05; } };
};
EMOJI.mail = () => {
  const e = makeEnvelope();
  e.g.scale.setScalar(0.9);
  const g = new THREE.Group(); g.add(e.g); g.rotation.set(0.1, -0.35, 0);
  return { g };
};
EMOJI.online = () => {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.8, 64, 32), plastic(0x22c55e, { e: 0x16a34a, ei: 0.4, r: 0.2 }));
  const ring = mesh(new THREE.TorusGeometry(1.05, 0.08, 16, 80), plastic(0x86efac, { e: 0x22c55e, ei: 0.8, opacity: 0.8 }));
  g.add(b, ring);
  return { g, anim: (t) => { const k = (t * 2) % 1; ring.scale.setScalar(0.85 + k * 0.35); ring.material.opacity = 1 - k; b.scale.setScalar(1 + Math.sin(t * TAU * 2) * 0.04); } };
};
EMOJI.offline = () => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.8, 64, 32), plastic(0x6b7280, { r: 0.35 })));
  const hole = mesh(new THREE.TorusGeometry(0.42, 0.12, 16, 64), plastic(0x374151, { r: 0.4 }));
  hole.position.z = 0.7; hole.scale.z = 0.4; g.add(hole);
  return { g };
};
EMOJI.sold = () => {
  const g = new THREE.Group();
  const plate = mesh(rbox(2.2, 1.0, 0.24, 0.16), plastic(0xdc2626, { r: 0.25 }));
  const border = mesh(rbox(2.0, 0.8, 0.26, 0.1), plastic(0xffffff, { r: 0.3 }));
  const inner = mesh(rbox(1.88, 0.68, 0.28, 0.08), plastic(0xdc2626, { r: 0.25 }));
  const txt = text3d("SOLD", 0.42, 0.1, plastic(0xffffff, { r: 0.2 }));
  txt.position.z = 0.2;
  g.add(plate, border, inner, txt); g.rotation.set(0.1, -0.35, -0.1);
  return { g, scale: 1.12 };
};
EMOJI.brick = () => {
  const g = new THREE.Group();
  const red = plastic(0xc2410c, { r: 0.55, cc: 0.3 });
  const mortar = plastic(0xe7e5e4, { r: 0.8, cc: 0 });
  const back = mesh(rbox(2.3, 1.45, 0.4, 0.06), mortar); back.position.z = -0.08; g.add(back);
  const rows = [[-0.55, [-0.55, 0.55]], [0, [-0.82, 0, 0.82]], [0.55, [-0.55, 0.55]]];
  for (const [y, xs] of rows) for (const x of xs) {
    const w = Math.abs(x) === 0.82 ? 0.58 : 1.0;
    const b = mesh(rbox(xs.length === 3 && x !== 0 ? 0.58 : (xs.length === 3 ? 0.98 : 1.04), 0.46, 0.5, 0.07), red);
    b.position.set(xs.length === 3 && x !== 0 ? Math.sign(x) * 0.84 : x, y, 0.05); g.add(b);
  }
  g.rotation.set(0.25, -0.45, 0);
  return { g };
};
EMOJI.clover = () => {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const h = mesh(extrude(heartShape(0.42), 0.12, 0.08, 8), plastic(0x22c55e, { r: 0.3 }));
    h.rotation.z = i * Math.PI / 2 + Math.PI;
    const a = i * Math.PI / 2 + Math.PI / 2;
    h.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0);
    h.rotation.z = a - Math.PI / 2;
    g.add(h);
  }
  const stem = mesh(tube([[0, 0, -0.05], [0.15, -0.5, 0], [0.4, -1.0, 0]], 0.07, 30), plastic(0x15803d));
  g.add(stem); g.rotation.set(0.25, -0.3, 0.2); g.position.y = 0.15;
  return { g };
};
EMOJI.flag = () => {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 24), chrome(0xcbd5e1, 0.2)); pole.position.x = -0.75; g.add(pole);
  const knob = mesh(new THREE.SphereGeometry(0.12, 24, 16), gold()); knob.position.set(-0.75, 1.18, 0); g.add(knob);
  const geo = new THREE.PlaneGeometry(1.4, 0.95, 30, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + 0.7; pos.setZ(i, Math.sin(x * 4) * 0.12 * x); }
  geo.computeVertexNormals();
  const fl = mesh(geo, plastic(0xef4444, { r: 0.35, side: THREE.DoubleSide })); fl.position.set(-0.02, 0.6, 0); g.add(fl);
  g.rotation.set(0.1, -0.35, 0); g.position.y = -0.05;
  return { g };
};
EMOJI.inbox = () => {
  const g = new THREE.Group();
  const tray = mesh(rbox(2.0, 0.55, 1.4, 0.15), plastic(0xe2e8f0, { r: 0.3 })); tray.position.y = -0.55; g.add(tray);
  const slot = mesh(rbox(1.5, 0.2, 1.0, 0.08), plastic(0x94a3b8, { r: 0.4 })); slot.position.y = -0.33; g.add(slot);
  const arr = new THREE.Shape();
  arr.moveTo(-0.2, 0.7); arr.lineTo(0.2, 0.7); arr.lineTo(0.2, 0.15); arr.lineTo(0.45, 0.15); arr.lineTo(0, -0.35); arr.lineTo(-0.45, 0.15); arr.lineTo(-0.2, 0.15); arr.closePath();
  const a = mesh(extrude(arr, 0.22, 0.07, 6), plastic(0x3b82f6, { r: 0.22 })); a.position.set(0, 0.35, 0.2); g.add(a);
  g.rotation.set(0.35, -0.4, 0);
  return { g };
};
EMOJI.island = () => {
  const g = new THREE.Group();
  const water = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.18, 64), plastic(0x38bdf8, { r: 0.1 })); water.position.y = -0.7; g.add(water);
  const sand = mesh(new THREE.SphereGeometry(0.85, 48, 24, 0, TAU, 0, Math.PI / 2), plastic(0xfcd34d, { r: 0.6, cc: 0.2 })); sand.scale.y = 0.45; sand.position.y = -0.62; g.add(sand);
  const trunk = mesh(tube([[0, -0.3, 0], [0.12, 0.2, 0], [0.05, 0.75, 0]], 0.08, 30), plastic(0x92400e, { r: 0.6 })); g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const l = leaf(0x16a34a, 0.75); const a = i / 6 * TAU;
    const p = new THREE.Group(); p.add(l); l.rotation.x = -1.3;
    p.rotation.y = a; p.position.set(0.05, 0.75, 0); g.add(p);
  }
  g.rotation.set(0.3, -0.3, 0); g.position.y = 0.05;
  return { g };
};
EMOJI.jackpot = () => {
  const g = new THREE.Group();
  const body = mesh(rbox(2.0, 1.7, 0.9, 0.2), plastic(0x7c3aed, { r: 0.25 })); g.add(body);
  const top = mesh(rbox(1.6, 0.35, 0.7, 0.12), gold()); top.position.y = 1.0; g.add(top);
  const screen = mesh(rbox(1.7, 0.85, 0.2, 0.06), plastic(0x1e1b4b)); screen.position.set(0, 0.1, 0.42); g.add(screen);
  const reels = [];
  for (let i = 0; i < 3; i++) {
    const w = mesh(rbox(0.46, 0.68, 0.1, 0.05), plastic(0xfffdf7, { r: 0.4 })); w.position.set((i - 1) * 0.52, 0.1, 0.52); g.add(w);
    const seven = text3d("7", 0.42, 0.06, plastic(0xef4444, { r: 0.25 })); seven.position.set((i - 1) * 0.52, 0.1, 0.6); g.add(seven); reels.push(seven);
  }
  const bulbs = [];
  for (let i = 0; i < 5; i++) { const b = mesh(new THREE.SphereGeometry(0.07, 16, 12), glow(0xfde047, 1.5)); b.position.set((i - 2) * 0.32, 1.0, 0.38); g.add(b); bulbs.push(b); }
  const lever = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 16), chrome()); lever.position.set(1.1, 0.35, 0); g.add(lever);
  const ball = mesh(new THREE.SphereGeometry(0.15, 24, 16), plastic(0xef4444)); ball.position.set(1.1, 0.82, 0); g.add(ball);
  g.rotation.set(0.15, -0.35, 0); g.position.set(-0.08, -0.05, 0);
  return { g, scale: 0.88, anim: (t, i) => { bulbs.forEach((b, k) => (b.material.emissiveIntensity = (k + i) % 2 ? 2.4 : 0.3)); reels.forEach((r, k) => (r.position.y = 0.1 + Math.sin((t * 2 + k * 0.33) * TAU) * 0.03)); } };
};
EMOJI.party = () => {
  const g = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.5, 1.6, 48, 1, true), plastic(0xffffff, { side: THREE.DoubleSide, map: canvasTex(256, 256, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#f59e0b" : "#ec4899"; c.fillRect(0, i * 32, 256, 32); } }) }));
  cone.rotation.z = Math.PI + 0.75; cone.position.set(0.15, -0.25, 0); g.add(cone);
  const r = rng(7); const cols = [0xf43f5e, 0x22c55e, 0x3b82f6, 0xfacc15, 0xa855f7];
  for (let i = 0; i < 16; i++) {
    const p = mesh(rbox(0.12, 0.2, 0.04, 0.02), plastic(cols[i % 5]));
    p.position.set(-0.3 - r() * 0.8, 0.2 + r() * 0.9, (r() - 0.5) * 0.6); p.rotation.set(r() * 3, r() * 3, r() * 3); g.add(p);
  }
  for (let i = 0; i < 3; i++) {
    const s = mesh(tube([[0, 0, 0], [-0.2 - i * 0.1, 0.4, 0.1], [-0.1 - i * 0.25, 0.8, 0], [-0.4 - i * 0.2, 1.1, 0]], 0.035, 40), plastic(cols[i + 1])); s.position.set(-0.35, 0.3, 0); g.add(s);
  }
  g.rotation.y = -0.3;
  return { g };
};
EMOJI.robot = () => {
  const g = new THREE.Group();
  const head = mesh(rbox(1.8, 1.35, 1.2, 0.3), plastic(0xcbd5e1, { r: 0.25 })); g.add(head);
  const face = mesh(rbox(1.45, 0.9, 0.2, 0.18), plastic(0x1e293b, { r: 0.2 })); face.position.z = 0.55; g.add(face);
  for (const x of [-0.35, 0.35]) { const e = mesh(new THREE.SphereGeometry(0.15, 24, 16), glow(0x38bdf8, 2)); e.position.set(x, 0.08, 0.66); e.scale.z = 0.5; g.add(e); }
  const mouth = mesh(rbox(0.5, 0.08, 0.05, 0.03), glow(0x38bdf8, 1.5)); mouth.position.set(0, -0.2, 0.66); g.add(mouth);
  const ant = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 12), chrome()); ant.position.y = 0.88; g.add(ant);
  const tip = mesh(new THREE.SphereGeometry(0.12, 24, 16), glow(0xf43f5e, 1.2)); tip.position.y = 1.15; g.add(tip);
  for (const x of [-1, 1]) { const ear = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 24), plastic(0x94a3b8)); ear.rotation.z = Math.PI / 2; ear.position.x = x * 0.95; g.add(ear); }
  g.rotation.set(0.1, -0.35, 0); g.position.y = -0.1;
  return { g };
};
EMOJI.sprout = () => {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.85, 48), plastic(0xb45309, { r: 0.5 })); pot.position.y = -0.6; g.add(pot);
  const rimm = mesh(new THREE.TorusGeometry(0.7, 0.1, 16, 48), plastic(0xc2410c, { r: 0.45 })); rimm.rotation.x = Math.PI / 2; rimm.position.y = -0.17; g.add(rimm);
  const soil = mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.06, 48), plastic(0x422006, { r: 0.9, cc: 0 })); soil.position.y = -0.2; g.add(soil);
  const stem = mesh(tube([[0, -0.2, 0], [0.02, 0.2, 0], [0, 0.5, 0]], 0.06, 20), plastic(0x16a34a)); g.add(stem);
  for (const s of [-1, 1]) { const l = leaf(0x22c55e, 0.75); l.position.set(0, 0.45, 0); l.rotation.set(0, 0, -s * 1.1); g.add(l); }
  g.rotation.set(0.25, -0.3, 0); g.position.y = 0.05;
  return { g };
};
EMOJI.tree = () => {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.0, 24), plastic(0x92400e, { r: 0.6 })); trunk.position.y = -0.65; g.add(trunk);
  for (const [x, y, z, r] of [[0, 0.35, 0, 0.75], [-0.5, 0.05, 0.1, 0.5], [0.5, 0.05, 0.1, 0.52], [0.05, 0.85, 0, 0.5]]) {
    const b = mesh(new THREE.SphereGeometry(r, 48, 32), plastic(0x16a34a, { r: 0.35 })); b.position.set(x, y, z); g.add(b);
  }
  g.rotation.y = -0.3;
  return { g };
};
EMOJI.ticket = () => {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const W = 1.1, H = 0.65, n = 0.18;
  s.moveTo(-W, -H); s.lineTo(W, -H); s.lineTo(W, -n); s.absarc(W, 0, n, -Math.PI / 2, Math.PI / 2, true); s.lineTo(W, H); s.lineTo(-W, H); s.lineTo(-W, n); s.absarc(-W, 0, n, Math.PI / 2, -Math.PI / 2, true); s.closePath();
  g.add(mesh(extrude(s, 0.16, 0.08, 6), plastic(0xfacc15, { r: 0.25 })));
  const line = mesh(rbox(0.04, 1.1, 0.05, 0.01), plastic(0xca8a04)); line.position.set(0.45, 0, 0.17); g.add(line);
  const st = mesh(extrude(starShape(0.32, 0.14), 0.08, 0.04, 4), plastic(0xef4444, { r: 0.2 })); st.position.set(-0.2, 0, 0.2); g.add(st);
  g.rotation.set(0.2, -0.4, 0.25);
  return { g };
};

window.setupEmoji = (name, size) => {
  eRenderer.setSize(size, size, false);
  eScene = new THREE.Scene();
  eLights(eScene);
  eCam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  eCam.position.set(0, 0.35, 6.2);
  eCam.lookAt(0, 0, 0);
  const o = EMOJI[name]();
  o.g.scale.multiplyScalar(o.scale ?? 1);
  eScene.add(o.g);
  eUpdate = o.anim ?? (() => {});
};
window.frameEmoji = (i, n) => {
  eUpdate(i / n, i, n);
  eRenderer.render(eScene, eCam);
  return eRenderer.domElement.toDataURL("image/png");
};

window.setup = (name, w, h, opts) => {
  renderer.setSize(w, h, false);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  update = SCENES[name](scene, opts);
  if (opts.zoom) camera.zoom = opts.zoom;
  if (opts.cx !== undefined || opts.cy !== undefined) {
    const ox = opts.cx !== undefined ? w / 2 - opts.cx : 0;
    const oy = opts.cy !== undefined ? h / 2 - opts.cy : 0;
    camera.setViewOffset(w, h, ox, oy, w, h);
  }
  camera.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(w * 2, h * 2, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(2);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), opts.bloom ?? 0.32, 0.45, 1.05));
  composer.addPass(new OutputPass());
};

window.frame = (i, n) => {
  update(i / n, i, n);
  composer.render();
  return renderer.domElement.toDataURL("image/png");
};

new FontLoader().load("/node_modules/three/examples/fonts/helvetiker_bold.typeface.json", (f) => {
  FONT = f;
  window.__ready = true;
});
