import { cellKey, dedupeBlocks, STATIC_MODELS, type StaticBlock, type StaticKind } from "@/lib/island/world";
import {
  ARENA_HALF,
  ARENAS,
  MAZE,
  MAZE_ENTRY,
  MAZE_EXIT,
  MAZE_SIZE,
  MARKET,
  MARKET_PER_SIDE,
  MARKET_PITCH,
  MARKET_STALL_LIST,
  MARKET_Z0,
  PARKOUR_AREA,
  PARKOUR_GOAL,
  PARKOUR_STEPS,
  TREASURE,
  TREASURE_SPOTS,
  mazeGrid,
  parkourPadRadius,
  type ParkourStage,
} from "./games";
import { cherryTree, FLOWERS, hash, lampPost, oakTree, type PlazaBoard } from "./layout";

/** 밟고 있으면 메인 광장으로 돌아가는 발판 칸 */
export const MAZE_BACK_CELLS: [number, number, number][] = [];
export const TREASURE_BACK_CELLS: [number, number, number][] = [];

/** 광장 귀환 아치 (z 평면): 석영 기둥 · 바다 랜턴 상인방 · 안쪽 3칸 바닥에 하늘빛 발판 */
function backPortal(out: StaticBlock[], x0: number, z: number, cells: [number, number, number][], base = 0) {
  for (let x = x0; x <= x0 + 4; x++) {
    const side = x === x0 || x === x0 + 4;
    out.push([x, base, z, side ? "quartz" : "deepslate_tiles"], [x, base + 4, z, x === x0 + 2 ? "sea_lantern" : "quartz"]);
    if (side) {
      for (let y = base + 1; y <= base + 3; y++) out.push([x, y, z, "quartz"]);
      out.push([x, base + 5, z, "lantern"]);
    } else {
      out.push([x, base + 1, z, "pad_sky"]);
      cells.push([x, base + 1, z]);
    }
  }
}

function underside(out: StaticBlock[], x: number, z: number, depth: number) {
  for (let k = 1; k <= depth; k++) {
    const h = hash(x, z, k + 60);
    out.push([x, -k, z, k === 1 ? "dirt" : k >= depth - 1 && k > 2 ? "deepslate" : h < 0.2 ? "cobble" : "stone"]);
  }
}

/* ───────────── 미로 ───────────── */

