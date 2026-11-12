/**
 * 미니게임 규칙 · 좌표 (블록 데이터 없이 가볍게) — 클라이언트, API, 멀티플레이 방이 함께 쓴다.
 * 모든 구역은 메인 광장과 같은 하늘(x > 280)이라 멀티플레이 방은 공유하지만,
 * 광장에서 안 보이도록 카메라 시야(400칸)보다 멀리 떨어뜨려 둔다. 게이트 포털로만 오간다.
 */

export const GAME_PLAZA = { x: 400, z: 0 };
/** 광장 중심에서 미니게임 구역까지의 거리 (카메라 far 400 + 여유) */
const FAR = 480;

/** 한국 시간 날짜 (YYYY-MM-DD) — 미로 · 보물 위치가 이 값으로 정해진다 */
export function kstDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function fnv(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed: string) {
  let a = fnv(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────── 미로 (매일 자정에 바뀜) ───────────── */

/** 광장 북쪽 아주 먼 하늘 */
export const MAZE = { n: 12, x0: GAME_PLAZA.x - 12, z0: GAME_PLAZA.z - FAR - 12 };
export const MAZE_SIZE = MAZE.n * 2 + 1;
/** 입구는 남쪽 아래 왼쪽, 출구는 북쪽 위 오른쪽 */
export const MAZE_ENTRY = { gx: 1, gz: MAZE_SIZE - 1 };
export const MAZE_EXIT = { gx: MAZE_SIZE - 2, gz: 0 };
export const MAZE_START = { x: MAZE.x0 + MAZE_ENTRY.gx + 0.5, y: 1, z: MAZE.z0 + MAZE_SIZE + 2.5, yaw: 0 };

/** 1 = 생울타리 벽, 0 = 길 — 인덱스는 gz * MAZE_SIZE + gx */
export function mazeGrid(day: string): Uint8Array {
  const S = MAZE_SIZE;
  const n = MAZE.n;
  const g = new Uint8Array(S * S).fill(1);
  const r = seeded(`maze:${day}`);
  const seen = new Uint8Array(n * n);
  const stack: [number, number][] = [[0, 0]];
  seen[0] = 1;
  g[1 * S + 1] = 0;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1]!;
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dz]) => [cx + dx, cz + dz] as const)
      .filter(([x, z]) => x >= 0 && z >= 0 && x < n && z < n && !seen[z * n + x]);
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, nz] = next[Math.floor(r() * next.length)]!;
    seen[nz * n + nx] = 1;
    g[(cz + nz + 1) * S + (cx + nx + 1)] = 0;
    g[(nz * 2 + 1) * S + (nx * 2 + 1)] = 0;
    stack.push([nx, nz]);
  }
  // 막다른 길만 있으면 지루하니 벽 몇 개를 더 뚫어 순환로를 만든다
  for (let k = 0; k < 14; k++) {
    const gx = 1 + Math.floor(r() * (S - 2));
    const gz = 1 + Math.floor(r() * (S - 2));
    if ((gx % 2) + (gz % 2) === 1) g[gz * S + gx] = 0;
  }
  g[MAZE_ENTRY.gz * S + MAZE_ENTRY.gx] = 0;
  g[MAZE_EXIT.gz * S + MAZE_EXIT.gx] = 0;
  return g;
}

/** 입구 → 출구 최단 칸 수 (서버가 너무 빠른 기록을 거르는 데 쓴다) */
export function mazeShortestSteps(day: string) {
  const S = MAZE_SIZE;
  const g = mazeGrid(day);
  const dist = new Int32Array(S * S).fill(-1);
  const q = [MAZE_ENTRY.gz * S + MAZE_ENTRY.gx];
  dist[q[0]!] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i]!;
    const cx = c % S;
    const cz = Math.floor(c / S);
    if (cx === MAZE_EXIT.gx && cz === MAZE_EXIT.gz) return dist[c]!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= S || z >= S) continue;
      const k = z * S + x;
      if (g[k] || dist[k] >= 0) continue;
      dist[k] = dist[c]! + 1;
      q.push(k);
    }
  }
  return S * 2;
}

/* ───────────── 보물섬 ───────────── */

/** 광장 남쪽 아주 먼 바다 위 */
export const TREASURE = { x: GAME_PLAZA.x, z: GAME_PLAZA.z + FAR, r: 17 };
export const TREASURE_PER_DAY = 5;
export const TREASURE_START = { x: TREASURE.x + 0.5, y: 1, z: TREASURE.z + TREASURE.r + 3.5, yaw: 0 };

