/**
 * 야생 월드 생성기 — 대륙 · 침식 · 봉우리 노이즈로 지형을, 기온 · 습도로 생물군계를 정하고
 * 치즈 · 스파게티 동굴, 협곡, 깊이별 광석, 나무 · 풀 · 꽃을 시드에 따라 똑같이 만든다.
 * 높이 0~127 (바다 62). 마인크래프트의 y −64~320 을 줄인 배치라 심층암은 y 16 아래에서 나온다.
 */

import { B, bid, ORE_INFO, type OreKey, type TreeKind } from "./blocks";
import { hash3, mulberry32, Simplex } from "./noise";

export const CS = 16;
export const H = 128;
export const SEA = 62;
export const DEEP = 16;

export const idx = (x: number, y: number, z: number) => (y << 8) | (z << 4) | x;

export type BiomeKey =
  | "ocean"
  | "deep_ocean"
  | "frozen_ocean"
  | "beach"
  | "snowy_beach"
  | "river"
  | "frozen_river"
  | "plains"
  | "sunflower_plains"
  | "forest"
  | "birch_forest"
  | "taiga"
  | "snowy_plains"
  | "snowy_taiga"
  | "desert"
  | "savanna"
  | "swamp"
  | "jungle"
  | "windswept_hills"
  | "stony_peaks"
  | "snowy_peaks";

export type BiomeInfo = { key: BiomeKey; name: string; grass: number; foliage: number; water: number; snowy?: boolean };

export const BIOMES: BiomeInfo[] = [
  { key: "ocean", name: "해양", grass: 0x8eb971, foliage: 0x71a74d, water: 0x3f76e4 },
  { key: "deep_ocean", name: "깊은 해양", grass: 0x8eb971, foliage: 0x71a74d, water: 0x3f76e4 },
  { key: "frozen_ocean", name: "얼어붙은 해양", grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9, snowy: true },
  { key: "beach", name: "해변", grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },
  { key: "snowy_beach", name: "눈 덮인 해변", grass: 0x83b593, foliage: 0x64a278, water: 0x3d57d6, snowy: true },
  { key: "river", name: "강", grass: 0x8eb971, foliage: 0x71a74d, water: 0x3f76e4 },
  { key: "frozen_river", name: "얼어붙은 강", grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9, snowy: true },
  { key: "plains", name: "평원", grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },
  { key: "sunflower_plains", name: "해바라기 평원", grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4 },
  { key: "forest", name: "숲", grass: 0x79c05a, foliage: 0x59ae30, water: 0x3f76e4 },
  { key: "birch_forest", name: "자작나무 숲", grass: 0x88bb67, foliage: 0x6ba941, water: 0x3f76e4 },
  { key: "taiga", name: "타이가", grass: 0x86b783, foliage: 0x68a464, water: 0x287082 },
  { key: "snowy_plains", name: "눈 덮인 평원", grass: 0x80b497, foliage: 0x60a17b, water: 0x3938c9, snowy: true },
  { key: "snowy_taiga", name: "눈 덮인 타이가", grass: 0x80b497, foliage: 0x60a17b, water: 0x3d57d6, snowy: true },
  { key: "desert", name: "사막", grass: 0xbfb755, foliage: 0xaea42a, water: 0x32a598 },
  { key: "savanna", name: "사바나", grass: 0xbfb755, foliage: 0xaea42a, water: 0x2c8b9c },
  { key: "swamp", name: "늪", grass: 0x6a7039, foliage: 0x6a7039, water: 0x617b64 },
  { key: "jungle", name: "정글", grass: 0x59c93c, foliage: 0x30bb0b, water: 0x14a2c5 },
  { key: "windswept_hills", name: "바람이 세찬 언덕", grass: 0x8ab689, foliage: 0x6da36b, water: 0x007bf7 },
  { key: "stony_peaks", name: "돌투성이 봉우리", grass: 0x9abe4b, foliage: 0x82ac1e, water: 0x3f76e4 },
  { key: "snowy_peaks", name: "눈 덮인 봉우리", grass: 0x80b497, foliage: 0x60a17b, water: 0x3f76e4, snowy: true },
];

const BIOME_ID = new Map(BIOMES.map((b, i) => [b.key, i]));
export const biomeId = (k: BiomeKey) => BIOME_ID.get(k)!;

export type MobKind = "pig" | "cow" | "sheep" | "chicken" | "zombie" | "skeleton" | "creeper" | "spider";

export type ChunkData = {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  meta: Uint8Array;
  biomes: Uint8Array;
  /** 칸마다 섞은 잔디 · 잎 색 (0xRRGGBB) */
  grass: Uint32Array;
  foliage: Uint32Array;
  animals: { x: number; y: number; z: number; kind: MobKind }[];
};

