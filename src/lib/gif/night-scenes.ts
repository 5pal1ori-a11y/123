/**
 * 출석 · 도박 · 랜덤뽑기 결과 GIF (어두운 밤 배경 · 보라 빛 · 큰 픽셀 소품).
 * 96×60 논리 픽셀을 4배로 키운다 (cute-art 엔진).
 */
import {
  addFrame,
  coin,
  drawText,
  encodeScene,
  hash,
  HOLD,
  newScene,
  P,
  prizeIcon,
  signedAmount,
  sparkle,
  W,
  H,
  type Canvas,
  type Prize,
} from "@/lib/gif/cute-art";

export type RafflePrize = Prize | "none";

/* ───────────── 공용 배경 ───────────── */

/** 밤하늘: 점 무늬 + 반짝이는 별 */
function night(cv: Canvas, f: number) {
  cv.rect(0, 0, W, H, P.NIGHT);
  for (let y = 3; y < H; y += 6) for (let x = 3; x < W; x += 6) cv.set(x, y, P.NIGHT_DOT);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash(i, 1, 41) * W);
    const y = Math.floor(hash(i, 2, 41) * H);
    if ((f + i * 3) % 9 < 6) cv.set(x, y, hash(i, 3, 41) < 0.5 ? P.STAR_1 : P.STAR_2);
  }
}

/** 소품 뒤의 둥근 보라 빛 */
function glow(cv: Canvas, cx: number, cy: number, f: number, strong = false) {
  const pulse = Math.round(Math.sin((f / 8) * Math.PI) * 1);
  cv.disc(cx, cy, 25 + pulse, P.NIGHT_2);
  cv.disc(cx, cy, 19 + pulse, P.NIGHT_3);
  if (strong) cv.disc(cx, cy, 13, P.VIOLET_D);
}

function burst(cv: Canvas, cx: number, cy: number, t: number, seed: number) {
  const colors = [P.COIN, P.HEART, P.CAP, P.LEAF, P.VIOLET_L];
  for (let i = 0; i < 16; i++) {
    const ang = hash(i, 1, seed) * Math.PI * 2;
    const sp = 6 + hash(i, 2, seed) * 14;
    const x = cx + Math.cos(ang) * sp * t;
    const y = cy + Math.sin(ang) * sp * t + t * t * 10;
    cv.rect(x, y, i % 2 ? 1 : 2, i % 2 ? 2 : 1, colors[i % colors.length]!);
  }
}

/* ───────────── 출석: 달력에 체크 도장 ───────────── */

const STAMP = [
  "...oooooo...",
  "..oggggggo..",
  ".oggggggwgo.",
  "ogggggggwwgo",
  "ogwwggggwggo",
  "oggwwggwwggo",
  "ogggwwwwgggo",
  "oggggwwggggo",
  ".oggggggggo.",
  "..oggggggo..",
  "...oooooo...",
];

function calendar(cv: Canvas, cx: number, top: number, gold: boolean) {
  const w = 30;
  const h = 30;
  const x = cx - w / 2;
  cv.rect(x - 1, top - 1, w + 2, h + 2, P.OUT);
  cv.rect(x, top, w, h, P.PAPER);
  cv.rect(x, top, w, 8, gold ? P.COIN : P.RED);
  cv.rect(x, top + 7, w, 1, gold ? P.COIN_D : P.RED_D);
  // 고리 두 개
  for (const rx of [x + 7, x + w - 9]) {
    cv.rect(rx, top - 3, 2, 5, P.OUT);
    cv.rect(rx, top - 2, 2, 3, P.STEEL);
  }
  // 날짜 칸
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      cv.rect(x + 3 + c * 5, top + 11 + r * 5, 3, 3, (r * 5 + c) % 7 === 3 ? P.PAPER_D : P.DUST_D);
    }
  }
}