/** 보물 상자가 숨을 수 있는 자리 (섬 중심 기준) — up 은 지면보다 몇 칸 위인지 (유적 기둥 꼭대기 등) */
export const TREASURE_SPOTS: { dx: number; dz: number; up?: number }[] = [
  { dx: -8, dz: 2 },
  { dx: -3, dz: 9 },
  { dx: 10, dz: -2 },
  { dx: 4, dz: -13 },
  { dx: -5, dz: -4 },
  { dx: 6, dz: 8 },
  { dx: 8, dz: 10 },
  { dx: 5, dz: 7, up: 3 },
  { dx: 12, dz: -10 },
  { dx: -14, dz: 3 },
  { dx: 13, dz: 7 },
  { dx: 7, dz: -9 },
  { dx: 0, dz: -15 },
  { dx: -15, dz: -4 },
  { dx: 15, dz: -1 },
  { dx: 9, dz: 6 },
  { dx: -10, dz: -11 },
  { dx: -1, dz: 2 },
  { dx: -11, dz: 9 },
  { dx: 2, dz: -7 },
];

/** 오늘 숨겨진 상자 번호들 */
export function treasureSpotsForDay(day: string): number[] {
  const r = seeded(`treasure:${day}`);
  const idx = TREASURE_SPOTS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, TREASURE_PER_DAY).sort((a, b) => a - b);
}

/* ───────────── 1:1 결투장 ───────────── */

export const ARENA_HALF = 8;
/** 광장 동쪽 아주 먼 하늘에 나란히 */
export const ARENAS = [
  { x: GAME_PLAZA.x + FAR, z: GAME_PLAZA.z - 30 },
  { x: GAME_PLAZA.x + FAR, z: GAME_PLAZA.z },
  { x: GAME_PLAZA.x + FAR, z: GAME_PLAZA.z + 30 },
];
export const DUEL_COUNTDOWN_MS = 3500;
export const DUEL_LIMIT_MS = 120_000;

export function arenaSpawn(slot: number, side: 0 | 1) {
  const a = ARENAS[slot] ?? ARENAS[0]!;
  return side === 0 ? { x: a.x + 0.5, y: 1, z: a.z + 5.5, yaw: 0 } : { x: a.x + 0.5, y: 1, z: a.z - 4.5, yaw: Math.PI };
}

export function arenaAt(x: number, z: number) {
  return ARENAS.findIndex((a) => Math.abs(x - (a.x + 0.5)) <= ARENA_HALF + 0.5 && Math.abs(z - (a.z + 0.5)) <= ARENA_HALF + 0.5);
}

/* ───────────── 하늘 파쿠르 ───────────── */

/** 광장 북동쪽 아주 먼 하늘 — 출발대가 원점, 북쪽(-z)으로 올라간다 */
export const PARKOUR_AREA = { x: GAME_PLAZA.x + FAR, z: GAME_PLAZA.z - FAR };

export type ParkourStage = "garden" | "rainbow" | "nether" | "end" | "sky";
export type ParkourStep = { x: number; y: number; z: number; stage: ParkourStage; kind: "start" | "step" | "slime" | "cp" | "goal" };

/** [dx, dy, dz, 표시] — 각 발판은 앞 발판에서 이만큼 떨어져 있다 (모두 점프 가능 거리로 맞춰 둠) */
const PARKOUR_MOVES: [ParkourStage, [number, number, number, ("cp" | "slime" | "goal")?][]][] = [
  ["garden", [[0, 0, -3], [2, 0, -2], [2, 1, -1], [0, 0, -3], [-2, 1, -1], [-3, 0, 0], [-2, 1, -2], [0, 0, -3, "cp"]]],
  ["rainbow", [[0, 1, -3], [2, 1, -1], [2, 1, 0], [2, 1, 1], [1, 1, 2], [2, 0, 2], [0, 1, 2], [-2, 1, 1], [-3, 0, 0], [-2, 1, -1], [0, 1, -2], [2, 0, -2, "cp"]]],
  ["nether", [[3, 0, -1], [2, 1, -2], [0, 0, -3], [3, -1, -1], [3, 0, 0], [2, 1, 1], [0, 1, 2], [3, 0, 1], [2, 1, -1], [0, 0, -3, "cp"]]],
  ["end", [[0, 0, -3], [-2, 0, -2, "slime"], [-1, 3, -1], [-3, 0, 0], [-2, 1, -1, "slime"], [0, 3, -2], [0, 0, -3], [2, -1, -2], [3, 0, 0], [1, 1, -2, "cp"]]],
  ["sky", [[0, 1, -3], [-2, 0, -2], [-2, 1, -1], [-2, 0, 2], [-2, 1, 1], [-3, 0, -1], [0, 1, -2], [2, 0, -2], [2, 1, -1], [0, 0, -4, "goal"]]],
];