export function mazeBlocks(day: string): StaticBlock[] {
  const out: StaticBlock[] = [];
  const S = MAZE_SIZE;
  const g = mazeGrid(day);
  const wall = (gx: number, gz: number) => gx < 0 || gz < 0 || gx >= S || gz >= S || g[gz * S + gx] === 1;
  const mid = (S - 1) / 2;
  for (let gz = 0; gz < S; gz++)
    for (let gx = 0; gx < S; gx++) {
      const x = MAZE.x0 + gx;
      const z = MAZE.z0 + gz;
      const edge = Math.max(Math.abs(gx - mid), Math.abs(gz - mid));
      const hp = hash(x, z, 71);
      out.push([x, 0, z, wall(gx, gz) ? "grass" : hp < 0.16 ? "mossy_stonebrick" : hp < 0.42 ? "andesite" : "grass"]);
      underside(out, x, z, 1 + Math.round(((mid - edge) / mid) * 5 + hash(x, z, 72) * 1.5));
      if (wall(gx, gz)) {
        const outer = gx === 0 || gz === 0 || gx === S - 1 || gz === S - 1;
        if (outer) {
          // 바깥 담장: 돌 받침 + 생울타리, 6칸마다 석영 기둥 · 등불
          const pillar = gx % 6 === 0 && gz % 6 === 0;
          out.push([x, 1, z, pillar ? "quartz" : hash(x, z, 78) < 0.35 ? "mossy_stonebrick" : "stonebrick"]);
          for (let y = 2; y <= (pillar ? 4 : 3); y++) out.push([x, y, z, pillar ? "quartz" : "hedge"]);
          out.push([x, pillar ? 5 : 4, z, pillar ? "lantern" : "hedge"]);
        } else {
          for (let y = 1; y <= 3; y++) out.push([x, y, z, "hedge"]);
          const top = hash(x, z, 73);
          if (gx % 2 === 0 && gz % 2 === 0 && top < 0.3) out.push([x, 4, z, "lantern"]);
          else if (top > 0.86) out.push([x, 4, z, top > 0.93 ? "flower_pink" : "flower_yellow"]);
        }
      } else {
        const walls = [wall(gx + 1, gz), wall(gx - 1, gz), wall(gx, gz + 1), wall(gx, gz - 1)].filter(Boolean).length;
        if (walls === 3 && hash(x, z, 74) < 0.7) out.push([x, 1, z, FLOWERS[Math.floor(hash(x, z, 75) * 4)]!]);
      }
    }

  /* 남쪽 출발대 */
  const sx = MAZE.x0 + MAZE_ENTRY.gx;
  const sz0 = MAZE.z0 + S;
  for (let x = sx - 4; x <= sx + 4; x++)
    for (let z = sz0; z <= sz0 + 6; z++) {
      const ring = x === sx - 4 || x === sx + 4 || z === sz0 + 6;
      out.push([x, 0, z, ring ? "quartz" : (x + z) % 2 ? "stonebrick" : "andesite"]);
      underside(out, x, z, 2 + Math.round(hash(x, z, 76) * 2));
    }
  out.push([sx, 0, sz0, "gold"]);
  lampPost(out, sx - 4, sz0 + 1);
  lampPost(out, sx + 4, sz0 + 1);
  // 출발 아치 (생울타리 기둥 + 금 들보)
  for (const ax of [sx - 2, sx + 2]) for (let y = 1; y <= 4; y++) out.push([ax, y, sz0 + 1, y === 1 ? "mossy_stonebrick" : "hedge"]);
  for (let ax = sx - 2; ax <= sx + 2; ax++) out.push([ax, 5, sz0 + 1, ax === sx ? "sea_lantern" : "gold"]);
  for (const ax of [sx - 3, sx + 3]) for (let z = sz0 + 2; z <= sz0 + 4; z++) out.push([ax, 1, z, FLOWERS[Math.floor(hash(ax, z, 79) * 4)]!]);
  backPortal(out, sx - 2, sz0 + 6, []);

  /* 북쪽 골인 지점 */
  const gx = MAZE.x0 + MAZE_EXIT.gx;
  const gz1 = MAZE.z0 - 1;
  for (let x = gx - 4; x <= gx + 4; x++)
    for (let z = gz1 - 5; z <= gz1; z++) {
      const ring = x === gx - 4 || x === gx + 4 || z === gz1 - 5;
      out.push([x, 0, z, ring ? "quartz" : (x + z) % 2 ? "gold" : "quartz"]);
      underside(out, x, z, 2 + Math.round(hash(x, z, 77) * 2));
    }
  out.push([gx + 3, 1, gz1 - 1, "beacon"], [gx - 3, 1, gz1 - 1, "lantern"], [gx + 3, 1, gz1, "lantern"]);
  // 골인 지점 양옆 축하 정원
  for (const ox of [-7, 7]) {
    for (let x = gx + ox - 1; x <= gx + ox + 1; x++)
      for (let z = gz1 - 4; z <= gz1 - 2; z++) {
        out.push([x, 0, z, "grass"]);
        underside(out, x, z, 2);
      }
    cherryTree(out, gx + ox, 1, gz1 - 3, 1);
    for (let y = 1; y <= 3; y++) out.push([gx + ox + (ox < 0 ? 3 : -3), y, gz1 - 5, "amethyst"]);
  }
  backPortal(out, gx - 2, gz1 - 5, []);
  return dedupeBlocks(out);
}
backPortal([], MAZE.x0 + MAZE_ENTRY.gx - 2, MAZE.z0 + MAZE_SIZE + 6, MAZE_BACK_CELLS);
backPortal([], MAZE.x0 + MAZE_EXIT.gx - 2, MAZE.z0 - 6, MAZE_BACK_CELLS);

/* ───────────── 보물섬 ───────────── */

const HILLS = [
  { x: -6, z: -5, r: 5.5, h: 3 },
  { x: 6, z: 4, r: 4.5, h: 2 },
  { x: 2, z: -10, r: 3, h: 1 },
];
const POND = { x: 5, z: -6, r: 2.3 };

/** 섬 기준 좌표의 지면 높이 (섬 밖이면 null) */
export function treasureGround(dx: number, dz: number): number | null {
  const d = Math.hypot(dx, dz) + hash(dx, dz, 81) * 1.4;
  if (d > TREASURE.r) return null;
  let h = 0;
  for (const hl of HILLS) {
    const t = 1 - (Math.hypot(dx - hl.x, dz - hl.z) / hl.r) ** 2;
    if (t > 0) h = Math.max(h, Math.round(hl.h * t + 0.2));
  }
  return h;
}

