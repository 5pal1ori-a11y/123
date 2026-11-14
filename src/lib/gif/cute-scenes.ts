import {
  addFrame,
  backdrop,
  coin,
  confetti,
  drawText,
  dust,
  encodeScene,
  giftBox,
  GROUND,
  groundShadow,
  heart,
  HOLD,
  kid,
  KID_H,
  newScene,
  P,
  prizeIcon,
  signedAmount,
  sparkle,
  type Canvas,
  type Mood,
  type Prize,
  type Scene,
} from "@/lib/gif/cute-art";

const KX = 70;
const KY = GROUND - KID_H;
const BOX_X = 36;
const JUMP = [0, -3, -5, -3, 0, -1];
const SPARKLE_COLORS = [P.COIN, P.HEART, P.CAP];

function sparkles(cv: Canvas, i: number, spots: [number, number][]) {
  spots.forEach(([x, y], k) => {
    if ((i + k) % 3 !== 2) sparkle(cv, x, y, (i + k) % 2 === 0, SPARKLE_COLORS[k % 3]!);
  });
}

/** 오른쪽 아이. step 은 기쁠 때 폴짝 뛰는 단계 (-1 이면 가만히) */
function kidAt(cv: Canvas, mood: Mood, step = -1) {
  const dy = mood === "happy" && step >= 0 ? JUMP[step % JUMP.length]! : 0;
  groundShadow(cv, KX + 7, dy < -2 ? 4 : 6);
  kid(cv, KX, KY + dy, mood);
  if (mood === "happy") {
    const t = step < 0 ? 0 : step % 4;
    heart(cv, KX + 10, KY - 7 - t);
    if (step >= 0 && step % 2 === 0) heart(cv, KX - 6, KY - 2 - t);
  }
}

/** 상자가 떨어져 통 튀고, 흔들리다 뚜껑이 날아간다 */
function dropAndOpen(scene: Scene) {
  addFrame(scene, 20, (cv) => {
    backdrop(cv);
    kidAt(cv, "idle");
  });
  for (const bottom of [8, 20, 34, 48]) {
    addFrame(scene, 4, (cv) => {
      backdrop(cv);
      groundShadow(cv, BOX_X, 3 + bottom / 7);
      giftBox(cv, BOX_X, bottom);
      kidAt(cv, "worry");
    });
  }
  addFrame(scene, 5, (cv) => {
    backdrop(cv);
    groundShadow(cv, BOX_X, 12);
    giftBox(cv, BOX_X, GROUND, { squash: 2 });
    dust(cv, BOX_X - 15, GROUND - 2, 2);
    dust(cv, BOX_X + 15, GROUND - 2, 2);
    kidAt(cv, "worry");
  });
  addFrame(scene, 5, (cv) => {
    backdrop(cv);
    groundShadow(cv, BOX_X, 9);
    giftBox(cv, BOX_X, GROUND - 3);
    kidAt(cv, "idle");
  });
  addFrame(scene, 14, (cv) => {
    backdrop(cv);
    groundShadow(cv, BOX_X, 11);
    giftBox(cv, BOX_X, GROUND);
    kidAt(cv, "blink");
  });
  for (const dx of [-1, 1, -1, 1, -1, 1]) {
    addFrame(scene, 5, (cv) => {
      backdrop(cv);
      groundShadow(cv, BOX_X, 11);
      giftBox(cv, BOX_X + dx, GROUND);
      kidAt(cv, "worry");
    });
  }
  for (const lid of [
    { dx: 2, dy: -5 },
    { dx: 7, dy: -14 },
    { dx: 14, dy: -26 },
  ]) {
    addFrame(scene, 4, (cv) => {
      backdrop(cv);
      groundShadow(cv, BOX_X, 11);
      giftBox(cv, BOX_X, GROUND, { lid });
      sparkle(cv, BOX_X, 36, true, P.COIN);
      kidAt(cv, "idle");
    });
  }
}

