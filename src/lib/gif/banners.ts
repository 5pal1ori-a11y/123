import { KO_BITMAPS } from "@/lib/gif/ko-bitmaps";
import {
  addFrame,
  backdrop,
  drawInk,
  drawText,
  giftBox,
  encodeScene,
  groundShadow,
  hash,
  kid,
  newScene,
  P,
  sparkle,
  type Canvas,
} from "@/lib/gif/cute-art";

/** 디스코드 상품 임베드 위에 올리는 가로 배너 (160×48 → 3배) */
const SIZE = { w: 160, h: 48, scale: 3 };
const LOOP_FRAMES = 8;

/* ───────────── FRESH MFA ───────────── */

const FRESH_GROUND = 42;

export function freshMfaBanner() {
  const scene = newScene(SIZE);
  const leaves: [number, number, number][] = [
    [60, 0, 1],
    [118, 6, 2],
    [146, 2, 1],
    [88, 10, 3],
  ];
  for (let f = 0; f < LOOP_FRAMES; f++) {
    addFrame(scene, 16, (cv) => {
      backdrop(cv, FRESH_GROUND);
      groundShadow(cv, 28, 11, FRESH_GROUND);
      kid(cv, 14, FRESH_GROUND - 34, f === 5 ? "blink" : "idle", 2);
      for (const [x, y0, sway] of leaves) {
        const y = (y0 + f * 5) % 44;
        const x2 = x + Math.round(Math.sin((f + y0) * 0.8) * sway);
        cv.rect(x2, y, 2, 1, P.LEAF);
        cv.set(x2 + (f % 2 ? 0 : 1), y + 1, P.LEAF_D);
      }
      drawText(cv, "FRESH MFA", 10, "green", 2, 102);
      drawInk(cv, "NO LOGIN HISTORY", 59, 31, P.INK);
      if (f % 2 === 0) sparkle(cv, 154, 8, f % 4 === 0, P.COIN);
      else sparkle(cv, 50, 30, false, P.HEART);
      if (f % 3 === 1) sparkle(cv, 146, 34, true, P.CAP);
    });
  }
  return encodeScene(scene);
}

/* ───────────── 망토 ───────────── */

type CapeStyle = (tx: number, ty: number) => number;

const CAPE_W = 10;
const CAPE_H = 22;

const CAPES: CapeStyle[] = [
  // 달밤
  (tx, ty) => {
    if ((tx === 3 || tx === 4) && ty >= 4 && ty <= 8 && !(tx === 4 && ty >= 5 && ty <= 7)) return P.WHITE;
    if ((tx === 7 && ty === 3) || (tx === 2 && ty === 13) || (tx === 6 && ty === 17)) return P.COIN_L;
    return ty > 12 ? P.MOON : P.NAVY;
  },
  // 벚꽃
  (tx, ty) => {
    const r = hash(tx, ty, 41);
    if (r < 0.1) return P.WHITE;
    if (r < 0.3) return P.BOX;
    return P.LID;
  },
  // 주황 문장
  (tx, ty) => {
    if (tx >= 3 && tx <= 6 && ty >= 6 && ty <= 10) return tx === 3 || tx === 6 || ty === 6 || ty === 10 ? P.ORANGE_D : P.COIN;
    return ty % 6 === 0 ? P.ORANGE_D : P.ORANGE;
  },
  // 구리
  (tx, ty) => {
    const r = hash(tx, ty, 43);
    if (r < 0.18) return P.PATINA;
    return (tx + ty) % 5 === 0 ? P.COPPER_D : P.COPPER;
  },
  // 보라 하트
  (tx, ty) => {
    const heart = [".##.##.", "#######", ".#####.", "..###..", "...#..."];
    const row = heart[ty - 7];
    if (row && tx >= 1 && tx <= 7 && row[tx - 1] === "#") return P.HEART;
    return ty > 15 ? P.PURPLE_D : P.PURPLE;
  },
  // 경험치
  (tx, ty) => {
    const dx = tx - 4.5;
    const dy = ty - 9;
    const d = dx * dx + dy * dy;
    if (d < 5) return d < 1.5 ? P.COIN_L : P.COIN;
    if (d < 8) return P.COIN_D;
    return ty > 15 ? P.LEAF_D : P.LEAF;
  },
];