export function checkinGif(amount: number, jackpot: boolean) {
  const scene = newScene();
  const cx = 48;
  const calTop = 22;
  const text = signedAmount("+", amount, "원");
  // 0~7: 달력이 살짝 떠오름 · 8~12: 도장이 떨어짐 · 13~: 금액
  for (let f = 0; f < 28; f++) {
    const last = f === 27;
    addFrame(scene, last ? HOLD : f < 8 ? 9 : 8, (cv) => {
      night(cv, f);
      glow(cv, cx, 37, f, jackpot && f >= 13);
      const rise = f < 6 ? Math.round((6 - f) * 1.5) : 0;
      const bob = f >= 13 ? Math.round(Math.sin(f / 3) * 1) : 0;
      calendar(cv, cx, calTop + rise + bob, jackpot);
      if (f >= 8) {
        const drop = Math.max(0, 12 - f) * 6;
        const squash = f === 12 ? 1 : 0;
        cv.sprite(STAMP, cx + 2, calTop + 12 - drop + squash + bob, { o: P.OUT, g: P.T_GREEN, w: P.WHITE }, 2);
        if (f === 12 || f === 13) {
          sparkle(cv, cx - 14, calTop + 10, true, P.COIN_L);
          sparkle(cv, cx + 30, calTop + 6, true, P.COIN_L);
        }
      }
      if (f >= 13) {
        const pop = Math.min(1, (f - 13) / 3);
        drawText(cv, text, Math.round(10 - pop * 6), jackpot ? "gold" : "green");
        if (f % 2 === 0) sparkle(cv, 10, 30, f % 4 === 0, P.COIN);
        else sparkle(cv, 86, 40, false, P.VIOLET_L);
        if (jackpot) burst(cv, cx, 34, Math.min(1, (f - 13) / 10), 7 + (f > 20 ? 1 : 0));
      }
    });
  }
  return encodeScene(scene);
}

/* ───────────── 도박: 슬롯머신 ───────────── */

type Sym = "seven" | "cherry" | "bell" | "gem";
const SYMS: Sym[] = ["seven", "cherry", "bell", "gem"];

const SYM_ROWS: Record<Sym, string[]> = {
  seven: ["rrrrrrr", "rrrrrrr", "....rr.", "...rr..", "..rr...", "..rr...", "..rr..."],
  cherry: ["....gg.", "...g...", "..g.g..", ".g...g.", "rr...rr", "rrr.rrr", ".r...r."],
  bell: ["...y...", "..yyy..", ".yyyyy.", ".yyyyy.", ".yyyyy.", "yyyyyyy", "...y..."],
  gem: ["..ccc..", ".cwccc.", "ccccccc", ".ccccc.", "..ccc..", "...c...", "......."],
};

function symbol(cv: Canvas, s: Sym, x: number, y: number, dim = false, clip?: { top: number; bottom: number }) {
  const legend: Record<string, number> = {
    r: dim ? P.GRAY_D : P.RED,
    g: dim ? P.GRAY_D : P.LEAF_D,
    y: dim ? P.GRAY_D : P.COIN,
    c: dim ? P.GRAY_D : P.CAP,
    w: P.WHITE,
  };
  SYM_ROWS[s].forEach((row, ry) => {
    const yy = y + ry;
    if (clip && (yy < clip.top || yy > clip.bottom)) return;
    for (let rx = 0; rx < row.length; rx++) {
      const c = legend[row[rx]!];
      if (c !== undefined) cv.set(x + rx, yy, c);
    }
  });
}