type Column = { h: number; biome: number; cont: number; temp: number; humid: number; mount: number; steep: boolean; entrance: boolean };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 구간 선형 보간 스플라인 */
function spline(points: [number, number][], x: number) {
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return lerp(y0, y1, (x - x0) / (x1 - x0));
  }
  return points[points.length - 1]![1];
}

const CONT_SPLINE: [number, number][] = [
  [-1, -34],
  [-0.5, -26],
  [-0.28, -14],
  [-0.16, -4],
  [-0.08, 0.5],
  [0.05, 3],
  [0.3, 7],
  [0.6, 13],
  [1, 22],
];

const ID = {
  oakLog: bid("oak_log"),
  oakLeaves: bid("oak_leaves"),
  birchLog: bid("birch_log"),
  birchLeaves: bid("birch_leaves"),
  spruceLog: bid("spruce_log"),
  spruceLeaves: bid("spruce_leaves"),
  acaciaLog: bid("acacia_log"),
  acaciaLeaves: bid("acacia_leaves"),
  jungleLog: bid("jungle_log"),
  jungleLeaves: bid("jungle_leaves"),
  shortGrass: bid("short_grass"),
  fern: bid("fern"),
  dandelion: bid("dandelion"),
  poppy: bid("poppy"),
  cornflower: bid("cornflower"),
  orchid: bid("blue_orchid"),
  deadBush: bid("dead_bush"),
  pumpkin: bid("pumpkin"),
  redMush: bid("red_mushroom"),
  brownMush: bid("brown_mushroom"),
  mossy: bid("mossy_cobblestone"),
};

export type TreeBlock = [number, number, number, number];

/** 나무 모양 (뿌리 위 칸이 (0,0,0)). 묘목이 자랄 때도 쓴다 */
export function treeShape(kind: TreeKind, rnd: () => number): TreeBlock[] {
  const out: TreeBlock[] = [];
  const leaf = (x: number, y: number, z: number, id: number) => out.push([x, y, z, id]);
  const log = (x: number, y: number, z: number, id: number) => out.push([x, y, z, id | 0x100]);
  if (kind === "oak" || kind === "birch") {
    const L = kind === "oak" ? ID.oakLeaves : ID.birchLeaves;
    const W = kind === "oak" ? ID.oakLog : ID.birchLog;
    const h = (kind === "oak" ? 4 : 5) + Math.floor(rnd() * 3);
    for (let y = h - 3; y <= h; y++) {
      const r = y >= h - 1 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (corner && (y === h || rnd() < 0.5)) continue;
          leaf(dx, y, dz, L);
        }
    }
    for (let y = 0; y < h; y++) log(0, y, 0, W);
  } else if (kind === "spruce") {
    const h = 6 + Math.floor(rnd() * 4);
    const bare = 1 + Math.floor(rnd() * 2);
    for (let y = h; y >= bare; y--) {
      const i = h - y;
      const r = i === 0 ? 0 : i % 2 === 1 ? 1 : i >= 6 ? 3 : 2;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          leaf(dx, y, dz, ID.spruceLeaves);
        }
    }
    leaf(0, h + 1, 0, ID.spruceLeaves);
    for (let y = 0; y < h; y++) log(0, y, 0, ID.spruceLog);
  } else if (kind === "acacia") {
    const h = 4 + Math.floor(rnd() * 2);
    const dir = Math.floor(rnd() * 4);
    const [sx, sz] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ][dir]!;
    let x = 0;
    let z = 0;
    let y = 0;
    for (; y < h; y++) log(x, y, z, ID.acaciaLog);
    const bend = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < bend; i++) {
      x += sx;
      z += sz;
      log(x, y, z, ID.acaciaLog);
      y++;
    }
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) if (!(Math.abs(dx) === 2 && Math.abs(dz) === 2)) leaf(x + dx, y, z + dz, ID.acaciaLeaves);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) leaf(x + dx, y + 1, z + dz, ID.acaciaLeaves);
    log(x, y, z, ID.acaciaLog);
  } else {
    const h = 8 + Math.floor(rnd() * 5);
    for (let y = h - 3; y <= h + 1; y++) {
      const r = y >= h ? 1 : y === h - 3 ? 2 : 3;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
          if (r === 3 && rnd() < 0.25) continue;
          leaf(dx, y, dz, ID.jungleLeaves);
        }
    }
    for (let y = 0; y < h; y++) log(0, y, 0, ID.jungleLog);
  }
  return out;
}

