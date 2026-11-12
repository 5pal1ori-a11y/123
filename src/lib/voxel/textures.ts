/** 야생 · 광산용 16×16 절차 텍스처. 섬 텍스처에 있는 것은 그대로 가져다 쓴다 */

import { texturePixels as islandPixels, type TextureName } from "@/lib/island/textures";
import { COLORS } from "./blocks";
import { hashString, mulberry32 } from "./noise";

export const T = 16;
type RGB = [number, number, number];
export type Pixels = Uint8ClampedArray;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const blank = () => new Uint8ClampedArray(T * T * 4);

function set(p: Pixels, x: number, y: number, c: RGB, a = 255) {
  if (x < 0 || y < 0 || x >= T || y >= T) return;
  const i = (y * T + x) * 4;
  p[i] = clamp(c[0]);
  p[i + 1] = clamp(c[1]);
  p[i + 2] = clamp(c[2]);
  p[i + 3] = a;
}
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
function noisy(p: Pixels, base: RGB, r: () => number, amount = 0.12) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) set(p, x, y, shade(base, 1 - amount + r() * amount * 2));
}
function speckle(p: Pixels, c: RGB, r: () => number, chance: number) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < chance) set(p, x, y, shade(c, 0.9 + r() * 0.2));
}
function copy(src: Pixels) {
  return new Uint8ClampedArray(src);
}
function gray(src: Pixels, boost = 1.35) {
  const p = copy(src);
  for (let i = 0; i < p.length; i += 4) {
    const l = (p[i]! * 0.3 + p[i + 1]! * 0.59 + p[i + 2]! * 0.11) * boost;
    p[i] = p[i + 1] = p[i + 2] = clamp(l);
  }
  return p;
}
function recolor(src: Pixels, m: RGB) {
  const p = copy(src);
  for (let i = 0; i < p.length; i += 4) {
    p[i] = clamp(p[i]! * m[0]);
    p[i + 1] = clamp(p[i + 1]! * m[1]);
    p[i + 2] = clamp(p[i + 2]! * m[2]);
  }
  return p;
}
const island = (n: TextureName) => copy(islandPixels(n));

/** 바탕 텍스처 위에 광석 덩어리 */
function oreOn(base: Pixels, light: RGB, dark: RGB, seed: number) {
  const p = copy(base);
  const r = mulberry32(seed);
  const spots = 5 + Math.floor(r() * 2);
  for (let s = 0; s < spots; s++) {
    const cx = 2 + Math.floor(r() * 12);
    const cy = 2 + Math.floor(r() * 12);
    const cells = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 0],
      [0, -1],
    ].slice(0, 3 + Math.floor(r() * 4));
    for (const [dx, dy] of cells) set(p, cx + dx!, cy + dy!, r() < 0.45 ? light : dark);
    set(p, cx + 1, cy + 1, shade(dark, 0.7));
  }
  return p;
}

function logSide(bark: RGB, seed: number, stripes = true) {
  const p = blank();
  const r = mulberry32(seed);
  for (let x = 0; x < T; x++) {
    const stripe = stripes ? (x % 4 === 0 ? 0.74 : x % 4 === 2 ? 0.88 : 1) : 1;
    for (let y = 0; y < T; y++) set(p, x, y, shade(bark, stripe * (0.9 + r() * 0.18)));
  }
  return p;
}
function logTop(bark: RGB, wood: RGB, seed: number) {
  const p = blank();
  const r = mulberry32(seed);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.5) set(p, x, y, shade(bark, 0.9 + r() * 0.15));
      else set(p, x, y, shade(wood, Math.floor(d) % 2 ? 0.84 : 1 + r() * 0.05));
    }
  return p;
}
function planks(base: RGB, seed: number) {
  const p = blank();
  const r = mulberry32(seed);
  noisy(p, base, r, 0.06);
  for (let x = 0; x < T; x++) for (const y of [3, 7, 11, 15]) set(p, x, y, shade(base, 0.66));
  for (let row = 0; row < 4; row++) {
    const seam = (row * 7 + 3) % T;
    for (let y = row * 4; y < row * 4 + 3; y++) set(p, seam, y, shade(base, 0.7));
  }
  speckle(p, shade(base, 0.86), r, 0.05);
  return p;
}
function leaves(base: RGB, seed: number, holes = 0.2) {
  const p = blank();
  const r = mulberry32(seed);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (r() < holes) continue;
      set(p, x, y, shade(base, 0.68 + r() * 0.5));
    }
  return p;
}
function rock(base: RGB, seed: number, spots: RGB[] = [], chance = 0.1) {
  const p = blank();
  const r = mulberry32(seed);
  noisy(p, base, r, 0.09);
  for (const c of spots) speckle(p, c, r, chance);
  return p;
}

/** 십자 식물: 줄기 + 꽃 */
function flower(stem: RGB, petal: RGB, center: RGB, seed: number) {
  const p = blank();
  const r = mulberry32(seed);
  for (let y = 8; y < 16; y++) set(p, 7 + (y % 3 === 0 ? 1 : 0), y, shade(stem, 0.9 + r() * 0.2));
  set(p, 6, 11, stem);
  set(p, 5, 10, stem);
  set(p, 9, 12, stem);
  set(p, 10, 11, stem);
  for (const [dx, dy] of [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -2],
    [-2, 0],
    [2, 0],
  ])
    set(p, 7 + dx!, 6 + dy!, shade(petal, 0.85 + r() * 0.3));
  set(p, 7, 6, center);
  return p;
}
function grassBlades(seed: number, tall = 1, base: RGB = [200, 200, 200]) {
  const p = blank();
  const r = mulberry32(seed);
  for (let x = 0; x < T; x++) {
    if (r() < 0.25) continue;
    const h = Math.floor((4 + r() * 10) * tall);
    let bx = x;
    for (let y = 15; y > 15 - h && y >= 0; y--) {
      set(p, bx, y, shade(base, 0.6 + ((15 - y) / h) * 0.5));
      if (r() < 0.2) bx += r() < 0.5 ? -1 : 1;
    }
  }
  return p;
}
function sapling(trunk: RGB, leaf: RGB, seed: number) {
  const p = blank();
  const r = mulberry32(seed);
  for (let y = 9; y < 16; y++) set(p, 7, y, trunk);
  for (let y = 1; y < 11; y++)
    for (let x = 2; x < 14; x++) {
      const d = Math.hypot(x - 7.5, y - 5.5);
      if (d < 4.8 && r() < 0.8) set(p, x, y, shade(leaf, 0.7 + r() * 0.5));
    }
  return p;
}
function wheat(stage: number) {
  const p = blank();
  const r = mulberry32(900 + stage);
  const h = 3 + stage * 1.6;
  const ripe = stage / 7;
  const col: RGB = [lerp(40, 196, ripe), lerp(160, 160, ripe), lerp(30, 56, ripe)];
  for (const x of [1, 4, 7, 10, 13]) {
    for (let y = 15; y > 15 - h; y--) set(p, x + (y % 4 === 0 ? 1 : 0), y, shade(col, 0.8 + r() * 0.3));
    if (stage >= 5) for (let y = 16 - h; y < 16 - h + 3; y++) set(p, x + 1, y, shade([214, 180, 70], 0.85 + r() * 0.2));
  }
  return p;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function furnaceFront(lit: boolean) {
  const p = rock([118, 118, 118], 77, [[90, 90, 90]], 0.15);
  for (let x = 3; x < 13; x++) {
    set(p, x, 2, [70, 70, 70]);
    set(p, x, 7, [70, 70, 70]);
  }
  for (let y = 9; y < 14; y++) for (let x = 4; x < 12; x++) set(p, x, y, lit ? (y > 11 ? [255, 190, 60] : [230, 110, 30]) : [28, 28, 28]);
  for (let x = 3; x < 13; x++) {
    set(p, x, 8, [60, 60, 60]);
    set(p, x, 14, [60, 60, 60]);
  }
  return p;
}

function crack(stage: number) {
  const p = blank();
  const r = mulberry32(4242);
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < 14; i++) lines.push([r() * 16, r() * 16, r() * Math.PI * 2, 2 + r() * 6]);
  const n = Math.round(((stage + 1) / 10) * lines.length);
  for (let i = 0; i < n; i++) {
    const line = lines[i]!;
    let [x, y, a] = line;
    for (let s = 0; s < line[3] + stage * 0.6; s++) {
      set(p, Math.floor(x), Math.floor(y), [20, 20, 20], 200);
      x += Math.cos(a);
      y += Math.sin(a);
      a += (r() - 0.5) * 0.9;
    }
  }
  return p;
}

