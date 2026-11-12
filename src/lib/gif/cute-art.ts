import { encodeGif, type GifFrame } from "@/lib/gif/encode";

/** 미니멀 픽셀 GIF 공용 도구 (96×60 논리 픽셀 → 4배 확대) */
export const W = 96;
export const H = 60;
export const GROUND = 52;
const SCALE = 4;

const COLORS = {
  BG: 0xf2efe8,
  DOT: 0xdcd7cc,
  LINE: 0xd0cbbf,
  SHADOW: 0xc4beb1,
  OUT: 0x2e2b36,
  WHITE: 0xffffff,
  SKIN: 0xf8dfcc,
  BLUSH: 0xf6a6ad,
  CAP: 0x7cb2ff,
  CAP_D: 0x5a90e6,
  LEAF: 0x66d17a,
  LEAF_D: 0x3fae5c,
  COAT: 0xffd166,
  COAT_D: 0xf0b43c,
  BOOT: 0x4b5a7a,
  TEAR: 0x7fc8f5,
  BOX: 0xff9fc6,
  BOX_D: 0xe97aa8,
  BOX_IN: 0xb8507e,
  LID: 0xffc0da,
  LID_D: 0xf08fb8,
  COIN: 0xffcf3f,
  COIN_D: 0xe0a21c,
  COIN_L: 0xfff1a8,
  GRAY: 0xbdb8ae,
  GRAY_D: 0x8f8a80,
  NITRO: 0xd68bff,
  NITRO_D: 0xa25be0,
  NITRO_L: 0xf3dcff,
  GRASS: 0x6ccf5a,
  GRASS_D: 0x4aa83f,
  DIRT: 0xc28a5a,
  DIRT_D: 0x9c6a42,
  PAPER: 0xfff5df,
  PAPER_D: 0xe0c58f,
  DUST: 0xe6e2da,
  DUST_D: 0xcdc8bd,
  HEART: 0xff6f91,
  T_GOLD: 0xf5b62e,
  T_GOLD_L: 0xffe17a,
  T_GREEN: 0x34c46a,
  T_GREEN_L: 0x9df0a8,
  T_RED: 0xff5a5f,
  T_RED_L: 0xffb0b3,
  INK: 0x6b6676,
  NAVY: 0x34407a,
  MOON: 0x6f86d6,
  COPPER: 0xd9824a,
  COPPER_D: 0xa85a2e,
  PATINA: 0x5fc7b0,
  PURPLE: 0x9b6be0,
  PURPLE_D: 0x6e45b5,
  ORANGE: 0xf0a040,
  ORANGE_D: 0xc77422,
  RED: 0xe0484f,
  RED_D: 0xa8323a,
} as const;

type ColorName = keyof typeof COLORS;
export const P = Object.fromEntries(Object.keys(COLORS).map((k, i) => [k, i])) as Record<ColorName, number>;
const PALETTE: number[] = Object.values(COLORS);

export function hash(x: number, y: number, s = 0) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export class Canvas {
  readonly px: Uint8Array;

  constructor(
    readonly w = W,
    readonly h = H,
  ) {
    this.px = new Uint8Array(w * h);
  }

  set(x: number, y: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    x = Math.round(x);
    y = Math.round(y);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
  }

  disc(cx: number, cy: number, r: number, c: number) {
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + r * 0.6) this.set(cx + xx, cy + yy, c);
    }
  }

  /** 글자 지도 비트맵 — legend 에 없는 글자는 투명 */
  sprite(rows: readonly string[], x: number, y: number, legend: Record<string, number>, s = 1) {
    x = Math.round(x);
    y = Math.round(y);
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const c = legend[row[rx]!];
        if (c !== undefined) this.rect(x + rx * s, y + ry * s, s, s, c);
      }
    });
  }
}

/* ───────────── 배경: 점 무늬 종이 + 바닥선 ───────────── */

export function backdrop(cv: Canvas, ground: number | null = GROUND) {
  cv.px.fill(P.BG);
  for (let y = 3; y < cv.h; y += 8) for (let x = 3; x < cv.w; x += 8) cv.set(x, y, P.DOT);
  if (ground !== null) cv.rect(0, ground, cv.w, 1, P.LINE);
}

/** 바닥선 위 그림자 — 물체가 높이 있을수록 작게 */
export function groundShadow(cv: Canvas, cx: number, half: number, ground = GROUND) {
  half = Math.round(half);
  if (half <= 0) return;
  cv.rect(cx - half, ground - 1, half * 2, 2, P.SHADOW);
}

/* ───────────── 새싹 모자 아이 ───────────── */

