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

export function boxIdleGif() {
  const scene = newScene();
  const bobs = [0, -1, -2, -2, -1, 0];
  bobs.forEach((b, n) => {
    addFrame(scene, 18, (cv) => {
      backdrop(cv);
      groundShadow(cv, BOX_X, 11);
      giftBox(cv, BOX_X, GROUND);
      drawText(cv, "?", 14 + b, "gold", 2, BOX_X);
      kidAt(cv, n === 4 ? "blink" : "idle");
      if (n % 2 === 0) sparkle(cv, BOX_X - 16, 30, false, P.COIN);
      else sparkle(cv, BOX_X + 16, 26, false, P.HEART);
    });
  });
  return encodeScene(scene);
}

const COIN_SPOTS = [10, 56, 19];

export function boxOpenGif(amount: number) {
  const scene = newScene();
  dropAndOpen(scene);
  if (amount <= 0) {
    emptyEnding(scene);
    return encodeScene(scene);
  }

  const spots = COIN_SPOTS.slice(0, amount >= 300 ? 3 : 2);
  for (let k = 1; k <= 4; k++) {
    const t = k / 4;
    addFrame(scene, 5, (cv) => {
      openBox(cv);
      for (const sx of spots) {
        const x = BOX_X + (sx - BOX_X) * t;
        const y = 38 + (GROUND - 4 - 38) * t - Math.sin(t * Math.PI) * 18;
        coin(cv, x, y, 1, k);
      }
      kidAt(cv, "happy", 0);
    });
  }
  const text = signedAmount("+", amount, "원");
  const glints: [number, number][] = [
    [8, 30],
    [62, 28],
    [24, 36],
    [90, 24],
  ];
  const result = (cv: Canvas, n: number, step: number) => {
    openBox(cv);
    for (const sx of spots) coin(cv, sx, GROUND - 4);
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
  addFrame(scene, 20, (cv) => {
    backdrop(cv);
    kidAt(cv, "idle");
  });
  const fall = [-6, 6, 20, 34, GROUND - 8];
  fall.forEach((cy, k) => {
    addFrame(scene, 4, (cv) => {
      backdrop(cv);
      groundShadow(cv, COIN_X, 2 + (cy + 8) / 10);
      coin(cv, COIN_X, cy, 2, k);
      kidAt(cv, "worry");
    });
  });
  addFrame(scene, 5, (cv) => {
    backdrop(cv);
    groundShadow(cv, COIN_X, 8);
    coin(cv, COIN_X, GROUND - 8, 2);
    dust(cv, COIN_X - 11, GROUND - 2, 2);
    dust(cv, COIN_X + 11, GROUND - 2, 2);
    kidAt(cv, "idle");
  });
  addFrame(scene, 5, (cv) => {
    backdrop(cv);
    groundShadow(cv, COIN_X, 6);
    coin(cv, COIN_X, GROUND - 12, 2, 1);
    kidAt(cv, "happy", 0);
  });

  const text = signedAmount("+", amount, "원");
  const glints: [number, number][] = jackpot
    ? [
        [24, 30],
        [56, 26],
        [14, 44],
        [62, 44],
        [88, 22],
      ]
    : [
        [26, 32],
        [54, 28],
        [60, 44],
      ];
  const result = (cv: Canvas, n: number, step: number) => {
    backdrop(cv);
    if (jackpot) {
      [8, 22, 58, 90].forEach((x, p) => coin(cv, x, 22 + ((n * 6 + p * 11) % 24), 1, n + p));
      confetti(cv, n, 9, 20);
    }
    groundShadow(cv, COIN_X, 8);
    coin(cv, COIN_X, GROUND - 8, 2);
    kidAt(cv, "happy", step);
    drawText(cv, text, 3, "gold");
    sparkles(cv, n, glints);
  };
  for (let k = 0; k < 8; k++) addFrame(scene, 14, (cv, n) => result(cv, n, k));
  addFrame(scene, HOLD, (cv, n) => result(cv, n, -1));
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