function slotMachine(cv: Canvas, cx: number, top: number, lightOn: boolean, shake: number) {
  const x = cx - 22 + shake;
  // 몸통
  cv.rect(x - 1, top - 1, 46, 34, P.OUT);
  cv.rect(x, top, 44, 32, P.VIOLET);
  cv.rect(x, top + 26, 44, 6, P.VIOLET_D);
  cv.rect(x + 2, top + 1, 40, 1, P.VIOLET_L);
  // 위 전구
  for (let i = 0; i < 6; i++) cv.rect(x + 4 + i * 7, top + 2, 2, 2, lightOn === (i % 2 === 0) ? P.COIN : P.ORANGE_D);
  // 레버
  cv.rect(x + 45, top + 8, 2, 14, P.STEEL_D);
  cv.disc(x + 46, top + 7, 2, P.RED);
  // 받침
  cv.rect(x + 6, top + 33, 32, 3, P.OUT);
}

/** 릴 3칸. stopAt: 각 릴이 멈추는 프레임, result: 멈춘 기호 */
function reels(cv: Canvas, cx: number, top: number, f: number, stopAt: number[], result: Sym[], dim: boolean, shake: number) {
  const x0 = cx - 18 + shake;
  for (let r = 0; r < 3; r++) {
    const rx = x0 + r * 13;
    cv.rect(rx - 1, top + 7, 12, 15, P.OUT);
    cv.rect(rx, top + 8, 10, 13, P.WHITE);
    if (f < stopAt[r]!) {
      // 돌아가는 중: 기호가 아래로 흐른다
      const off = (f * 5 + r * 3) % 9;
      const a = SYMS[(f + r) % SYMS.length]!;
      const b = SYMS[(f + r + 1) % SYMS.length]!;
      const clip = { top: top + 8, bottom: top + 20 };
      symbol(cv, a, rx + 2, top + 6 + off, false, clip);
      symbol(cv, b, rx + 2, top + 6 + off - 9, false, clip);
    } else {
      const bounce = f === stopAt[r] ? 1 : 0;
      symbol(cv, result[r]!, rx + 2, top + 11 + bounce, dim && r === 2);
    }
  }
}

export function gambleGif(win: boolean, amount: number) {
  const scene = newScene();
  const cx = 48;
  const top = 20;
  const stopAt = [10, 13, 16];
  const result: Sym[] = win ? ["seven", "seven", "seven"] : ["seven", "seven", "cherry"];
  const text = signedAmount(win ? "+" : "-", amount, "P");
  for (let f = 0; f < 30; f++) {
    const last = f === 29;
    addFrame(scene, last ? HOLD : 7, (cv) => {
      night(cv, f);
      const done = f >= 17;
      glow(cv, cx, 36, f, win && done);
      const shake = !win && done && f < 21 ? (f % 2 ? 1 : -1) : 0;
      slotMachine(cv, cx, top, f % 2 === 0 || (win && done), shake);
      reels(cv, cx, top, f, stopAt, result, !win && done, shake);
      if (done) {
        const pop = Math.min(1, (f - 17) / 3);
        drawText(cv, text, Math.round(9 - pop * 5), win ? "green" : "red");
        if (win) {
          burst(cv, cx, 30, Math.min(1, (f - 17) / 10), 11);
          coin(cv, 12, 40 - ((f * 2) % 6), 1, f % 4);
          coin(cv, 84, 44 - ((f * 2 + 3) % 6), 1, (f + 2) % 4);
          if (f % 2 === 0) sparkle(cv, 14, 22, true, P.COIN_L);
          else sparkle(cv, 82, 26, true, P.COIN_L);
        } else if (f < 24) {
          cv.disc(cx + 24, top - 2 - (f - 17), 2, P.STEEL_D);
          cv.disc(cx + 27, top - 5 - (f - 17), 1, P.STEEL_D);
        }
      }
    });
  }
  return encodeScene(scene);
}

/* ───────────── 랜덤뽑기: 가챠 기계 ───────────── */