const KID = [
  "....ll..ll....",
  ".....llll.....",
  "......gg......",
  "...oooooooo...",
  "..occcccccco..",
  ".occcccccccco.",
  ".oCCCCCCCCCCo.",
  ".osssssssssso.",
  ".ossessssesso.",
  ".ossessssesso.",
  ".osbssssssbso.",
  "..oossssssoo..",
  "..otttttttto..",
  ".ottttTTtttto.",
  ".ottttTTtttto.",
  "..oBBo..oBBo..",
  "..oooo..oooo..",
];

export type Mood = "idle" | "blink" | "happy" | "sad" | "worry";
export const KID_W = 14;
export const KID_H = KID.length;

const FACE: Record<Mood, [string, string, string]> = {
  idle: [".ossessssesso.", ".ossessssesso.", ".osbssssssbso."],
  worry: [".ossessssesso.", ".ossessssesso.", ".osbssssssbso."],
  blink: [".osssssssssso.", ".oseesssseeso.", ".osbssssssbso."],
  happy: [".ossessssesso.", ".osesesseseso.", ".osbssmmssbso."],
  sad: [".osssssssssso.", ".oseesssseeso.", ".oswssssssbso."],
};

export function kid(cv: Canvas, x: number, y: number, mood: Mood, s = 1) {
  const rows = KID.slice();
  [rows[8], rows[9], rows[10]] = FACE[mood];
  cv.sprite(rows, x, y, {
    l: P.LEAF,
    g: P.LEAF_D,
    o: P.OUT,
    c: P.CAP,
    C: P.CAP_D,
    s: P.SKIN,
    e: P.OUT,
    m: P.OUT,
    b: P.BLUSH,
    t: P.COAT,
    T: P.COAT_D,
    B: P.BOOT,
    w: P.TEAR,
  }, s);
  if (mood === "worry") {
    cv.rect(x + 15 * s, y + 5 * s, s, s, P.TEAR);
    cv.rect(x + 14 * s, y + 6 * s, 3 * s, 2 * s, P.TEAR);
  }
}

const HEART = [".hh.hh.", "hhhhhhh", ".hhhhh.", "..hhh..", "...h..."];

export function heart(cv: Canvas, x: number, y: number) {
  cv.sprite(HEART, x, y, { h: P.HEART });
}

/* ───────────── 선물 상자 ───────────── */

const STAR = ["..w..", ".www.", "wwwww", ".www.", ".w.w."];

/** cx: 가운데, bottom: 바닥 y. lid: 뚜껑 위치 차이 (없으면 닫힘, null 이면 날아가고 없음) */
export function giftBox(
  cv: Canvas,
  cx: number,
  bottom: number,
  opts: { lid?: { dx: number; dy: number } | null; squash?: number } = {},
) {
  const sq = opts.squash ?? 0;
  const w = 20 + sq * 2;
  const h = 12 - sq;
  const x = Math.round(cx - w / 2);
  const y = Math.round(bottom - h);
  cv.rect(x, y, w, h, P.OUT);
  cv.rect(x + 1, y + 1, w - 2, h - 2, P.BOX);
  cv.rect(x + w - 4, y + 1, 3, h - 2, P.BOX_D);
  cv.sprite(STAR, x + Math.round(w / 2) - 3, y + Math.round(h / 2) - 2, { w: P.WHITE });
  if (opts.lid === null) {
    cv.rect(x + 1, y + 1, w - 2, 2, P.BOX_IN);
    return;
  }
  const lid = opts.lid ?? { dx: 0, dy: 0 };
  if (lid.dy !== 0 || lid.dx !== 0) cv.rect(x + 1, y + 1, w - 2, 2, P.BOX_IN);
  const lx = x - 1 + lid.dx;
  const ly = y - 5 + lid.dy;
  cv.rect(lx, ly, w + 2, 6, P.OUT);
  cv.rect(lx + 1, ly + 1, w, 4, P.LID);
  cv.rect(lx + 1, ly + 4, w, 1, P.LID_D);
  cv.rect(lx + w - 3, ly + 1, 3, 3, P.LID_D);
}

/* ───────────── 동전 · 아이템 ───────────── */

const COIN_FRAMES = [
  ["..oooo..", ".oyyyyo.", "oyllyyDo", "oylyyyDo", "oyyyyyDo", "oyyyyyDo", ".oDDDDo.", "..oooo.."],
  [".oooo.", "oyyyDo", "olyyDo", "olyyDo", "oyyyDo", "oyyyDo", "oyDDDo", ".oooo."],
  [".oo.", "oyDo", "oyDo", "oyDo", "oyDo", "oyDo", "oyDo", ".oo."],
  [".oooo.", "oyyyDo", "olyyDo", "olyyDo", "oyyyDo", "oyyyDo", "oyDDDo", ".oooo."],
];