function openBox(cv: Canvas) {
  backdrop(cv);
  groundShadow(cv, BOX_X, 11);
  giftBox(cv, BOX_X, GROUND, { lid: null });
}

/** 꽝: 먼지만 풀썩 */
function emptyEnding(scene: Scene) {
  for (let k = 0; k < 3; k++) {
    addFrame(scene, 10, (cv) => {
      openBox(cv);
      dust(cv, BOX_X - 4, 36 - k * 4, 2 + k);
      dust(cv, BOX_X + 5, 34 - k * 5, 1 + k);
      kidAt(cv, k < 1 ? "worry" : "sad");
    });
  }
  addFrame(scene, HOLD, (cv) => {
    openBox(cv);
    kidAt(cv, "sad");
    drawText(cv, "꽝", 2, "red", 4);
  });
}

/* ───────────── 랜덤박스 ───────────── */

/* ───────────── 랜덤박스: 다이아 캐기 ───────────── */

function bline(cv: Canvas, x0: number, y0: number, x1: number, y1: number, c: number) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    cv.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 곡괭이: 0 = 번쩍 들어 올림, 1 = 내려오는 중, 2 = 내리침 */
const PICK_POSES = [
  { tx: 51, ty: 19 },
  { tx: 48, ty: 27 },
  { tx: 45, ty: 35 },
];
const HAND = { x: 58, y: 44 };

function pickaxe(cv: Canvas, pose: 0 | 1 | 2) {
  const { tx, ty } = PICK_POSES[pose]!;
  bline(cv, HAND.x, HAND.y, tx, ty, P.DIRT_D);
  bline(cv, HAND.x + 1, HAND.y, tx + 1, ty, P.DIRT);
  const vx = tx - HAND.x;
  const vy = ty - HAND.y;
  const len = Math.hypot(vx, vy) || 1;
  const px = -vy / len;
  const py = vx / len;
  for (let k = -5; k <= 5; k++) {
    const hx = tx + px * k;
    const hy = ty + py * k - Math.abs(k) * 0.25 * (vy / len) * -1;
    const edge = Math.abs(k) >= 5;
    cv.set(hx, hy, edge ? P.OUT : P.GRAY_D);
    cv.set(hx - vx / len, hy - vy / len, edge ? P.OUT : P.GRAY);
    if (Math.abs(k) <= 2) cv.set(hx - 2 * (vx / len), hy - 2 * (vy / len), P.WHITE);
  }
}

const ORE_W = 16;
const DIAMOND_SPOTS: [number, number][] = [
  [3, 3],
  [10, 4],
  [5, 9],
  [11, 10],
  [8, 13],
];

/** 다이아 원석 블록. crack 0~3 (갈라짐), dx 흔들림 */
function oreBlock(cv: Canvas, crack: number, dx = 0, twinkle = -1) {
  const x = BOX_X - ORE_W / 2 + dx;
  const y = GROUND - ORE_W;
  cv.rect(x, y, ORE_W, ORE_W, P.GRAY);
  for (let i = 0; i < 18; i++) cv.set(x + ((i * 7) % 14) + 1, y + ((i * 5) % 14) + 1, P.GRAY_D);
  for (let i = 0; i < ORE_W; i++) {
    cv.set(x + i, y, P.OUT);
    cv.set(x + i, y + ORE_W - 1, P.OUT);
    cv.set(x, y + i, P.OUT);
    cv.set(x + ORE_W - 1, y + i, P.OUT);
  }
  DIAMOND_SPOTS.forEach(([ox, oy], i) => {
    cv.rect(x + ox, y + oy, 2, 2, P.PATINA);
    cv.set(x + ox, y + oy, P.WHITE);
    cv.set(x + ox + 1, y + oy + 1, P.CAP);
    if (i === twinkle) sparkle(cv, x + ox, y + oy - 1, false, P.WHITE);
  });
  const cx = x;
  if (crack >= 1) bline(cv, cx + 8, y + 1, cx + 7, y + 6, P.OUT);
  if (crack >= 2) {
    bline(cv, cx + 7, y + 6, cx + 4, y + 9, P.OUT);
    bline(cv, cx + 8, y + 7, cx + 12, y + 8, P.OUT);
  }
  if (crack >= 3) {
    bline(cv, cx + 4, y + 9, cx + 5, y + 14, P.OUT);
    bline(cv, cx + 12, y + 8, cx + 11, y + 13, P.OUT);
  }
}