const DEEP: RGB = [80, 80, 86];

const GEN: Record<string, () => Pixels> = {
  stone: () => island("stone"),
  cobblestone: () => island("cobble"),
  dirt: () => island("dirt"),
  grass_block_top: () => gray(island("grass_top"), 1.55),
  grass_block_side: () => island("grass_side"),
  oak_log: () => island("oak_log"),
  oak_log_top: () => island("oak_log_top"),
  oak_leaves: () => gray(island("oak_leaves"), 1.6),
  oak_planks: () => island("oak_planks"),
  glass: () => island("glass"),
  obsidian: () => island("obsidian"),
  sand: () => island("sand"),
  sandstone: () => island("sandstone"),
  sandstone_top: () => rock([218, 206, 160], 31, [[200, 186, 140]], 0.2),
  sandstone_bottom: () => rock([210, 196, 150], 32, [[190, 176, 130]], 0.25),
  bricks: () => island("bricks"),
  ice: () => recolor(island("ice"), [1, 1, 1]),
  crafting_table_top: () => island("crafting_top"),
  crafting_table_side: () => island("crafting_side"),
  crafting_table_front: () => island("crafting_front"),
  chest_front: () => island("chest_front"),
  chest_side: () => island("chest_side"),
  chest_top: () => island("chest_top"),
  bookshelf: () => island("bookshelf"),
  white_wool: () => island("wool_white"),
  diamond_block: () => island("diamond_block"),
  gold_block: () => island("gold_block"),
  emerald_block: () => island("emerald_block"),
  iron_block: () => island("iron"),
  smooth_stone: () => island("smooth_stone"),
  spruce_planks: () => island("spruce_planks"),
  andesite: () => island("andesite"),
  glowstone: () => island("glowstone"),
  pumpkin_side: () => island("pumpkin_side"),
  pumpkin_top: () => island("pumpkin_top"),
  stone_bricks: () => island("stonebrick"),
  mossy_cobblestone: () => {
    const p = island("cobble");
    const r = mulberry32(55);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < 0.32 + (y < 5 ? 0.2 : 0)) set(p, x, y, shade([82, 118, 52], 0.8 + r() * 0.4));
    return p;
  },
  deepslate: () => {
    const p = rock(DEEP, 21, [[64, 64, 70]], 0.2);
    for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) if ((x + y) % 7 !== 0) set(p, x, y, [66, 66, 72]);
    return p;
  },
  deepslate_top: () => rock(DEEP, 22, [[66, 66, 72], [96, 96, 100]], 0.15),
  cobbled_deepslate: () => {
    const p = recolor(island("cobble"), [0.62, 0.62, 0.68]);
    return p;
  },
  tuff: () => rock([108, 109, 102], 23, [[90, 92, 86], [130, 130, 120]], 0.2),
  granite: () => rock([149, 103, 85], 24, [[176, 126, 106], [120, 80, 66], [190, 160, 150]], 0.14),
  diorite: () => rock([188, 188, 188], 25, [[220, 220, 220], [150, 150, 150], [120, 120, 120]], 0.14),
  bedrock: () => rock([86, 86, 86], 26, [[40, 40, 40], [140, 140, 140], [20, 20, 20]], 0.22),
  gravel: () => rock([136, 126, 122], 27, [[100, 92, 90], [170, 164, 160], [80, 70, 70]], 0.25),
  clay: () => rock([160, 166, 179], 28, [[146, 152, 166]], 0.18),
  snow_block: () => rock([240, 250, 250], 29, [[226, 238, 242]], 0.12),
  grass_block_snow: () => {
    const p = island("dirt");
    const r = mulberry32(30);
    for (let x = 0; x < T; x++) {
      const d = 3 + Math.floor(r() * 3);
      for (let y = 0; y < d; y++) set(p, x, y, shade([240, 250, 250], 0.92 + r() * 0.08));
    }
    return p;
  },
  coal_block: () => rock([30, 30, 30], 33, [[50, 50, 50], [16, 16, 16]], 0.3),
  lapis_block: () => rock([38, 72, 160], 34, [[60, 100, 200], [24, 50, 120]], 0.3),
  copper_block: () => rock([192, 108, 80], 35, [[220, 140, 110], [160, 84, 60]], 0.3),
  redstone_block: () => rock([170, 26, 12], 36, [[210, 40, 20], [120, 14, 6]], 0.3),
  coal_ore: () => oreOn(island("stone"), [56, 56, 56], [30, 30, 30], 101),
  iron_ore: () => oreOn(island("stone"), [226, 192, 170], [176, 132, 104], 102),
  copper_ore: () => oreOn(island("stone"), [226, 128, 90], [110, 160, 120], 103),
  gold_ore: () => oreOn(island("stone"), [252, 238, 76], [210, 160, 30], 104),
  redstone_ore: () => oreOn(island("stone"), [255, 40, 30], [160, 10, 6], 105),
  lapis_ore: () => oreOn(island("stone"), [40, 90, 220], [24, 50, 140], 106),
  diamond_ore: () => oreOn(island("stone"), [140, 250, 240], [40, 190, 180], 107),
  emerald_ore: () => oreOn(island("stone"), [90, 240, 120], [20, 150, 60], 108),
  deepslate_coal_ore: () => oreOn(GEN.deepslate!(), [40, 40, 40], [20, 20, 20], 111),
  deepslate_iron_ore: () => oreOn(GEN.deepslate!(), [226, 192, 170], [176, 132, 104], 112),
  deepslate_copper_ore: () => oreOn(GEN.deepslate!(), [226, 128, 90], [110, 160, 120], 113),
  deepslate_gold_ore: () => oreOn(GEN.deepslate!(), [252, 238, 76], [210, 160, 30], 114),
  deepslate_redstone_ore: () => oreOn(GEN.deepslate!(), [255, 40, 30], [160, 10, 6], 115),
  deepslate_lapis_ore: () => oreOn(GEN.deepslate!(), [40, 90, 220], [24, 50, 140], 116),
  deepslate_diamond_ore: () => oreOn(GEN.deepslate!(), [140, 250, 240], [40, 190, 180], 117),
  deepslate_emerald_ore: () => oreOn(GEN.deepslate!(), [90, 240, 120], [20, 150, 60], 118),
  birch_log: () => {
    const p = blank();
    const r = mulberry32(41);
    noisy(p, [216, 215, 210], r, 0.05);
    for (let k = 0; k < 9; k++) {
      const y = Math.floor(r() * T);
      const x0 = Math.floor(r() * T);
      const len = 2 + Math.floor(r() * 4);
      for (let x = x0; x < x0 + len; x++) set(p, x % T, y, [40, 40, 36]);
    }
    return p;
  },
  birch_log_top: () => logTop([216, 215, 210], [200, 178, 120], 42),
  birch_leaves: () => leaves([118, 156, 80], 43),
  birch_planks: () => planks([196, 178, 122], 44),
  spruce_log: () => logSide([60, 42, 26], 45),
  spruce_log_top: () => logTop([60, 42, 26], [120, 88, 52], 46),
  spruce_leaves: () => leaves([86, 128, 86], 47, 0.15),
  acacia_log: () => logSide([104, 98, 90], 48),
  acacia_log_top: () => logTop([104, 98, 90], [176, 92, 52], 49),
  acacia_leaves: () => gray(leaves([90, 140, 50], 50), 1.6),
  acacia_planks: () => planks([168, 90, 50], 51),
  jungle_log: () => logSide([86, 66, 30], 52),
  jungle_log_top: () => logTop([86, 66, 30], [160, 116, 76], 53),
  jungle_leaves: () => gray(leaves([60, 150, 30], 54, 0.12), 1.6),
  jungle_planks: () => planks([160, 114, 80], 55),
  cactus_side: () => {
    const p = blank();
    const r = mulberry32(56);
    for (let y = 0; y < T; y++)
      for (let x = 1; x < 15; x++) set(p, x, y, shade([82, 132, 40], (x === 1 || x === 14 ? 0.7 : 1) * (0.9 + r() * 0.2)));
    for (let y = 1; y < T; y += 4) {
      set(p, 1, y, [220, 220, 180]);
      set(p, 14, y + 2, [220, 220, 180]);
      set(p, 7, y + 1, [40, 80, 20]);
    }
    return p;
  },
  cactus_top: () => {
    const p = rock([96, 150, 52], 57, [[70, 120, 36]], 0.2);
    for (let i = 0; i < T; i++) {
      set(p, i, 0, [60, 100, 30]);
      set(p, i, 15, [60, 100, 30]);
      set(p, 0, i, [60, 100, 30]);
      set(p, 15, i, [60, 100, 30]);
    }
    return p;
  },
  cactus_bottom: () => rock([150, 180, 100], 58),
  dead_bush: () => {
    const p = blank();
    const r = mulberry32(59);
    const branch = (x: number, y: number, dx: number, len: number) => {
      for (let i = 0; i < len; i++) {
        set(p, Math.round(x), Math.round(y), [128, 86, 40]);
        x += dx * (0.4 + r() * 0.6);
        y -= 1;
      }
    };
    branch(7, 15, 0, 6);
    branch(7, 11, 1, 6);
    branch(7, 12, -1, 6);
    branch(8, 9, 0.6, 5);
    branch(6, 10, -0.5, 6);
    return p;
  },
  short_grass: () => grassBlades(60, 0.7),
  fern: () => {
    const p = blank();
    const r = mulberry32(61);
    for (const [x0, lean] of [
      [4, -1],
      [8, 0],
      [11, 1],
    ] as const) {
      for (let y = 15; y > 3; y--) {
        const x = x0 + Math.round(((15 - y) / 12) * lean * 2);
        set(p, x, y, shade([190, 190, 190], 0.7 + r() * 0.3));
        if (y % 2 === 0) {
          set(p, x - 1, y, [170, 170, 170]);
          set(p, x + 1, y, [170, 170, 170]);
        }
      }
    }
    return p;
  },
  dandelion: () => flower([60, 130, 40], [250, 220, 40], [230, 150, 20], 62),
  poppy: () => flower([60, 130, 40], [220, 30, 30], [30, 20, 20], 63),
  cornflower: () => flower([60, 130, 40], [80, 110, 230], [40, 60, 160], 64),
  blue_orchid: () => flower([60, 130, 40], [40, 170, 230], [180, 230, 255], 65),
  sugar_cane: () => {
    const p = blank();
    const r = mulberry32(66);
    for (const x of [3, 7, 11]) {
      for (let y = 0; y < T; y++) set(p, x, y, shade([140, 196, 92], (y % 5 === 0 ? 0.7 : 1) * (0.9 + r() * 0.2)));
      for (let y = 0; y < T; y++) set(p, x + 1, y, shade([110, 168, 70], 0.9 + r() * 0.2));
      set(p, x + 2, 4, [110, 168, 70]);
      set(p, x - 1, 10, [110, 168, 70]);
    }
    return p;
  },
  red_mushroom: () => {
    const p = blank();
    for (let y = 9; y < 16; y++) {
      set(p, 7, y, [220, 210, 190]);
      set(p, 8, y, [200, 190, 170]);
    }
    for (let y = 4; y < 9; y++)
      for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, (y - 8) * 1.4) < 5.2) set(p, x, y, (x + y) % 4 === 0 ? [240, 240, 240] : [210, 30, 30]);
    return p;
  },
  brown_mushroom: () => {
    const p = blank();
    for (let y = 10; y < 16; y++) {
      set(p, 7, y, [220, 210, 190]);
      set(p, 8, y, [200, 190, 170]);
    }
    for (let y = 6; y < 10; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, (y - 9.5) * 1.6) < 5) set(p, x, y, [150, 110, 80]);
    return p;
  },
  oak_sapling: () => sapling([104, 82, 50], [70, 140, 40], 67),
  birch_sapling: () => sapling([216, 215, 210], [118, 156, 80], 68),
  spruce_sapling: () => sapling([60, 42, 26], [60, 100, 60], 69),
  acacia_sapling: () => sapling([104, 98, 90], [120, 140, 40], 70),
  jungle_sapling: () => sapling([86, 66, 30], [40, 140, 20], 71),
  torch: () => {
    const p = blank();
    for (let y = 6; y < 16; y++) {
      set(p, 7, y, [120, 90, 50]);
      set(p, 8, y, [96, 70, 40]);
    }
    set(p, 7, 5, [255, 230, 120]);
    set(p, 8, 5, [255, 200, 80]);
    set(p, 7, 4, [255, 250, 200]);
    set(p, 8, 4, [255, 220, 120]);
    set(p, 7, 3, [255, 170, 60]);
    return p;
  },
  furnace_side: () => rock([118, 118, 118], 72, [[96, 96, 96]], 0.15),
  furnace_top: () => recolor(island("smooth_stone"), [0.92, 0.92, 0.92]),
  furnace_front: () => furnaceFront(false),
  furnace_front_on: () => furnaceFront(true),
  farmland: () => {
    const p = recolor(island("dirt"), [0.8, 0.72, 0.66]);
    for (let y = 0; y < T; y += 4) for (let x = 0; x < T; x++) set(p, x, y, [80, 52, 34]);
    return p;
  },
  water: () => {
    const p = blank();
    const r = mulberry32(73);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + Math.cos((y - x * 0.3) * 0.6) * 0.5;
        const v = 190 + w * 22 + r() * 14;
        set(p, x, y, [v, v, v], 255);
      }
    return p;
  },
  lava: () => {
    const p = blank();
    const r = mulberry32(74);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const w = Math.sin((x * 0.9 + y * 0.4) * 0.9) * 0.5 + Math.cos((y * 0.8 - x * 0.3) * 0.7) * 0.5;
        set(p, x, y, w > 0.45 ? [255, 220, 90] : w > -0.1 ? [240, 120, 20] : [200, 70, 10]);
        if (r() < 0.05) set(p, x, y, [140, 40, 10]);
      }
    return p;
  },
};
for (let i = 0; i < 8; i++) GEN[`wheat_stage${i}`] = () => wheat(i);
for (let i = 0; i < 10; i++) GEN[`destroy_stage_${i}`] = () => crack(i);