/** spin: 0 이면 정면, 1~3 은 돌아가는 모습. gray: 꽝 동전 */
export function coin(cv: Canvas, cx: number, cy: number, s = 1, spin = 0, gray = false) {
  const rows = COIN_FRAMES[spin % 4]!;
  const w = rows[0]!.length * s;
  const legend = gray
    ? { o: P.OUT, y: P.GRAY, l: P.WHITE, D: P.GRAY_D }
    : { o: P.OUT, y: P.COIN, l: P.COIN_L, D: P.COIN_D };
  cv.sprite(rows, cx - w / 2, cy - 4 * s, legend, s);
}

const GEM = [
  "...oooooo...",
  "..ollaaaao..",
  ".olaaaaaaDo.",
  "oooooooooooo",
  ".oaaaaaaaDo.",
  "..oaaaaaDo..",
  "...oaaaDo...",
  "....oaDo....",
  ".....oo.....",
];

const TICKET = [
  "oooooooooooooo",
  "oppppppppppppo",
  "ophhhhhhhhhhpo",
  "oppppppppppppo",
  ".oppkkkkkkppo.",
  ".oppppppppppo.",
  "oppkkkkpppppDo",
  "oppppppppppDDo",
  "oooooooooooooo",
];

export type Prize = "nitro" | "mc" | "charge";

export function prizeIcon(cv: Canvas, prize: Prize, cx: number, top: number, s = 2) {
  if (prize === "nitro") {
    cv.sprite(GEM, cx - 6 * s, top, { o: P.OUT, a: P.NITRO, l: P.NITRO_L, D: P.NITRO_D }, s);
    return;
  }
  if (prize === "charge") {
    cv.sprite(TICKET, cx - 7 * s, top, { o: P.OUT, p: P.PAPER, h: P.HEART, k: P.PAPER_D, D: P.PAPER_D }, s);
    return;
  }
  const x = cx - 6 * s;
  cv.rect(x, top, 12 * s, 12 * s, P.OUT);
  for (let yy = 1; yy < 11; yy++) {
    for (let xx = 1; xx < 11; xx++) {
      const drip = yy === 4 && hash(xx, 4, 9) < 0.5;
      const c = yy < 4 || drip ? (hash(xx, yy, 8) < 0.25 ? P.GRASS_D : P.GRASS) : hash(xx, yy, 7) < 0.3 ? P.DIRT_D : P.DIRT;
      cv.rect(x + xx * s, top + yy * s, s, s, c);
    }
  }
}

export function sparkle(cv: Canvas, x: number, y: number, big: boolean, c: number) {
  cv.set(x, y, c);
  cv.set(x - 1, y, c);
  cv.set(x + 1, y, c);
  cv.set(x, y - 1, c);
  cv.set(x, y + 1, c);
  if (big) {
    cv.set(x - 2, y, c);
    cv.set(x + 2, y, c);
    cv.set(x, y - 2, c);
    cv.set(x, y + 2, c);
  }
}

export function dust(cv: Canvas, x: number, y: number, r: number) {
  cv.disc(x, y, r + 1, P.DUST_D);
  cv.disc(x, y - 1, r, P.DUST);
}

const CONFETTI = [P.BOX, P.CAP, P.COAT, P.LEAF, P.NITRO, P.HEART];

export function confetti(cv: Canvas, i: number, seed: number, count: number) {
  for (let p = 0; p < count; p++) {
    const x = Math.round(hash(p, 1, seed) * W);
    const speed = 2 + hash(p, 3, seed) * 2;
    const y = Math.round((hash(p, 2, seed) * GROUND + i * speed) % GROUND);
    const c = CONFETTI[p % CONFETTI.length]!;
    if ((p + i) % 2) cv.rect(x, y, 1, 2, c);
    else cv.rect(x, y, 2, 1, c);
  }
}

/* ───────────── 글꼴 ───────────── */

const FONT: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...##", "..#.#", ".#..#", "#...#", "#####", "....#", "....#"],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "#...#", "....#", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ",": ["..", "..", "..", "..", "..", ".#", "#."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  J: ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
};

/** 14px 높이 한글 (2배 글자와 같은 높이) */
const WON = [
  "..####....##",
  ".##..##...##",
  ".##..##...##",
  "..####....##",
  "..........##",
  "########.###",
  "...##.....##",
  "...##.....##",
  "..........##",
  ".##.........",
  ".##.........",
  ".##.........",
  ".##########.",
  ".##########.",
];