function buildTreasure(): { blocks: StaticBlock[]; spots: [number, number, number][] } {
  const out: StaticBlock[] = [];
  const { x: cx, z: cz, r } = TREASURE;
  const P = (dx: number, y: number, dz: number, kind: StaticKind) => out.push([cx + dx, y, cz + dz, kind]);
  const ground = new Map<string, number>();

  for (let dx = -r - 1; dx <= r + 1; dx++)
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const h = treasureGround(dx, dz);
      if (h === null) continue;
      ground.set(`${dx},${dz}`, h);
      const d = Math.hypot(dx, dz);
      const pond = Math.hypot(dx - POND.x, dz - POND.z) <= POND.r;
      const beach = d > r - 3.2 && h === 0;
      for (let y = 0; y < h; y++) P(dx, y, dz, "dirt");
      P(dx, h, dz, pond ? "water" : beach ? "sand" : "grass");
      if (pond) P(dx, -1, dz, "sand");
      const depth = 2 + Math.round((r - d) * 0.55 + hash(cx + dx, cz + dz, 82) * 2);
      for (let k = pond ? 2 : 1; k <= depth; k++) {
        const hh = hash(cx + dx, cz + dz, 83 + k);
        P(dx, -k, dz, k === 1 ? (beach ? "sandstone" : "dirt") : k >= depth - 1 && k > 3 ? "deepslate" : hh < 0.18 ? "cobble" : "stone");
      }
      if (!pond && !beach && hash(cx + dx, cz + dz, 84) < 0.14) P(dx, h + 1, dz, FLOWERS[Math.floor(hash(dx, dz, 85) * FLOWERS.length)]!);
    }
  const gy = (dx: number, dz: number) => ground.get(`${dx},${dz}`) ?? 0;

  /* 나무 */
  for (const [dx, dz] of [[-9, 3], [-2, 8], [9, -3], [3, -12], [-12, -6], [12, 2]] as const) oakTree(out, cx + dx, gy(dx, dz) + 1, cz + dz);
  cherryTree(out, cx - 6, gy(-6, -6) + 1, cz - 6, 2);
  cherryTree(out, cx + 2, gy(2, -10) + 1, cz - 10, 1);
  cherryTree(out, cx - 10, gy(-10, 9) + 1, cz + 9, 1);

  /* 무너진 유적 (가운데 (7, 9)) — 낮은 벽을 밟고 기둥 위로 올라갈 수 있다 */
  for (let dx = 5; dx <= 9; dx++)
    for (let dz = 7; dz <= 11; dz++) {
      const ring = dx === 5 || dx === 9 || dz === 7 || dz === 11;
      const base = gy(dx, dz);
      P(dx, base, dz, hash(dx, dz, 86) < 0.4 ? "mossy_stonebrick" : "stonebrick");
      if (!ring) continue;
      const corner = (dx === 5 || dx === 9) && (dz === 7 || dz === 11);
      let hgt = corner ? 3 : hash(dx, dz, 87) < 0.45 ? 0 : 1 + Math.floor(hash(dx, dz, 88) * 2);
      if (dx === 6 && dz === 7) hgt = 2;
      if (dx === 7 && dz === 7) hgt = 1;
      for (let y = 1; y <= hgt; y++) P(dx, base + y, dz, hash(dx, dz + y, 89) < 0.5 ? "mossy_stonebrick" : "cobble");
      if (corner && !(dx === 5 && dz === 7)) P(dx, base + hgt + 1, dz, "lantern");
    }

  /* 바위 */
  for (const [bx, bz] of [[11, -9], [-13, 2], [12, 6]] as const) {
    for (let ox = 0; ox <= 1; ox++)
      for (let oz = 0; oz <= 1; oz++) {
        const b = gy(bx + ox, bz + oz);
        P(bx + ox, b + 1, bz + oz, hash(bx + ox, bz + oz, 90) < 0.5 ? "cobble" : "stone");
        if (hash(bx + ox, bz + oz, 91) < 0.55) P(bx + ox, b + 2, bz + oz, "stone");
      }
  }

  /* 섬을 두른 얕은 석호 (모래 바닥이라 빠지지 않는다) */
  for (let dx = -r - 5; dx <= r + 5; dx++)
    for (let dz = -r - 5; dz <= r + 5; dz++) {
      const d = Math.hypot(dx, dz) + hash(dx, dz, 92) * 1.2;
      if (treasureGround(dx, dz) !== null || d > r + 4.6) continue;
      P(dx, 0, dz, "water");
      P(dx, -1, dz, "sand");
      for (let k = 2; k <= 2 + Math.round(hash(dx, dz, 93) * 2); k++) P(dx, -k, dz, k === 2 ? "sandstone" : "stone");
    }

  /* 해변 야자수 */
  const palm = (dx: number, dz: number, lean: number) => {
    const b = gy(dx, dz);
    for (let y = 1; y <= 5; y++) P(dx + (y >= 4 ? lean : 0), b + y, dz, "log");
    const tx = dx + lean;
    const ty = b + 6;
    P(tx, ty, dz, "leaves");
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      P(tx + ox, ty, dz + oz, "leaves");
      P(tx + ox * 2, ty - 1, dz + oz * 2, "leaves");
      P(tx + ox * 3, ty - 2, dz + oz * 3, "leaves");
    }
  };
  palm(-14, 7, 1);
  palm(14, -5, -1);
  palm(-4, -15, 1);

  /* 언덕 꼭대기 해적 깃발 */
  {
    const fx = 6;
    const fz = 4;
    const b = gy(fx, fz);
    for (let y = 1; y <= 5; y++) P(fx, b + y, fz, "post");
    for (const [ox, oy] of [[1, 5], [2, 5], [1, 4], [2, 4]] as const) P(fx + ox, b + oy, fz, oy === 5 ? "wool_red" : "wool_white");
  }

  /* 남쪽 선착장 · 돌아가는 포털 */
  for (let dz = r - 2; dz <= r + 6; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (treasureGround(dx, dz) !== null && dz < r - 1) continue;
      P(dx, 0, dz, "spruce");
      if ((dx === -1 || dx === 1) && dz % 3 === 0) for (let y = -1; y >= -3; y--) P(dx, y, dz, "log");
    }
  P(-1, 1, r + 1, "lantern");
  P(1, 1, r + 1, "lantern");
  backPortal(out, cx - 2, cz + r + 6, TREASURE_BACK_CELLS);

  const blocks = dedupeBlocks(out);

  /* 상자 자리: 지면(또는 지정 높이) 위 첫 빈칸 */
  const solid = new Set<string>();
  for (const [x, y, z, k] of blocks) if (!STATIC_MODELS[k].passable) solid.add(cellKey(x, y, z));
  const spots = TREASURE_SPOTS.map(({ dx, dz, up }) => {
    let y = gy(dx, dz) + 1 + (up ?? 0);
    while (solid.has(cellKey(cx + dx, y, cz + dz))) y++;
    return [cx + dx, y, cz + dz] as [number, number, number];
  });
  const spotCells = new Set(spots.map(([x, y, z]) => cellKey(x, y, z)));
  return { blocks: blocks.filter(([x, y, z]) => !spotCells.has(cellKey(x, y, z))), spots };
}