const DIAMOND = [
  "..oooooo..",
  ".oWWccCco.",
  "oWcccccCCo",
  "oooooooooo",
  ".occccCCo.",
  "..occCCo..",
  "...occo...",
  "....oo....",
];

function diamond(cv: Canvas, cx: number, top: number) {
  cv.sprite(DIAMOND, cx - 5, top, { o: P.OUT, W: P.WHITE, c: P.PATINA, C: P.CAP }, 1);
}

/** 블록이 깨진 뒤 남는 부스러기 */
function rubble(cv: Canvas) {
  backdrop(cv);
  groundShadow(cv, BOX_X, 11);
  const bits: [number, number][] = [[-9, 0], [-5, 1], [-1, 0], [3, 1], [7, 0], [-7, 2], [5, 2]];
  for (const [bx, by] of bits) {
    cv.rect(BOX_X + bx, GROUND - 3 + by, 3, 2, P.GRAY);
    cv.set(BOX_X + bx, GROUND - 3 + by, P.GRAY_D);
  }
}

/** 곡괭이를 세 번 휘둘러 블록을 깨뜨린다 */
function mineSwings(scene: Scene) {
  addFrame(scene, 16, (cv) => {
    backdrop(cv);
    groundShadow(cv, BOX_X, 11);
    oreBlock(cv, 0);
    pickaxe(cv, 0);
    kidAt(cv, "idle");
  });
  for (let swing = 1; swing <= 3; swing++) {
    ([0, 1, 2] as const).forEach((pose) => {
      addFrame(scene, pose === 2 ? 7 : 4, (cv) => {
        backdrop(cv);
        groundShadow(cv, BOX_X, 11);
        const hit = pose === 2;
        oreBlock(cv, hit ? swing : swing - 1, hit ? (swing % 2 ? 1 : -1) : 0);
        pickaxe(cv, pose);
        if (hit) {
          sparkle(cv, 41, 36, true, P.COIN);
          dust(cv, 44, GROUND - 3, 1);
        }
        kidAt(cv, pose === 2 ? "worry" : "idle");
      });
    });
  }
  // 펑: 조각이 사방으로
  for (let k = 1; k <= 3; k++) {
    addFrame(scene, 4, (cv) => {
      rubble(cv);
      const reach = k * 6;
      for (const [vx, vy] of [[-1, -1], [1, -1], [-1, 0], [1, 0], [0, -1], [-2, -1], [2, -1]] as const) {
        const x = BOX_X + vx * reach;
        const y = GROUND - 8 + vy * reach + k * k;
        cv.rect(x, y, 3, 3, P.GRAY);
        cv.set(x, y, P.GRAY_D);
      }
      sparkle(cv, BOX_X, GROUND - 10, true, P.WHITE);
      kidAt(cv, "worry");
    });
  }
}

export function boxIdleGif() {
  const scene = newScene();
  const poses = [0, 1, 2, 2, 1, 0] as const;
  poses.forEach((pose, n) => {
    addFrame(scene, pose === 2 ? 10 : 7, (cv) => {
      backdrop(cv);
      groundShadow(cv, BOX_X, 11);
      oreBlock(cv, 0, pose === 2 && n === 2 ? 1 : 0, (n + 1) % 5);
      pickaxe(cv, pose);
      if (pose === 2) {
        sparkle(cv, 41, 36, true, P.COIN);
        dust(cv, 44, GROUND - 3, 1);
      }
      kidAt(cv, n === 4 ? "blink" : "idle");
    });
  });
  return encodeScene(scene);
}

