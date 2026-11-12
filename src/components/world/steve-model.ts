import * as THREE from "three";

/**
 * 마크 스킨과 같은 64×64 배치로 캐릭터 텍스처를 그리고,
 * 안쪽 몸 + 바깥 레이어(머리카락 · 옷깃)를 겹쳐 입체감 있는 캐릭터를 만든다.
 */

export type SteveLook = {
  shirt: number;
  pants?: number;
  hair?: number;
  skin?: number;
  shoes?: number;
  accent?: number;
  seed?: number;
};

export type SteveLimbs = {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
};

export type SteveRig = { root: THREE.Group; limbs: SteveLimbs; texture: THREE.Texture };

const PX = 1 / 16;
const HAIRS = [0x3b2414, 0x1f1a17, 0x6b4425, 0xc28f4a, 0x8a3b1f, 0x2c2c3a];
const PANTS = [0x3b3f9e, 0x2b2f3a, 0x4a5a2a, 0x5a3a24, 0x1f4f6e];

function hex(n: number) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function shade(n: number, f: number) {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export function lookFromName(name: string, shirt: number): SteveLook {
  let h = 7;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  return {
    shirt,
    hair: HAIRS[h % HAIRS.length],
    pants: PANTS[(h >> 4) % PANTS.length],
    seed: h,
  };
}

type Rect = [number, number, number, number];
type BoxFaces = { top: Rect; bottom: Rect; right: Rect; front: Rect; left: Rect; back: Rect };

/** 스킨 파일 안에서 상자 하나가 차지하는 6면 위치 */
function faces(u: number, v: number, w: number, h: number, d: number): BoxFaces {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + 2 * d + w, v + d, w, h],
  };
}

const HEAD = faces(0, 0, 8, 8, 8);
const HAT = faces(32, 0, 8, 8, 8);
const BODY = faces(16, 16, 8, 12, 4);
const JACKET = faces(16, 32, 8, 12, 4);
const ARM_R = faces(40, 16, 4, 12, 4);
const SLEEVE_R = faces(40, 32, 4, 12, 4);
const ARM_L = faces(32, 48, 4, 12, 4);
const SLEEVE_L = faces(48, 48, 4, 12, 4);
const LEG_R = faces(0, 16, 4, 12, 4);
const LEG_L = faces(16, 48, 4, 12, 4);