const TREASURE_DATA = buildTreasure();
export const TREASURE_BLOCKS = TREASURE_DATA.blocks;
/** TREASURE_SPOTS 와 같은 순서의 실제 칸 좌표 */
export const TREASURE_SPOT_CELLS = TREASURE_DATA.spots;

/* ───────────── 결투장 ───────────── */

function buildArenas(): StaticBlock[] {
  const out: StaticBlock[] = [];
  const H = ARENA_HALF;
  ARENAS.forEach((a, i) => {
    for (let dx = -H; dx <= H; dx++)
      for (let dz = -H; dz <= H; dz++) {
        const x = a.x + dx;
        const z = a.z + dz;
        const wallRing = Math.abs(dx) === H || Math.abs(dz) === H;
        let floor: StaticKind = (dx + dz) % 2 === 0 ? "smooth_stone" : "quartz";
        if (dz === 0) floor = "gold";
        if (Math.abs(dx) <= 1 && dz >= 4 && dz <= 6) floor = "wool_red";
        if (Math.abs(dx) <= 1 && dz <= -4 && dz >= -6) floor = "wool_cyan";
        const inner = Math.abs(dx) === H - 1 || Math.abs(dz) === H - 1;
        if (!wallRing && inner) floor = dz > 0 ? "wool_red" : dz < 0 ? "wool_cyan" : "gold";
        out.push([x, 0, z, wallRing ? "nether_bricks" : floor]);
        underside(out, x, z, 2 + Math.round(((H - Math.max(Math.abs(dx), Math.abs(dz))) / H) * 4 + hash(x, z, 92)));
        if (!wallRing) continue;
        const corner = Math.abs(dx) === H && Math.abs(dz) === H;
        // 아래는 네더 벽돌, 가운데는 유리, 위는 울타리 — 모서리는 등불 탑
        for (let y = 1; y <= 4; y++) out.push([x, y, z, corner ? "nether_bricks" : y === 1 ? "nether_bricks" : y === 4 ? "nb_fence" : "glass"]);
        if (corner) out.push([x, 5, z, "amethyst"], [x, 6, z, "lantern"]);
      }
    out.push([a.x, 5, a.z - H, i === 0 ? "wool_red" : i === 1 ? "gold" : "wool_cyan"]);
    // 벽 바깥 테두리 발판
    for (let dx = -H - 1; dx <= H + 1; dx++)
      for (let dz = -H - 1; dz <= H + 1; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== H + 1) continue;
        out.push([a.x + dx, 0, a.z + dz, (dx + dz) % 2 === 0 ? "quartz" : "smooth_stone"]);
        underside(out, a.x + dx, a.z + dz, 2);
      }
  });
  return dedupeBlocks(out);
}

export const ARENA_BLOCKS = buildArenas();

/* ───────────── 하늘 파쿠르 ───────────── */

/** 출발대 · 정상의 보라 포털 → 광장 */
export const PARKOUR_BACK_CELLS: [number, number, number][] = [];
/** 체크포인트 발판 칸 → 되살아날 자리 */
export const PARKOUR_CP_CELLS = new Map<string, { x: number; y: number; z: number }>();
/** 골인 발판 칸 */
export const PARKOUR_GOAL_CELLS = new Set<string>();

const STAGE_KINDS: Record<ParkourStage, StaticKind[]> = {
  garden: ["grass"],
  rainbow: ["wool_red", "wool_orange", "wool_yellow", "wool_lime", "wool_cyan", "wool_blue", "wool_purple", "wool_pink"],
  nether: ["nether_bricks", "netherrack", "nether_bricks"],
  end: ["end_stone", "purpur"],
  sky: ["quartz", "sea_lantern", "ice"],
};
const STAGE_UNDER: Partial<Record<ParkourStage, StaticKind>> = { garden: "dirt", nether: "netherrack", end: "end_stone" };