const TREES_BY_BIOME: Partial<Record<BiomeKey, { density: number; pick: (r: number) => TreeKind }>> = {
  plains: { density: 0.0018, pick: () => "oak" },
  sunflower_plains: { density: 0.0012, pick: () => "oak" },
  forest: { density: 0.045, pick: (r) => (r < 0.8 ? "oak" : "birch") },
  birch_forest: { density: 0.05, pick: () => "birch" },
  taiga: { density: 0.04, pick: () => "spruce" },
  snowy_taiga: { density: 0.035, pick: () => "spruce" },
  snowy_plains: { density: 0.0015, pick: () => "spruce" },
  savanna: { density: 0.005, pick: (r) => (r < 0.85 ? "acacia" : "oak") },
  swamp: { density: 0.012, pick: () => "oak" },
  jungle: { density: 0.07, pick: (r) => (r < 0.7 ? "jungle" : "oak") },
  windswept_hills: { density: 0.006, pick: (r) => (r < 0.6 ? "spruce" : "oak") },
};

export class WorldGen {
  readonly seed: number;
  private nCont: Simplex;
  private nEro: Simplex;
  private nPeak: Simplex;
  private nTemp: Simplex;
  private nHumid: Simplex;
  private nDetail: Simplex;
  private nRiver: Simplex;
  private nCheese: Simplex;
  private nSpagA: Simplex;
  private nSpagB: Simplex;
  private nEntrance: Simplex;
  private nPatch: Simplex;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const s = (k: number) => new Simplex((this.seed + k * 7919) >>> 0);
    this.nCont = s(1);
    this.nEro = s(2);
    this.nPeak = s(3);
    this.nTemp = s(4);
    this.nHumid = s(5);
    this.nDetail = s(6);
    this.nRiver = s(7);
    this.nCheese = s(8);
    this.nSpagA = s(9);
    this.nSpagB = s(10);
    this.nEntrance = s(11);
    this.nPatch = s(12);
  }

  /** 기둥 하나의 높이 · 생물군계 */
  column(x: number, z: number): Column {
    const cont = this.nCont.fbm2(x / 760, z / 760, 4) * 1.15 + 0.08;
    const ero = this.nEro.fbm2(x / 520, z / 520, 3);
    const pv = this.nPeak.fbm2(x / 210, z / 210, 4);
    const temp = this.nTemp.fbm2(x / 980, z / 980, 2) * 1.3;
    const humid = this.nHumid.fbm2(x / 860, z / 860, 2) * 1.3;
    const detail = this.nDetail.fbm2(x / 48, z / 48, 3);

    let h = SEA + spline(CONT_SPLINE, cont);
    const inland = smooth(-0.05, 0.35, cont);
    const mount = inland * smooth(0.05, -0.55, ero);
    const ridge = 1 - Math.abs(pv);
    h += mount * Math.pow(Math.max(0, ridge), 1.6) * 58;
    h += mount * Math.max(0, pv) * 10;

    const swampy = smooth(0.25, 0.55, humid) * smooth(-0.2, 0.05, temp) * smooth(0.45, 0.2, temp) * (1 - mount);
    const flat = smooth(-0.2, 0.3, ero);
    const hills = detail * (3 + (1 - flat) * 7 + mount * 6);
    h += hills * (1 - swampy * 0.85);
    if (swampy > 0 && h > SEA) h = lerp(h, SEA + 0.6 + detail * 1.4, swampy);

    const river = Math.abs(this.nRiver.fbm2(x / 420, z / 420, 3));
    const isRiver = river < 0.045 && cont > -0.2 && h > SEA - 6 && mount < 0.55;
    if (isRiver) {
      const k = smooth(0.0, 0.045, river);
      h = lerp(SEA - 3 - (1 - k) * 2, h, k * k);
    }
    const height = Math.max(4, Math.min(H - 8, Math.floor(h)));

    let biome: BiomeKey;
    const cold = temp < -0.42;
    if (height < SEA) {
      if (isRiver && cont > -0.2) biome = cold ? "frozen_river" : "river";
      else if (cold) biome = "frozen_ocean";
      else biome = cont < -0.42 ? "deep_ocean" : "ocean";
    } else if (height <= SEA + 2 && cont < 0.02 && mount < 0.3) biome = cold ? "snowy_beach" : temp > 0.45 && humid < -0.15 ? "desert" : "beach";
    else if (height > SEA + 44) biome = temp < 0.25 ? "snowy_peaks" : "stony_peaks";
    else if (mount > 0.35 && height > SEA + 20) biome = "windswept_hills";
    else if (cold) biome = humid > -0.05 ? "snowy_taiga" : "snowy_plains";
    else if (temp < -0.12) biome = humid > -0.25 ? "taiga" : "plains";
    else if (temp < 0.38) {
      if (swampy > 0.5) biome = "swamp";
      else if (humid > 0.05) biome = "forest";
      else if (humid > -0.18) biome = "birch_forest";
      else biome = this.nPatch.noise2(x / 300, z / 300) > 0.55 ? "sunflower_plains" : "plains";
    } else if (humid < -0.12) biome = "desert";
    else if (humid < 0.28) biome = "savanna";
    else biome = "jungle";

    const entrance = height > SEA + 2 && this.nEntrance.noise2(x / 90, z / 90) > 0.62;
    return { h: height, biome: biomeId(biome), cont, temp, humid, mount, steep: false, entrance };
  }

  biomeAt(x: number, z: number) {
    return BIOMES[this.column(x, z).biome]!;
  }

  /** (0,0) 가까운 육지 */
  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 2000; r += 16)
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos((a / 8) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 8) * Math.PI * 2) * r);
        const c = this.column(x, z);
        const b = BIOMES[c.biome]!.key;
        if (c.h > SEA && b !== "beach" && !b.includes("ocean") && !b.includes("peaks")) return { x: x + 0.5, y: c.h + 1, z: z + 0.5 };
      }
    return { x: 0.5, y: SEA + 10, z: 0.5 };
  }

  /** 반지름 radius 안의 아무 육지 (멀티 야생 랜덤 스폰) */
  randomSpawn(radius: number, rand: () => number = Math.random): { x: number; y: number; z: number } {
    for (let i = 0; i < 80; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius;
      const x = Math.round(Math.cos(a) * r);
      const z = Math.round(Math.sin(a) * r);
      const c = this.column(x, z);
      const b = BIOMES[c.biome]!.key;
      if (c.h > SEA && b !== "beach" && !b.includes("ocean") && !b.includes("river") && !b.includes("peaks")) return { x: x + 0.5, y: c.h + 1, z: z + 0.5 };
    }
    return this.findSpawn();
  }

  generate(cx: number, cz: number): ChunkData {
    const blocks = new Uint8Array(CS * CS * H);
    const meta = new Uint8Array(CS * CS * H);
    const biomes = new Uint8Array(CS * CS);
    const grass = new Uint32Array(CS * CS);
    const foliage = new Uint32Array(CS * CS);
    const bx = cx * CS;
    const bz = cz * CS;
    const P = 3;
    const PW = CS + P * 2;
    const cols: Column[] = new Array(PW * PW);
    for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) cols[z * PW + x] = this.column(bx + x - P, bz + z - P);
    const col = (lx: number, lz: number) => cols[(lz + P) * PW + (lx + P)]!;
    for (let z = -P + 1; z < CS + P - 1; z++)
      for (let x = -P + 1; x < CS + P - 1; x++) {
        const c = col(x, z);
        const d = Math.max(
          Math.abs(c.h - col(x + 1, z).h),
          Math.abs(c.h - col(x - 1, z).h),
          Math.abs(c.h - col(x, z + 1).h),
          Math.abs(c.h - col(x, z - 1).h),
        );
        c.steep = d >= 3;
      }

    /* 지형 + 표면 */
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const c = col(x, z);
        const wx = bx + x;
        const wz = bz + z;
        const bk = BIOMES[c.biome]!;
        biomes[(z << 4) | x] = c.biome;
        let gr = 0;
        let gg = 0;
        let gb = 0;
        let fr = 0;
        let fg = 0;
        let fb = 0;
        let n = 0;
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const o = BIOMES[col(x + dx, z + dz).biome]!;
            gr += (o.grass >> 16) & 255;
            gg += (o.grass >> 8) & 255;
            gb += o.grass & 255;
            fr += (o.foliage >> 16) & 255;
            fg += (o.foliage >> 8) & 255;
            fb += o.foliage & 255;
            n++;
          }
        grass[(z << 4) | x] = ((gr / n) << 16) | ((gg / n) << 8) | (gb / n);
        foliage[(z << 4) | x] = ((fr / n) << 16) | ((fg / n) << 8) | (fb / n);

        const top = c.h;
        const deepOffset = Math.floor(hash3(this.seed, wx, 7, wz) * 5) - 2;
        for (let y = 0; y <= top; y++) {
          let id: number;
          if (y === 0) id = B.bedrock;
          else if (y < 5 && hash3(this.seed, wx, y, wz) < 1 - y / 5) id = B.bedrock;
          else id = y < DEEP + deepOffset ? B.deepslate : B.stone;
          blocks[idx(x, y, z)] = id;
        }

        const key = bk.key;
        const depthDirt = 3 + Math.floor(hash3(this.seed, wx, 3, wz) * 2);
        const set = (y: number, id: number) => {
          if (y > 0 && y < H) blocks[idx(x, y, z)] = id;
        };
        if (key === "desert" || key === "beach" || key === "snowy_beach") {
          for (let i = 0; i < 4; i++) set(top - i, B.sand);
          if (key === "desert") for (let i = 4; i < 8; i++) set(top - i, B.sandstone);
        } else if (key.includes("ocean") || key.includes("river")) {
          const floor = key === "deep_ocean" ? B.gravel : hash3(this.seed, wx, 5, wz) < 0.15 && key.includes("river") ? B.clay : B.sand;
          for (let i = 0; i < 3; i++) set(top - i, floor);
        } else if (key === "stony_peaks") {
          if (hash3(this.seed, wx, 9, wz) < 0.12) set(top, B.gravel);
        } else if (key === "snowy_peaks") {
          if (!c.steep) for (let i = 0; i < 3; i++) set(top - i, B.snowBlock);
        } else if (key === "windswept_hills" && (c.steep || this.nPatch.noise2(wx / 18, wz / 18) > 0.35)) {
          if (hash3(this.seed, wx, 9, wz) < 0.1) set(top, B.gravel);
        } else if (c.steep && c.h > SEA + 20) {
          /* 가파른 산비탈은 돌이 드러난다 */
        } else {
          for (let i = 1; i <= depthDirt; i++) set(top - i, B.dirt);
          set(top, bk.snowy ? B.grassSnow : B.grass);
          if (key === "swamp" && top <= SEA && hash3(this.seed, wx, 11, wz) < 0.5) set(top, B.dirt);
        }

        for (let y = top + 1; y <= SEA; y++) set(y, B.water);
        if (bk.snowy && top < SEA) set(SEA, B.ice);
        if (key === "swamp" && top === SEA) {
          /* 늪 물웅덩이 */
          if (this.nPatch.noise2(wx / 9, wz / 9) > 0.25) set(top, B.water);
        }
      }

    this.carveCaves(blocks, cx, cz, col);
    this.carveRavines(blocks, cx, cz, col);
    this.placeOres(blocks, cx, cz, col);
    this.decorate(blocks, meta, cx, cz, col);

    const animals = this.animals(blocks, cx, cz, col);
    return { cx, cz, blocks, meta, biomes, grass, foliage, animals };
  }

  private carveCaves(blocks: Uint8Array, cx: number, cz: number, col: (x: number, z: number) => Column) {
    const bx = cx * CS;
    const bz = cz * CS;
    const SX = 5;
    const SY = 33;
    const cheese = new Float32Array(SX * SY * SX);
    const spag = new Float32Array(SX * SY * SX);
    for (let gz = 0; gz < SX; gz++)
      for (let gy = 0; gy < SY; gy++)
        for (let gx = 0; gx < SX; gx++) {
          const x = bx + gx * 4;
          const y = gy * 4;
          const z = bz + gz * 4;
          const i = (gz * SY + gy) * SX + gx;
          cheese[i] = this.nCheese.fbm3(x / 70, y / 42, z / 70, 2);
          const a = this.nSpagA.noise3(x / 52, y / 34, z / 52);
          const b = this.nSpagB.noise3(x / 52, y / 34, z / 52);
          spag[i] = a * a + b * b;
        }
    const sample = (arr: Float32Array, x: number, y: number, z: number) => {
      const fx = x / 4;
      const fy = y / 4;
      const fz = z / 4;
      const x0 = Math.min(SX - 2, Math.floor(fx));
      const y0 = Math.min(SY - 2, Math.floor(fy));
      const z0 = Math.min(SX - 2, Math.floor(fz));
      const tx = fx - x0;
      const ty = fy - y0;
      const tz = fz - z0;
      const g = (ix: number, iy: number, iz: number) => arr[(iz * SY + iy) * SX + ix]!;
      const c00 = lerp(g(x0, y0, z0), g(x0 + 1, y0, z0), tx);
      const c10 = lerp(g(x0, y0 + 1, z0), g(x0 + 1, y0 + 1, z0), tx);
      const c01 = lerp(g(x0, y0, z0 + 1), g(x0 + 1, y0, z0 + 1), tx);
      const c11 = lerp(g(x0, y0 + 1, z0 + 1), g(x0 + 1, y0 + 1, z0 + 1), tx);
      return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
    };
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const c = col(x, z);
        const wet = c.h < SEA + 1;
        const ceiling = wet ? c.h - 5 : c.entrance ? c.h + 1 : c.h - 4;
        for (let y = 1; y <= Math.min(ceiling, H - 2); y++) {
          const i = idx(x, y, z);
          const id = blocks[i]!;
          if (id === B.bedrock || id === B.water || id === 0) continue;
          const depth = 1 - y / SEA;
          const ch = sample(cheese, x, y, z);
          const sp = sample(spag, x, y, z);
          const cheeseCut = ch > 0.56 - depth * 0.12 && y < c.h - 10;
          const spagCut = sp < 0.0035 + depth * 0.0025;
          if (cheeseCut || spagCut) blocks[i] = y <= 10 ? B.lava : 0;
        }
      }
  }

  private carveRavines(blocks: Uint8Array, cx: number, cz: number, col: (x: number, z: number) => Column) {
    const R = 6;
    const x0 = cx * CS;
    const z0 = cz * CS;
    for (let oz = cz - R; oz <= cz + R; oz++)
      for (let ox = cx - R; ox <= cx + R; ox++) {
        if (hash3(this.seed ^ 0x5eed, ox, 99, oz) > 0.02) continue;
        const rnd = mulberry32((this.seed ^ Math.imul(ox, 73856093) ^ Math.imul(oz, 19349663)) >>> 0);
        let px = ox * CS + rnd() * CS;
        let pz = oz * CS + rnd() * CS;
        let py = 24 + rnd() * 34;
        let yaw = rnd() * Math.PI * 2;
        let pitch = (rnd() - 0.5) * 0.25;
        const len = 70 + Math.floor(rnd() * 50);
        const width = 1.8 + rnd() * 2.2;
        let dyaw = 0;
        for (let s = 0; s < len; s++) {
          const t = s / len;
          const r = 1 + Math.sin(t * Math.PI) * width;
          const rv = r * 3.2;
          px += Math.cos(yaw) * Math.cos(pitch);
          pz += Math.sin(yaw) * Math.cos(pitch);
          py += Math.sin(pitch);
          dyaw = dyaw * 0.75 + (rnd() - 0.5) * 0.12;
          yaw += dyaw;
          pitch = pitch * 0.7 + (rnd() - 0.5) * 0.1;
          if (px + r < x0 || px - r > x0 + CS || pz + r < z0 || pz - r > z0 + CS) continue;
          for (let x = Math.max(x0, Math.floor(px - r)); x <= Math.min(x0 + CS - 1, Math.floor(px + r)); x++)
            for (let z = Math.max(z0, Math.floor(pz - r)); z <= Math.min(z0 + CS - 1, Math.floor(pz + r)); z++) {
              const dx = (x + 0.5 - px) / r;
              const dz = (z + 0.5 - pz) / r;
              const dd = dx * dx + dz * dz;
              if (dd >= 1) continue;
              const c = col(x - x0, z - z0);
              const top = c.h < SEA + 1 ? c.h - 4 : c.h + 2;
              for (let y = Math.max(1, Math.floor(py - rv)); y <= Math.min(top, Math.floor(py + rv)); y++) {
                const dy = (y + 0.5 - py) / rv;
                if (dd + dy * dy >= 1) continue;
                const i = idx(x - x0, y, z - z0);
                const id = blocks[i]!;
                if (id === B.bedrock || id === B.water) continue;
                blocks[i] = y <= 10 ? B.lava : 0;
              }
            }
        }
      }
  }

  private placeOres(blocks: Uint8Array, cx: number, cz: number, col: (x: number, z: number) => Column) {
    const rnd = mulberry32((this.seed ^ Math.imul(cx, 341873128) ^ Math.imul(cz, 132897987) ^ 0x0e0e) >>> 0);
    const stoneLike = (id: number) => id === B.stone || id === B.deepslate || id === B.granite || id === B.diorite || id === B.andesite || id === B.tuff;
    const blob = (count: number, size: number, y0: number, y1: number, place: (base: number, y: number) => number | null, tri = false) => {
      for (let n = 0; n < count; n++) {
        const ox = 2 + rnd() * 12;
        const oz = 2 + rnd() * 12;
        const oy = tri ? y0 + (rnd() + rnd()) * 0.5 * (y1 - y0) : y0 + rnd() * (y1 - y0);
        const r = Math.max(0.8, Math.cbrt(size) * 0.62);
        for (let k = 0; k < size; k++) {
          const x = Math.floor(ox + (rnd() - 0.5) * 2 * r);
          const y = Math.floor(oy + (rnd() - 0.5) * 2 * r);
          const z = Math.floor(oz + (rnd() - 0.5) * 2 * r);
          if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y > y1 || y >= H) continue;
          const i = idx(x, y, z);
          const id = place(blocks[i]!, y);
          if (id !== null) blocks[i] = id;
        }
      }
    };
    const ore = (key: OreKey) => (base: number) =>
      base === B.deepslate || base === B.tuff ? ORE_INFO[key].deep : stoneLike(base) ? ORE_INFO[key].stone : null;
    const replace = (id: number) => (base: number) => (base === B.stone || base === B.deepslate ? id : null);

    blob(2, 30, 1, 80, replace(B.granite));
    blob(2, 30, 1, 80, replace(B.diorite));
    blob(2, 30, 1, 80, replace(B.andesite));
    blob(2, 26, 1, DEEP + 2, (b) => (b === B.deepslate ? B.tuff : null));
    blob(3, 24, 1, 110, replace(B.dirt));
    blob(2, 24, 1, 110, replace(B.gravel));

    /* 광석 높이 (y 1 ~ 위): 다이아 20 · 레드스톤 25 · 금 30 · 철 · 청금석 60 */
    blob(18, 10, 4, 118, ore("coal"), true);
    blob(13, 8, 1, 60, ore("iron"));
    blob(7, 8, 18, 92, ore("copper"), true);
    blob(5, 8, 1, 30, ore("gold"));
    blob(7, 7, 1, 25, ore("redstone"));
    blob(4, 6, 1, 60, ore("lapis"));
    blob(5, 7, 1, 20, ore("diamond"));
    const c = col(8, 8);
    if (c.mount > 0.3) {
      for (let n = 0; n < 4; n++) {
        const x = Math.floor(rnd() * CS);
        const z = Math.floor(rnd() * CS);
        const y = 40 + Math.floor(rnd() * 70);
        const i = idx(x, y, z);
        if (y < H && stoneLike(blocks[i]!)) blocks[i] = ORE_INFO.emerald.stone;
      }
    }
  }

  private decorate(blocks: Uint8Array, meta: Uint8Array, cx: number, cz: number, col: (x: number, z: number) => Column) {
    const bx = cx * CS;
    const bz = cz * CS;
    const get = (x: number, y: number, z: number) => blocks[idx(x, y, z)]!;
    const inside = (x: number, y: number, z: number) => x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < H;

    /* 나무: 이웃 청크에 뿌리를 둔 나무도 이 청크에 걸치는 부분은 똑같이 그린다 */
    for (let z = -3; z < CS + 3; z++)
      for (let x = -3; x < CS + 3; x++) {
        const c = col(x, z);
        if (c.h <= SEA || c.entrance || c.steep) continue;
        const bk = BIOMES[c.biome]!.key;
        const spec = TREES_BY_BIOME[bk];
        if (!spec) continue;
        const wx = bx + x;
        const wz = bz + z;
        if (bk === "windswept_hills" && this.nPatch.noise2(wx / 18, wz / 18) > 0.35) continue;
        const roll = hash3(this.seed ^ 0x7ee, wx, 0, wz);
        if (roll >= spec.density) continue;
        const kind = spec.pick(hash3(this.seed ^ 0x7ef, wx, 1, wz));
        const rnd = mulberry32((this.seed ^ Math.imul(wx, 2654435761) ^ Math.imul(wz, 40503)) >>> 0);
        const baseY = c.h + 1;
        for (const [dx, dy, dz, raw] of treeShape(kind, rnd)) {
          const tx = x + dx;
          const ty = baseY + dy;
          const tz = z + dz;
          if (!inside(tx, ty, tz)) continue;
          const isLog = raw & 0x100;
          const id = raw & 0xff;
          const i = idx(tx, ty, tz);
          const cur = blocks[i]!;
          if (isLog) {
            if (cur === 0 || cur === B.snow || isLeaf(cur) || isPlant(cur)) blocks[i] = id;
          } else if (cur === 0 || cur === B.snow) blocks[i] = id;
        }
        if (inside(x, c.h, z) && get(x, c.h, z) === B.grass) blocks[idx(x, c.h, z)] = B.dirt;
      }

    /* 풀 · 꽃 · 선인장 · 사탕수수 · 눈 */
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const c = col(x, z);
        const wx = bx + x;
        const wz = bz + z;
        const bk = BIOMES[c.biome]!;
        const y = c.h + 1;
        if (y >= H - 1) continue;
        const ground = get(x, c.h, z);
        if (get(x, y, z) !== 0) continue;
        const r = hash3(this.seed ^ 0xf10, wx, 2, wz);
        const r2 = hash3(this.seed ^ 0xf11, wx, 3, wz);
        const k = bk.key;
        if (ground === B.grass) {
          const grassChance = k === "jungle" || k === "savanna" ? 0.32 : k === "plains" || k === "sunflower_plains" ? 0.28 : k === "swamp" ? 0.18 : 0.14;
          if (r < 0.0007 && (k === "plains" || k === "forest")) blocks[idx(x, y, z)] = ID.pumpkin;
          else if (r < grassChance) blocks[idx(x, y, z)] = (k === "taiga" || k === "jungle") && r2 < 0.35 ? ID.fern : ID.shortGrass;
          else if (r < grassChance + (k === "plains" || k === "sunflower_plains" || k === "forest" ? 0.025 : 0.006)) {
            blocks[idx(x, y, z)] = k === "swamp" ? ID.orchid : r2 < 0.45 ? ID.dandelion : r2 < 0.85 ? ID.poppy : ID.cornflower;
          } else if ((k === "taiga" || k === "swamp") && r < grassChance + 0.03 && r2 < 0.12) blocks[idx(x, y, z)] = r2 < 0.06 ? ID.redMush : ID.brownMush;
        } else if (ground === B.sand && k === "desert") {
          if (r < 0.006) {
            const hgt = 1 + Math.floor(r2 * 3);
            for (let i = 0; i < hgt && y + i < H; i++) blocks[idx(x, y + i, z)] = B.cactus;
          } else if (r < 0.012) blocks[idx(x, y, z)] = ID.deadBush;
        }
        if ((ground === B.sand || ground === B.grass || ground === B.dirt) && c.h === SEA && r2 > 0.9) {
          const wet = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dz]) => {
            const nx = x + dx!;
            const nz = z + dz!;
            return nx >= 0 && nx < CS && nz >= 0 && nz < CS && get(nx, SEA, nz) === B.water;
          });
          if (wet && get(x, y, z) === 0) {
            const hgt = 1 + Math.floor(r * 30) % 3;
            for (let i = 0; i < hgt; i++) blocks[idx(x, y + i, z)] = B.sugarCane;
          }
        }
        if ((bk.snowy || k === "snowy_peaks") && get(x, y, z) === 0 && get(x, c.h, z) !== B.water && get(x, c.h, z) !== B.ice) {
          blocks[idx(x, y, z)] = B.snow;
        }
      }
    void meta;
  }

  private animals(blocks: Uint8Array, cx: number, cz: number, col: (x: number, z: number) => Column) {
    const out: ChunkData["animals"] = [];
    const rnd = mulberry32((this.seed ^ Math.imul(cx, 668265263) ^ Math.imul(cz, 374761393) ^ 0xa11) >>> 0);
    if (rnd() > 0.35) return out;
    const c = col(8, 8);
    const k = BIOMES[c.biome]!.key;
    if (c.h <= SEA || k.includes("ocean") || k === "desert" || k.includes("peaks") || k === "beach") return out;
    const kinds: MobKind[] = k === "jungle" ? ["chicken", "pig"] : k.includes("snowy") ? ["sheep"] : ["pig", "cow", "sheep", "chicken"];
    const kind = kinds[Math.floor(rnd() * kinds.length)]!;
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const x = 2 + Math.floor(rnd() * 12);
      const z = 2 + Math.floor(rnd() * 12);
      let y = H - 2;
      while (y > 1 && (blocks[idx(x, y, z)] === 0 || isPlant(blocks[idx(x, y, z)]!) || isLeaf(blocks[idx(x, y, z)]!))) y--;
      const ground = blocks[idx(x, y, z)]!;
      const open = (id: number) => id === 0 || isPlant(id);
      if (!open(blocks[idx(x, y + 1, z)]!) || !open(blocks[idx(x, y + 2, z)]!)) continue;
      if (ground !== B.grass && ground !== B.grassSnow) continue;
      out.push({ x: cx * CS + x + 0.5, y: y + 1, z: cz * CS + z + 0.5, kind });
    }
    return out;
  }
}

const LEAVES = new Set([ID.oakLeaves, ID.birchLeaves, ID.spruceLeaves, ID.acaciaLeaves, ID.jungleLeaves]);
const PLANTS = new Set([ID.shortGrass, ID.fern, ID.dandelion, ID.poppy, ID.cornflower, ID.orchid, ID.deadBush]);
export const isLeaf = (id: number) => LEAVES.has(id);
const isPlant = (id: number) => PLANTS.has(id);

/** 문자열 시드 → 숫자 */
export function seedFrom(text: string) {
  const t = text.trim();
  if (/^-?\d+$/.test(t)) return Number(BigInt.asUintN(32, BigInt(t)));
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return h >>> 0;
}