export function paintSkin(look: SteveLook) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const skin = look.skin ?? 0xd8a785;
  const hair = look.hair ?? HAIRS[0]!;
  const pants = look.pants ?? PANTS[0]!;
  const shoes = look.shoes ?? 0x2a2a30;
  const shirt = look.shirt;
  const accent = look.accent ?? 0x5ef0e6;

  const fill = (r: Rect, color: number) => {
    g.fillStyle = hex(color);
    g.fillRect(r[0], r[1], r[2], r[3]);
  };
  const px = (r: Rect, x: number, y: number, color: number, w = 1, h = 1) => {
    g.fillStyle = hex(color);
    g.fillRect(r[0] + x, r[1] + y, w, h);
  };
  const all = (f: BoxFaces, color: number) => Object.values(f).forEach((r) => fill(r, color));

  /* 머리 */
  all(HEAD, skin);
  fill(HEAD.top, hair);
  fill([HEAD.back[0], HEAD.back[1], 8, 7], hair);
  fill([HEAD.right[0], HEAD.right[1], 8, 2], hair);
  fill([HEAD.right[0], HEAD.right[1], 3, 6], hair);
  fill([HEAD.left[0], HEAD.left[1], 8, 2], hair);
  fill([HEAD.left[0] + 5, HEAD.left[1], 3, 6], hair);
  const F = HEAD.front;
  px(F, 0, 0, hair, 8, 2);
  px(F, 0, 2, hair);
  px(F, 7, 2, hair);
  px(F, 1, 4, 0xffffff);
  px(F, 2, 4, 0x2b3f8f);
  px(F, 2, 3, shade(hair, 1.1));
  px(F, 1, 3, shade(hair, 1.1));
  px(F, 5, 4, 0x2b3f8f);
  px(F, 6, 4, 0xffffff);
  px(F, 5, 3, shade(hair, 1.1));
  px(F, 6, 3, shade(hair, 1.1));
  px(F, 3, 5, shade(skin, 0.86), 2, 1);
  px(F, 1, 5, 0xe9a39a);
  px(F, 6, 5, 0xe9a39a);
  px(F, 3, 6, 0x9a5a48, 2, 1);
  fill(HEAD.bottom, shade(skin, 0.9));

  /* 머리카락 바깥 레이어 — 앞머리는 들쭉날쭉하게 */
  const hairHi = shade(hair, 1.25);
  fill(HAT.top, hairHi);
  fill([HAT.back[0], HAT.back[1], 8, 6], hair);
  fill([HAT.right[0], HAT.right[1], 8, 2], hair);
  fill([HAT.right[0], HAT.right[1] + 2, 2, 3], hair);
  fill([HAT.left[0], HAT.left[1], 8, 2], hair);
  fill([HAT.left[0] + 6, HAT.left[1] + 2, 2, 3], hair);
  px(HAT.front, 0, 0, hairHi, 8, 1);
  for (const x of [0, 1, 3, 6, 7]) px(HAT.front, x, 1, hair);

  /* 몸통 */
  all(BODY, shirt);
  const B = BODY.front;
  px(B, 3, 0, skin, 2, 1);
  px(B, 3, 1, shade(skin, 0.9), 2, 1);
  px(B, 0, 11, shade(pants, 0.7), 8, 1);
  px(B, 3, 11, 0xd9b44a, 2, 1);
  px(B, 5, 3, accent);
  px(B, 4, 4, accent, 3, 1);
  px(B, 5, 5, accent);
  px(B, 5, 4, 0xffffff);
  for (const k of ["right", "left", "back"] as const) px(BODY[k], 0, 11, shade(pants, 0.7), BODY[k][2], 1);

  /* 겉옷: 옷깃 · 밑단 · 앞섶 */
  const trim = shade(shirt, 0.72);
  for (const k of ["front", "back", "left", "right"] as const) {
    px(JACKET[k], 0, 0, trim, JACKET[k][2], 1);
    px(JACKET[k], 0, 10, trim, JACKET[k][2], 1);
  }
  g.clearRect(JACKET.front[0] + 3, JACKET.front[1], 2, 1);
  px(JACKET.front, 0, 1, trim, 1, 9);
  px(JACKET.front, 7, 1, trim, 1, 9);
  fill(JACKET.top, trim);
  g.clearRect(JACKET.top[0] + 2, JACKET.top[1] + 1, 4, 2);

  /* 팔 */
  for (const [A, S] of [
    [ARM_R, SLEEVE_R],
    [ARM_L, SLEEVE_L],
  ] as const) {
    all(A, skin);
    fill(A.top, shirt);
    for (const k of ["front", "back", "left", "right"] as const) {
      px(A[k], 0, 0, shirt, A[k][2], 4);
      px(S[k], 0, 3, trim, S[k][2], 1);
    }
    fill(S.top, trim);
    fill(A.bottom, shade(skin, 0.9));
  }

  /* 다리 */
  for (const L of [LEG_R, LEG_L]) {
    all(L, pants);
    for (const k of ["front", "back", "left", "right"] as const) {
      px(L[k], 0, 10, shoes, L[k][2], 2);
      px(L[k], 0, 9, shade(pants, 0.82), L[k][2], 1);
    }
    px(L.front, 0, 10, shade(shoes, 1.6), 4, 1);
    fill(L.bottom, shade(shoes, 0.8));
  }

  /* 픽셀마다 살짝 다른 밝기 — 손으로 그린 스킨 느낌 */
  const img = g.getImageData(0, 0, 64, 64);
  let s = (look.seed ?? 1234) || 1234;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const f = 0.93 + rnd() * 0.12;
    img.data[i] = Math.min(255, img.data[i]! * f);
    img.data[i + 1] = Math.min(255, img.data[i + 1]! * f);
    img.data[i + 2] = Math.min(255, img.data[i + 2]! * f);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function makeSkinTexture(look: SteveLook) {
  const t = new THREE.CanvasTexture(paintSkin(look));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** BoxGeometry 6면(+x −x +y −y +z −z)에 스킨 좌표를 입힌다 */
function skinBox(w: number, h: number, d: number, f: BoxFaces, inflate = 0) {
  const geo = new THREE.BoxGeometry((w + inflate * 2) * PX, (h + inflate * 2) * PX, (d + inflate * 2) * PX);
  const order: Rect[] = [f.left, f.right, f.top, f.bottom, f.front, f.back];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const e = 0.02;
  order.forEach(([x, y, rw, rh], i) => {
    const x0 = (x + e) / 64;
    const x1 = (x + rw - e) / 64;
    const y0 = 1 - (y + e) / 64;
    const y1 = 1 - (y + rh - e) / 64;
    uv.setXY(i * 4, x0, y0);
    uv.setXY(i * 4 + 1, x1, y0);
    uv.setXY(i * 4 + 2, x0, y1);
    uv.setXY(i * 4 + 3, x1, y1);
  });
  uv.needsUpdate = true;
  return geo;
}

export function buildSteve(texture: THREE.Texture, mats: THREE.MeshLambertMaterial[]): SteveRig {
  const base = new THREE.MeshLambertMaterial({ map: texture });
  const outer = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  mats.push(base, outer);

  const layered = (w: number, h: number, d: number, inner: BoxFaces, over: BoxFaces | null, inflate: number) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(skinBox(w, h, d, inner), base));
    if (over) g.add(new THREE.Mesh(skinBox(w, h, d, over, inflate), outer));
    return g;
  };

  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 0.75;
  root.add(torso);

  const body = layered(8, 12, 4, BODY, JACKET, 0.25);
  body.position.y = 0.375;
  torso.add(body);

  const head = new THREE.Group();
  head.position.y = 0.75;
  const headMesh = layered(8, 8, 8, HEAD, HAT, 0.5);
  headMesh.position.y = 0.25;
  head.add(headMesh);
  torso.add(head);

  const limb = (inner: BoxFaces, over: BoxFaces | null, x: number, y: number, parent: THREE.Object3D, drop: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = layered(4, 12, 4, inner, over, 0.25);
    m.position.y = -drop;
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  };
  const armL = limb(ARM_L, SLEEVE_L, 0.375, 0.6875, torso, 0.3125);
  const armR = limb(ARM_R, SLEEVE_R, -0.375, 0.6875, torso, 0.3125);
  const legL = limb(LEG_L, null, 0.125, 0.75, root, 0.375);
  const legR = limb(LEG_R, null, -0.125, 0.75, root, 0.375);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, limbs: { root, torso, head, armL, armR, legL, legR }, texture };
}