/** 꽝: 부스러기만 남고 아이가 시무룩 */
function mineEmptyEnding(scene: Scene) {
  for (let k = 0; k < 3; k++) {
    addFrame(scene, 10, (cv) => {
      rubble(cv);
      dust(cv, BOX_X - 4, 36 - k * 4, 2 + k);
      dust(cv, BOX_X + 5, 34 - k * 5, 1 + k);
      kidAt(cv, k < 1 ? "worry" : "sad");
    });
  }
  addFrame(scene, HOLD, (cv) => {
    rubble(cv);
    kidAt(cv, "sad");
    drawText(cv, "꽝", 2, "red", 4);
  });
}

export function boxOpenGif(amount: number) {
  const scene = newScene();
  mineSwings(scene);
  if (amount <= 0) {
    mineEmptyEnding(scene);
    return encodeScene(scene);
  }

  // 다이아가 통통 튀어 오름
  [GROUND - 12, GROUND - 22, GROUND - 28, GROUND - 22, GROUND - 14].forEach((top, k) => {
    addFrame(scene, 5, (cv) => {
      rubble(cv);
      diamond(cv, BOX_X, top);
      sparkle(cv, BOX_X - 10, top + 2, k % 2 === 0, P.WHITE);
      sparkle(cv, BOX_X + 10, top, k % 2 === 1, P.COIN);
      kidAt(cv, "happy", k);
    });
  });
  const text = signedAmount("+", amount, "원");
  const glints: [number, number][] = [[8, 30], [62, 28], [24, 36], [90, 24]];
  const result = (cv: Canvas, n: number, step: number) => {
    rubble(cv);
    diamond(cv, BOX_X, GROUND - 13 - (n % 4 < 2 ? 0 : 1));
    confetti(cv, n, 3, 14);
    kidAt(cv, "happy", step);
    drawText(cv, text, 3, "gold");
    sparkles(cv, n, glints);
  };
  for (let k = 0; k < 6; k++) addFrame(scene, 16, (cv, n) => result(cv, n, k));
  addFrame(scene, HOLD, (cv, n) => result(cv, n, -1));
  return encodeScene(scene);
}

/* ───────────── 출석: 동전이 떨어진다 ───────────── */

const COIN_X = 40;