/* ───────────── 추가 블록 ───────────── */

const rgb = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
function frame(p: Pixels, c: RGB, inset = 0) {
  for (let i = inset; i < T - inset; i++) {
    set(p, i, inset, c);
    set(p, i, T - 1 - inset, c);
    set(p, inset, i, c);
    set(p, T - 1 - inset, i, c);
  }
  return p;
}
/** 벽돌 · 타일 줄눈 */
function brickWall(base: RGB, mortar: RGB, rowH: number, brickW: number, seed: number, offset = true) {
  const p = rock(base, seed, [shade(base, 0.85), shade(base, 1.12)], 0.14);
  for (let y = 0; y < T; y++) {
    const row = Math.floor(y / rowH);
    if (y % rowH === rowH - 1) {
      for (let x = 0; x < T; x++) set(p, x, y, mortar);
      continue;
    }
    const shift = offset && row % 2 ? brickW / 2 : 0;
    for (let x = 0; x < T; x++) if ((x + shift) % brickW === brickW - 1) set(p, x, y, mortar);
  }
  return p;
}
function polished(base: RGB, seed: number) {
  const p = rock(base, seed, [shade(base, 0.92), shade(base, 1.06)], 0.12);
  frame(p, shade(base, 0.78));
  for (let i = 1; i < T - 1; i++) {
    set(p, i, 1, shade(base, 1.12));
    set(p, 1, i, shade(base, 1.12));
  }
  return p;
}
function plankBox(base: RGB, rim: RGB, seed: number) {
  const p = planks(base, seed);
  frame(p, rim);
  frame(p, shade(rim, 1.15), 1);
  return p;
}
function tableTop(wood: RGB, seed: number) {
  const p = planks(wood, seed);
  frame(p, shade(wood, 0.6));
  return p;
}