function buildParkour(): StaticBlock[] {
  const out: StaticBlock[] = [];
  const { x: ax, z: az } = PARKOUR_AREA;

  /* 발판 위 공간 · 발판 사이 점프 궤적은 장식으로 막지 않는다 */
  const clear = new Set<string>();
  const keep = (x: number, y0: number, y1: number, z: number) => {
    for (let y = y0; y <= y1; y++) clear.add(cellKey(x, y, z));
  };
  PARKOUR_STEPS.forEach((s, i) => {
    const r = parkourPadRadius(s);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) keep(s.x + dx, s.y + 1, s.y + 4, s.z + dz);
    const n = PARKOUR_STEPS[i + 1];
    if (!n) return;
    for (let t = 0; t <= 1; t += 0.05) {
      const x = Math.floor(s.x + (n.x - s.x) * t + 0.5);
      const z = Math.floor(s.z + (n.z - s.z) * t + 0.5);
      keep(x, Math.min(s.y, n.y) + 1, Math.max(s.y, n.y) + 4, z);
    }
  });
  const deco = (x: number, y: number, z: number, kind: StaticKind) => {
    if (!clear.has(cellKey(x, y, z))) out.push([x, y, z, kind]);
  };

  /* 출발대 (x -4..4, z -1..5) · 출발 아치 · 돌아가는 포털 */
  for (let dx = -4; dx <= 4; dx++)
    for (let dz = -1; dz <= 5; dz++) {
      const ring = Math.abs(dx) === 4 || dz === -1 || dz === 5;
      out.push([ax + dx, 0, az + dz, ring ? "quartz" : dx === 0 ? "andesite" : hash(dx, dz, 120) < 0.2 ? "mossy_stonebrick" : "stonebrick"]);
      underside(out, ax + dx, az + dz, 2 + Math.round((4 - Math.max(Math.abs(dx), Math.abs(dz - 2))) * 0.8 + hash(dx, dz, 121) * 1.5));
    }
  for (const dx of [-2, 2]) for (let y = 1; y <= 4; y++) out.push([ax + dx, y, az - 1, y === 4 ? "gold" : "quartz"]);
  for (let dx = -2; dx <= 2; dx++) out.push([ax + dx, 5, az - 1, dx === 0 ? "sea_lantern" : "quartz"]);
  out.push([ax - 2, 6, az - 1, "lantern"], [ax + 2, 6, az - 1, "lantern"]);
  lampPost(out, ax - 4, az + 1);
  lampPost(out, ax + 4, az + 1);
  for (const dx of [-3, 3]) out.push([ax + dx, 1, az + 3, FLOWERS[Math.floor(hash(dx, 3, 122) * 4)]!]);
  backPortal(out, ax - 2, az + 5, PARKOUR_BACK_CELLS);

  /* 발판 */
  let rainbow = 0;
  for (const s of PARKOUR_STEPS) {
    const kinds = STAGE_KINDS[s.stage];
    if (s.kind === "start") {
      out.push([s.x, s.y, s.z, "gold"]);
      continue;
    }
    if (s.kind === "slime") {
      out.push([s.x, s.y, s.z, "slime"]);
      deco(s.x, s.y - 1, s.z, "purpur");
      continue;
    }
    if (s.kind === "cp" || s.kind === "goal") {
      const r = parkourPadRadius(s);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const edge = Math.max(Math.abs(dx), Math.abs(dz)) === r;
          const center = dx === 0 && dz === 0;
          const kind: StaticKind = s.kind === "goal" ? (center ? "diamond" : edge ? "gold" : "quartz") : center ? "sea_lantern" : "gold";
          out.push([s.x + dx, s.y, s.z + dz, kind]);
          deco(s.x + dx, s.y - 1, s.z + dz, s.kind === "goal" ? "quartz" : "stonebrick");
          if (s.kind === "goal") PARKOUR_GOAL_CELLS.add(cellKey(s.x + dx, s.y, s.z + dz));
          else PARKOUR_CP_CELLS.set(cellKey(s.x + dx, s.y, s.z + dz), { x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5 });
        }
      out.push([s.x + r, s.y + 1, s.z + r, "lantern"], [s.x - r, s.y + 1, s.z - r, "lantern"]);
      continue;
    }
    const kind = s.stage === "rainbow" ? kinds[rainbow++ % kinds.length]! : kinds[Math.floor(hash(s.x, s.z, 123) * kinds.length)]!;
    out.push([s.x, s.y, s.z, kind]);
    const under = STAGE_UNDER[s.stage];
    if (under) deco(s.x, s.y - 1, s.z, under);
  }

  /* 정상: 신호기 · 꽃 · 돌아가는 포털 */
  const g = PARKOUR_GOAL;
  out.push([g.x + 2, g.y + 1, g.z - 1, "beacon"]);
  out.push([g.x - 2, g.y + 1, g.z + 1, "flower_pink"], [g.x - 1, g.y + 1, g.z + 2, "flower_yellow"], [g.x + 1, g.y + 1, g.z + 2, "flower_blue"]);
  for (let dx = -2; dx <= 2; dx++) for (let k = 2; k <= 3 + Math.round(hash(dx, 0, 124) * 2); k++) deco(g.x + dx, g.y - k, g.z, k === 2 ? "quartz" : "amethyst");
  backPortal(out, g.x - 2, g.z - 3, PARKOUR_BACK_CELLS, g.y);

  /* 무지개 탑 기둥 (2단계 나선 가운데) */
  const cp2 = PARKOUR_STEPS.find((s) => s.kind === "cp" && s.stage === "rainbow")!;
  for (let y = -3; y < cp2.y - 1; y++) deco(cp2.x, y, cp2.z, y % 4 === 1 ? "sea_lantern" : "quartz");

  /* 장식 섬 · 기둥 */
  const isle = (cx: number, cy: number, cz: number, r: number, tree: "cherry" | "oak" | "none", top: StaticKind = "grass") => {
    for (let dx = -r - 1; dx <= r + 1; dx++)
      for (let dz = -r - 1; dz <= r + 1; dz++) {
        const d = Math.hypot(dx, dz) + hash(cx + dx, cz + dz, 125) * 0.6;
        if (d > r + 0.5) continue;
        deco(cx + dx, cy, cz + dz, top);
        const depth = Math.round((r + 0.8 - d) * 1.3 + hash(cx + dx, cz + dz, 126) * 1.5);
        for (let k = 1; k <= depth; k++) deco(cx + dx, cy - k, cz + dz, k === 1 && top === "grass" ? "dirt" : hash(cx + dx, cz + dz, k + 127) < 0.25 ? "cobble" : "stone");
        if (top === "grass" && d > 1.2 && hash(cx + dx, cz + dz, 128) < 0.3) deco(cx + dx, cy + 1, cz + dz, FLOWERS[Math.floor(hash(cx + dx, cz + dz, 129) * FLOWERS.length)]!);
      }
    if (tree === "cherry") cherryTree(out, cx, cy + 1, cz, r >= 3 ? 2 : 1);
    if (tree === "oak") oakTree(out, cx, cy + 1, cz);
  };
  isle(ax - 10, -2, az - 9, 3, "cherry");
  isle(ax + 10, -1, az - 5, 2, "oak");
  isle(ax - 9, 6, az - 24, 2, "cherry");
  isle(ax + 26, 10, az - 20, 2, "none", "netherrack");
  isle(ax + 4, 16, az - 34, 2, "none", "end_stone");
  isle(ax + 24, 22, az - 48, 2, "oak");
  for (let k = 0; k <= 7; k++) deco(ax - 7, -2 - k, az - 9, "waterfall");

  /* 네더 구간 아래 요새 다리 */
  for (let x = ax + 5; x <= ax + 18; x++) {
    deco(x, 8, az - 29, "nether_bricks");
    if ((x - ax) % 3 === 0) for (let y = 3; y < 8; y++) deco(x, y, az - 29, "nb_fence");
    if ((x - ax) % 4 === 1) deco(x, 9, az - 29, "lantern");
  }

  /* 엔드 구간 자수정 기둥 */
  for (const [dx, dz, top] of [[8, -34, 16], [21, -36, 19], [14, -44, 18], [20, -30, 13]] as const) {
    for (let y = top - 8; y <= top; y++) deco(ax + dx, y, az + dz, y === top ? "amethyst" : "purpur");
    deco(ax + dx, top + 1, az + dz, "lantern");
  }

  return dedupeBlocks(out);
}