function gachaMachine(cv: Canvas, cx: number, top: number, knob: number, f: number) {
  const x = cx - 15;
  // 유리 돔
  cv.disc(cx, top + 12, 14, P.OUT);
  cv.disc(cx, top + 12, 13, P.GLASS_D);
  cv.disc(cx - 1, top + 11, 11, P.GLASS);
  // 안의 캡슐들
  const caps = [P.RED, P.COIN, P.CAP, P.HEART, P.LEAF, P.VIOLET];
  for (let i = 0; i < 9; i++) {
    const px = cx - 8 + (i % 4) * 5 + (i > 3 ? 2 : 0);
    const py = top + 12 + Math.floor(i / 4) * 4 - (i > 7 ? 6 : 0) + (f % 6 === i % 6 ? -1 : 0);
    cv.disc(px, py, 2, caps[i % caps.length]!);
  }
  cv.rect(cx - 6, top + 4, 3, 1, P.WHITE);
  // 몸통
  cv.rect(x - 1, top + 23, 32, 20, P.OUT);
  cv.rect(x, top + 24, 30, 18, P.RED);
  cv.rect(x, top + 38, 30, 4, P.RED_D);
  // 손잡이
  cv.disc(cx, top + 30, 4, P.OUT);
  cv.disc(cx, top + 30, 3, P.STEEL);
  const ang = (knob / 4) * Math.PI * 2;
  cv.rect(cx + Math.round(Math.cos(ang) * 2) - 1, top + 30 + Math.round(Math.sin(ang) * 2) - 1, 2, 2, P.OUT);
  // 배출구
  cv.rect(cx + 6, top + 35, 8, 5, P.OUT);
  cv.rect(cx + 7, top + 36, 6, 3, P.NIGHT_2);
}

function capsule(cv: Canvas, x: number, y: number, open: number) {
  // 위 반쪽(보라) · 아래 반쪽(흰색). open: 벌어진 정도
  const r = 5;
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > (r + 1) * (r + 1) + 1) continue;
      const edge = d2 > r * r;
      const topHalf = dy < 0;
      const yy = y + dy + (topHalf ? -open : open);
      const c = edge || dy === 0 ? P.OUT : topHalf ? (dx < -1 && dy < -2 ? P.VIOLET_L : P.VIOLET) : P.WHITE;
      cv.set(x + dx, yy, c);
    }
  }
}

const PRIZE_TEXT: Record<RafflePrize, string> = { nitro: "NITRO!", mc: "MC GET!", charge: "CHARGE!", none: "꽝" };

export function raffleGif(prize: RafflePrize) {
  const scene = newScene();
  const mcx = 30;
  const top = 6;
  // 0~6: 손잡이 돌림 · 7~12: 캡슐이 굴러 나옴 · 13~16: 열림 · 17~: 결과
  for (let f = 0; f < 30; f++) {
    const last = f === 29;
    addFrame(scene, last ? HOLD : 8, (cv) => {
      night(cv, f);
      glow(cv, 66, 32, f, prize !== "none" && f >= 17);
      gachaMachine(cv, mcx, top, f < 7 ? f : 0, f);
      // 캡슐 위치
      let capX = mcx + 10;
      let capY = top + 37;
      if (f >= 7) {
        const t = Math.min(1, (f - 7) / 6);
        capX = Math.round(mcx + 10 + t * 26);
        capY = Math.round(top + 37 - Math.sin(t * Math.PI) * 10 - t * 4);
      }
      if (f >= 7 && f < 17) capsule(cv, capX, capY, f >= 13 ? Math.min(4, f - 12) : 0);
      if (f >= 17) {
        const rise = Math.min(1, (f - 17) / 4);
        if (prize === "none") {
          cv.disc(66, 36, 3, P.STEEL_D);
          drawText(cv, PRIZE_TEXT.none, Math.round(18 - rise * 4), "red", 2, 66);
        } else {
          prizeIcon(cv, prize, 66, Math.round(30 - rise * 6), 2);
          drawText(cv, PRIZE_TEXT[prize], 4, prize === "nitro" ? "gold" : "green", undefined, 48);
          burst(cv, 66, 34, Math.min(1, (f - 17) / 9), 21);
          if (f % 2 === 0) sparkle(cv, 52, 22, true, P.COIN_L);
          else sparkle(cv, 84, 28, true, P.VIOLET_L);
        }
      }
    });
  }
  return encodeScene(scene);
}

