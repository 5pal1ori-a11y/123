import * as THREE from "three";
import type { MobKind } from "@/lib/voxel/worldgen";
import { mulberry32 } from "@/lib/voxel/noise";
import { COLORS } from "@/lib/voxel/blocks";

export type MobSpec = {
  name: string;
  hp: number;
  w: number;
  h: number;
  speed: number;
  hostile: boolean;
  damage: number;
  drops: { item: string; min: number; max: number }[];
  burns?: boolean;
};

/** 마인크래프트 자바 에디션 체력 · 크기 · 드롭 */
export const MOBS: Record<MobKind, MobSpec> = {
  pig: { name: "돼지", hp: 10, w: 0.9, h: 0.9, speed: 1.6, hostile: false, damage: 0, drops: [{ item: "porkchop", min: 1, max: 3 }] },
  cow: {
    name: "소",
    hp: 10,
    w: 0.9,
    h: 1.4,
    speed: 1.5,
    hostile: false,
    damage: 0,
    drops: [
      { item: "beef", min: 1, max: 3 },
      { item: "leather", min: 0, max: 2 },
    ],
  },
  sheep: {
    name: "양",
    hp: 8,
    w: 0.9,
    h: 1.3,
    speed: 1.5,
    hostile: false,
    damage: 0,
    drops: [
      { item: "white_wool", min: 1, max: 1 },
      { item: "mutton", min: 1, max: 2 },
    ],
  },
  chicken: {
    name: "닭",
    hp: 4,
    w: 0.4,
    h: 0.7,
    speed: 1.4,
    hostile: false,
    damage: 0,
    drops: [
      { item: "chicken", min: 1, max: 1 },
      { item: "feather", min: 0, max: 2 },
    ],
  },
  zombie: { name: "좀비", hp: 20, w: 0.6, h: 1.95, speed: 2.3, hostile: true, damage: 3, burns: true, drops: [{ item: "rotten_flesh", min: 0, max: 2 }] },
  skeleton: {
    name: "스켈레톤",
    hp: 20,
    w: 0.6,
    h: 1.99,
    speed: 2.5,
    hostile: true,
    damage: 3,
    burns: true,
    drops: [
      { item: "bone", min: 0, max: 2 },
      { item: "arrow", min: 0, max: 2 },
    ],
  },
  creeper: { name: "크리퍼", hp: 20, w: 0.6, h: 1.7, speed: 2.2, hostile: true, damage: 0, drops: [{ item: "gunpowder", min: 0, max: 2 }] },
  spider: { name: "거미", hp: 16, w: 1.4, h: 0.9, speed: 3.0, hostile: true, damage: 2, drops: [{ item: "string", min: 0, max: 2 }] },
};

type Part = { mesh: THREE.Mesh; base: THREE.Euler };

/* ───────────── 스킨 (마인크래프트 박스 UV 전개도) ─────────────
 * 박스 (w,h,d) 픽셀을 (u,v) 에 펼치면
 *   윗면 (u+d, v) w×d · 아랫면 (u+d+w, v) w×d
 *   오른쪽 (u, v+d) d×h · 앞 (u+d, v+d) w×h · 왼쪽 (u+d+w, v+d) d×h · 뒤 (u+2d+w, v+d) w×h
 * 몹은 +Z 를 바라보고, 오른쪽은 −X 다. */

const S = 1 / 16;

type Box = { u: number; v: number; w: number; h: number; d: number };
const bx = (u: number, v: number, w: number, h: number, d: number): Box => ({ u, v, w, h, d });