export const PARKOUR_BLOCKS = buildParkour();

/* ───────────── 계정 시장 ───────────── */

export const MARKET_BACK_CELLS: [number, number, number][] = [];

const AWNINGS: StaticKind[] = ["awn_red", "awn_cyan", "awn_yellow", "awn_lime", "awn_orange", "awn_blue", "awn_pink", "awn_white"];
const STALL_BACKS: StaticKind[] = ["bricks", "spruce", "planks", "stonebrick", "quartz", "bricks", "cherry_log", "andesite"];
/** 북쪽 끝 칸막이 */
const MARKET_ZN = MARKET_Z0 - MARKET_PER_SIDE * MARKET_PITCH;
/** 시장 섬 남쪽 · 북쪽 끝 */
const MARKET_ZS = MARKET_Z0 + 10;
const MARKET_ZE = MARKET_ZN - 9;
/** 입구 아치 (간판이 걸리는 z) */
const MARKET_GATE_Z = MARKET_Z0 + 3;
/** 광장 귀환 아치 가운데 (골목 중심에서 동쪽으로) */
const MARKET_BACK_X = 7;

/**
 * 새마을시장 같은 아케이드 골목: 가운데 5칸 길 위로 유리 지붕, 양옆에 칸막이로 나뉜 점포가 줄지어 있다.
 * 점포 = 나무 바닥 · 반 칸 진열대 · 색색 차양 · 위쪽 간판 자리 · 안쪽 선반, 마네킹은 엔진이 계정 스킨으로 세운다.
 */