/* ───────────── 다이아 캐기 (랜덤박스) ───────────── */

const ORE_X = 38;
const ORE_BOTTOM = 52;
const ORE = 24;

const DIAMOND = [
  "..oooooo..",
  ".occwwcco.",
  "occwcccbbo",
  "oooooooooo",
  ".occcbbbo.",
  "..occbbo..",
  "...ocbo...",
  "....oo....",
];

function ground(cv: Canvas) {
  cv.rect(0, ORE_BOTTOM, W, 1, P.NIGHT_3);
  cv.rect(0, ORE_BOTTOM + 1, W, H - ORE_BOTTOM - 1, P.NIGHT_2);
}

/** 다이아 광석 블록. crack 0~3 금이 간 정도 */
function oreBlock(cv: Canvas, crack: number, shake = 0) {
  const x = ORE_X - ORE / 2 + shake;
  const y = ORE_BOTTOM - ORE;
  cv.rect(x - 1, y - 1, ORE + 2, ORE + 2, P.OUT);
  for (let yy = 0; yy < ORE; yy++) {
    for (let xx = 0; xx < ORE; xx++) {
      const h = hash(Math.floor(xx / 3), Math.floor(yy / 3), 51);
      cv.set(x + xx, y + yy, h < 0.35 ? P.STEEL_D : P.STEEL);
    }
  }
  // 다이아 알갱이
  for (const [ox, oy] of [[4, 5], [15, 3], [9, 12], [17, 15], [5, 18]] as const) {
    cv.rect(x + ox, y + oy, 3, 2, P.CAP);
    cv.set(x + ox, y + oy, P.GLASS);
    cv.set(x + ox + 2, y + oy + 1, P.CAP_D);
  }
  // 금
  const cracks: [number, number][][] = [
    [[11, 0], [12, 4], [10, 8], [12, 12]],
    [[12, 12], [16, 15], [15, 20], [18, 24]],
    [[10, 8], [5, 11], [3, 16], [0, 18]],
  ];
  for (let c = 0; c < Math.min(crack, 3); c++) {
    const pts = cracks[c]!;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[i + 1]!;
      const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let k = 0; k <= n; k++) cv.set(x + x1 + Math.round(((x2 - x1) * k) / n), y + y1 + Math.round(((y2 - y1) * k) / n), P.OUT);
    }
  }
}

/** 곡괭이: pose 0 = 들어 올림, 1 = 내려오는 중, 2 = 내리침 */
function pickaxe(cv: Canvas, pose: number) {
  // 손잡이 끝(손 위치)을 블록 오른쪽 아래에 두고, 내리치면 머리가 블록 위 모서리에 닿는다
  const pivot = { x: ORE_X + 30, y: ORE_BOTTOM - 2 };
  const ang = [-1.35, -1.85, -2.35][pose]!;
  const len = 22;
  for (let k = 0; k <= len; k++) {
    const px = pivot.x + Math.cos(ang) * k;
    const py = pivot.y + Math.sin(ang) * k;
    cv.rect(px - 1, py - 1, 3, 3, P.OUT);
  }
  for (let k = 0; k <= len; k++) {
    cv.rect(pivot.x + Math.cos(ang) * k, pivot.y + Math.sin(ang) * k, 2, 2, k > len - 3 ? P.DIRT_D : P.DIRT);
  }
  // 머리 (손잡이 끝에 수직으로)
  const hx = pivot.x + Math.cos(ang) * len;
  const hy = pivot.y + Math.sin(ang) * len;
  const perp = ang + Math.PI / 2;
  for (let k = -8; k <= 8; k++) {
    const bend = Math.abs(k) * 0.12;
    const x = hx + Math.cos(perp) * k + Math.cos(ang) * bend * 4;
    const y = hy + Math.sin(perp) * k + Math.sin(ang) * bend * 4;
    cv.rect(x - 1, y - 1, 3, 3, P.OUT);
  }
  for (let k = -7; k <= 7; k++) {
    const bend = Math.abs(k) * 0.12;
    cv.rect(hx + Math.cos(perp) * k + Math.cos(ang) * bend * 4, hy + Math.sin(perp) * k + Math.sin(ang) * bend * 4, 2, 2, Math.abs(k) > 5 ? P.GLASS : P.CAP);
  }
}