/**
 * 1인칭 오른팔 (스킨 그대로) — 어깨가 원점, 주먹이 −z(화면 안쪽)를 향한다.
 * 벽에 파묻히지 않도록 깊이 검사 없이 마지막에 그린다.
 */
export function buildFirstPersonArm(texture: THREE.Texture, mats: THREE.MeshLambertMaterial[]) {
  const base = new THREE.MeshLambertMaterial({ map: texture, depthTest: false });
  const outer = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, depthTest: false });
  mats.push(base, outer);
  const g = new THREE.Group();
  const inner = new THREE.Mesh(skinBox(4, 12, 4, ARM_R), base);
  const sleeve = new THREE.Mesh(skinBox(4, 12, 4, SLEEVE_R, 0.25), outer);
  [inner, sleeve].forEach((m, i) => {
    // 팔을 앞으로 뻗은 자세: 손끝은 앞, 팔 앞면은 위
    m.rotation.set(Math.PI / 2, Math.PI, 0);
    m.position.z = -0.375;
    m.renderOrder = 50 + i;
    m.frustumCulled = false;
    g.add(m);
  });
  return g;
}

export type PoseState = {
  t: number;
  walk: number;
  speed: number;
  swing: number;
  pitch: number;
  air?: number;
  land?: number;
  wave?: number;
  /** 0~1 웅크린 정도 */
  sneak?: number;
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function poseSteve(l: SteveLimbs, s: PoseState) {
  const run = Math.min(1.4, Math.max(0, s.speed));
  const amt = Math.min(1, run);
  const sprint = Math.max(0, Math.min(1, (run - 1) / 0.37));
  const idle = 1 - amt;
  const air = s.air ?? 0;
  const ph = s.walk * 3;
  const w = Math.sin(ph);
  const breath = Math.sin(s.t * 2.1);

  // 다리가 팔보다 크게, 달리면 보폭·팔 흔들기가 커진다
  const legAmp = (0.72 + sprint * 0.28) * amt;
  const armAmp = (0.55 + sprint * 0.35) * amt;
  // 앞으로 뻗는 쪽이 살짝 더 크게 (발을 내딛는 느낌)
  const legL = -w * legAmp * (w < 0 ? 1.08 : 0.92);
  const legR = w * legAmp * (w > 0 ? 1.08 : 0.92);

  l.armL.rotation.x = lerp(w * armAmp, -0.35, air);
  l.armR.rotation.x = lerp(-w * armAmp, -0.35, air);
  l.armL.rotation.z = lerp(0.06 + breath * 0.035 * idle + Math.max(0, -w) * 0.06 * amt, 0.6, air);
  l.armR.rotation.z = lerp(-0.06 - breath * 0.035 * idle - Math.max(0, w) * 0.06 * amt, -0.6, air);
  l.legL.rotation.x = lerp(legL, -0.55, air);
  l.legR.rotation.x = lerp(legR, 0.35, air);
  l.legL.rotation.z = 0.02 * amt;
  l.legR.rotation.z = -0.02 * amt;

  // 상체: 걸음에 맞춰 살짝 비틀고, 달릴수록 앞으로 숙인다
  let torsoYaw = w * 0.07 * amt;
  if (s.swing > 0) {
    const k = Math.sin((1 - s.swing / 0.28) * Math.PI);
    l.armR.rotation.x = -k * 1.9;
    l.armR.rotation.z = -k * 0.35;
    torsoYaw = -k * 0.25;
  }
  l.torso.rotation.y = torsoYaw;
  if (s.wave && s.wave > 0) {
    const k = Math.min(1, s.wave);
    l.armR.rotation.x = lerp(l.armR.rotation.x, 0, k);
    l.armR.rotation.z = lerp(l.armR.rotation.z, -2.6 + Math.sin(s.t * 12) * 0.35, k);
  }

  // 한 걸음에 두 번 오르내림 · 좌우로 체중 이동
  const bob = (1 - Math.abs(Math.cos(ph))) * (0.045 + sprint * 0.03) * amt;
  l.torso.position.y = 0.75 + breath * 0.006 * idle;
  l.torso.rotation.x = 0.05 * amt + 0.16 * sprint + air * 0.1;
  l.torso.rotation.z = Math.cos(ph) * 0.025 * amt;
  l.root.position.y = bob;
  l.root.position.x = Math.cos(ph) * 0.02 * amt;

  // 웅크리기: 상체를 앞으로 숙이고 엉덩이를 뒤로 빼며 몸 전체가 내려간다
  const sn = s.sneak ?? 0;
  l.torso.rotation.x = lerp(l.torso.rotation.x, 0.5, sn);
  l.torso.position.y -= 0.12 * sn;
  l.torso.position.z = 0.04 * sn;
  l.legL.position.z = -0.16 * sn;
  l.legR.position.z = -0.16 * sn;

  // 머리: 숙인 몸만큼 들어 앞을 보고, 걸음 반대로 아주 살짝 흔들린다
  l.head.rotation.x = -s.pitch * 0.6 + breath * 0.02 * idle - l.torso.rotation.x * 0.8;
  l.head.rotation.y = Math.sin(s.t * 0.6) * 0.18 * idle * (1 - air) - torsoYaw * 0.6;
  l.head.rotation.z = -l.torso.rotation.z * 0.7;

  const land = s.land ?? 0;
  l.root.scale.set(1 + land * 0.08, 1 - land * 0.14, 1 + land * 0.08);
}