Object.assign(GEN, {
  jack_o_lantern: () => {
    const p = island("pumpkin_side");
    const glow: RGB = [255, 214, 72];
    const hot: RGB = [255, 244, 160];
    for (const [x, y] of [
      [3, 5],
      [4, 5],
      [4, 4],
      [11, 5],
      [12, 5],
      [11, 4],
    ])
      set(p, x!, y!, glow);
    for (let x = 3; x <= 12; x++) set(p, x, 10, glow);
    for (let x = 4; x <= 11; x++) set(p, x, 11, x % 3 === 0 ? [120, 60, 10] : hot);
    set(p, 3, 9, glow);
    set(p, 12, 9, glow);
    return p;
  },
  hay_block_side: () => {
    const p = blank();
    const r = mulberry32(201);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const band = y === 3 || y === 12 ? 0.55 : 1;
        set(p, x, y, band < 1 ? [140, 30, 20] : shade([206, 170, 40], (x % 2 ? 0.86 : 1) * (0.9 + r() * 0.2)));
      }
    return p;
  },
  hay_block_top: () => {
    const p = rock([200, 166, 40], 202, [[230, 196, 70], [160, 120, 26]], 0.3);
    frame(p, [140, 30, 20]);
    return p;
  },
  bone_block_side: () => {
    const p = rock([226, 222, 200], 203, [[240, 236, 214], [200, 196, 172]], 0.18);
    for (let x = 0; x < T; x++) {
      set(p, x, 0, [190, 186, 160]);
      set(p, x, 15, [190, 186, 160]);
    }
    return p;
  },
  bone_block_top: () => {
    const p = rock([226, 222, 200], 204, [[200, 196, 172]], 0.1);
    frame(p, [190, 186, 160]);
    for (const [x, y] of [
      [5, 5],
      [10, 5],
      [5, 10],
      [10, 10],
      [7, 7],
      [8, 8],
    ])
      set(p, x!, y!, [170, 166, 140]);
    return p;
  },
  polished_granite: () => polished([154, 106, 89], 205),
  polished_diorite: () => polished([194, 194, 196], 206),
  polished_andesite: () => polished([132, 134, 132], 207),
  cracked_stone_bricks: () => {
    const p = island("stonebrick");
    const r = mulberry32(208);
    for (let k = 0; k < 3; k++) {
      let x = Math.floor(r() * 16);
      let y = Math.floor(r() * 16);
      for (let s = 0; s < 9; s++) {
        set(p, x, y, [70, 70, 70]);
        x += r() < 0.5 ? 1 : 0;
        y += r() < 0.7 ? 1 : -1;
      }
    }
    return p;
  },
  chiseled_stone_bricks: () => {
    const p = polished([122, 122, 122], 209);
    for (let y = 3; y < 13; y++)
      for (let x = 3; x < 13; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 3.6 && d < 4.8) set(p, x, y, [88, 88, 88]);
        if (d < 1.6) set(p, x, y, [96, 96, 96]);
      }
    return p;
  },
  cut_sandstone: () => {
    const p = rock([218, 206, 160], 210, [[200, 186, 140]], 0.15);
    for (let x = 0; x < T; x++) {
      set(p, x, 0, [176, 160, 110]);
      set(p, x, 15, [176, 160, 110]);
      set(p, x, 7, [196, 180, 130]);
    }
    return p;
  },
  chiseled_sandstone: () => {
    const p = GEN.cut_sandstone!();
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) if ((x + y) % 4 === 0 || Math.abs(x - 7.5) + Math.abs(y - 7.5) < 2.5) set(p, x, y, [176, 160, 110]);
    return p;
  },
  terracotta: () => rock([152, 94, 67], 211, [[140, 86, 60], [164, 102, 74]], 0.2),
  packed_ice: () => {
    const p = rock([140, 180, 250], 212, [[170, 205, 255], [120, 160, 236]], 0.22);
    for (let i = 0; i < T; i++) set(p, i, (i * 5) % T, [200, 225, 255]);
    return p;
  },
  tnt_side: () => {
    const p = blank();
    const r = mulberry32(213);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) set(p, x, y, x % 4 === 3 ? [120, 20, 14] : shade([220, 40, 30], 0.9 + r() * 0.15));
    for (let y = 5; y < 11; y++) for (let x = 0; x < T; x++) set(p, x, y, [236, 236, 228]);
    const font = ["###.#..#.###", ".#..##.#..#.", ".#..#.##..#.", ".#..#..#..#."];
    font.forEach((row, dy) => [...row].forEach((ch, dx) => ch === "#" && set(p, 2 + dx, 6 + dy, [30, 30, 30])));
    return p;
  },
  tnt_top: () => {
    const p = rock([220, 50, 36], 214, [[190, 36, 26]], 0.2);
    for (const [x, y] of [
      [4, 4],
      [11, 4],
      [4, 11],
      [11, 11],
      [7, 7],
      [8, 8],
    ]) {
      set(p, x!, y!, [60, 50, 40]);
      set(p, x! + 1, y!, [90, 80, 70]);
    }
    return p;
  },
  tnt_bottom: () => rock([200, 40, 30], 215, [[170, 30, 20]], 0.2),
  enchanting_table_top: () => {
    const p = blank();
    const r = mulberry32(216);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) set(p, x, y, shade([170, 30, 40], 0.85 + r() * 0.2));
    frame(p, [30, 18, 44]);
    for (const [x, y] of [
      [1, 1],
      [14, 1],
      [1, 14],
      [14, 14],
    ]) {
      set(p, x!, y!, [110, 236, 226]);
    }
    for (let i = 5; i < 11; i++) {
      set(p, i, 5, [60, 20, 30]);
      set(p, i, 10, [60, 20, 30]);
    }
    return p;
  },
  enchanting_table_side: () => {
    const p = island("obsidian");
    const r = mulberry32(217);
    for (let y = 0; y < 5; y++) for (let x = 0; x < T; x++) set(p, x, y, shade([170, 30, 40], 0.8 + r() * 0.25));
    for (let x = 0; x < T; x += 3) set(p, x, 5, [150, 24, 34]);
    for (const x of [2, 13]) set(p, x, 1, [110, 236, 226]);
    return p;
  },
  polished_deepslate: () => polished([72, 72, 78], 218),
  deepslate_bricks: () => brickWall([76, 76, 82], [44, 44, 50], 4, 8, 219),
  deepslate_tiles: () => brickWall([58, 58, 64], [34, 34, 38], 4, 4, 220, false),
  cut_copper: () => brickWall([196, 112, 82], [150, 80, 58], 8, 8, 221),
  barrel_side: () => {
    const p = logSide([120, 84, 46], 222, false);
    for (let x = 0; x < T; x++) {
      set(p, x, 2, [70, 70, 74]);
      set(p, x, 13, [70, 70, 74]);
    }
    for (let y = 0; y < T; y++) if (y !== 2 && y !== 13) set(p, 0, y, [88, 60, 32]);
    return p;
  },
  barrel_top: () => {
    const p = plankBox([150, 108, 62], [90, 62, 34], 223);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) set(p, x, y, x === 5 || x === 10 || y === 5 || y === 10 ? [70, 48, 26] : [104, 74, 40]);
    return p;
  },
  barrel_bottom: () => plankBox([140, 100, 56], [90, 62, 34], 224),
  fletching_table_top: () => {
    const p = tableTop([212, 196, 140], 225);
    for (let i = 3; i < 13; i++) set(p, i, 15 - i, [120, 90, 50]);
    set(p, 12, 3, [230, 230, 230]);
    set(p, 3, 12, [60, 60, 60]);
    return p;
  },
  fletching_table_side: () => {
    const p = planks([212, 196, 140], 226);
    for (let x = 0; x < T; x++) set(p, x, 0, [170, 150, 100]);
    return p;
  },
  fletching_table_front: () => {
    const p = GEN.fletching_table_side!();
    for (let y = 4; y < 12; y++) set(p, 7, y, [120, 90, 50]);
    for (const [x, y] of [
      [6, 4],
      [8, 4],
      [6, 11],
      [8, 11],
    ])
      set(p, x!, y!, [240, 240, 240]);
    return p;
  },
  smithing_table_top: () => {
    const p = rock([60, 60, 68], 227, [[46, 46, 54]], 0.2);
    frame(p, [36, 36, 42]);
    return p;
  },
  smithing_table_side: () => {
    const p = planks([96, 64, 40], 228);
    for (let y = 0; y < 4; y++) for (let x = 0; x < T; x++) set(p, x, y, [58, 58, 66]);
    return p;
  },
  smithing_table_bottom: () => planks([96, 64, 40], 229),
  smithing_table_front: () => {
    const p = GEN.smithing_table_side!();
    for (let y = 6; y < 12; y++) for (let x = 5; x < 11; x++) if (y === 6 || x === 5 || x === 10) set(p, x, y, [180, 180, 190]);
    return p;
  },
  cartography_table_top: () => {
    const p = tableTop([120, 84, 52], 230);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) set(p, x, y, (x + y) % 5 === 0 ? [140, 120, 80] : [232, 222, 190]);
    for (let i = 4; i < 12; i++) set(p, i, 7 + Math.round(Math.sin(i) * 2), [60, 120, 200]);
    return p;
  },
  cartography_table_side: () => {
    const p = planks([120, 84, 52], 231);
    for (let x = 2; x < 14; x++) set(p, x, 1, [232, 222, 190]);
    return p;
  },
  coarse_dirt: () => {
    const p = island("dirt");
    const r = mulberry32(232);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < 0.25) set(p, x, y, shade([110, 92, 80], 0.8 + r() * 0.4));
    return p;
  },
  raw_iron_block: () => rock([196, 160, 132], 233, [[226, 196, 172], [150, 116, 90]], 0.3),
  raw_gold_block: () => rock([222, 168, 44], 234, [[250, 214, 80], [170, 110, 20]], 0.3),
  raw_copper_block: () => rock([186, 102, 70], 235, [[220, 140, 100], [130, 66, 44]], 0.3),
  ladder: () => {
    const p = blank();
    const wood: RGB = [140, 104, 58];
    for (let y = 0; y < T; y++) {
      set(p, 2, y, wood);
      set(p, 3, y, shade(wood, 0.8));
      set(p, 12, y, wood);
      set(p, 13, y, shade(wood, 0.8));
    }
    for (const y of [2, 6, 10, 14]) for (let x = 4; x < 12; x++) set(p, x, y, x % 3 ? wood : shade(wood, 0.85));
    return p;
  },
  note_block: () => {
    const p = plankBox([110, 74, 50], [70, 46, 30], 236);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) if (x === 5 || x === 10 || y === 5 || y === 10) set(p, x, y, [40, 26, 18]);
    return p;
  },
  jukebox_side: () => plankBox([110, 74, 50], [70, 46, 30], 237),
  jukebox_top: () => {
    const p = plankBox([110, 74, 50], [70, 46, 30], 238);
    for (let x = 3; x < 13; x++) set(p, x, 7, [24, 20, 18]);
    for (let x = 3; x < 13; x++) set(p, x, 8, [50, 40, 34]);
    return p;
  },
  redstone_lamp_on: () => {
    const p = rock([214, 150, 74], 239, [[250, 206, 120], [170, 100, 40]], 0.3);
    frame(p, [96, 56, 30]);
    for (let i = 3; i < 13; i += 3) {
      set(p, i, 3, [255, 240, 190]);
      set(p, 3, i, [255, 240, 190]);
    }
    return p;
  },
} satisfies Record<string, () => Pixels>);