const KKWANG = [
  "####.####...##..",
  "...#....#...##..",
  "...#....#...##..",
  "...#....#...####",
  ".....##.....##..",
  ".....##.....##..",
  "###########.##..",
  "###########.##..",
  "................",
  "....######......",
  "...##....##.....",
  "...##....##.....",
  "...##....##.....",
  "....######......",
];

type Glyph = { rows: string[]; half: boolean };

function textGlyphs(text: string): Glyph[] {
  const out: Glyph[] = [];
  for (const ch of text) {
    if (ch === "원") out.push({ rows: WON, half: true });
    else if (ch === "꽝") out.push({ rows: KKWANG, half: true });
    else if (FONT[ch]) out.push({ rows: FONT[ch]!, half: false });
  }
  return out;
}

export type TextColor = "gold" | "red" | "green";
/** [윗부분 밝은색, 아랫부분 기본색] */
const TEXT_COLORS: Record<TextColor, [number, number]> = {
  gold: [P.T_GOLD_L, P.T_GOLD],
  red: [P.T_RED_L, P.T_RED],
  green: [P.T_GREEN_L, P.T_GREEN],
};

function glyphWidth(glyphs: Glyph[], s: number) {
  return glyphs.reduce((sum, g) => sum + g.rows[0]!.length * (g.half ? s / 2 : s), 0) + s * (glyphs.length - 1);
}

/** 테두리 없는 한 가지 색 글자 (왼쪽 정렬) — 배너의 작은 설명줄 */
export function drawInk(cv: Canvas, text: string, x: number, top: number, color: number, s = 1) {
  for (const g of textGlyphs(text)) {
    if (g.half) continue;
    cv.sprite(g.rows, x, top, { "#": color }, s);
    x += (g.rows[0]!.length + 1) * s;
  }
}

/** 진한 테두리 · 위아래 두 톤. 한글이 섞이면 scale 은 짝수여야 한다 */
export function drawText(cv: Canvas, text: string, top: number, color: TextColor, scale?: number, cx = cv.w / 2) {
  const glyphs = textGlyphs(text);
  if (!glyphs.length) return;
  const hasHalf = glyphs.some((g) => g.half);
  const widthAt = (s: number) => glyphWidth(glyphs, s);
  const s = scale ?? (hasHalf || widthAt(2) <= cv.w - 6 ? 2 : 1);
  const [light, base] = TEXT_COLORS[color];
  const baseH = 7 * s;
  const mid = top + baseH / 2;
  const cells: { x: number; y: number; size: number }[] = [];
  let x = Math.round(cx - widthAt(s) / 2);
  for (const g of glyphs) {
    const gs = g.half ? s / 2 : s;
    const y0 = top + baseH - g.rows.length * gs;
    g.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === "#") cells.push({ x: x + rx * gs, y: y0 + ry * gs, size: gs });
    });
    x += g.rows[0]!.length * gs + s;
  }
  for (const c of cells) cv.rect(c.x - 1, c.y - 1, c.size + 2, c.size + 3, P.OUT);
  for (const c of cells) cv.rect(c.x, c.y, c.size, c.size, c.y + c.size / 2 <= mid ? light : base);
}

export function signedAmount(sign: "+" | "-", n: number, unit: "원" | "P") {
  return `${sign}${Math.max(0, Math.floor(n)).toLocaleString("en-US")}${unit}`;
}

/* ───────────── 프레임 · 인코딩 ───────────── */

function upscale(cv: Canvas, scale: number): Uint8Array {
  const ow = cv.w * scale;
  const out = new Uint8Array(ow * cv.h * scale);
  for (let y = 0; y < cv.h; y++) {
    const rowStart = y * scale * ow;
    for (let x = 0; x < cv.w; x++) {
      const c = cv.px[y * cv.w + x]!;
      const o = rowStart + x * scale;
      for (let sx = 0; sx < scale; sx++) out[o + sx] = c;
    }
    for (let sy = 1; sy < scale; sy++) out.copyWithin(rowStart + sy * ow, rowStart, rowStart + ow);
  }
  return out;
}

export type Scene = { frames: GifFrame[]; w: number; h: number; scale: number };

export function newScene(size: { w: number; h: number; scale: number } = { w: W, h: H, scale: SCALE }): Scene {
  return { frames: [], ...size };
}

export function addFrame(scene: Scene, delayCs: number, draw: (cv: Canvas, i: number) => void) {
  const cv = new Canvas(scene.w, scene.h);
  draw(cv, scene.frames.length);
  scene.frames.push({ pixels: upscale(cv, scene.scale), delayCs });
}

/** 마지막 프레임은 오래 멈춰 결과를 보여 준다 */
export const HOLD = 65000;

export function encodeScene(scene: Scene) {
  return encodeGif(scene.w * scene.scale, scene.h * scene.scale, PALETTE, scene.frames);
}