/** 발판 좌표 (월드 기준). 0번이 출발 발판, 마지막이 골인 지점 가운데 */
export const PARKOUR_STEPS: ParkourStep[] = (() => {
  const { x: ax, z: az } = PARKOUR_AREA;
  const out: ParkourStep[] = [{ x: ax, y: 0, z: az - 2, stage: "garden", kind: "start" }];
  for (const [stage, moves] of PARKOUR_MOVES) {
    for (const [dx, dy, dz, tag] of moves) {
      const p = out[out.length - 1]!;
      out.push({ x: p.x + dx, y: p.y + dy, z: p.z + dz, stage, kind: tag ?? "step" });
    }
  }
  return out;
})();

/** 체크포인트 · 골인 발판 반지름 (3×3 · 5×5) */
export const parkourPadRadius = (s: ParkourStep) => (s.kind === "cp" ? 1 : s.kind === "goal" ? 2 : 0);

export const PARKOUR_START = { x: PARKOUR_AREA.x + 0.5, y: 1, z: PARKOUR_AREA.z + 3.5, yaw: 0 };
export const PARKOUR_GOAL = PARKOUR_STEPS[PARKOUR_STEPS.length - 1]!;
/** 슬라임 발판에서 점프하면 튀어 오르는 속도 */
export const SLIME_JUMP_V = 14.5;

export function inParkour(x: number, z: number) {
  return x >= PARKOUR_AREA.x - 14 && x <= PARKOUR_AREA.x + 30 && z >= PARKOUR_AREA.z - 66 && z <= PARKOUR_AREA.z + 12;
}

/* ───────────── 계정 시장 (새마을시장 같은 지붕 덮인 골목) ───────────── */

/** 광장 남동쪽 아주 먼 하늘 — 남쪽 입구에서 북쪽(-z)으로 골목이 뻗고 양옆에 점포가 늘어선다 */
export const MARKET = { x: GAME_PLAZA.x + FAR, z: GAME_PLAZA.z + FAR };
export const MARKET_PER_SIDE = 10;
export const MARKET_STALLS = MARKET_PER_SIDE * 2;
/** 점포 한 칸 폭 (칸막이 1 + 안쪽 4) */
export const MARKET_PITCH = 5;
/** 입구 쪽 첫 칸막이 z — 칸막이는 여기서 북쪽으로 MARKET_PITCH 마다 */
export const MARKET_Z0 = MARKET.z + (MARKET_PER_SIDE * MARKET_PITCH) / 2;
export const MARKET_START = { x: MARKET.x + 0.5, y: 1, z: MARKET_Z0 + 5.5, yaw: 0 };

export type MarketStall = {
  i: number;
  /** -1 = 서쪽 줄, 1 = 동쪽 줄 */
  side: -1 | 1;
  /** 입구에서 몇 번째 칸인지 */
  k: number;
  /** 점포 가운데 z (칸 경계) */
  cz: number;
  /** 진열대(계산대) 칸 x */
  counterX: number;
  /** 마네킹 자리 · 골목을 바라보는 yaw */
  mx: number;
  yaw: number;
  /** 손님이 서는 진열대 앞 */
  fx: number;
};

/** 0·1 번이 입구 바로 옆 (서·동), 짝수 = 서쪽, 홀수 = 동쪽 */
export const MARKET_STALL_LIST: MarketStall[] = Array.from({ length: MARKET_STALLS }, (_, i) => {
  const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
  const k = Math.floor(i / 2);
  return {
    i,
    side,
    k,
    cz: MARKET_Z0 - k * MARKET_PITCH - 2,
    counterX: side < 0 ? MARKET.x - 3 : MARKET.x + 3,
    mx: side < 0 ? MARKET.x - 4.5 : MARKET.x + 5.5,
    yaw: side < 0 ? -Math.PI / 2 : Math.PI / 2,
    fx: side < 0 ? MARKET.x - 2 : MARKET.x + 3,
  };
});

/** 진열대 앞에 서 있으면 그 점포 번호, 아니면 -1 */
export function marketStallNear(x: number, z: number, reach = 3.2) {
  let best = -1;
  let bestD = reach;
  for (const s of MARKET_STALL_LIST) {
    const d = Math.hypot(x - s.fx, z - s.cz);
    if (d < bestD) {
      bestD = d;
      best = s.i;
    }
  }
  return best;
}