const WOOL_WHITE = () => gray(island("wool_white"), 1.05);
for (const [c, , hex] of COLORS) {
  const col = rgb(hex);
  if (c !== "white") GEN[`${c}_wool`] = () => recolor(WOOL_WHITE(), [col[0] / 235, col[1] / 235, col[2] / 235]);
  GEN[`${c}_stained_glass`] = () => {
    const p = blank();
    const r = mulberry32(hashString(c));
    frame(p, shade(col, 0.82));
    for (let i = 3; i < 9; i++) set(p, i, 12 - i, shade(col, 1.25), 255);
    for (let i = 9; i < 13; i++) set(p, i, 20 - i, shade(col, 1.25), 255);
    for (let k = 0; k < 4; k++) set(p, 2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), col);
    return p;
  };
}

const cache = new Map<string, Pixels>();

export function tilePixels(name: string): Pixels {
  const hit = cache.get(name);
  if (hit) return hit;
  const gen = GEN[name];
  let p: Pixels;
  if (gen) p = gen();
  else {
    p = blank();
    const r = mulberry32(hashString(name));
    noisy(p, [200, 0, 200], r, 0.1);
  }
  cache.set(name, p);
  return p;
}

export function hasTile(name: string) {
  return name in GEN;
}

/* ───────────── 아이템 스프라이트 ───────────── */

type Pal = Record<string, RGB | null>;

const MAT_PAL: Record<string, [RGB, RGB, RGB]> = {
  wooden: [[196, 160, 100], [150, 116, 66], [96, 72, 40]],
  stone: [[170, 170, 170], [128, 128, 128], [80, 80, 80]],
  iron: [[255, 255, 255], [216, 216, 216], [140, 140, 140]],
  golden: [[255, 255, 160], [248, 210, 60], [190, 130, 20]],
  diamond: [[200, 255, 250], [80, 226, 216], [24, 140, 130]],
  leather: [[196, 120, 80], [160, 92, 56], [110, 60, 36]],
};
const HANDLE: [RGB, RGB] = [[150, 110, 60], [92, 64, 34]];
const OUT: RGB = [30, 22, 18];

const TOOL: Record<string, string[]> = {
  pickaxe: [
    "................",
    "...1111111......",
    "..1aaabbbb1.....",
    "...111111bc1....",
    "........1hbc1...",
    ".......1hh1bc1..",
    "......1hh1.1bc1.",
    ".....1hh1...1c1.",
    "....1hh1.....11.",
    "...1hh1.........",
    "..1hh1..........",
    ".1hh1...........",
    "1hh1............",
    "1d1.............",
    ".1..............",
    "................",
  ],
  axe: [
    "................",
    "......111.......",
    ".....1aab1......",
    "....1aabbb1.....",
    "....1abbbc1.....",
    "....1bbcc1h1....",
    ".....111.1h1....",
    "........1hh1....",
    ".......1hh1.....",
    "......1hh1......",
    ".....1hh1.......",
    "....1hh1........",
    "...1hh1.........",
    "..1hh1..........",
    "..1d1...........",
    "...1............",
  ],
  shovel: [
    "................",
    "..........111...",
    ".........1aab1..",
    "........1aabbc1.",
    "........1abbcc1.",
    ".........1bcc1..",
    "........1h111...",
    ".......1hh1.....",
    "......1hh1......",
    ".....1hh1.......",
    "....1hh1........",
    "...1hh1.........",
    "..1hh1..........",
    ".1hh1...........",
    ".1d1............",
    "..1.............",
  ],
  hoe: [
    "................",
    "....111111......",
    "...1aaabbb1.....",
    "....11111hb1....",
    "........1hh1....",
    ".......1hh1.....",
    "......1hh1......",
    ".....1hh1.......",
    "....1hh1........",
    "...1hh1.........",
    "..1hh1..........",
    ".1hh1...........",
    ".1d1............",
    "..1.............",
    "................",
    "................",
  ],
  sword: [
    "...........111..",
    "..........1aa1..",
    ".........1aab1..",
    "........1aab1...",
    ".......1aab1....",
    "......1aab1.....",
    ".....1aab1......",
    "..11.1ab1.......",
    "..1c1bb1........",
    "...1cc1.........",
    "...1hc1c1.......",
    "..1hh1.11.......",
    ".1hh1...........",
    "1dd1............",
    "111.............",
    "................",
  ],
};