class Skin {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  private r: () => number;
  constructor(
    readonly W: number,
    readonly H: number,
    seed: number,
  ) {
    this.c = document.createElement("canvas");
    this.c.width = W;
    this.c.height = H;
    this.g = this.c.getContext("2d")!;
    this.r = mulberry32(seed);
  }
  rand() {
    return this.r();
  }
  /** 한 칸씩 밝기를 흔든 단색 */
  fill(x: number, y: number, w: number, h: number, hex: number, amount = 0.08) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const f = 1 - amount + this.r() * amount * 2;
        this.p(x + i, y + j, hex, 1, 1, f);
      }
  }
  /** 여러 색 중 무작위로 골라 얼룩지게 */
  mottle(x: number, y: number, w: number, h: number, palette: number[], weights?: number[]) {
    const total = weights ? weights.reduce((a, b) => a + b, 0) : palette.length;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let k = this.r() * total;
        let idx = 0;
        if (weights)
          while (idx < weights.length - 1 && k >= weights[idx]!) {
            k -= weights[idx]!;
            idx++;
          }
        else idx = Math.floor(k);
        this.p(x + i, y + j, palette[idx]!);
      }
  }
  p(x: number, y: number, hex: number, w = 1, h = 1, f = 1) {
    const r = Math.min(255, ((hex >> 16) & 255) * f) | 0;
    const g = Math.min(255, ((hex >> 8) & 255) * f) | 0;
    const b = Math.min(255, (hex & 255) * f) | 0;
    this.g.fillStyle = `rgb(${r},${g},${b})`;
    this.g.fillRect(x, y, w, h);
  }
  /** 전개도 전체 */
  box(b: Box, hex: number, amount = 0.08) {
    this.fill(b.u + b.d, b.v, b.w * 2, b.d, hex, amount);
    this.fill(b.u, b.v + b.d, b.d * 2 + b.w * 2, b.h, hex, amount);
  }
  boxMottle(b: Box, palette: number[], weights?: number[]) {
    this.mottle(b.u + b.d, b.v, b.w * 2, b.d, palette, weights);
    this.mottle(b.u, b.v + b.d, b.d * 2 + b.w * 2, b.h, palette, weights);
  }
  /** 앞면 기준 좌표로 칠하기 */
  front(b: Box, x: number, y: number, hex: number, w = 1, h = 1) {
    this.p(b.u + b.d + x, b.v + b.d + y, hex, w, h);
  }
  top(b: Box, x: number, y: number, hex: number, w = 1, h = 1) {
    this.p(b.u + b.d + x, b.v + y, hex, w, h);
  }
  back(b: Box, x: number, y: number, hex: number, w = 1, h = 1) {
    this.p(b.u + b.d * 2 + b.w + x, b.v + b.d + y, hex, w, h);
  }
  /** 네 옆면을 한 줄로 두르는 띠 (소매 · 신발 · 발굽) */
  band(b: Box, y: number, rows: number, hex: number, amount = 0.06) {
    this.fill(b.u, b.v + b.d + y, b.d * 2 + b.w * 2, rows, hex, amount);
  }
  texture() {
    const t = new THREE.CanvasTexture(this.c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}

/** 박스 UV + 면 밝기 (위 1 · 앞뒤 0.8 · 옆 0.6 · 아래 0.5) */
function cubeGeo(b: Box, W: number, H: number, inflate = 0) {
  const g = new THREE.BoxGeometry((b.w + inflate * 2) * S, (b.h + inflate * 2) * S, (b.d + inflate * 2) * S);
  const { u, v, w, h, d } = b;
  // BoxGeometry 면 순서: +X(왼쪽) −X(오른쪽) +Y −Y +Z(앞) −Z(뒤)
  const rects: [number, number, number, number][] = [
    [u + d + w, v + d, d, h],
    [u, v + d, d, h],
    [u + d, v, w, d],
    [u + d + w, v, w, d],
    [u + d, v + d, w, h],
    [u + d * 2 + w, v + d, w, h],
  ];
  const uv = g.attributes.uv as THREE.BufferAttribute;
  rects.forEach(([x, y, rw, rh], f) => {
    const u0 = x / W;
    const u1 = (x + rw) / W;
    const v0 = 1 - (y + rh) / H;
    const v1 = 1 - y / H;
    uv.setXY(f * 4, u0, v1);
    uv.setXY(f * 4 + 1, u1, v1);
    uv.setXY(f * 4 + 2, u0, v0);
    uv.setXY(f * 4 + 3, u1, v0);
  });
  uv.needsUpdate = true;
  const shades = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
  const col = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) col.set([shades[f]!, shades[f]!, shades[f]!], (f * 4 + k) * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/* ───────────── 몹별 스킨 ───────────── */

const PIG = { head: bx(0, 0, 8, 8, 8), snout: bx(32, 0, 4, 3, 1), body: bx(0, 16, 10, 8, 16), leg: bx(44, 0, 4, 6, 4) };
const COW = { head: bx(0, 0, 8, 8, 6), horn: bx(28, 0, 1, 3, 1), body: bx(0, 14, 12, 10, 18), leg: bx(0, 42, 4, 12, 4), udder: bx(16, 42, 4, 1, 6) };
const SHEEP = { head: bx(0, 0, 6, 6, 8), body: bx(0, 14, 8, 6, 16), leg: bx(0, 36, 4, 12, 4) };
const WOOL = { body: bx(0, 0, 8, 6, 16), head: bx(0, 22, 6, 6, 6), leg: bx(24, 22, 4, 6, 4) };
const CHICKEN = { head: bx(0, 0, 4, 6, 3), beak: bx(16, 0, 4, 2, 2), wattle: bx(28, 0, 2, 2, 2), body: bx(0, 10, 6, 6, 8), wing: bx(28, 10, 1, 4, 6), leg: bx(44, 10, 1, 5, 1), foot: bx(48, 10, 3, 1, 2) };
const HUMAN = { head: bx(0, 0, 8, 8, 8), body: bx(16, 16, 8, 12, 4), arm: bx(40, 16, 4, 12, 4), leg: bx(0, 16, 4, 12, 4), thinArm: bx(40, 16, 2, 12, 2), thinLeg: bx(0, 16, 2, 12, 2), bow: bx(56, 0, 1, 1, 1) };
const CREEPER = { head: bx(0, 0, 8, 8, 8), body: bx(16, 16, 8, 12, 4), leg: bx(0, 16, 4, 6, 4) };
const SPIDER = { head: bx(0, 0, 8, 8, 8), neck: bx(32, 0, 6, 6, 6), body: bx(0, 16, 10, 8, 12), leg: bx(0, 36, 16, 2, 2) };

function paintPig(s: Skin) {
  const pink = 0xf0a5a2;
  s.box(PIG.head, pink, 0.05);
  s.box(PIG.body, pink, 0.05);
  s.box(PIG.leg, pink, 0.05);
  s.box(PIG.snout, 0xf6b9b6, 0.03);
  // 연한 얼룩
  for (let i = 0; i < 14; i++) s.p(PIG.body.u + Math.floor(s.rand() * 52), PIG.body.v + 16 + Math.floor(s.rand() * 8), 0xe58f8d);
  const h = PIG.head;
  s.front(h, 0, 3, 0xffffff);
  s.front(h, 1, 3, 0x1a1a1a);
  s.front(h, 6, 3, 0x1a1a1a);
  s.front(h, 7, 3, 0xffffff);
  s.front(h, 2, 7, 0xe08f8c, 4, 1);
  s.front(PIG.snout, 0, 1, 0x8e4a4c);
  s.front(PIG.snout, 3, 1, 0x8e4a4c);
  s.front(PIG.snout, 1, 0, 0xfbc8c5, 2, 1);
  // 발굽
  s.band(PIG.leg, 5, 1, 0xb87a76);
}

function paintCow(s: Skin) {
  const brown = 0x433626;
  const white = 0xe8e6e2;
  s.box(COW.head, brown, 0.08);
  s.box(COW.body, brown, 0.08);
  s.box(COW.leg, white, 0.05);
  s.box(COW.horn, 0xd8d0bc, 0.04);
  s.top(COW.horn, 0, 0, 0x8c8473);
  s.box(COW.udder, 0xe59a9a, 0.04);
  // 흰 얼룩 무늬 (고정 배치)
  const b = COW.body;
  // 전개도 기준 (옆면 띠는 v+18 부터 10줄, 윗면은 v..v+18)
  const patches: [number, number, number, number][] = [
    [3, 20, 7, 5],
    [14, 23, 6, 4],
    [26, 19, 8, 6],
    [40, 22, 6, 5],
    [50, 19, 7, 5],
    [22, 2, 7, 6],
    [26, 11, 5, 5],
  ];
  for (const [x, y, w, h] of patches) s.fill(b.u + x, b.v + y, w, h, white, 0.04);
  // 다리: 위는 갈색, 발굽은 진회색
  s.band(COW.leg, 0, 5, brown);
  s.band(COW.leg, 11, 1, 0x4a4540);
  const h = COW.head;
  s.front(h, 3, 0, white, 2, 4);
  s.front(h, 1, 3, 0x111111);
  s.front(h, 0, 3, 0xffffff);
  s.front(h, 6, 3, 0x111111);
  s.front(h, 7, 3, 0xffffff);
  s.front(h, 2, 5, 0xb3a596, 4, 3);
  s.front(h, 2, 6, 0x5c4f45);
  s.front(h, 5, 6, 0x5c4f45);
}

function paintSheep(s: Skin) {
  const face = 0xdcc6af;
  s.box(SHEEP.head, face, 0.05);
  s.box(SHEEP.body, 0xd8d2c8, 0.05);
  s.box(SHEEP.leg, face, 0.05);
  s.band(SHEEP.leg, 11, 1, 0x8a7a6a);
  const h = SHEEP.head;
  s.front(h, 0, 2, 0xffffff);
  s.front(h, 1, 2, 0x1a1a1a);
  s.front(h, 4, 2, 0x1a1a1a);
  s.front(h, 5, 2, 0xffffff);
  s.front(h, 2, 4, 0xe6a1a1, 2, 1);
  s.front(h, 2, 5, 0xc9a993, 2, 1);
}

function paintWool(s: Skin) {
  const pal = [0xf4f4f4, 0xe9e9e9, 0xffffff, 0xdcdcdc];
  const w = [5, 3, 2, 1];
  s.boxMottle(WOOL.body, pal, w);
  s.boxMottle(WOOL.head, pal, w);
  s.boxMottle(WOOL.leg, pal, w);
}

function paintChicken(s: Skin) {
  const white = 0xf6f6f6;
  s.box(CHICKEN.head, white, 0.03);
  s.box(CHICKEN.body, white, 0.04);
  s.box(CHICKEN.wing, 0xebebeb, 0.04);
  s.box(CHICKEN.beak, 0xf9b233, 0.05);
  s.band(CHICKEN.beak, 1, 1, 0xe39a1c);
  s.box(CHICKEN.wattle, 0xc9302c, 0.05);
  s.box(CHICKEN.leg, 0xe8a33a, 0.04);
  s.box(CHICKEN.foot, 0xe8a33a, 0.04);
  s.front(CHICKEN.head, 0, 2, 0x111111);
  s.front(CHICKEN.head, 3, 2, 0x111111);
  // 꼬리 깃털 쪽 그림자
  s.back(CHICKEN.body, 0, 0, 0xdedede, 6, 2);
}

function paintZombie(s: Skin) {
  const skin = 0x5b9e47;
  const dark = 0x3f7232;
  const shirt = 0x2e9d9e;
  const pants = 0x463ea0;
  s.box(HUMAN.head, skin, 0.07);
  s.fill(HUMAN.head.u + 8, HUMAN.head.v, 8, 8, dark, 0.08);
  s.band(HUMAN.head, 0, 1, dark);
  const h = HUMAN.head;
  s.front(h, 0, 0, dark, 8, 2);
  s.front(h, 1, 4, 0x182016, 2, 1);
  s.front(h, 5, 4, 0x182016, 2, 1);
  s.front(h, 3, 5, 0x47803a, 2, 1);
  s.front(h, 2, 6, 0x325c28, 4, 1);
  s.box(HUMAN.body, shirt, 0.08);
  s.band(HUMAN.body, 10, 2, pants);
  s.box(HUMAN.arm, skin, 0.07);
  s.band(HUMAN.arm, 0, 4, shirt);
  s.box(HUMAN.leg, pants, 0.08);
  s.band(HUMAN.leg, 10, 2, 0x5a5a5a);
}

function paintSkeleton(s: Skin) {
  const bone = 0xbcbcbc;
  const light = 0xd6d6d6;
  const gap = 0x3c3c3c;
  s.box(HUMAN.head, bone, 0.06);
  const h = HUMAN.head;
  s.front(h, 1, 3, 0x1e1e1e, 2, 2);
  s.front(h, 5, 3, 0x1e1e1e, 2, 2);
  s.front(h, 3, 5, 0x5a5a5a, 2, 1);
  s.front(h, 1, 6, gap, 6, 1);
  for (let x = 1; x < 7; x += 2) s.front(h, x, 6, light);
  // 갈비뼈
  const b = HUMAN.body;
  s.box(b, gap, 0.04);
  for (let y = 0; y < 8; y += 2) s.band(b, y, 1, bone, 0.05);
  s.front(b, 3, 0, light, 2, 12);
  s.back(b, 3, 0, light, 2, 12);
  s.band(b, 9, 3, bone, 0.05);
  s.box(HUMAN.thinArm, bone, 0.06);
  s.box(HUMAN.thinLeg, bone, 0.06);
  s.box(HUMAN.bow, 0x6b4a28, 0.05);
}

function paintCreeper(s: Skin) {
  const pal = [0x5db443, 0x4ca33a, 0x8bd873, 0x3c8a2c, 0x6dc556, 0xbfe9b0, 0x2b6620];
  const w = [6, 4, 3, 2, 3, 1, 1];
  s.boxMottle(CREEPER.head, pal, w);
  s.boxMottle(CREEPER.body, pal, w);
  s.boxMottle(CREEPER.leg, pal, w);
  const h = CREEPER.head;
  const k = 0x0f0f0f;
  s.front(h, 1, 2, k, 2, 2);
  s.front(h, 5, 2, k, 2, 2);
  s.front(h, 3, 4, k, 2, 1);
  s.front(h, 2, 5, k, 4, 2);
  s.front(h, 2, 7, k);
  s.front(h, 5, 7, k);
  s.front(h, 3, 5, 0x262626, 2, 1);
}

function paintSpider(s: Skin) {
  const pal = [0x342c25, 0x2a231d, 0x433830, 0x1f1a16];
  s.boxMottle(SPIDER.head, pal);
  s.boxMottle(SPIDER.neck, pal);
  s.boxMottle(SPIDER.body, pal);
  s.box(SPIDER.leg, 0x2a231d, 0.1);
  // 배 등의 붉은 갈색 무늬
  const b = SPIDER.body;
  for (let y = 1; y < 12; y += 3) s.p(b.u + b.d + 2, b.v + y, 0x5a3424, 6, 1);
  s.p(b.u + b.d + 4, b.v + 1, 0x6b3e2b, 2, 10);
  const h = SPIDER.head;
  const red = 0xd81818;
  const red2 = 0x9e0f0f;
  s.front(h, 1, 4, red, 2, 1);
  s.front(h, 5, 4, red, 2, 1);
  s.front(h, 2, 3, red2);
  s.front(h, 5, 3, red2);
  s.front(h, 0, 5, red2);
  s.front(h, 7, 5, red2);
  s.front(h, 3, 2, red2);
  s.front(h, 4, 2, red2);
}

const SKINS: Record<string, [number, number, (s: Skin) => void]> = {
  pig: [64, 32, paintPig],
  cow: [64, 64, paintCow],
  sheep: [64, 64, paintSheep],
  wool: [64, 64, paintWool],
  chicken: [64, 32, paintChicken],
  zombie: [64, 64, paintZombie],
  skeleton: [64, 64, paintSkeleton],
  creeper: [64, 32, paintCreeper],
  spider: [64, 64, paintSpider],
};

const texCache = new Map<string, { tex: THREE.Texture; W: number; H: number }>();
function skinTex(key: string) {
  let t = texCache.get(key);
  if (!t) {
    const [W, H, paint] = SKINS[key]!;
    const s = new Skin(W, H, key.length * 977 + key.charCodeAt(0));
    paint(s);
    t = { tex: s.texture(), W, H };
    texCache.set(key, t);
  }
  return t;
}

/* ───────────── 모델 ───────────── */

export type MobModel = {
  root: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
  head: THREE.Object3D | null;
  legs: Part[];
  arms: Part[];
  body: THREE.Object3D;
  /** 털 깎으면 숨길 부분 */
  wool: THREE.Object3D[];
  woolMats: THREE.MeshBasicMaterial[];
};

export function buildMob(kind: MobKind): MobModel {
  const root = new THREE.Group();
  const mats: THREE.MeshBasicMaterial[] = [];
  const legs: Part[] = [];
  const arms: Part[] = [];
  const wool: THREE.Object3D[] = [];
  const woolMats: THREE.MeshBasicMaterial[] = [];
  let head: THREE.Object3D | null = null;
  const body = new THREE.Group();
  root.add(body);

  const sk = skinTex(kind);
  const mat = new THREE.MeshBasicMaterial({ map: sk.tex, vertexColors: true });
  mats.push(mat);

  /** 픽셀 좌표 (중심) 에 박스 */
  const cube = (b: Box, x: number, y: number, z: number, parent: THREE.Object3D = body, m = mat, inflate = 0, W = sk.W, H = sk.H) => {
    const mesh = new THREE.Mesh(cubeGeo(b, W, H, inflate), m);
    mesh.position.set(x * S, y * S, z * S);
    parent.add(mesh);
    return mesh;
  };
  /** 관절(피벗) 아래로 매달린 팔다리. (ox,oy,oz) 는 피벗 기준 박스 중심 */
  const limb = (list: Part[], b: Box, px: number, py: number, pz: number, ox = 0, oy = -b.h / 2, oz = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(px * S, py * S, pz * S);
    cube(b, ox, oy, oz, pivot);
    body.add(pivot);
    list.push({ mesh: pivot as unknown as THREE.Mesh, base: pivot.rotation.clone() });
    return pivot;
  };
  const headAt = (px: number, py: number, pz: number) => {
    const g = new THREE.Group();
    g.position.set(px * S, py * S, pz * S);
    body.add(g);
    head = g;
    return g;
  };

  if (kind === "pig") {
    cube(PIG.body, 0, 10, 0);
    const hd = headAt(0, 12, 6);
    cube(PIG.head, 0, 0, 4, hd);
    cube(PIG.snout, 0, -1.5, 8.5, hd);
    for (const [x, z] of [
      [-3, 5],
      [3, 5],
      [-3, -7],
      [3, -7],
    ] as const)
      limb(legs, PIG.leg, x, 6, z);
  } else if (kind === "cow") {
    cube(COW.body, 0, 17, -1);
    cube(COW.udder, 0, 11.5, -7);
    const hd = headAt(0, 20, 8);
    cube(COW.head, 0, 0, 3, hd);
    cube(COW.horn, -4.5, 3.5, 3.5, hd);
    cube(COW.horn, 4.5, 3.5, 3.5, hd);
    for (const [x, z] of [
      [-4, 6],
      [4, 6],
      [-4, -7],
      [4, -7],
    ] as const)
      limb(legs, COW.leg, x, 12, z);
  } else if (kind === "sheep") {
    const wt = skinTex("wool");
    const wm = new THREE.MeshBasicMaterial({ map: wt.tex, vertexColors: true });
    woolMats.push(wm);
    cube(SHEEP.body, 0, 15, 0);
    wool.push(cube(WOOL.body, 0, 15, 0, body, wm, 1.75, wt.W, wt.H));
    const hd = headAt(0, 19, 6);
    cube(SHEEP.head, 0, 0, 4, hd);
    wool.push(cube(WOOL.head, 0, 0.4, 3, hd, wm, 0.6, wt.W, wt.H));
    for (const [x, z] of [
      [-3, 5],
      [3, 5],
      [-3, -7],
      [3, -7],
    ] as const) {
      const p = limb(legs, SHEEP.leg, x, 12, z);
      const w = new THREE.Mesh(cubeGeo(WOOL.leg, wt.W, wt.H, 0.5), wm);
      w.position.set(0, -3 * S, 0);
      p.add(w);
      wool.push(w);
    }
  } else if (kind === "chicken") {
    cube(CHICKEN.body, 0, 8, 0);
    const hd = headAt(0, 9, 3);
    cube(CHICKEN.head, 0, 3, 1.5, hd);
    cube(CHICKEN.beak, 0, 3, 4, hd);
    cube(CHICKEN.wattle, 0, 1, 3, hd);
    for (const x of [-1.5, 1.5]) {
      const p = limb(legs, CHICKEN.leg, x, 5, 0.5);
      cube(CHICKEN.foot, 0, -4.5, 1, p);
    }
    limb(arms, CHICKEN.wing, -3.5, 11, 0);
    limb(arms, CHICKEN.wing, 3.5, 11, 0);
  } else if (kind === "zombie" || kind === "skeleton") {
    const zombie = kind === "zombie";
    cube(HUMAN.body, 0, 18, 0);
    const hd = headAt(0, 24, 0);
    cube(HUMAN.head, 0, 4, 0, hd);
    const arm = zombie ? HUMAN.arm : HUMAN.thinArm;
    const leg = zombie ? HUMAN.leg : HUMAN.thinLeg;
    limb(arms, arm, -5, 22, 0, zombie ? -1 : 0, -4);
    limb(arms, arm, 5, 22, 0, zombie ? 1 : 0, -4);
    limb(legs, leg, zombie ? -1.9 : -2, 12, 0);
    limb(legs, leg, zombie ? 1.9 : 2, 12, 0);
    if (!zombie) {
      // 활: 손끝에서 위아래로 휘어진 나무
      const hand = arms[1]!.mesh;
      const bow = new THREE.Group();
      bow.position.set(0, -10 * S, 1.5 * S);
      bow.rotation.x = Math.PI / 2;
      const seg = (y: number, z: number, len: number) => {
        const m = new THREE.Mesh(cubeGeo(HUMAN.bow, sk.W, sk.H), mat);
        m.scale.set(1, len, 1);
        m.position.set(0, y * S, z * S);
        bow.add(m);
      };
      seg(0, 0, 4);
      seg(4, -1, 4);
      seg(-4, -1, 4);
      seg(7, -2.5, 3);
      seg(-7, -2.5, 3);
      hand.add(bow);
    }
  } else if (kind === "creeper") {
    cube(CREEPER.body, 0, 12, 0);
    const hd = headAt(0, 18, 0);
    cube(CREEPER.head, 0, 4, 0, hd);
    for (const [x, z] of [
      [-2, 4],
      [2, 4],
      [-2, -4],
      [2, -4],
    ] as const)
      limb(legs, CREEPER.leg, x, 6, z);
  } else {
    cube(SPIDER.neck, 0, 9, 0);
    cube(SPIDER.body, 0, 9, -9);
    const hd = headAt(0, 9, 3);
    cube(SPIDER.head, 0, 0, 4, hd);
    // 마인크래프트 거미 다리 각도 (뒤 → 앞)
    const yRot = [0.785, 0.393, -0.393, -0.785];
    const zRot = [0.785, 0.58, 0.58, 0.785];
    const zs = [-2, -1, 0, 1];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      const pivot = new THREE.Group();
      pivot.position.set(side * 4 * S, 9 * S, zs[k]! * S);
      cube(SPIDER.leg, side * 7, 0, 0, pivot);
      pivot.rotation.z = -side * zRot[k]!;
      pivot.rotation.y = side * yRot[k]!;
      body.add(pivot);
      legs.push({ mesh: pivot as unknown as THREE.Mesh, base: pivot.rotation.clone() });
    }
  }
  return { root, mats, head, legs, arms, body, wool, woolMats };
}

/* ───────────── 상태 ───────────── */

export type Mob = {
  id: number;
  kind: MobKind;
  spec: MobSpec;
  model: MobModel;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  onGround: boolean;
  hurtT: number;
  deadT: number;
  walk: number;
  /** 배회 목표 */
  target: THREE.Vector3 | null;
  thinkT: number;
  fleeT: number;
  attackT: number;
  fuse: number;
  burnT: number;
  sheared: boolean;
  persistent: boolean;
  fallStart: number;
  /** 양털 색 */
  woolColor?: string;
};

let nextId = 1;

/** 자연 양털 색 (마인크래프트 확률) */
function naturalWool() {
  const r = Math.random() * 100;
  if (r < 5) return "black";
  if (r < 10) return "gray";
  if (r < 15) return "light_gray";
  if (r < 18) return "brown";
  if (r < 18.164) return "pink";
  return "white";
}

export function setWoolColor(m: Mob, color: string) {
  m.woolColor = color;
  const hex = COLORS.find(([c]) => c === color)?.[2] ?? 0xffffff;
  for (const mt of m.model.woolMats) mt.userData.tint = new THREE.Color(hex);
}

export function createMob(kind: MobKind, x: number, y: number, z: number, persistent: boolean): Mob {
  const spec = MOBS[kind];
  const m: Mob = {
    id: nextId++,
    kind,
    spec,
    model: buildMob(kind),
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    yaw: Math.random() * Math.PI * 2,
    hp: spec.hp,
    onGround: false,
    hurtT: 0,
    deadT: 0,
    walk: 0,
    target: null,
    thinkT: Math.random() * 3,
    fleeT: 0,
    attackT: 0,
    fuse: 0,
    burnT: 0,
    sheared: false,
    persistent,
    fallStart: y,
  };
  if (kind === "sheep") setWoolColor(m, naturalWool());
  return m;
}

/** 걷기 · 다치기 · 죽기 · 크리퍼 부풀기 애니메이션 */
export function animateMob(m: Mob, dt: number, bright: number, time: number) {
  const md = m.model;
  const speed = Math.hypot(m.vel.x, m.vel.z);
  m.walk += speed * dt * 2.6;
  const swing = Math.sin(m.walk) * Math.min(1, speed / 1.5) * 0.7;
  md.legs.forEach((l, i) => {
    if (m.kind === "spider") {
      l.mesh.rotation.y = l.base.y + Math.sin(m.walk * 1.4 + i * 1.3) * 0.25 * Math.min(1, speed);
      l.mesh.rotation.z = l.base.z + Math.cos(m.walk * 1.4 + i * 1.3) * 0.12 * Math.min(1, speed);
    } else l.mesh.rotation.x = (i % 2 === 0) !== (i >= 2) ? swing : -swing;
  });
  md.arms.forEach((a, i) => {
    if (m.kind === "zombie") a.mesh.rotation.x = -Math.PI / 2 + Math.sin(time * 2 + i) * 0.05;
    else if (m.kind === "skeleton") a.mesh.rotation.x = -Math.PI / 2 + (i === 0 ? 0.15 : 0);
    else if (m.kind === "chicken") a.mesh.rotation.z = (i === 0 ? -1 : 1) * (m.onGround ? 0 : Math.abs(Math.sin(time * 18)) * 0.9);
    else a.mesh.rotation.x = -swing;
  });
  for (const w of md.wool) w.visible = !m.sheared;
  md.root.position.copy(m.pos);
  md.root.rotation.y = m.yaw;
  if (m.deadT > 0) md.root.rotation.z = Math.min(1, m.deadT * 2.5) * (Math.PI / 2);
  let r = bright;
  let g = bright;
  let b = bright;
  if (m.hurtT > 0 || m.deadT > 0) {
    g *= 0.45;
    b *= 0.45;
    r = Math.min(1, r * 1.4 + 0.2);
  }
  if (m.burnT > 0 && Math.sin(time * 30) > 0) {
    r = Math.min(1, r + 0.4);
    g = Math.min(1, g + 0.15);
  }
  if (m.fuse > 0) {
    const flash = Math.sin(m.fuse * 24) > 0 ? 1 : 0;
    r = g = b = Math.min(1.6, bright + flash * 0.8);
    md.body.scale.setScalar(1 + m.fuse * 0.12);
  } else md.body.scale.setScalar(1);
  for (const mt of md.mats) mt.color.setRGB(r, g, b);
  for (const mt of md.woolMats) {
    const t = mt.userData.tint as THREE.Color | undefined;
    mt.color.setRGB(r * (t?.r ?? 1), g * (t?.g ?? 1), b * (t?.b ?? 1));
  }
}

export function disposeMob(m: Mob) {
  m.model.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
  for (const mt of m.model.mats) mt.dispose();
  for (const mt of m.model.woolMats) mt.dispose();
}
