/** 16×16 마인크래프트풍 절차 텍스처 — 서버(PNG)와 클라이언트(three.js)가 같은 픽셀을 쓴다 */

export const TEX = 16;

export type TextureName =
  | "grass_top"
  | "grass_side"
  | "dirt"
  | "stone"
  | "cobble"
  | "stonebrick"
  | "oak_log"
  | "oak_log_top"
  | "oak_leaves"
  | "oak_planks"
  | "dark_planks"
  | "diamond_block"
  | "gold_block"
  | "emerald_block"
  | "glass"
  | "obsidian"
  | "portal"
  | "glowstone"
  | "pumpkin_face"
  | "pumpkin_side"
  | "pumpkin_top"
  | "lantern"
  | "iron"
  | "cake_top"
  | "cake_side"
  | "beacon_core"
  | "jukebox_side"
  | "jukebox_top"
  | "chest_front"
  | "chest_side"
  | "chest_top"
  | "banner"
  | "wool_red"
  | "wool_white"
  | "door"
  | "terracotta"
  | "leaf_green"
  | "nether_bricks"
  | "netherrack"
  | "end_frame_top"
  | "end_frame_side"
  | "end_portal"
  | "end_stone"
  | "crafting_top"
  | "crafting_side"
  | "crafting_front"
  | "bookshelf"
  | "quartz"
  | "diamond_ore"
  | "deepslate"
  | "smooth_stone"
  | "sea_lantern"
  | "spruce_planks"
  | "lectern_top"
  | "purpur"
  | "cherry_leaves"
  | "cherry_log"
  | "cherry_log_top"
  | "mossy_stonebrick"
  | "andesite"
  | "deepslate_tiles"
  | "water"
  | "amethyst"
  | "wool_yellow"
  | "wool_lime"
  | "wool_cyan"
  | "wool_purple"
  | "wool_pink"
  | "wool_orange"
  | "petal_red"
  | "petal_yellow"
  | "petal_blue"
  | "petal_pink"
  | "stem"
  | "roof_tiles"
  | "window_lit"
  | "manor_door"
  | "manor_wall"
  | "hedge"
  | "portal_green"
  | "portal_gold"
  | "target_side"
  | "target_top"
  | "sand"
  | "sandstone"
  | "portal_cyan"
  | "portal_lime"
  | "portal_orange"
  | "bricks"
  | "ice"
  | "wool_black"
  | "wool_blue"
  | "slime";

/** 구멍이 뚫린(알파 0 픽셀) 텍스처 — 렌더러에서 alphaTest 로 그린다 */
export const CUTOUT_TEXTURES = new Set<TextureName>(["oak_leaves", "glass", "cherry_leaves"]);
/** 반투명 텍스처 */
export const TRANSLUCENT_TEXTURES = new Set<TextureName>(["portal", "water", "portal_green", "portal_gold", "portal_cyan", "portal_lime", "portal_orange"]);

type RGB = [number, number, number];
type Pixels = Uint8ClampedArray;

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function canvas(): Pixels {
  return new Uint8ClampedArray(TEX * TEX * 4);
}

function set(p: Pixels, x: number, y: number, c: RGB, a = 255) {
  const i = (y * TEX + x) * 4;
  p[i] = clamp(c[0]);
  p[i + 1] = clamp(c[1]);
  p[i + 2] = clamp(c[2]);
  p[i + 3] = a;
}

function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

function noisy(p: Pixels, base: RGB, r: () => number, amount = 0.12) {
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) set(p, x, y, shade(base, 1 - amount + r() * amount * 2));
}

function speckle(p: Pixels, c: RGB, r: () => number, chance: number) {
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) if (r() < chance) set(p, x, y, shade(c, 0.9 + r() * 0.2));
}