const ARMOR_T: Record<string, string[]> = {
  helmet: [
    "................",
    "................",
    "................",
    "....11111111....",
    "...1aaaaabbb1...",
    "...1abbbbbbc1...",
    "...1bc1111cc1...",
    "...1c1....1c1...",
    "...111....111...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  chestplate: [
    "................",
    "..111......111..",
    ".1ab1111111bc1..",
    ".1abbaaaabbbc1..",
    ".1abbbbbbbbbc1..",
    "..11abbbbbbc11..",
    "...1abbbbbbc1...",
    "...1abbbbbbc1...",
    "...1abbbbbbc1...",
    "...1abbbbbbc1...",
    "...1bbbbbbcc1...",
    "...1111111111...",
    "................",
    "................",
    "................",
    "................",
  ],
  leggings: [
    "................",
    "...1111111111...",
    "...1aaabbbbcc1..",
    "...1abbbbbbcc1..",
    "...1abbc11bcc1..",
    "...1abc1..1bc1..",
    "...1abc1..1bc1..",
    "...1abc1..1bc1..",
    "...1abc1..1bc1..",
    "...1abc1..1bc1..",
    "...1bcc1..1cc1..",
    "...1111...1111..",
    "................",
    "................",
    "................",
    "................",
  ],
  boots: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "...1111..1111...",
    "...1ab1..1ab1...",
    "...1ab1..1bc1...",
    "...1ab1..1bc1...",
    "..1abb1..1bcc1..",
    ".1abbb1..1bccc1.",
    ".1111111111111..",
    "................",
    "................",
    "................",
    "................",
  ],
};

const SPR: Record<string, { rows: string[]; pal: Pal }> = {};

function def(key: string, rows: string[], pal: Pal) {
  SPR[key] = { rows, pal };
}

const INGOT = [
  "................",
  "................",
  "................",
  "................",
  "......11111111..",
  ".....1aaaaaab1..",
  "....1aaaaaabc1..",
  "...1bbbbbbbcc1..",
  "..1abbbbbbbc1...",
  "..1bbbbbbbcc1...",
  "..1ccccccc11....",
  "..111111111.....",
  "................",
  "................",
  "................",
  "................",
];
const GEM = [
  "................",
  "................",
  "....11111111....",
  "...1aaabbbbb1...",
  "..1aaaabbbbcc1..",
  ".1bbbbbbbbccc11.",
  ".1abbbbbbbccc1..",
  "..1abbbbbbcc1...",
  "...1abbbbcc1....",
  "....1abbcc1.....",
  ".....1bcc1......",
  "......1c1.......",
  ".......1........",
  "................",
  "................",
  "................",
];
const EMERALD = [
  "................",
  ".......11.......",
  "......1aa1......",
  ".....1aabb1.....",
  "....1aabbbc1....",
  "....1abbbbc1....",
  "...1abbbbbcc1...",
  "...1abbbbbcc1...",
  "...1abbbbbcc1...",
  "....1abbbcc1....",
  "....1bbbbcc1....",
  ".....1bbcc1.....",
  "......1cc1......",
  ".......11.......",
  "................",
  "................",
];
const LUMP = [
  "................",
  "................",
  "................",
  ".....111111.....",
  "....1aaabbb1....",
  "...1aabbbbbc1...",
  "..1abbbcbbbbc1..",
  "..1abbbbbbbcc1..",
  "..1bbbcbbbbbc1..",
  "..1abbbbbbcbc1..",
  "...1bbbbbbccc1..",
  "....1cccccc11...",
  ".....111111.....",
  "................",
  "................",
  "................",
];
const DUST = [
  "................",
  "................",
  "................",
  "................",
  ".......a........",
  "....a..bb.a.....",
  "...bbabbbab.....",
  "..abbbbbbbbba...",
  ".abbbbcbbbbbbb..",
  ".bbbbbbbbcbbbba.",
  "..bbcbbbbbbbb...",
  "...bbbbbcbbb....",
  ".....bbbbb......",
  "................",
  "................",
  "................",
];
const NUGGET = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......1111......",
  ".....1aabb1.....",
  "....1abbbbc1....",
  "....1bbbbcc1....",
  ".....1bccc1.....",
  "......1111......",
  "................",
  "................",
  "................",
  "................",
  "................",
];
const CHOP = [
  "................",
  "................",
  ".......1111.....",
  ".....11aaab1....",
  "....1aaabbbb1...",
  "...1aabbbbbbc1..",
  "..1abbbbbbbbc1..",
  "..1abbbbcbbbc1..",
  "..1bbbbbbbbcc1..",
  "..1dbbbbbbccc1..",
  "..1ddbbbbccc1...",
  "...1dddccc11....",
  "....1111111.....",
  "................",
  "................",
  "................",
];
const DRUMSTICK = [
  "................",
  "................",
  "......1111......",
  ".....1aaab1.....",
  "....1aabbbb1....",
  "....1abbbbbc1...",
  "....1bbbbbbc1...",
  ".....1bbbbcc1...",
  "......1bbcc1....",
  ".......1dd1.....",
  "......1dd1......",
  ".....1dd1.......",
  "....1dd11.......",
  "...1dd1d1.......",
  "....11.1........",
  "................",
];
const STICK = [
  "................",
  "................",
  "............11..",
  "...........1a1..",
  "..........1ab1..",
  ".........1ab1...",
  "........1ab1....",
  ".......1ab1.....",
  "......1ab1......",
  ".....1ab1.......",
  "....1ab1........",
  "...1ab1.........",
  "..1bb1..........",
  "..111...........",
  "................",
  "................",
];
const BONE = [
  "................",
  "............11..",
  "...........1aa1.",
  "..........1aab1.",
  "...........1b1..",
  "..........1a1...",
  ".........1a1....",
  "........1a1.....",
  ".......1a1......",
  "......1a1.......",
  ".....1a1........",
  "..1.1b1.........",
  ".1ab1b1.........",
  ".1abb1..........",
  "..111...........",
  "................",
];
const APPLE = [
  "................",
  ".........1......",
  "........1d1.....",
  "........1d11....",
  "....1111d1ee1...",
  "...1aabb1beee1..",
  "..1aabbbbbb11...",
  "..1abbbbbbbbc1..",
  "..1abbbbbbbbc1..",
  "..1bbbbbbbbbc1..",
  "..1bbbbbbbbcc1..",
  "...1bbbbbbcc1...",
  "...1bbcc1bcc1...",
  "....111.1111....",
  "................",
  "................",
];
const BREAD = [
  "................",
  "................",
  "................",
  "................",
  ".......11111....",
  ".....11aaaab11..",
  "....1aabababbc1.",
  "...1abababbbbc1.",
  "..1abbbbbbbbcc1.",
  ".1abbbbbbbbcc1..",
  ".1bbbbbbbbcc1...",
  ".1cbbbbbccc1....",
  "..1ccccc111.....",
  "...11111........",
  "................",
  "................",
];
const BUCKET = [
  "................",
  "................",
  "................",
  "....11111111....",
  "...1aaaaaaab1...",
  "...1wwwwwwww1...",
  "...1abbbbbbc1...",
  "...1abbbbbbc1...",
  "....1abbbbc1....",
  "....1abbbbc1....",
  "....1abbbbc1....",
  "....1bbbbcc1....",
  ".....111111.....",
  "................",
  "................",
  "................",
];
const BALL = [
  "................",
  "................",
  "................",
  "................",
  "......1111......",
  ".....1aaab1.....",
  "....1aabbbc1....",
  "....1abbbbc1....",
  "....1abbbcc1....",
  "....1bbbccc1....",
  ".....1bccc1.....",
  "......1111......",
  "................",
  "................",
  "................",
  "................",
];
const SHEET = [
  "................",
  "................",
  "....1111111111..",
  "....1aaaaaaab1..",
  "...1aaaaaaab1...",
  "...1abbbbbbb1...",
  "..1aaaaaaab1....",
  "..1abbbbbbb1....",
  "..1aaaaaaab1....",
  "..1abbbbbbb1....",
  ".1aaaaaaab1.....",
  ".1bbbbbbbc1.....",
  ".1111111111.....",
  "................",
  "................",
  "................",
];
const BOOK = [
  "................",
  "................",
  "...11111111111..",
  "..1aaaaaaaaab1..",
  "..1abbbbbbbbb1..",
  "..1abbddddbbb1..",
  "..1abbbbbbbbb1..",
  "..1abbbbbbbbb1..",
  "..1abbbbbbbbb1..",
  "..1abbbbbbbbb1..",
  "..1abbbbbbbbc1..",
  "..1weeeeeeeee1..",
  "..11111111111...",
  "................",
  "................",
  "................",
];
const FEATHER = [
  "................",
  "...........11...",
  "..........1aa1..",
  ".........1aab1..",
  "........1aabb1..",
  ".......1aabb1...",
  "......1aabb1....",
  ".....1aabb1.....",
  "....1aabb1......",
  "....1abb1.......",
  "...1abb1........",
  "...1bb1.........",
  "..1d11..........",
  ".1d1............",
  "..1.............",
  "................",
];
const STRING = [
  "................",
  "................",
  "...........aa...",
  "..........a..a..",
  ".........a...a..",
  "........a...a...",
  ".......a...a....",
  "......a..aa.....",
  ".....a..a.......",
  "....a..a........",
  "...a..a.........",
  "..a.aa..........",
  "..aa............",
  "................",
  "................",
  "................",
];
const BOWL = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..111111111111..",
  "..1eeeeeeeeee1..",
  "..1abbbbbbbbc1..",
  "...1abbbbbbc1...",
  "....1abbbbc1....",
  ".....111111.....",
  "................",
  "................",
  "................",
  "................",
];
const SEEDS = [
  "................",
  "................",
  "................",
  "................",
  "......a.....a...",
  "....a.b...a.....",
  "...b....a...b...",
  ".....a.....a....",
  "...a...b..b.....",
  ".....b...a...a..",
  "...a...a........",
  ".....b....b.....",
  "................",
  "................",
  "................",
  "................",
];
const WHEAT = [
  "................",
  "..........1.....",
  ".........1a1.1..",
  ".........1ab1a1.",
  "......1..1b1ab1.",
  ".....1a1.1b1b1..",
  ".....1ab1d1b1...",
  "......1bd1dd1...",
  ".......1dd1.....",
  "......1dd1......",
  ".....1dd1.......",
  "....1dd1........",
  "...1dd1.........",
  "..1dd1..........",
  "...11...........",
  "................",
];
const ARROW = [
  "................",
  "..........1111..",
  "..........1aa1..",
  "...........1a1..",
  "..........1b11..",
  ".........1d1....",
  "........1d1.....",
  ".......1d1......",
  "......1d1.......",
  ".....1d1........",
  "..1.1d1.........",
  ".1e1d1..........",
  "..1ee1..........",
  ".1ee1e1.........",
  "..11.1..........",
  "................",
];
const BOW = [
  "................",
  ".....1111.......",
  "....1dd1.a......",
  "...1d11..a......",
  "...1d1....a.....",
  "..1d1.....a.....",
  "..1d1......a....",
  "..1d1......a....",
  "..1d1......a....",
  "..1d1......a....",
  "..1d1.....a.....",
  "...1d1....a.....",
  "...1d11..a......",
  "....1dd1.a......",
  ".....1111.......",
  "................",
];
const SHEARS = [
  "................",
  "................",
  "...........11...",
  "..........1a1...",
  ".........1ab1...",
  "....11..1ab1....",
  "...1aa11ab1.....",
  "....1abbb1......",
  ".....1bb1.......",
  "....1d11d1......",
  "...1d1..1d1.....",
  "..1d1....1d1....",
  "..1d1....1d1....",
  "...11.....11....",
  "................",
  "................",
];