function buildMarket(): StaticBlock[] {
  const out: StaticBlock[] = [];
  const mx = MARKET.x;
  const put = (dx: number, y: number, z: number, kind: StaticKind) => out.push([mx + dx, y, z, kind]);
  /** 골목에서 d 칸 떨어진 점포 쪽 x (서쪽 = 음수) */
  const sx = (side: -1 | 1, d: number) => (side < 0 ? -d : d);

  /* 바닥 */
  for (let dx = -10; dx <= 10; dx++)
    for (let z = MARKET_ZE; z <= MARKET_ZS; z++) {
      const ox = Math.abs(dx - 0.5);
      const oz = Math.min(z - MARKET_ZE, MARKET_ZS - z);
      if (ox > 9 && oz < 2) continue;
      const x = mx + dx;
      const street = Math.abs(dx) <= 2;
      const stalls = z >= MARKET_ZN && z <= MARKET_Z0 && ox >= 3 && ox <= 8.5;
      let kind: StaticKind;
      if (stalls) kind = "spruce";
      else if (ox > 8.5) kind = "grass";
      else if (street && (dx === -2 || dx === 2)) kind = "deepslate_tiles";
      else if (street || z > MARKET_Z0 || z < MARKET_ZN) kind = (z % 3 === 0 ? "andesite" : "smooth_stone");
      else kind = "smooth_stone";
      out.push([x, 0, z, kind]);
      underside(out, x, z, 2 + Math.floor(hash(x, z, 77) * 3) + (ox < 6 ? 2 : 0));
      if (kind === "grass") {
        const h = hash(x, z, 78);
        if (h < 0.18) out.push([x, 1, z, FLOWERS[Math.floor(hash(x, z, 79) * FLOWERS.length)]!]);
        else if (h < 0.26) out.push([x, 1, z, "leaves"]);
        else if (h < 0.4) out.push([x, 1, z, "tall_grass"]);
      }
    }

  /* 점포 줄 */
  for (const side of [-1, 1] as const) {
    // 칸막이 (앞 기둥은 가문비 · 나머지는 흰 벽)
    for (let k = 0; k <= MARKET_PER_SIDE; k++) {
      const zw = MARKET_Z0 - k * MARKET_PITCH;
      for (let d = 3; d <= 8; d++) for (let y = 1; y <= 5; y++) put(sx(side, d), y, zw, d === 3 ? "spruce" : y === 1 ? "stonebrick" : "wool_white");
    }
    for (let k = 0; k < MARKET_PER_SIDE; k++) {
      const i = k * 2 + (side < 0 ? 0 : 1);
      const zw = MARKET_Z0 - k * MARKET_PITCH;
      const back = STALL_BACKS[i % STALL_BACKS.length]!;
      const awn = AWNINGS[i % AWNINGS.length]!;
      for (let z = zw - 4; z <= zw - 1; z++) {
        for (let y = 1; y <= 5; y++) put(sx(side, 8), y, z, back);
        put(sx(side, 3), 1, z, "spruce_slab");
        put(sx(side, 3), 4, z, awn);
        put(sx(side, 2), 4, z, awn);
        put(sx(side, 3), 5, z, "spruce");
      }
      // 안쪽 선반 · 상자
      put(sx(side, 7), 1, zw - 4, "bookshelf");
      put(sx(side, 7), 2, zw - 4, "bookshelf");
      put(sx(side, 7), 1, zw - 1, i % 3 === 0 ? "crafting" : "chest");
      put(sx(side, 7), 1, zw - 2, "chest");
      put(sx(side, 6), 5, zw - 2, "lantern");
    }
    // 점포 지붕 + 처마 줄
    for (let z = MARKET_ZN; z <= MARKET_Z0; z++) {
      for (let d = 3; d <= 8; d++) put(sx(side, d), 6, z, "deepslate_tiles");
      put(sx(side, 3), 7, z, "spruce");
    }
  }

  /* 골목 아케이드 지붕: 칸막이마다 가문비 들보, 사이는 유리 */
  for (let z = MARKET_ZN; z <= MARKET_Z0; z++) {
    const beam = (MARKET_Z0 - z) % MARKET_PITCH === 0;
    for (const dx of [-2, 2]) put(dx, 7, z, beam ? "spruce" : "glass");
    for (let dx = -1; dx <= 1; dx++) put(dx, 8, z, beam ? "spruce" : "glass");
    if (beam) {
      for (let dx = -2; dx <= 2; dx++) put(dx, 6, z, "spruce");
      put(0, 5, z, "lantern");
      put(-1, 5, z, "banner");
      put(1, 5, z, "banner");
    }
  }

  /* 입구 아치: 파란 기둥 · 빨강/파랑 상인방 (간판은 엔진이 건다) */
  for (const dx of [-4, 4]) {
    put(dx, 1, MARKET_GATE_Z, "deepslate_tiles");
    for (let y = 2; y <= 6; y++) put(dx, y, MARKET_GATE_Z, "wool_blue");
    put(dx, 8, MARKET_GATE_Z, "lantern");
  }
  for (let dx = -4; dx <= 4; dx++) put(dx, 7, MARKET_GATE_Z, Math.abs(dx) === 4 ? "wool_red" : "wool_blue");
  // 입구 앞 화단 (서쪽) · 광장 귀환 아치 (동쪽 — 도착 지점 뒤에 두면 3인칭 카메라를 가린다)
  for (const dx of [-8, -7, -6])
    for (const z of [MARKET_Z0 + 6, MARKET_Z0 + 7]) {
      put(dx, 1, z, "spruce_slab");
      if (hash(mx + dx, z, 81) < 0.7) put(dx, 2, z, FLOWERS[Math.floor(hash(mx + dx, z, 82) * FLOWERS.length)]!);
    }
  for (const dx of [-4, 4]) lampPost(out, mx + dx, MARKET_Z0 + 9);
  backPortal(out, mx + MARKET_BACK_X - 2, MARKET_Z0 + 7, MARKET_BACK_CELLS);

  /* 북쪽 끝 쉼터: 분수 · 벤치 · 안내 벽 */
  const fz = MARKET_ZN - 4;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
      if (ring) put(dx, 1, fz + dz, "stone_slab");
      else put(dx, 0, fz + dz, "water");
    }
  put(0, 1, fz, "sea_lantern");
  put(0, 2, fz, "waterfall");
  for (const dx of [-5, 5]) for (const dz of [-1, 0, 1]) put(dx, 1, fz + dz, "spruce_slab");
  for (let dx = -4; dx <= 4; dx++) for (let y = 1; y <= 4; y++) put(dx, y, MARKET_ZE + 1, y === 4 ? "spruce" : "bricks");
  for (const dx of [-4, 4]) put(dx, 5, MARKET_ZE + 1, "lantern");

  return dedupeBlocks(out);
}