function chips(cv: Canvas, t: number, seed: number) {
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI * (0.15 + hash(i, 1, seed) * 0.7);
    const sp = 8 + hash(i, 2, seed) * 14;
    const x = ORE_X + Math.cos(ang) * sp * t;
    const y = ORE_BOTTOM - 12 + Math.sin(ang) * sp * t + t * t * 14;
    cv.rect(x, y, 2, 2, i % 3 === 0 ? P.CAP : P.STEEL_D);
  }
}

function diamondAt(cv: Canvas, cx: number, top: number) {
  cv.sprite(DIAMOND, cx - 15, top, { o: P.OUT, c: P.CAP, b: P.CAP_D, w: P.WHITE }, 3);
}

/** 패널에 걸어 두는 기다리는 그림: 곡괭이가 계속 내리친다 */
export function mineIdleGif() {
  const scene = newScene();
  const poses = [0, 0, 1, 2, 2, 1];
  poses.forEach((pose, f) => {
    addFrame(scene, pose === 2 ? 12 : 8, (cv) => {
      night(cv, f);
      glow(cv, ORE_X, 38, f);
      ground(cv);
      oreBlock(cv, 0, pose === 2 && f === 3 ? 1 : 0);
      pickaxe(cv, pose);
      if (pose === 2) {
        sparkle(cv, ORE_X + 10, ORE_BOTTOM - 22, true, P.COIN_L);
        chips(cv, 0.4, 3 + f);
      }
      drawText(cv, "DIG!", 8, "gold", 2, 76);
    });
  });
  return encodeScene(scene);
}

/** 결과: 세 번 내리쳐 금이 가고 → 깨지고 → 다이아(+금액) 또는 꽝 */
export function mineOpenGif(amount: number) {
  const scene = newScene();
  let f = 0;
  for (let hit = 0; hit < 3; hit++) {
    for (const pose of [0, 1, 2]) {
      const ff = f++;
      addFrame(scene, pose === 2 ? 9 : 6, (cv) => {
        night(cv, ff);
        glow(cv, ORE_X, 38, ff);
        ground(cv);
        oreBlock(cv, pose === 2 ? hit + 1 : hit, pose === 2 ? (hit % 2 ? 1 : -1) : 0);
        pickaxe(cv, pose);
        if (pose === 2) chips(cv, 0.5, 9 + hit);
      });
    }
  }
  // 깨짐
  for (let k = 0; k < 4; k++) {
    const ff = f++;
    addFrame(scene, 6, (cv) => {
      night(cv, ff);
      glow(cv, ORE_X, 38, ff);
      ground(cv);
      chips(cv, 0.3 + k * 0.25, 30);
      cv.rect(ORE_X - 10, ORE_BOTTOM - 3, 20, 3, P.STEEL_D);
    });
  }
  const text = amount > 0 ? signedAmount("+", amount, "원") : "꽝";
  for (let k = 0; k < 14; k++) {
    const ff = f++;
    const last = k === 13;
    addFrame(scene, last ? HOLD : 8, (cv) => {
      night(cv, ff);
      glow(cv, ORE_X, 38, ff);
      ground(cv);
      cv.rect(ORE_X - 10, ORE_BOTTOM - 3, 20, 3, P.STEEL_D);
      if (amount > 0) {
        const bounce = [0, 6, 9, 6, 2, 3, 3][Math.min(k, 6)]!;
        diamondAt(cv, ORE_X, ORE_BOTTOM - 28 - bounce);
        burst(cv, ORE_X, ORE_BOTTOM - 26, Math.min(1, k / 9), 61);
        if (k % 2 === 0) sparkle(cv, ORE_X - 16, ORE_BOTTOM - 30, true, P.COIN_L);
        else sparkle(cv, ORE_X + 16, ORE_BOTTOM - 34, true, P.GLASS);
        drawText(cv, text, 3, "gold");
      } else {
        cv.disc(ORE_X, ORE_BOTTOM - 8 - k, 2, P.STEEL_D);
        drawText(cv, text, 8, "red", 4, 70);
      }
    });
  }
  return encodeScene(scene);
}