const p3 = (m: [RGB, RGB, RGB]): Pal => ({ "1": OUT, a: m[0], b: m[1], c: m[2] });

function addTools() {
  for (const [mat, m] of Object.entries(MAT_PAL)) {
    if (mat !== "leather")
      for (const [kind, rows] of Object.entries(TOOL)) def(`${mat}_${kind}`, rows, { ...p3(m), h: HANDLE[0], d: HANDLE[1] });
    if (mat === "leather" || mat === "iron" || mat === "golden" || mat === "diamond")
      for (const [slot, rows] of Object.entries(ARMOR_T)) def(`${mat}_${slot}`, rows, p3(m));
  }
}
addTools();

const sameRow = (rows: string[]) => rows;
def("iron_ingot", INGOT, p3(MAT_PAL.iron!));
def("gold_ingot", INGOT, p3(MAT_PAL.golden!));
def("copper_ingot", INGOT, p3([[240, 160, 120], [200, 110, 76], [140, 70, 46]]));
def("brick", INGOT, p3([[200, 110, 80], [160, 80, 56], [110, 50, 36]]));
def("diamond", GEM, p3(MAT_PAL.diamond!));
def("lapis_lazuli", GEM, p3([[90, 140, 240], [40, 80, 200], [20, 40, 120]]));
def("emerald", EMERALD, p3([[160, 255, 170], [40, 210, 90], [10, 130, 50]]));
def("coal", LUMP, p3([[80, 80, 80], [40, 40, 40], [20, 20, 20]]));
def("charcoal", LUMP, p3([[100, 86, 70], [60, 50, 40], [30, 24, 20]]));
def("raw_iron", LUMP, p3([[230, 200, 180], [190, 150, 120], [130, 96, 76]]));
def("raw_gold", LUMP, p3([[255, 240, 120], [230, 180, 40], [170, 110, 20]]));
def("raw_copper", LUMP, p3([[240, 150, 110], [200, 110, 70], [130, 70, 44]]));
def("flint", LUMP, p3([[110, 110, 110], [60, 60, 62], [30, 30, 32]]));
def("clay_ball", BALL, p3([[200, 206, 220], [160, 166, 180], [120, 124, 136]]));
def("snowball", BALL, p3([[255, 255, 255], [230, 240, 245], [190, 210, 220]]));
def("redstone", DUST, { a: [255, 80, 60], b: [200, 20, 10], c: [120, 10, 4] });
def("glowstone_dust", DUST, { a: [255, 250, 180], b: [240, 200, 100], c: [170, 120, 50] });
def("gunpowder", DUST, { a: [140, 140, 140], b: [90, 90, 90], c: [50, 50, 50] });
def("bone_meal", DUST, { a: [255, 255, 255], b: [230, 230, 220], c: [190, 190, 180] });
def("iron_nugget", NUGGET, p3(MAT_PAL.iron!));
def("gold_nugget", NUGGET, p3(MAT_PAL.golden!));
const RAW_MEAT = { ...p3([[240, 140, 140], [210, 90, 90], [150, 50, 50]]), d: [250, 240, 230] as RGB };
const COOKED = { ...p3([[200, 120, 70], [150, 80, 40], [100, 50, 24]]), d: [230, 210, 180] as RGB };
def("porkchop", CHOP, { ...p3([[255, 180, 180], [240, 130, 140], [190, 90, 100]]), d: [255, 240, 235] });
def("cooked_porkchop", CHOP, COOKED);
def("beef", CHOP, RAW_MEAT);
def("cooked_beef", CHOP, { ...p3([[150, 90, 50], [110, 60, 30], [70, 36, 18]]), d: [200, 170, 140] });
def("mutton", CHOP, { ...RAW_MEAT, d: [255, 255, 255] });
def("cooked_mutton", CHOP, { ...COOKED, d: [240, 230, 210] });
def("rotten_flesh", CHOP, { ...p3([[170, 120, 80], [120, 110, 50], [80, 70, 30]]), d: [110, 140, 60] });
def("chicken", DRUMSTICK, { ...p3([[255, 220, 210], [240, 190, 180], [200, 150, 140]]), d: [250, 245, 235] });
def("cooked_chicken", DRUMSTICK, { ...p3([[230, 170, 90], [200, 130, 60], [150, 90, 40]]), d: [250, 240, 220] });
def("stick", sameRow(STICK), { "1": OUT, a: HANDLE[0], b: HANDLE[1] });
def("bone", BONE, { "1": [120, 120, 110], a: [250, 250, 240], b: [210, 210, 200] });
def("apple", APPLE, { ...p3([[255, 120, 110], [220, 30, 40], [150, 10, 20]]), d: [100, 70, 40], e: [80, 170, 50] });
def("bread", BREAD, p3([[230, 180, 100], [190, 130, 60], [130, 80, 36]]));
def("bucket", BUCKET, { ...p3(MAT_PAL.iron!), w: [70, 70, 70] });
def("water_bucket", BUCKET, { ...p3(MAT_PAL.iron!), w: [60, 110, 230] });
def("lava_bucket", BUCKET, { ...p3(MAT_PAL.iron!), w: [250, 130, 20] });
def("paper", SHEET, p3([[255, 255, 255], [230, 230, 220], [180, 180, 170]]));
def("leather", SHEET, p3([[200, 120, 80], [160, 90, 56], [110, 60, 36]]));
def("book", BOOK, { ...p3([[150, 70, 40], [120, 50, 30], [80, 30, 20]]), d: [230, 200, 120], w: [240, 240, 230], e: [210, 210, 200] });
def("feather", FEATHER, { "1": [140, 140, 140], a: [255, 255, 255], b: [220, 220, 220], d: [160, 160, 160] });
def("string", STRING, { a: [240, 240, 240] });
def("bowl", BOWL, { ...p3([[170, 130, 80], [130, 96, 56], [90, 64, 36]]), e: [80, 56, 30] });
def("mushroom_stew", BOWL, { ...p3([[170, 130, 80], [130, 96, 56], [90, 64, 36]]), e: [200, 150, 100] });
def("wheat_seeds", SEEDS, { a: [90, 170, 60], b: [60, 120, 40] });
def("wheat", WHEAT, { "1": [110, 80, 20], a: [240, 210, 100], b: [210, 170, 60], d: [190, 160, 60] });
def("arrow", ARROW, { "1": OUT, a: [200, 200, 200], b: [140, 140, 140], d: HANDLE[0], e: [240, 240, 240] });
def("bow", BOW, { "1": OUT, d: HANDLE[0], a: [230, 230, 230] });
def("shears", SHEARS, { "1": OUT, a: [255, 255, 255], b: [200, 200, 200], d: [140, 140, 140] });