function cape(cv: Canvas, x: number, top: number, style: CapeStyle, sway: number) {
  cv.rect(x + 4, top - 3, 2, 3, P.OUT);
  for (let ty = -1; ty <= CAPE_H; ty++) {
    const off = Math.round((sway * Math.max(0, ty)) / CAPE_H);
    for (let tx = -1; tx <= CAPE_W; tx++) {
      const edge = tx < 0 || tx >= CAPE_W || ty < 0 || ty >= CAPE_H;
      const c = edge ? P.OUT : style(tx, ty);
      cv.set(x + tx + off, top + ty, !edge && tx === CAPE_W - 1 ? shade(c) : c);
    }
  }
}

const SHADE: Partial<Record<number, number>> = {
  [P.NAVY]: P.OUT,
  [P.MOON]: P.NAVY,
  [P.LID]: P.BOX,
  [P.BOX]: P.BOX_D,
  [P.ORANGE]: P.ORANGE_D,
  [P.COPPER]: P.COPPER_D,
  [P.PURPLE]: P.PURPLE_D,
  [P.LEAF]: P.LEAF_D,
};

function shade(c: number) {
  return SHADE[c] ?? c;
}

export function capesBanner() {
  const scene = newScene(SIZE);
  const railX = 72;
  for (let f = 0; f < LOOP_FRAMES; f++) {
    addFrame(scene, 14, (cv) => {
      backdrop(cv, null);
      drawText(cv, "CAPES", 12, "gold", 2, 37);
      drawInk(cv, "MINECRAFT", 12, 31, P.INK);
      cv.rect(railX, 7, 160 - railX - 4, 1, P.OUT);
      cv.rect(railX, 5, 1, 4, P.OUT);
      cv.rect(155, 5, 1, 4, P.OUT);
      CAPES.forEach((style, i) => {
        const sway = Math.round(Math.sin(((f + i * 2) / LOOP_FRAMES) * Math.PI * 2) * 1.6);
        cape(cv, railX + 4 + i * 13, 11, style, sway);
      });
      if (f % 2 === 0) sparkle(cv, 66, 10, f % 4 === 0, P.COIN);
      else sparkle(cv, 8, 40, false, P.HEART);
    });
  }
  return encodeScene(scene);
}


/* ───────────── GIVEAWAY · 재고 요청 (한글 비트맵 글자) ───────────── */

const WIDE = { w: 200, h: 56, scale: 3 };
const WIDE_GROUND = 50;

/** 한글 비트맵 글자. outline 이면 진한 테두리 · 위아래 두 톤 (제목), 아니면 한 가지 색 (설명줄) */
function drawKo(cv: Canvas, key: string, x: number, top: number, opts: { outline?: "gold" | "green" | "red"; scale?: number; ink?: number } = {}) {
  const rows = KO_BITMAPS[key];
  if (!rows) return;
  const s = opts.scale ?? 1;
  if (!opts.outline) {
    cv.sprite(rows, x, top, { "#": opts.ink ?? P.INK }, s);
    return;
  }
  const light = opts.outline === "gold" ? P.T_GOLD_L : opts.outline === "green" ? P.T_GREEN_L : P.T_RED_L;
  const base = opts.outline === "gold" ? P.T_GOLD : opts.outline === "green" ? P.T_GREEN : P.T_RED;
  const mid = top + (rows.length * s) / 2;
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) if (row[rx] === "#") cv.rect(x + rx * s + 1, top + ry * s + 1, s, s + 1, P.OUT);
  });
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] !== "#") continue;
      const y = top + ry * s;
      cv.rect(x + rx * s, y, s, s, y + s / 2 <= mid ? light : base);
    }
  });
}

function koWidth(key: string, s = 1) {
  return (KO_BITMAPS[key]?.[0]?.length ?? 0) * s;
}

/** 진행 중: 선물상자가 통통 튀고 별이 반짝 */
export function giveawayBanner() {
  const scene = newScene(WIDE);
  for (let f = 0; f < LOOP_FRAMES; f++) {
    addFrame(scene, 12, (cv) => {
      backdrop(cv, WIDE_GROUND);
      groundShadow(cv, 30, 13, WIDE_GROUND);
      const hop = [0, 2, 4, 5, 4, 2, 0, 0][f]!;
      giftBox(cv, 30, WIDE_GROUND - hop, { squash: hop === 0 && f === 7 ? 2 : 0 });
      drawText(cv, "GIVEAWAY", 9, "gold", 2, 132);
      drawKo(cv, "gwSub", 82, 32);
      cv.rect(82, 46, 22, 2, P.T_GREEN);
      if (f % 2 === 0) sparkle(cv, 188, 9, f % 4 === 0, P.COIN);
      else sparkle(cv, 60, 14, false, P.HEART);
      if (f % 3 === 1) sparkle(cv, 180, 44, true, P.CAP);
    });
  }
  return encodeScene(scene);
}