export function checkinGif(amount: number, jackpot: boolean) {
  const scene = newScene();
  const COIN_Y = GROUND - 8;

  // 1) 아이가 서 있고, 위에서 반짝이 하나가 깜빡
  for (let k = 0; k < 3; k++) {
    addFrame(scene, 9, (cv) => {
      backdrop(cv);
      if (k === 1) sparkle(cv, COIN_X, 6, true, P.COIN);
      kidAt(cv, k === 2 ? "blink" : "idle");
    });
  }

  // 2) 동전이 돌면서 떨어짐 (꼬리 반짝이)
  const fall = [-6, 2, 11, 21, 32, 43, COIN_Y];
  fall.forEach((cy, k) => {
    addFrame(scene, 3, (cv) => {
      backdrop(cv);
      groundShadow(cv, COIN_X, 2 + (cy + 8) / 9);
      if (k > 0) sparkle(cv, COIN_X + (k % 2 ? -5 : 5), cy - 9, false, P.COIN_L);
      coin(cv, COIN_X, cy, 2, k);
      kidAt(cv, k < 5 ? "worry" : "idle");
    });
  });

  // 3) 착지: 먼지 → 두 번 튕김
  addFrame(scene, 4, (cv) => {
    backdrop(cv);
    groundShadow(cv, COIN_X, 9);
    coin(cv, COIN_X, COIN_Y, 2, 0);
    dust(cv, COIN_X - 12, GROUND - 2, 2);
    dust(cv, COIN_X + 12, GROUND - 2, 2);
    kidAt(cv, "idle");
  });
  [12, 4, 0].forEach((lift, k) => {
    addFrame(scene, 4, (cv) => {
      backdrop(cv);
      groundShadow(cv, COIN_X, 8 - lift / 3);
      coin(cv, COIN_X, COIN_Y - lift, 2, k + 1);
      if (k === 0) {
        dust(cv, COIN_X - 15, GROUND - 3, 1);
        dust(cv, COIN_X + 15, GROUND - 3, 1);
      }
      kidAt(cv, "happy", k);
    });
  });

  // 4) 결과: 숫자가 위에서 쿵 내려오고, 동전 주위로 반짝이가 퍼짐
  const text = signedAmount("+", amount, "원");
  const drop = [-9, -1, 6, 2, 3];
  const ringColors = [P.COIN, P.HEART, P.CAP, P.COIN_L];
  const ring = (cv: Canvas, step: number) => {
    const r = 5 + step * 3;
    for (let q = 0; q < 8; q++) {
      const ang = (q / 8) * Math.PI * 2 + step * 0.3;
      const x = Math.round(COIN_X + Math.cos(ang) * r * 1.4);
      const y = Math.round(COIN_Y - 3 + Math.sin(ang) * r * 0.8);
      if (x > 1 && x < 94 && y > 8 && y < GROUND - 2) sparkle(cv, x, y, step < 2, ringColors[q % 4]!);
    }
  };
  const glints: [number, number][] = jackpot
    ? [[24, 30], [56, 26], [14, 44], [62, 44], [88, 22]]
    : [[26, 32], [54, 28], [60, 44]];
  const result = (cv: Canvas, n: number, step: number, textTop: number, burst: number) => {
    backdrop(cv);
    if (jackpot) {
      [8, 22, 58, 90].forEach((x, q) => coin(cv, x, 22 + ((n * 6 + q * 11) % 24), 1, n + q));
      confetti(cv, n, 9, 22);
    } else if (n % 2 === 0) {
      confetti(cv, n, 5, 7);
    }
    groundShadow(cv, COIN_X, 8);
    coin(cv, COIN_X, COIN_Y, 2, n);
    if (burst >= 0) ring(cv, burst);
    kidAt(cv, "happy", step);
    drawText(cv, text, textTop, "gold");
    sparkles(cv, n, glints);
  };
  drop.forEach((top, k) => addFrame(scene, 6, (cv, n) => result(cv, n, k, top, k)));
  for (let k = 0; k < 10; k++) addFrame(scene, 12, (cv, n) => result(cv, n, k, 3, -1));
  addFrame(scene, HOLD, (cv, n) => result(cv, n, -1, 3, -1));
  return encodeScene(scene);
}

/* ───────────── 도박: 동전 던지기 ───────────── */

function crack(cv: Canvas, cx: number, cy: number) {
  const path: [number, number][] = [
    [0, -7],
    [1, -5],
    [0, -3],
    [-1, -1],
    [0, 1],
    [1, 3],
    [0, 5],
  ];
  for (const [dx, dy] of path) cv.rect(cx + dx, cy + dy, 1, 2, P.OUT);
}