const DYE = [
  "................",
  "................",
  "................",
  "......1111......",
  ".....1aaab1.....",
  "....1aabbbc1....",
  "...1aabbbbbc1...",
  "...1abbbbbbc1...",
  "...1abbbbbcc1...",
  "...1bbbbbbcc1...",
  "....1bbbbcc1....",
  ".....1cccc1.....",
  "......1111......",
  "................",
  "................",
  "................",
];
const DIAL = [
  "................",
  "................",
  ".....111111.....",
  "....1aaaaaa1....",
  "...1abbbbbba1...",
  "..1abbbbrbbba1..",
  "..1abbbbrbbba1..",
  "..1abbbrrrbba1..",
  "..1abbbwwwbba1..",
  "..1abbbbwbbba1..",
  "..1abbbbwbbba1..",
  "...1abbbbbba1...",
  "....1aaaaaa1....",
  ".....111111.....",
  "................",
  "................",
];
const FLINT_STEEL = [
  "................",
  "................",
  "...........111..",
  "..........1aa1..",
  ".........1ab1...",
  "........1ab1....",
  ".......1ab1.....",
  "......1ab1......",
  "..111.1b1.......",
  ".1ddd111........",
  "1dddde1.........",
  "1ddeee1.........",
  ".1eee1..........",
  "..111...........",
  "................",
  "................",
];
const SHIELD = [
  "................",
  "..111111111111..",
  "..1aaaaaaaaaa1..",
  "..1abbbbbbbba1..",
  "..1abbbbbbbba1..",
  "..1abbbccbbba1..",
  "..1abbccccbba1..",
  "..1abbbccbbba1..",
  "..1abbbbbbbba1..",
  "..1abbbbbbbba1..",
  "...1abbbbbba1...",
  "...1abbbbbba1...",
  "....1abbbba1....",
  ".....1abba1.....",
  "......1111......",
  "................",
];
const EGG = [
  "................",
  "................",
  "................",
  "......1111......",
  ".....1aaab1.....",
  "....1aaaabb1....",
  "....1aaaabb1....",
  "...1aaaaabbb1...",
  "...1aaaabbbb1...",
  "...1aaabbbbc1...",
  "...1abbbbbcc1...",
  "....1bbbbcc1....",
  ".....1cccc1.....",
  "......1111......",
  "................",
  "................",
];
const PIE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......111111....",
  "....11aaaaaa11..",
  "..11aaaabaaaaa1.",
  ".1aaabaaaaabaaa1",
  ".1ddaaaaaaaaadd1",
  ".1dddddddddddd1.",
  "..1eeeeeeeeee1..",
  "...1111111111...",
  "................",
  "................",
  "................",
];
const CAKE = [
  "................",
  "................",
  "................",
  "................",
  ".......11.......",
  ".....11rr11.....",
  "...11aaaaaa11...",
  ".11aaaaaaaaaa11.",
  "1aaaaraaaaraaaa1",
  "1waaaaaaaaaaaaw1",
  "1wwaaaaaaaaaaww1",
  "1dwwwwaaaawwwwd1",
  "1ddddwwwwwwdddd1",
  ".11dddddddddd11.",
  "...1111111111...",
  "................",
];
for (const [c, , hex] of COLORS) {
  const col = rgb(hex);
  def(`${c}_dye`, DYE, p3([shade(col, 1.25), col, shade(col, 0.68)]));
}
def("sugar", DUST, { a: [255, 255, 255], b: [236, 236, 240], c: [200, 200, 210] });
def("compass", DIAL, { "1": OUT, a: [176, 176, 180], b: [70, 70, 76], r: [220, 30, 30], w: [230, 230, 230] });
def("clock", DIAL, { "1": OUT, a: [250, 210, 60], b: [90, 140, 220], r: [40, 40, 40], w: [40, 40, 40] });
def("flint_and_steel", FLINT_STEEL, { "1": OUT, a: [240, 240, 240], b: [170, 170, 170], d: [70, 70, 72], e: [40, 40, 42] });
def("shield", SHIELD, { "1": OUT, a: [190, 190, 196], b: [150, 108, 60], c: [210, 210, 216] });
def("egg", EGG, p3([[255, 250, 236], [232, 214, 180], [196, 170, 130]]));
def("pumpkin_pie", PIE, { "1": OUT, a: [230, 140, 50], b: [200, 100, 30], d: [220, 180, 110], e: [170, 120, 60] });
def("cake", CAKE, { "1": OUT, a: [250, 250, 250], r: [220, 30, 40], w: [240, 220, 200], d: [190, 120, 60] });
def("golden_apple", APPLE, { ...p3([[255, 250, 170], [248, 210, 60], [190, 130, 20]]), d: [100, 70, 40], e: [80, 170, 50] });
def("milk_bucket", BUCKET, { ...p3(MAT_PAL.iron!), w: [250, 250, 250] });

/** 아이템 스프라이트 픽셀 (16×16). 없으면 null */
export function spritePixels(key: string): Pixels | null {
  const s = SPR[key];
  if (!s) return null;
  const p = blank();
  s.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = s.pal[ch];
      if (c) set(p, x, y, c);
    }),
  );
  return p;
}