export const MARKET_BLOCKS = buildMarket();

/** 시장 간판 — 점포 간판(stall-i)은 계정이 들어오면 엔진이 글씨를 바꾼다 */
export const MARKET_BOARDS: PlazaBoard[] = [
  { key: "market-gate", kind: "wood", x: MARKET.x + 0.5, y: 7.02, z: MARKET_GATE_Z + 1.03, w: 7.6, h: 1.0, yaw: 0, text: "DOES 계정시장", sub: "점포 앞에 서면 계정 정보가 떠요 · E 로 크게 보기", color: "#ffd34d" },
  { key: "market-end", kind: "wood", x: MARKET.x + 0.5, y: 2.2, z: MARKET_ZE + 2.03, w: 7, h: 1.4, yaw: 0, text: "더 많은 계정은 상점에서", sub: "골목 입구 빛나는 발판 → 메인 광장", color: "#9ff6ff" },
  ...MARKET_STALL_LIST.map(
    (s): PlazaBoard => ({
      key: `stall-${s.i}`,
      kind: "wood",
      x: s.side < 0 ? MARKET.x - 1.97 : MARKET.x + 2.97,
      y: 5.02,
      z: s.cz,
      w: 3.6,
      h: 0.95,
      yaw: s.side < 0 ? Math.PI / 2 : -Math.PI / 2,
      text: "빈 점포",
      sub: "곧 새 계정이 들어와요",
      color: "#c9c2b8",
    }),
  ),
];

/* ───────────── 떠 있는 안내판 ───────────── */

/** cta = 아래에 "클릭해서 이동" 띠가 붙는 안내판 */
export type GameLabel = { x: number; y: number; z: number; title: string; sub: string; color: string; cta?: boolean };

export const GAME_LABELS: GameLabel[] = [
  { x: MAZE.x0 + MAZE_ENTRY.gx + 0.5, y: 6.6, z: MAZE.z0 + MAZE_SIZE + 1.5, title: "출발", sub: "입구로 들어가면 시간이 흘러요", color: "#7cf28f" },
  { x: MAZE.x0 + MAZE_EXIT.gx + 0.5, y: 4.2, z: MAZE.z0 - 1.5, title: "탈출 성공!", sub: "빛나는 발판 → 광장", color: "#ffd34d" },
  { x: TREASURE.x + 0.5, y: 4, z: TREASURE.z + TREASURE.r + 2.5, title: "보물섬", sub: "탐지기가 뜨거워지는 쪽으로!", color: "#ffd34d" },
  { x: PARKOUR_AREA.x + 0.5, y: 7.6, z: PARKOUR_AREA.z - 0.5, title: "하늘 파쿠르", sub: "금 발판을 밟으면 시작 · 체크포인트 자동 저장", color: "#6fe3ff" },
  ...PARKOUR_STEPS.filter((s) => s.kind === "cp").map((s, i): GameLabel => {
    const next: [string, string, string][] = [
      ["STAGE 2 · 무지개 탑", "나선을 따라 올라가요", "#ff8ad8"],
      ["STAGE 3 · 네더 요새", "아래를 보지 마세요", "#ff7a6b"],
      ["STAGE 4 · 디 엔드", "슬라임 위에서 점프하면 높이 튀어요", "#c9a6ff"],
      ["STAGE 5 · 구름 위", "정상의 신호기가 보여요!", "#9ff6ff"],
    ];
    const [title, sub, color] = next[i] ?? ["체크포인트", "", "#ffd34d"];
    return { x: s.x + 0.5, y: s.y + 4.2, z: s.z + 0.5, title, sub, color };
  }),
  { x: PARKOUR_GOAL.x + 0.5, y: PARKOUR_GOAL.y + 5.2, z: PARKOUR_GOAL.z + 0.5, title: "정상 도착!", sub: "빛나는 발판 → 광장", color: "#ffd34d" },
  { x: MARKET.x + MARKET_BACK_X + 0.5, y: 6.4, z: MARKET_Z0 + 7.5, title: "광장으로", sub: "빛나는 발판을 밟으면 돌아가요", color: "#9ff6ff" },
];