function bevelBlock(p: Pixels, r: () => number, light: RGB, mid: RGB, dark: RGB) {
  noisy(p, mid, r, 0.06);
  for (let i = 0; i < TEX; i++) {
    set(p, i, 0, light);
    set(p, 0, i, light);
    set(p, i, TEX - 1, dark);
    set(p, TEX - 1, i, dark);
  }
  for (let i = 2; i < TEX - 2; i++) {
    if (r() < 0.5) set(p, i, 2 + ((i * 3) % 4), light);
    if (r() < 0.4) set(p, 3 + ((i * 5) % 10), i, shade(dark, 1.1));
  }
}

const GRASS: RGB = [93, 155, 52];
const DIRT: RGB = [134, 96, 67];
const PLANK: RGB = [162, 130, 78];
const LOG: RGB = [104, 82, 50];

const generators: Record<TextureName, (p: Pixels, r: () => number) => void> = {
  grass_top(p, r) {
    noisy(p, GRASS, r, 0.14);
    speckle(p, [70, 128, 38], r, 0.18);
    speckle(p, [118, 182, 70], r, 0.08);
  },
  grass_side(p, r) {
    generators.dirt(p, r);
    for (let x = 0; x < TEX; x++) {
      const depth = 3 + Math.floor(r() * 3) - (x % 5 === 0 ? 1 : 0);
      for (let y = 0; y < depth; y++) set(p, x, y, shade(GRASS, 0.85 + r() * 0.3));
    }
  },
  dirt(p, r) {
    noisy(p, DIRT, r, 0.1);
    speckle(p, [104, 72, 48], r, 0.16);
    speckle(p, [168, 128, 92], r, 0.07);
  },
  stone(p, r) {
    noisy(p, [126, 126, 126], r, 0.08);
    for (let k = 0; k < 7; k++) {
      const y = Math.floor(r() * TEX);
      const x0 = Math.floor(r() * TEX);
      const len = 2 + Math.floor(r() * 4);
      for (let x = x0; x < Math.min(TEX, x0 + len); x++) set(p, x, y, [100, 100, 100]);
    }
  },
  cobble(p, r) {
    const seeds = Array.from({ length: 9 }, () => [r() * TEX, r() * TEX, 0.75 + r() * 0.4] as const);
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        let best = 1e9;
        let second = 1e9;
        let f = 1;
        for (const [sx, sy, sf] of seeds) {
          const dx = Math.min(Math.abs(x - sx), TEX - Math.abs(x - sx));
          const dy = Math.min(Math.abs(y - sy), TEX - Math.abs(y - sy));
          const d = dx * dx + dy * dy;
          if (d < best) {
            second = best;
            best = d;
            f = sf;
          } else if (d < second) second = d;
        }
        const edge = Math.sqrt(second) - Math.sqrt(best) < 1.1;
        set(p, x, y, edge ? [72, 72, 72] : shade([128, 128, 128], f + r() * 0.08));
      }
  },
  stonebrick(p, r) {
    noisy(p, [122, 121, 122], r, 0.06);
    for (let x = 0; x < TEX; x++) {
      set(p, x, 7, [80, 80, 80]);
      set(p, x, 15, [80, 80, 80]);
      set(p, x, 0, [140, 140, 140]);
      set(p, x, 8, [140, 140, 140]);
    }
    for (let y = 0; y < 8; y++) {
      set(p, 15, y, [80, 80, 80]);
      set(p, 7, y + 8, [80, 80, 80]);
    }
  },
  oak_log(p, r) {
    for (let x = 0; x < TEX; x++) {
      const stripe = x % 4 === 0 ? 0.72 : x % 4 === 2 ? 0.88 : 1;
      for (let y = 0; y < TEX; y++) set(p, x, y, shade(LOG, stripe * (0.92 + r() * 0.16)));
    }
  },
  oak_log_top(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.5) set(p, x, y, shade(LOG, 0.9 + r() * 0.15));
        else set(p, x, y, shade([178, 146, 92], Math.floor(d) % 2 ? 0.86 : 1 + r() * 0.05));
      }
  },
  oak_leaves(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        if (r() < 0.2) {
          set(p, x, y, [0, 0, 0], 0);
          continue;
        }
        set(p, x, y, shade([58, 128, 36], 0.7 + r() * 0.5));
      }
  },
  leaf_green(p, r) {
    noisy(p, [72, 140, 44], r, 0.15);
  },
  oak_planks(p, r) {
    noisy(p, PLANK, r, 0.06);
    for (let x = 0; x < TEX; x++) for (const y of [3, 7, 11, 15]) set(p, x, y, shade(PLANK, 0.68));
    for (let row = 0; row < 4; row++) {
      const seam = (row * 7 + 3) % TEX;
      for (let y = row * 4; y < row * 4 + 3; y++) set(p, seam, y, shade(PLANK, 0.72));
    }
    speckle(p, shade(PLANK, 0.85), r, 0.05);
  },
  dark_planks(p, r) {
    generators.oak_planks(p, r);
    for (let i = 0; i < p.length; i += 4) {
      p[i] = clamp(p[i]! * 0.42);
      p[i + 1] = clamp(p[i + 1]! * 0.34);
      p[i + 2] = clamp(p[i + 2]! * 0.26);
    }
  },
  diamond_block(p, r) {
    bevelBlock(p, r, [214, 252, 248], [98, 219, 214], [36, 150, 142]);
  },
  gold_block(p, r) {
    bevelBlock(p, r, [255, 250, 170], [248, 210, 62], [196, 140, 20]);
  },
  emerald_block(p, r) {
    bevelBlock(p, r, [170, 255, 190], [62, 200, 100], [20, 120, 50]);
  },
  glass(p, r) {
    for (let i = 0; i < p.length; i += 4) p[i + 3] = 0;
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [210, 236, 244]);
      set(p, 0, i, [210, 236, 244]);
      set(p, i, TEX - 1, [170, 206, 220]);
      set(p, TEX - 1, i, [170, 206, 220]);
    }
    for (let i = 3; i < 7; i++) set(p, i, 9 - i, [236, 250, 255], 220);
    for (let i = 9; i < 12; i++) set(p, i, 20 - i, [236, 250, 255], 200);
    void r;
  },
  obsidian(p, r) {
    noisy(p, [22, 18, 34], r, 0.2);
    speckle(p, [62, 40, 96], r, 0.1);
  },
  portal(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([140, 62, 230], 0.75 + w * 0.25 + r() * 0.1), 210);
      }
  },
  glowstone(p, r) {
    noisy(p, [236, 196, 112], r, 0.08);
    speckle(p, [255, 236, 170], r, 0.2);
    speckle(p, [150, 104, 52], r, 0.12);
  },
  pumpkin_side(p, r) {
    for (let x = 0; x < TEX; x++) {
      const ridge = x % 4 === 0 ? 0.78 : 1;
      for (let y = 0; y < TEX; y++) set(p, x, y, shade([226, 140, 28], ridge * (0.94 + r() * 0.1)));
    }
  },
  pumpkin_face(p, r) {
    generators.pumpkin_side(p, r);
    const glow: RGB = [255, 214, 74];
    for (const [x, y] of [
      [3, 5], [4, 5], [4, 4], [11, 5], [12, 5], [11, 4],
      [3, 10], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 10],
      [6, 10], [9, 10], [7, 12], [8, 12],
    ] as const)
      set(p, x, y, glow);
  },
  pumpkin_top(p, r) {
    generators.pumpkin_side(p, r);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) set(p, x, y, [98, 76, 30]);
  },
  lantern(p, r) {
    noisy(p, [48, 50, 58], r, 0.1);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) set(p, x, y, shade([255, 196, 88], 0.92 + r() * 0.16));
    for (let y = 5; y < 11; y++) for (let x = 6; x < 10; x++) set(p, x, y, [255, 240, 180]);
  },
  iron(p, r) {
    noisy(p, [72, 74, 84], r, 0.1);
  },
  cake_top(p, r) {
    noisy(p, [246, 240, 236], r, 0.04);
    for (const [x, y] of [[3, 3], [11, 4], [7, 8], [4, 12], [12, 11]] as const) set(p, x, y, [214, 36, 48]);
  },
  cake_side(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        if (y < 4 || (y < 6 && (x * 7) % 5 < 2)) set(p, x, y, shade([246, 240, 236], 0.96 + r() * 0.06));
        else if (y === 10) set(p, x, y, [214, 36, 48]);
        else set(p, x, y, shade([170, 102, 56], 0.9 + r() * 0.15));
      }
  },
  beacon_core(p, r) {
    noisy(p, [120, 240, 236], r, 0.1);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) set(p, x, y, [230, 255, 255]);
  },
  jukebox_side(p, r) {
    generators.dark_planks(p, r);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) set(p, x, y, shade([120, 82, 58], 0.9 + r() * 0.12));
  },
  jukebox_top(p, r) {
    generators.jukebox_side(p, r);
    for (let x = 3; x < 13; x++) {
      set(p, x, 7, [24, 20, 18]);
      set(p, x, 8, [24, 20, 18]);
    }
  },
  chest_side(p, r) {
    noisy(p, [168, 112, 44], r, 0.08);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [74, 46, 16]);
      set(p, i, TEX - 1, [74, 46, 16]);
      set(p, 0, i, [74, 46, 16]);
      set(p, TEX - 1, i, [74, 46, 16]);
      set(p, i, 5, [74, 46, 16]);
    }
  },
  chest_front(p, r) {
    generators.chest_side(p, r);
    for (let y = 4; y < 8; y++) for (let x = 7; x < 9; x++) set(p, x, y, [204, 204, 214]);
  },
  chest_top(p, r) {
    generators.chest_side(p, r);
  },
  banner(p, r) {
    noisy(p, [176, 36, 34], r, 0.06);
    const gold: RGB = [250, 206, 64];
    for (let x = 0; x < TEX; x++) set(p, x, 1, gold);
    for (const [x, y] of [
      [5, 5], [6, 5], [7, 5], [8, 5], [5, 6], [9, 6], [5, 7], [9, 7], [5, 8], [9, 8], [5, 9], [9, 9], [5, 10], [6, 10], [7, 10], [8, 10],
    ] as const)
      set(p, x + 1, y, gold);
  },
  wool_red(p, r) {
    noisy(p, [160, 39, 34], r, 0.08);
  },
  wool_white(p, r) {
    noisy(p, [233, 236, 236], r, 0.05);
  },
  door(p, r) {
    generators.oak_planks(p, r);
    for (let y = 2; y < 6; y++)
      for (let x = 3; x < 13; x++) if (x !== 7 && x !== 8) set(p, x, y, [80, 120, 150]);
    set(p, 12, 9, [40, 30, 20]);
  },
  terracotta(p, r) {
    noisy(p, [156, 84, 58], r, 0.06);
  },
  nether_bricks(p, r) {
    noisy(p, [52, 24, 30], r, 0.1);
    const mortar: RGB = [28, 12, 16];
    for (let x = 0; x < TEX; x++) for (const y of [3, 7, 11, 15]) set(p, x, y, mortar);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let y = row * 4; y < row * 4 + 3; y++) {
        set(p, (off + 7) % TEX, y, mortar);
        set(p, (off + 15) % TEX, y, mortar);
      }
    }
    speckle(p, [76, 36, 42], r, 0.08);
  },
  netherrack(p, r) {
    noisy(p, [110, 46, 46], r, 0.16);
    speckle(p, [70, 24, 26], r, 0.2);
    speckle(p, [150, 72, 66], r, 0.08);
  },
  end_frame_side(p, r) {
    noisy(p, [220, 222, 158], r, 0.06);
    for (let y = 0; y < 4; y++) for (let x = 0; x < TEX; x++) set(p, x, y, shade([36, 84, 72], 0.85 + r() * 0.3));
    for (let x = 0; x < TEX; x++) set(p, x, 4, [26, 58, 50]);
  },
  end_frame_top(p, r) {
    noisy(p, [36, 84, 72], r, 0.12);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [210, 214, 150]);
      set(p, 0, i, [210, 214, 150]);
      set(p, i, TEX - 1, [180, 184, 120]);
      set(p, TEX - 1, i, [180, 184, 120]);
    }
    for (let y = 5; y < 11; y++)
      for (let x = 5; x < 11; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d < 3.2) set(p, x, y, d < 1.4 ? [12, 40, 30] : shade([70, 168, 120], 0.9 + r() * 0.2));
      }
  },
  end_portal(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const v = r();
        set(p, x, y, v > 0.95 ? [190, 255, 236] : v > 0.9 ? [80, 160, 170] : v > 0.82 ? [22, 50, 64] : [6, 10, 20]);
      }
  },
  end_stone(p, r) {
    noisy(p, [220, 222, 160], r, 0.07);
    speckle(p, [196, 198, 132], r, 0.18);
  },
  crafting_side(p, r) {
    generators.oak_planks(p, r);
    for (let y = 0; y < 3; y++) for (let x = 0; x < TEX; x++) set(p, x, y, shade([118, 84, 50], 0.9 + r() * 0.15));
    for (let y = 5; y < 13; y++) {
      set(p, 3, y, [70, 52, 40]);
      set(p, 12, y, [140, 140, 150]);
    }
    for (let x = 2; x < 6; x++) set(p, x, 5, [150, 150, 160]);
    for (let x = 10; x < 14; x++) set(p, x, 6, [110, 80, 50]);
  },
  crafting_front(p, r) {
    generators.crafting_side(p, r);
    for (let y = 6; y < 12; y++) for (let x = 6; x < 10; x++) set(p, x, y, shade([92, 66, 38], 0.9 + r() * 0.1));
  },
  crafting_top(p, r) {
    noisy(p, [168, 124, 76], r, 0.06);
    const line: RGB = [96, 66, 38];
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, line);
      set(p, 0, i, line);
      set(p, i, TEX - 1, line);
      set(p, TEX - 1, i, line);
      set(p, i, 5, line);
      set(p, i, 10, line);
      set(p, 5, i, line);
      set(p, 10, i, line);
    }
  },
  bookshelf(p, r) {
    generators.oak_planks(p, r);
    const colors: RGB[] = [[160, 40, 36], [40, 90, 160], [60, 130, 60], [200, 170, 70], [120, 60, 140]];
    for (const y0 of [2, 9]) {
      for (let x = 1; x < 15; x++) {
        const c = colors[Math.floor(r() * colors.length)]!;
        const h = 4 + Math.floor(r() * 2);
        for (let y = y0 + (5 - h); y < y0 + 5; y++) set(p, x, y, shade(c, 0.85 + r() * 0.25));
      }
    }
  },
  quartz(p, r) {
    noisy(p, [236, 230, 222], r, 0.03);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [250, 248, 244]);
      set(p, 0, i, [250, 248, 244]);
      set(p, i, TEX - 1, [204, 198, 190]);
      set(p, TEX - 1, i, [204, 198, 190]);
    }
  },
  diamond_ore(p, r) {
    generators.stone(p, r);
    for (const [cx, cy] of [[4, 4], [11, 3], [7, 9], [3, 12], [12, 11]] as const) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] as const) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < TEX && y < TEX) set(p, x, y, dx === 0 && dy === 0 ? [214, 255, 250] : [92, 222, 214]);
      }
    }
  },
  deepslate(p, r) {
    noisy(p, [72, 72, 78], r, 0.1);
    for (let y = 0; y < TEX; y += 2) for (let x = 0; x < TEX; x++) if (r() < 0.3) set(p, x, y, [56, 56, 62]);
  },
  smooth_stone(p, r) {
    noisy(p, [158, 158, 158], r, 0.04);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [120, 120, 120]);
      set(p, i, TEX - 1, [120, 120, 120]);
      set(p, 0, i, [120, 120, 120]);
      set(p, TEX - 1, i, [120, 120, 120]);
    }
  },
  sea_lantern(p, r) {
    noisy(p, [196, 226, 216], r, 0.05);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) set(p, x, y, shade([236, 252, 246], 0.96 + r() * 0.06));
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [150, 186, 176]);
      set(p, 0, i, [150, 186, 176]);
      set(p, i, TEX - 1, [150, 186, 176]);
      set(p, TEX - 1, i, [150, 186, 176]);
    }
  },
  spruce_planks(p, r) {
    generators.oak_planks(p, r);
    for (let i = 0; i < p.length; i += 4) {
      p[i] = clamp(p[i]! * 0.66);
      p[i + 1] = clamp(p[i + 1]! * 0.56);
      p[i + 2] = clamp(p[i + 2]! * 0.46);
    }
  },
  lectern_top(p, r) {
    generators.spruce_planks(p, r);
    for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) if (x !== 7 && x !== 8) set(p, x, y, shade([240, 232, 210], 0.95 + r() * 0.05));
    for (const y of [5, 7, 9, 11]) for (let x = 3; x < 13; x++) if (x !== 7 && x !== 8 && r() < 0.7) set(p, x, y, [90, 80, 70]);
  },
  purpur(p, r) {
    noisy(p, [168, 122, 168], r, 0.06);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [196, 156, 196]);
      set(p, 0, i, [196, 156, 196]);
      set(p, i, TEX - 1, [130, 90, 130]);
      set(p, TEX - 1, i, [130, 90, 130]);
    }
  },
  cherry_leaves(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        if (r() < 0.16) {
          set(p, x, y, [0, 0, 0], 0);
          continue;
        }
        const v = r();
        set(p, x, y, v > 0.86 ? [255, 214, 232] : v > 0.3 ? shade([238, 152, 196], 0.9 + r() * 0.18) : [206, 112, 160]);
      }
  },
  cherry_log(p, r) {
    for (let x = 0; x < TEX; x++) {
      const stripe = x % 4 === 0 ? 0.7 : x % 4 === 2 ? 0.86 : 1;
      for (let y = 0; y < TEX; y++) set(p, x, y, shade([58, 34, 44], stripe * (0.9 + r() * 0.2)));
    }
  },
  cherry_log_top(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.5) set(p, x, y, shade([58, 34, 44], 0.9 + r() * 0.15));
        else set(p, x, y, shade([222, 168, 172], Math.floor(d) % 2 ? 0.86 : 1 + r() * 0.05));
      }
  },
  mossy_stonebrick(p, r) {
    generators.stonebrick(p, r);
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const moss = Math.sin(x * 0.7 + y * 0.3) + Math.cos(y * 0.9 - x * 0.2) + r() * 1.4;
        if (moss > 1.5) set(p, x, y, shade([92, 128, 56], 0.8 + r() * 0.35));
      }
  },
  andesite(p, r) {
    noisy(p, [150, 152, 154], r, 0.05);
    speckle(p, [124, 126, 128], r, 0.12);
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, [172, 174, 176]);
      set(p, 0, i, [172, 174, 176]);
      set(p, i, TEX - 1, [116, 118, 120]);
      set(p, TEX - 1, i, [116, 118, 120]);
    }
  },
  deepslate_tiles(p, r) {
    noisy(p, [62, 62, 70], r, 0.08);
    const line: RGB = [36, 36, 42];
    for (let i = 0; i < TEX; i++) {
      set(p, i, 7, line);
      set(p, i, 15, line);
      set(p, 7, i, line);
      set(p, 15, i, line);
      set(p, i, 0, [86, 86, 94]);
      set(p, 0, i, [86, 86, 94]);
      set(p, i, 8, [86, 86, 94]);
      set(p, 8, i, [86, 86, 94]);
    }
  },
  water(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin(x * 0.8 + y * 0.35) * 0.5 + Math.sin(y * 0.9 - x * 0.25) * 0.5;
        const hi = w > 0.78 ? 1.35 : 1;
        set(p, x, y, shade([52, 118, 220], (0.84 + w * 0.1 + r() * 0.06) * hi), 190);
      }
  },
  amethyst(p, r) {
    noisy(p, [140, 96, 210], r, 0.12);
    for (let k = 0; k < 6; k++) {
      const cx = Math.floor(r() * TEX);
      const cy = Math.floor(r() * TEX);
      for (let i = -2; i <= 2; i++) {
        if (cx + i >= 0 && cx + i < TEX) set(p, cx + i, cy, [214, 178, 255]);
        if (cy + i >= 0 && cy + i < TEX) set(p, cx, cy + i, [190, 150, 250]);
      }
    }
  },
  wool_yellow(p, r) {
    noisy(p, [246, 200, 46], r, 0.07);
  },
  wool_lime(p, r) {
    noisy(p, [118, 196, 40], r, 0.07);
  },
  wool_cyan(p, r) {
    noisy(p, [32, 156, 170], r, 0.07);
  },
  wool_purple(p, r) {
    noisy(p, [128, 54, 186], r, 0.07);
  },
  wool_pink(p, r) {
    noisy(p, [240, 140, 176], r, 0.07);
  },
  wool_orange(p, r) {
    noisy(p, [240, 118, 20], r, 0.07);
  },
  petal_red(p, r) {
    noisy(p, [214, 40, 40], r, 0.1);
    set(p, 7, 7, [60, 20, 10]);
    set(p, 8, 8, [60, 20, 10]);
  },
  petal_yellow(p, r) {
    noisy(p, [252, 214, 40], r, 0.1);
    set(p, 7, 7, [200, 120, 10]);
  },
  petal_blue(p, r) {
    noisy(p, [80, 140, 240], r, 0.1);
    set(p, 7, 7, [240, 230, 120]);
  },
  petal_pink(p, r) {
    noisy(p, [244, 150, 200], r, 0.1);
    set(p, 7, 7, [250, 240, 160]);
  },
  stem(p, r) {
    noisy(p, [64, 140, 40], r, 0.14);
  },
  roof_tiles(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const row = Math.floor(y / 4);
        const off = row % 2 ? 2 : 0;
        const edge = y % 4 === 3 || (x + off) % 4 === 0;
        const base: RGB = edge ? [24, 40, 62] : [44, 78, 116];
        set(p, x, y, shade(base, (y % 4 === 0 ? 1.18 : 1) * (0.92 + r() * 0.14)));
      }
  },
  window_lit(p, r) {
    const frame: RGB = [58, 40, 26];
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const glow = 1 - Math.hypot(x - 7.5, y - 9) / 14;
        set(p, x, y, shade([255, 212, 120], 0.82 + glow * 0.3 + r() * 0.05));
      }
    for (let i = 0; i < TEX; i++) {
      set(p, i, 0, frame);
      set(p, i, TEX - 1, frame);
      set(p, 0, i, frame);
      set(p, TEX - 1, i, frame);
      set(p, 7, i, frame);
      set(p, 8, i, frame);
      set(p, i, 7, frame);
    }
    for (let i = 2; i < 6; i++) set(p, i, 8 - i, [255, 246, 214]);
  },
  manor_door(p, r) {
    generators.dark_planks(p, r);
    const gold: RGB = [250, 206, 64];
    for (let y = 0; y < TEX; y++) set(p, 7, y, [30, 18, 10]);
    for (let y = 2; y < 7; y++)
      for (let x = 2; x < 14; x++) if (x !== 7 && Math.hypot(x - 7.5, y - 7) < 6) set(p, x, y, shade([255, 214, 128], 0.9 + r() * 0.1));
    for (let x = 1; x < 15; x++) set(p, x, 1, gold);
    set(p, 5, 10, gold);
    set(p, 10, 10, gold);
    set(p, 5, 11, shade(gold, 0.8));
    set(p, 10, 11, shade(gold, 0.8));
  },
  manor_wall(p, r) {
    generators.quartz(p, r);
    for (let x = 0; x < TEX; x++) {
      set(p, x, 12, [214, 206, 196]);
      set(p, x, 13, [196, 188, 178]);
    }
    for (let y = 14; y < TEX; y++) for (let x = 0; x < TEX; x++) set(p, x, y, shade([150, 146, 140], 0.92 + r() * 0.12));
  },
  hedge(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const v = r();
        set(p, x, y, v < 0.14 ? [30, 72, 22] : shade([52, 116, 34], 0.72 + r() * 0.46));
      }
    speckle(p, [96, 162, 60], r, 0.06);
  },
  portal_green(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([60, 220, 120], 0.72 + w * 0.25 + r() * 0.1), 200);
      }
  },
  portal_gold(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([255, 196, 60], 0.74 + w * 0.24 + r() * 0.1), 200);
      }
  },
  portal_lime(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([150, 230, 70], 0.72 + w * 0.25 + r() * 0.1), 200);
      }
  },
  portal_orange(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([255, 128, 48], 0.72 + w * 0.25 + r() * 0.1), 200);
      }
  },
  target_side(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const ring = Math.floor(Math.hypot(x - 7.5, y - 7.5) / 1.9);
        set(p, x, y, shade(ring % 2 === 0 ? [214, 52, 46] : [236, 222, 200], 0.92 + r() * 0.1));
      }
  },
  target_top(p, r) {
    noisy(p, [222, 206, 182], r, 0.06);
    speckle(p, [196, 176, 150], r, 0.15);
  },
  sand(p, r) {
    noisy(p, [222, 206, 150], r, 0.06);
    speckle(p, [200, 182, 126], r, 0.18);
    speckle(p, [240, 228, 180], r, 0.08);
  },
  sandstone(p, r) {
    noisy(p, [216, 198, 140], r, 0.04);
    for (let x = 0; x < TEX; x++) {
      set(p, x, 3, [190, 170, 112]);
      set(p, x, 4, [232, 216, 162]);
      set(p, x, 12, [190, 170, 112]);
    }
  },
  portal_cyan(p, r) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin((x + y * 0.6) * 0.9) * 0.5 + Math.cos((y - x * 0.4) * 0.7) * 0.5;
        set(p, x, y, shade([70, 214, 255], 0.72 + w * 0.25 + r() * 0.1), 200);
      }
  },
  bricks(p, r) {
    const mortar: RGB = [176, 168, 160];
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const row = Math.floor(y / 4);
        const seam = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
        set(p, x, y, seam ? shade(mortar, 0.9 + r() * 0.1) : shade([150, 74, 58], 0.84 + r() * 0.24));
      }
  },
  ice(p, r) {
    noisy(p, [146, 186, 250], r, 0.05);
    for (let k = 0; k < 5; k++) {
      const x0 = Math.floor(r() * TEX);
      const y0 = Math.floor(r() * TEX);
      for (let i = 0; i < 4; i++) set(p, Math.min(TEX - 1, x0 + i), Math.min(TEX - 1, y0 + i), [214, 232, 255]);
    }
  },
  wool_black(p, r) {
    noisy(p, [30, 30, 36], r, 0.12);
  },
  wool_blue(p, r) {
    noisy(p, [52, 60, 160], r, 0.07);
  },
  slime(p, r) {
    noisy(p, [112, 192, 92], r, 0.06);
    for (let i = 3; i < 13; i++) {
      set(p, i, 3, [150, 222, 120]);
      set(p, i, 12, [80, 150, 64]);
      set(p, 3, i, [150, 222, 120]);
      set(p, 12, i, [80, 150, 64]);
    }
  },
};

const cache = new Map<TextureName, Pixels>();

export function texturePixels(name: TextureName): Pixels {
  const hit = cache.get(name);
  if (hit) return hit;
  const p = canvas();
  generators[name](p, rng(hashString(name)));
  cache.set(name, p);
  return p;
}

export const TEXTURE_NAMES = Object.keys(generators) as TextureName[];