export function inMarket(x: number, z: number) {
  return Math.abs(x - (MARKET.x + 0.5)) <= 14 && z >= MARKET.z - 36 && z <= MARKET_Z0 + 13;
}

/* ───────────── 구역 판정 ───────────── */

export type GameRegion = "maze" | "treasure" | "arena" | "parkour" | "market" | null;

export function gameRegion(x: number, z: number): GameRegion {
  if (x >= MAZE.x0 - 6 && x <= MAZE.x0 + MAZE_SIZE + 6 && z >= MAZE.z0 - 8 && z <= MAZE.z0 + MAZE_SIZE + 9) return "maze";
  if (Math.hypot(x - TREASURE.x, z - TREASURE.z) <= TREASURE.r + 9) return "treasure";
  if (arenaAt(x, z) >= 0) return "arena";
  if (inParkour(x, z)) return "parkour";
  if (inMarket(x, z)) return "market";
  return null;
}

/* ───────────── 광장 워프 정자 ───────────── */

/**
 * 광장 중심을 둘러싼 반지름 16칸 고리 위의 정자들 — 가운데 빛나는 발판을 밟거나 정자를 클릭하면 이동한다.
 * 각도는 북쪽(-z)에서 시계 방향. 서쪽은 상점 쪽, 북쪽은 야생, 동쪽은 미니게임.
 */
export type GateKey = "parkour" | "maze" | "wild" | "shop" | "accounts" | "mine" | "treasure";
export const GATE_ORDER: GateKey[] = ["shop", "accounts", "maze", "wild", "parkour", "mine", "treasure"];
export type SpotKey = GateKey | "attend" | "duel";

/** 정자 가운데 칸 · 반폭(칸) · 광장 중심을 바라보는 yaw */
export type WarpSpot = { x: number; z: number; half: number; yaw: number };

const WARP_RING = 16;
const SPOT_ANGLE: Record<SpotKey, number> = {
  shop: -120,
  accounts: -90,
  attend: -60,
  maze: -30,
  wild: 0,
  parkour: 30,
  mine: 60,
  treasure: 90,
  duel: 120,
};

function ringSpot(deg: number, half = 2): WarpSpot {
  const a = (deg * Math.PI) / 180;
  const x = GAME_PLAZA.x + Math.round(Math.sin(a) * WARP_RING);
  const z = GAME_PLAZA.z - Math.round(Math.cos(a) * WARP_RING);
  return { x, z, half, yaw: Math.atan2(x - GAME_PLAZA.x, z - GAME_PLAZA.z) };
}

export const SPOTS = Object.fromEntries(
  (Object.keys(SPOT_ANGLE) as SpotKey[]).map((k) => [k, ringSpot(SPOT_ANGLE[k], k === "wild" ? 3 : 2)]),
) as Record<SpotKey, WarpSpot>;

/** 정자 가운데 3×3 발판 (y=1) — 밟고 있으면 이동 */
export function padCells(s: { x: number; z: number }): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push([s.x + dx, 1, s.z + dz]);
  return out;
}

export const MAZE_GATE_CELLS = padCells(SPOTS.maze);
export const TREASURE_GATE_CELLS = padCells(SPOTS.treasure);
export const PARKOUR_GATE_CELLS = padCells(SPOTS.parkour);
export const WILD_GATE_CELLS = padCells(SPOTS.wild);
export const MINE_GATE_CELLS = padCells(SPOTS.mine);
export const SHOP_GATE_CELLS = padCells(SPOTS.shop);
export const ACCOUNTS_GATE_CELLS = padCells(SPOTS.accounts);

/** 정자 앞 (광장 중심 쪽) — 게임에서 돌아오면 여기 서서 광장 중심을 본다 */
function spotFront(s: WarpSpot) {
  const d = s.half + 1.8;
  const ux = -Math.sin(s.yaw);
  const uz = -Math.cos(s.yaw);
  return { x: s.x + 0.5 + ux * d, y: 1, z: s.z + 0.5 + uz * d, yaw: s.yaw };
}
export const PARKOUR_RETURN = spotFront(SPOTS.parkour);
export const MAZE_RETURN = spotFront(SPOTS.maze);
export const TREASURE_RETURN = spotFront(SPOTS.treasure);
export const ACCOUNTS_RETURN = spotFront(SPOTS.accounts);
/** 결투 과녁 — 결투 정자 가운데 */
export const DUEL_BOARD = { x: SPOTS.duel.x, y: 1, z: SPOTS.duel.z };
export const DUEL_RETURN = spotFront(SPOTS.duel);