/** 종료: 상자가 열리고 색종이가 날린다 */
export function giveawayEndBanner() {
  const scene = newScene(WIDE);
  const colors = [P.COIN, P.HEART, P.CAP, P.LEAF];
  for (let f = 0; f < LOOP_FRAMES; f++) {
    addFrame(scene, 12, (cv) => {
      backdrop(cv, WIDE_GROUND);
      groundShadow(cv, 30, 13, WIDE_GROUND);
      giftBox(cv, 30, WIDE_GROUND, { lid: { dx: 0, dy: -6 - ((f % 4) % 3) * 2 } });
      drawKo(cv, "gwEndTitle", 82, 8, { outline: "gold", scale: 2 });
      drawKo(cv, "gwEndSub", 82, 33);
      cv.rect(82, 46, 22, 2, P.T_GREEN);
      for (let i = 0; i < 16; i++) {
        const x = Math.round(hash(i, 1, 7) * 196);
        const y = Math.round((hash(i, 2, 7) * 52 + f * 6) % 52);
        const c = colors[i % colors.length]!;
        if ((i + f) % 2) cv.rect(x, y, 1, 2, c);
        else cv.rect(x, y, 2, 1, c);
      }
      if (f % 2 === 0) sparkle(cv, 188, 9, f % 4 === 0, P.COIN);
    });
  }
  return encodeScene(scene);
}

const ENVELOPE = [
  "oooooooooooooooooooo",
  "owwwwwwwwwwwwwwwwwwo",
  "oowwwwwwwwwwwwwwwwoo",
  "owowwwwwwwwwwwwwwowo",
  "owwowwwwwwwwwwwwowwo",
  "owwwowwwwwwwwwwowwwo",
  "owwwwoowwwwwwoowwwwo",
  "owwwwwwoooooowwwwwwo",
  "owwwwwwwwwwwwwwwwwwo",
  "owwwwwwwwwwwwwwwwwwo",
  "oooooooooooooooooooo",
];

/** 재고 요청: 편지가 살짝 흔들리고 빨간 알림 점이 깜빡 */
export function stockRequestBanner() {
  const scene = newScene(WIDE);
  for (let f = 0; f < LOOP_FRAMES; f++) {
    addFrame(scene, 12, (cv) => {
      backdrop(cv, WIDE_GROUND);
      const bob = [0, 1, 2, 1, 0, -1, -2, -1][f]!;
      groundShadow(cv, 30, 13, WIDE_GROUND);
      cv.sprite(ENVELOPE, 20, 28 + bob, { o: P.OUT, w: P.WHITE });
      cv.rect(36, 24 + bob, 7, 7, P.OUT);
      cv.rect(37, 25 + bob, 5, 5, f % 4 < 2 ? P.HEART : P.T_RED);
      drawKo(cv, "stockTitle", 86, 9, { outline: "gold", scale: 2 });
      drawKo(cv, "stockSub", 50, 34);
      cv.rect(50, 47, 22, 2, P.T_GREEN);
      if (f % 2 === 0) sparkle(cv, 188, 9, f % 4 === 0, P.COIN);
      else sparkle(cv, 60, 14, false, P.HEART);
    });
  }
  return encodeScene(scene);
}

void koWidth;

/** 그림이 바뀌면 숫자를 올린다 — 디스코드가 주소별로 이미지를 오래 캐시함 */
export const BANNER_PATHS = {
  freshMfa: "/api/discord/banner/fresh-mfa-1.gif",
  capes: "/api/discord/banner/capes-1.gif",
  giveaway: "/api/discord/banner/giveaway-2.gif",
  giveawayEnd: "/api/discord/banner/giveaway-end-2.gif",
  stockRequest: "/api/discord/banner/stock-request-1.gif",
} as const;

export const BANNER_FILES: Record<string, () => Uint8Array> = {
  "fresh-mfa-1.gif": freshMfaBanner,
  "capes-1.gif": capesBanner,
  "giveaway-2.gif": giveawayBanner,
  "giveaway-end-2.gif": giveawayEndBanner,
  "stock-request-1.gif": stockRequestBanner,
};