/* ───────────── 랜덤뽑기 (잔액 차감 가챠) ───────────── */

/** 패널 그림: 가챠 기계 손잡이가 돌고 캡슐이 반짝인다 */
export function gachaIdleGif() {
  const scene = newScene();
  for (let f = 0; f < 12; f++) {
    addFrame(scene, 9, (cv) => {
      night(cv, f);
      glow(cv, 30, 30, f);
      gachaMachine(cv, 30, 6, f % 4, f);
      drawText(cv, "GACHA!", 10, "gold", 2, 63);
      if (f % 2 === 0) sparkle(cv, 54, 30, f % 4 === 0, P.COIN_L);
      else sparkle(cv, 88, 38, false, P.VIOLET_L);
      coin(cv, 70, 40 - ((f * 2) % 6), 1, f % 4);
    });
  }
  return encodeScene(scene);
}

export type GachaOutcome = { kind: "points"; amount: number } | { kind: "item" } | { kind: "none" };

/** 결과: 손잡이 → 캡슐이 굴러 나와 열림 → 금액 / 상품 / 꽝 */
export function gachaResultGif(outcome: GachaOutcome) {
  const scene = newScene();
  const mcx = 30;
  const top = 6;
  const win = outcome.kind !== "none";
  for (let f = 0; f < 30; f++) {
    const last = f === 29;
    addFrame(scene, last ? HOLD : 8, (cv) => {
      night(cv, f);
      glow(cv, 66, 32, f, win && f >= 17);
      gachaMachine(cv, mcx, top, f < 7 ? f : 0, f);
      let capX = mcx + 10;
      let capY = top + 37;
      if (f >= 7) {
        const t = Math.min(1, (f - 7) / 6);
        capX = Math.round(mcx + 10 + t * 26);
        capY = Math.round(top + 37 - Math.sin(t * Math.PI) * 10 - t * 4);
      }
      if (f >= 7 && f < 17) capsule(cv, capX, capY, f >= 13 ? Math.min(4, f - 12) : 0);
      if (f >= 17) {
        const rise = Math.min(1, (f - 17) / 4);
        if (outcome.kind === "none") {
          cv.disc(66, 36, 3, P.STEEL_D);
          drawText(cv, "꽝", Math.round(18 - rise * 4), "red", 2, 66);
        } else if (outcome.kind === "points") {
          coin(cv, 66, Math.round(34 - rise * 6), 3, f % 4);
          drawText(cv, signedAmount("+", outcome.amount, "원"), 3, "gold");
          burst(cv, 66, 34, Math.min(1, (f - 17) / 9), 71);
        } else {
          prizeIcon(cv, "nitro", 66, Math.round(30 - rise * 6), 2);
          drawText(cv, "WIN!", 3, "green", 2, 48);
          burst(cv, 66, 34, Math.min(1, (f - 17) / 9), 73);
        }
        if (win) {
          if (f % 2 === 0) sparkle(cv, 52, 22, true, P.COIN_L);
          else sparkle(cv, 84, 28, true, P.VIOLET_L);
        }
      }
    });
  }
  return encodeScene(scene);
}