export function gambleGif(win: boolean, amount: number) {
  const scene = newScene();
  addFrame(scene, 18, (cv) => {
    backdrop(cv);
    kidAt(cv, "idle");
    coin(cv, KX + 2, KY + 9, 1);
  });
  const steps = 9;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const x = KX + 2 + (COIN_X - KX - 2) * t;
    const y = KY + 9 + (GROUND - 8 - KY - 9) * t - Math.sin(t * Math.PI) * 34;
    addFrame(scene, 4, (cv) => {
      backdrop(cv);
      groundShadow(cv, Math.round(x), 2 + t * 5);
      coin(cv, x, y, 2, k);
      kidAt(cv, "worry");
    });
  }
  addFrame(scene, 14, (cv) => {
    backdrop(cv);
    groundShadow(cv, COIN_X, 8);
    coin(cv, COIN_X, GROUND - 8, 2, 2);
    kidAt(cv, "worry");
  });

  if (win) {
    const burst = [8, 20, 56, 62];
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      addFrame(scene, 5, (cv) => {
        backdrop(cv);
        groundShadow(cv, COIN_X, 8);
        coin(cv, COIN_X, GROUND - 8, 2);
        for (const bx of burst) coin(cv, COIN_X + (bx - COIN_X) * t, GROUND - 8 + 4 * t - Math.sin(t * Math.PI) * 14, 1, k);
        sparkle(cv, COIN_X, GROUND - 22, true, P.COIN);
        kidAt(cv, "happy", 0);
      });
    }
    const text = signedAmount("+", amount, "P");
    const glints: [number, number][] = [
      [28, 30],
      [52, 26],
      [12, 38],
      [88, 22],
    ];
    const result = (cv: Canvas, n: number, step: number) => {
      backdrop(cv);
      for (const bx of burst) coin(cv, bx, GROUND - 4);
      groundShadow(cv, COIN_X, 8);
      coin(cv, COIN_X, GROUND - 8, 2);
      confetti(cv, n, 5, 16);
      kidAt(cv, "happy", step);
      drawText(cv, text, 3, "green");
      sparkles(cv, n, glints);
    };
    for (let k = 0; k < 6; k++) addFrame(scene, 16, (cv, n) => result(cv, n, k));
    addFrame(scene, HOLD, (cv, n) => result(cv, n, -1));
    return encodeScene(scene);
  }

  for (let k = 1; k <= 3; k++) {
    addFrame(scene, 8, (cv) => {
      backdrop(cv);
      groundShadow(cv, COIN_X, 8);
      coin(cv, COIN_X, GROUND - 8, 2, 0, true);
      crack(cv, COIN_X, GROUND - 8);
      dust(cv, COIN_X - 10, GROUND - 4 - k * 2, 1 + k);
      dust(cv, COIN_X + 10, GROUND - 6 - k * 2, k);
      kidAt(cv, "sad");
    });
  }
  const text = signedAmount("-", amount, "P");
  const result = (cv: Canvas) => {
    backdrop(cv);
    groundShadow(cv, COIN_X, 8);
    coin(cv, COIN_X, GROUND - 8, 2, 0, true);
    crack(cv, COIN_X, GROUND - 8);
    dust(cv, COIN_X + 12, GROUND - 4, 2);
    kidAt(cv, "sad");
    drawText(cv, text, 3, "red");
  };
  for (let k = 0; k < 3; k++) addFrame(scene, 25, result);
  addFrame(scene, HOLD, result);
  return encodeScene(scene);
}

/* ───────────── 출석상점 뽑기 ───────────── */

export type RafflePrize = Prize | "none";

export function raffleGif(prize: RafflePrize) {
  const scene = newScene();
  dropAndOpen(scene);
  if (prize === "none") {
    emptyEnding(scene);
    return encodeScene(scene);
  }
  for (let k = 1; k <= 4; k++) {
    addFrame(scene, 5, (cv) => {
      openBox(cv);
      prizeIcon(cv, prize, BOX_X, 38 - k * 8);
      kidAt(cv, "happy", 0);
    });
  }
  const glints: [number, number][] = [
    [BOX_X - 14, 8],
    [BOX_X + 14, 6],
    [BOX_X - 18, 20],
    [BOX_X + 18, 22],
    [60, 30],
  ];
  const bob = [0, -1, -2, -1];
  const result = (cv: Canvas, n: number, step: number) => {
    openBox(cv);
    confetti(cv, n, 7, 14);
    prizeIcon(cv, prize, BOX_X, 8 + bob[n % 4]!);
    kidAt(cv, "happy", step);
    sparkles(cv, n, glints);
  };
  for (let k = 0; k < 8; k++) addFrame(scene, 14, (cv, n) => result(cv, n, k));
  addFrame(scene, HOLD, (cv, n) => result(cv, n, -1));
  return encodeScene(scene);
}
