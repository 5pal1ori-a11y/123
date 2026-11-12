import { ARRIVAL, BUILD, cellKey, dedupeBlocks, HUB, inBuildArea, ISLAND_WARP, STATIC_CELLS, type SignFacing, type StaticBlock, type StaticKind } from "@/lib/island/world";
import { DUEL_BOARD, padCells, SPOTS, type SpotKey, type WarpSpot } from "./games";

/**
 * 메인 광장 — 반지름 24칸 원형 광장. 섬들과 멀리 떨어진 하늘에 떠 있다 (안개 너머라 서로 안 보인다).
 *
 *                       DOES MC (공중 글자)
 *                  미로   [ 야생 ]   파쿠르
 *          출석 광산                     광산 레이스
 *     판매 계정          ◆ 3단 분수 ◆           보물찾기
 *          상점                             1:1 결투
 *               재고현황        후기 광장
 *          제작대 노점     스폰     미션 노점
 *                       [ 내 섬 ]
 *
 * 정자마다 가운데 빛나는 발판이 있다 — 밟고 있거나 정자를 클릭하면 이동한다.
 */
export const PLAZA = { x: 400, z: 0, half: 24 };
/** 원형 광장 반지름 (울타리 포함) */
const R = PLAZA.half;

/** 내 섬 정자 바로 앞 — 광장 중심을 바라보며 선다. worker/world-room.ts 의 SAFE 와 맞춰야 한다 */
export const PLAZA_SPAWN = { x: PLAZA.x + 0.5, y: 1, z: PLAZA.z + 14.5, yaw: 0 };

export function inPlaza(x: number) {
  return x > PLAZA.x - 120;
}

export type PlazaSign = { x: number; y: number; z: number; facing: SignFacing; lines: string[] };

export type Interactable = { kind: "crafting" | "mission" | "attend" | "duel"; x: number; y: number; z: number; label: string };

/** 스폰 뒤 내 섬 정자 (광장 중심을 바라본다) */
export const HOME_SPOT: WarpSpot = { x: PLAZA.x, z: PLAZA.z + 21, half: 2, yaw: 0 };

/** 정자 발판 → 상점 · 판매 계정 · 내 섬 */
export const SHOP_PORTAL_CELLS = padCells(SPOTS.shop);
export const END_PORTAL_CELLS = padCells(SPOTS.accounts);
export const HOME_PORTAL_CELLS = padCells(HOME_SPOT);

/** 노점 중심 (광장 중심 기준) — 스폰 양옆 앞마당 */
const CRAFT_STALL = { dx: -10, dz: 16 };
const MISSION_STALL = { dx: 10, dz: 16 };

/** 미션 주민: 독서대 뒤(광장 바깥쪽)에 서서 광장 중심을 본다 */
export const MISSION_NPC = (() => {
  const d = Math.hypot(MISSION_STALL.dx, MISSION_STALL.dz);
  const ux = MISSION_STALL.dx / d;
  const uz = MISSION_STALL.dz / d;
  return { x: PLAZA.x + MISSION_STALL.dx + 0.5 + ux * 1.1, y: 1, z: PLAZA.z + MISSION_STALL.dz + 0.5 + uz * 1.1, yaw: Math.atan2(-ux, -uz) };
})();

/** 출석 광산 정자 가운데의 다이아 원석 */
export const ATTEND_ORE = { x: SPOTS.attend.x, y: 1, z: SPOTS.attend.z };

export const INTERACTABLES: Interactable[] = [
  { kind: "crafting", x: PLAZA.x + CRAFT_STALL.dx, y: 1, z: PLAZA.z + CRAFT_STALL.dz, label: "제작대" },
  { kind: "mission", x: PLAZA.x + MISSION_STALL.dx, y: 1, z: PLAZA.z + MISSION_STALL.dz, label: "일일 미션" },
  { kind: "attend", x: ATTEND_ORE.x, y: ATTEND_ORE.y, z: ATTEND_ORE.z, label: "출석 광산" },
  { kind: "duel", x: DUEL_BOARD.x, y: DUEL_BOARD.y, z: DUEL_BOARD.z, label: "1:1 결투" },
  { kind: "duel", x: DUEL_BOARD.x, y: DUEL_BOARD.y + 1, z: DUEL_BOARD.z, label: "1:1 결투" },
];

export const PLAZA_SIGNS: PlazaSign[] = [
  { x: PLAZA.x - 2, y: 1, z: PLAZA.z + 12, facing: "+z", lines: ["정자 발판을 밟거나", "클릭하면 바로 이동!"] },
  { x: PLAZA.x + 3, y: 1, z: PLAZA.z + 12, facing: "+z", lines: ["가운데 분수", "모두의 만남의 장소"] },
];

/**
 * 광장 간판 — 블록이 아니라 판(메시)으로 그린다.
 *  - wood: 짙은 나무 판 + 분홍 글씨 (예: "후기 광장")
 *  - stock: 실시간 재고현황 종이 카드 (/api/products)
 *  - reviews: 최근 후기 종이 카드 (/api/reviews/feed)
 * (x, z) 는 판 가운데, y 는 판 아래 끝, w·h 는 블록 단위, yaw 0 = 앞면이 +z 를 본다.
 */
export type PlazaBoard = {
  key: string;
  kind: "wood" | "stock" | "reviews";
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw: number;
  text?: string;
  sub?: string;
  color?: string;
};

/** 스폰 앞 양옆의 두 게시판 (기둥 칸: 가운데 ±2) */
const STOCK_BOARD = { dx: -6, dz: 10 };
const REVIEW_BOARD = { dx: 6, dz: 10 };

/** 정자 모양 · 재료 */
type Theme = {
  title: string;
  sub: string;
  color: string;
  floor: StaticKind;
  rim: StaticKind;
  post: StaticKind;
  roof: StaticKind;
  roofEdge: StaticKind;
  /** 지붕 네 모서리 위 (하나면 모두 같게) */
  caps: StaticKind[];
  /** 가운데 3×3 발판 — 없으면 center 블록 */
  pad?: StaticKind;
  center?: StaticKind[];
  /** 지붕 아래 가운데 등불 */
  lamp?: boolean;
};

const THEMES: Record<SpotKey | "home", Theme> = {
  shop: {
    title: "상점",
    sub: "상품 둘러보고 구매하기",
    color: "#c9a6ff",
    floor: "quartz",
    rim: "gold",
    post: "quartz",
    roof: "wool_purple",
    roofEdge: "amethyst",
    caps: ["gold"],
    pad: "pad_purple",
    lamp: true,
  },
  accounts: {
    title: "계정시장",
    sub: "점포 골목에서 계정 구경",
    color: "#ff9b7a",
    floor: "spruce",
    rim: "bricks",
    post: "spruce",
    roof: "wool_red",
    roofEdge: "wool_white",
    caps: ["lantern"],
    pad: "pad_red",
    lamp: true,
  },
  attend: {
    title: "출석 광산",
    sub: "하루 한 번 다이아 캐기",
    color: "#9fe8ff",
    floor: "deepslate_tiles",
    rim: "cobble",
    post: "mossy_stonebrick",
    roof: "stone",
    roofEdge: "deepslate",
    caps: ["amethyst"],
    center: ["diamond_ore"],
  },
  maze: {
    title: "미로 탈출",
    sub: "매일 자정에 길이 바뀌어요",
    color: "#7cf28f",
    floor: "mossy_stonebrick",
    rim: "hedge",
    post: "hedge",
    roof: "hedge",
    roofEdge: "hedge",
    caps: ["lantern"],
    pad: "pad_green",
    lamp: true,
  },
  wild: {
    title: "야생",
    sub: "모두 함께하는 서바이벌",
    color: "#b5f07a",
    floor: "grass",
    rim: "mossy_stonebrick",
    post: "log",
    roof: "leaves",
    roofEdge: "leaves",
    caps: ["leaves"],
    pad: "pad_lime",
    lamp: true,
  },
  parkour: {
    title: "하늘 파쿠르",
    sub: "정상까지 완주하면 쿠폰!",
    color: "#6fe3ff",
    floor: "quartz",
    rim: "wool_cyan",
    post: "quartz",
    roof: "wool_cyan",
    roofEdge: "quartz",
    caps: ["sea_lantern"],
    pad: "pad_cyan",
    lamp: true,
  },
  mine: {
    title: "광산 레이스",
    sub: "오늘의 광물 1등 = 5토큰",
    color: "#ffb36b",
    floor: "stone",
    rim: "cobble",
    post: "log",
    roof: "spruce",
    roofEdge: "spruce",
    caps: ["diamond_ore", "gold", "iron_block", "emerald"],
    pad: "pad_orange",
    lamp: true,
  },
  treasure: {
    title: "보물찾기",
    sub: "보물섬의 상자 5개를 찾아라",
    color: "#ffd34d",
    floor: "sand",
    rim: "sandstone",
    post: "sandstone",
    roof: "wool_yellow",
    roofEdge: "sandstone",
    caps: ["gold"],
    pad: "pad_gold",
    lamp: true,
  },
  duel: {
    title: "1:1 결투",
    sub: "과녁 클릭 → 매칭",
    color: "#ff9f8f",
    floor: "stonebrick",
    rim: "bricks",
    post: "bricks",
    roof: "wool_red",
    roofEdge: "bricks",
    caps: ["lantern"],
    center: ["target", "target"],
  },
  home: {
    title: "내 섬으로",
    sub: "발판을 밟으면 출발",
    color: "#ffb3e0",
    floor: "quartz",
    rim: "deepslate_tiles",
    post: "cherry_log",
    roof: "wool_pink",
    roofEdge: "cherry_leaves",
    caps: ["lantern"],
    pad: "pad_pink",
    lamp: true,
  },
};

/** 지붕 높이 (판 아래 끝) — 야생은 잎 지붕이 한 단 더 높다 */
const roofTop = (key: SpotKey | "home") => (key === "wild" ? 6.02 : 5.02);

const PAVILIONS: [SpotKey | "home", WarpSpot][] = [...(Object.entries(SPOTS) as [SpotKey, WarpSpot][]), ["home", HOME_SPOT]];

export const PLAZA_BOARDS: PlazaBoard[] = [
  { key: "stock", kind: "stock", x: PLAZA.x + STOCK_BOARD.dx + 0.5, y: 1.85, z: PLAZA.z + STOCK_BOARD.dz + 0.5, w: 4, h: 3, yaw: 0 },
  { key: "stock-title", kind: "wood", x: PLAZA.x + STOCK_BOARD.dx + 0.5, y: 4.95, z: PLAZA.z + STOCK_BOARD.dz + 0.5, w: 4.8, h: 1.05, yaw: 0, text: "재고현황", sub: "실시간 재고 · 가격" },
  { key: "reviews", kind: "reviews", x: PLAZA.x + REVIEW_BOARD.dx + 0.5, y: 1.85, z: PLAZA.z + REVIEW_BOARD.dz + 0.5, w: 4, h: 3, yaw: 0 },
  { key: "reviews-title", kind: "wood", x: PLAZA.x + REVIEW_BOARD.dx + 0.5, y: 4.95, z: PLAZA.z + REVIEW_BOARD.dz + 0.5, w: 4.8, h: 1.05, yaw: 0, text: "후기 광장", sub: "구매하신 분들의 이야기" },
  // 정자 지붕 위에 서서 광장 중심을 보는 간판
  ...PAVILIONS.map(([key, s]): PlazaBoard => {
    const t = THEMES[key];
    const z = key === "home" ? s.z + s.half - 0.03 : s.z + 0.5;
    return { key: `pav-${key}`, kind: "wood", x: s.x + 0.5, y: roofTop(key), z, w: 3.6, h: 0.95, yaw: s.yaw + Math.PI, text: t.title, sub: t.sub, color: t.color };
  }),
  // 노점 차양 위
  ...[
    { key: "craft", s: CRAFT_STALL, text: "제작대", sub: "토큰 → 상품 교환", color: "#ffd479" },
    { key: "mission", s: MISSION_STALL, text: "일일 미션", sub: "클리어 → 토큰", color: "#8ff0e4" },
  ].map(({ key, s, text, sub, color }): PlazaBoard => ({
    key,
    kind: "wood",
    x: PLAZA.x + s.dx + 0.5,
    y: 3.32,
    z: PLAZA.z + s.dz + 0.5,
    w: 3.4,
    h: 0.9,
    yaw: Math.atan2(-s.dx, -s.dz),
    text,
    sub,
    color,
  })),
];

/** 섬 도착 정원 간판 (도리이 · 워프 정자) */
export const ISLAND_BOARDS: PlazaBoard[] = [
  { key: "torii", kind: "wood", x: 0.5, y: 5.05, z: 13.03, w: 3.6, h: 0.9, yaw: 0, text: "어서 오세요", sub: "하늘섬 도착 정원", color: "#ffb3e0" },
  { key: "island-warp", kind: "wood", x: ISLAND_WARP.x - 2 - 0.03, y: 4.02, z: ISLAND_WARP.z + 0.5, w: 4.4, h: 0.95, yaw: -Math.PI / 2, text: "메인 광장", sub: "발판을 밟으면 이동", color: "#8ff0e4" },
];

/** 좌표마다 고정된 의사 난수 (0~1) */
export function hash(x: number, z: number, salt = 0) {
  let h = (x * 374761393 + z * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 5줄 픽셀 글꼴 (# = 블록) */
const GLYPHS: Record<string, string[]> = {
  D: ["###.", "#..#", "#..#", "#..#", "###."],
  O: [".##.", "#..#", "#..#", "#..#", ".##."],
  E: ["###", "#..", "##.", "#..", "###"],
  S: [".##", "#..", ".#.", "..#", "##."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  C: [".##", "#..", "#..", "#..", ".##"],
  " ": ["..", "..", "..", "..", ".."],
};

/** 북쪽 하늘에 뜬 글자 — 석영 받침 · 자수정 점 · 아래로 늘어진 깃발 */
function buildLetters(out: StaticBlock[], text: string, z: number, baseY: number) {
  const widths = [...text].map((ch) => GLYPHS[ch]![0]!.length);
  const total = widths.reduce((s, w) => s + w, 0) + (text.length - 1);
  const left = PLAZA.x - Math.floor(total / 2);
  let x = left;
  [...text].forEach((ch, i) => {
    const glyph = GLYPHS[ch]!;
    const kind = i < 4 ? "gold" : "diamond";
    glyph.forEach((row, r) => {
      [...row].forEach((c, dx) => {
        if (c === "#") out.push([x + dx, baseY + (glyph.length - 1 - r), z, kind]);
      });
    });
    x += widths[i]! + 1;
  });
  for (let lx = left - 1; lx <= left + total; lx++) {
    out.push([lx, baseY - 1, z, (lx - left) % 4 === 0 ? "amethyst" : "quartz"]);
    if ((lx - left) % 4 === 2) out.push([lx, baseY - 1, z + 1, "banner"]);
  }
}

export function oakTree(out: StaticBlock[], x: number, y: number, z: number) {
  for (let i = 0; i < 4; i++) out.push([x, y + i, z, "log"]);
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 3; dy <= 4; dy++) {
        if (dx === 0 && dz === 0 && dy === 3) continue;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        out.push([x + dx, y + dy, z + dz, "leaves"]);
      }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push([x + dx, y + 5, z + dz, "leaves"]);
}

/** 분홍 잎이 늘어진 벚나무 */
export function cherryTree(out: StaticBlock[], x: number, y: number, z: number, size: 1 | 2 = 2) {
  const h = size === 2 ? 5 : 3;
  const R = size === 2 ? 3 : 2;
  for (let i = 0; i < h; i++) out.push([x, y + i, z, "cherry_log"]);
  if (size === 2) {
    out.push([x + 1, y + h - 1, z, "cherry_log"], [x - 1, y + h - 2, z + 1, "cherry_log"]);
  }
  const top = y + h;
  for (let dx = -R; dx <= R; dx++)
    for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz);
      for (let dy = -1; dy <= 1; dy++) {
        const r = R + 0.4 - Math.abs(dy) * (dy > 0 ? 1.1 : 0.5);
        if (d > r) continue;
        if (dx === 0 && dz === 0 && dy < 0) continue;
        out.push([x + dx, top + dy, z + dz, "cherry_leaves"]);
      }
      if (d > R - 1.2 && d <= R + 0.4 && hash(x + dx, z + dz, 7) < 0.45) {
        out.push([x + dx, top - 2, z + dz, "cherry_leaves"]);
        if (hash(x + dx, z + dz, 9) < 0.35) out.push([x + dx, top - 3, z + dz, "cherry_leaves"]);
      }
    }
}

export const FLOWERS: StaticKind[] = ["flower_red", "flower_yellow", "flower_blue", "flower_pink", "tall_grass", "tall_grass"];

export function lampPost(out: StaticBlock[], x: number, z: number, y = 1) {
  out.push([x, y, z, "post"], [x, y + 1, z, "post"], [x, y + 2, z, "lantern"]);
}

/** 하늘에 떠 있는 작은 섬 (장식) */
function miniIsland(
  out: StaticBlock[],
  cx: number,
  cy: number,
  cz: number,
  r: number,
  deco: "cherry" | "oak" | "flowers" | "amethyst" | "pond",
) {
  for (let dx = -r - 1; dx <= r + 1; dx++)
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.hypot(dx, dz) + hash(cx + dx, cz + dz, 3) * 0.6;
      if (d > r + 0.5) continue;
      const x = cx + dx;
      const z = cz + dz;
      out.push([x, cy, z, "grass"]);
      const depth = Math.round((r + 0.8 - d) * 1.4 + hash(x, z, 5) * 1.5);
      for (let k = 1; k <= depth; k++) out.push([x, cy - k, z, k === 1 ? "dirt" : hash(x, z, k) < 0.25 ? "cobble" : "stone"]);
      if (deco !== "amethyst" && hash(x, z, 11) < 0.32 && d > 1.2) out.push([x, cy + 1, z, FLOWERS[Math.floor(hash(x, z, 13) * FLOWERS.length)]!]);
    }
  if (deco === "cherry") cherryTree(out, cx, cy + 1, cz, r >= 3 ? 2 : 1);
  if (deco === "oak") oakTree(out, cx, cy + 1, cz);
  if (deco === "amethyst") {
    out.push([cx, cy + 1, cz, "amethyst"], [cx, cy + 2, cz, "amethyst"], [cx + 1, cy + 1, cz, "amethyst"], [cx, cy + 1, cz - 1, "amethyst"]);
  }
  if (deco === "pond") {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]] as const) out.push([cx + dx, cy, cz + dz, "water"]);
    out.push([cx + r, cy, cz, "waterfall"]);
    for (let k = 1; k <= 5; k++) out.push([cx + r + 1, cy - k, cz, "waterfall"]);
  }
}

/** 내 섬 발판: 스폰 바로 뒤라 3인칭 카메라를 가리지 않게 지붕 없이 뒤쪽 아치만 세운다 */
function homeGate(out: StaticBlock[], s: WarpSpot, t: Theme) {
  const h = s.half;
  for (let dx = -h; dx <= h; dx++)
    for (let dz = -h; dz <= h; dz++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      out.push([s.x + dx, 0, s.z + dz, edge === h ? t.rim : t.floor]);
      if (edge <= 1 && t.pad) out.push([s.x + dx, 1, s.z + dz, t.pad]);
    }
  const back = s.z + h;
  for (const dx of [-h, h]) {
    for (let y = 1; y <= 4; y++) out.push([s.x + dx, y, back, t.post]);
    out.push([s.x + dx, 6, back, "lantern"], [s.x + dx, 1, s.z - h, "lantern"]);
  }
  for (let dx = -h; dx <= h; dx++) out.push([s.x + dx, 5, back, Math.abs(dx) === h ? t.roofEdge : t.roof]);
  for (const dx of [-h - 1, h + 1]) out.push([s.x + dx, 4, back, t.roofEdge]);
}

/** 정자: 바닥 · 네 기둥 · 지붕 · 모서리 장식 · 가운데 발판(또는 과녁 · 원석) */
function pavilion(out: StaticBlock[], s: WarpSpot, t: Theme, key: SpotKey | "home") {
  if (key === "home") return homeGate(out, s, t);
  const h = s.half;
  for (let dx = -h; dx <= h; dx++)
    for (let dz = -h; dz <= h; dz++) {
      const x = s.x + dx;
      const z = s.z + dz;
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      out.push([x, 0, z, edge === h ? t.rim : t.floor]);
      if (edge <= 1 && t.pad) out.push([x, 1, z, t.pad]);
      const corner = Math.abs(dx) === h && Math.abs(dz) === h;
      if (key === "wild") {
        // 큰 나무 지붕: 둥글게 두 단
        if (Math.hypot(dx, dz) <= h + 0.6) out.push([x, 4, z, "leaves"]);
        if (Math.hypot(dx, dz) <= h - 0.6) out.push([x, 5, z, "leaves"]);
        if (edge === h && !corner && hash(x, z, 31) < 0.5) out.push([x, 1, z, FLOWERS[Math.floor(hash(x, z, 32) * 4)]!]);
      } else {
        out.push([x, 4, z, edge === h ? t.roofEdge : t.roof]);
      }
    }
  [[-h, -h], [h, -h], [-h, h], [h, h]].forEach(([dx, dz], i) => {
    for (let y = 1; y <= 3; y++) out.push([s.x + dx!, y, s.z + dz!, t.post]);
    if (key !== "wild") out.push([s.x + dx!, 5, s.z + dz!, t.caps[i % t.caps.length]!]);
  });
  if (t.center) t.center.forEach((kind, i) => out.push([s.x, 1 + i, s.z, kind]));
  if (t.lamp) out.push([s.x, 3, s.z, "lantern"]);

  if (key === "parkour") {
    // 지붕 위로 둥둥 뜬 파쿠르 발판
    for (const [dx, y, dz, kind] of [[h + 1, 6, h, "slime"], [h, 7, -h - 1, "quartz"], [-h - 1, 8, -h, "slime"], [-h, 9, h + 1, "sea_lantern"]] as const) {
      out.push([s.x + dx, y, s.z + dz, kind]);
    }
  }
  if (key === "treasure") {
    for (const [dx, dz] of [[h + 1, h], [-h - 1, -h]] as const) out.push([s.x + dx, 1, s.z + dz, "chest"]);
  }
  if (key === "mine") {
    for (const [dx, dz] of [[h + 1, -h], [-h - 1, h]] as const) out.push([s.x + dx, 1, s.z + dz, "diamond_ore"]);
  }
  if (key === "shop") {
    for (const [dx, dz] of [[h + 1, h], [-h - 1, -h]] as const) out.push([s.x + dx, 1, s.z + dz, "chest"], [s.x + dx, 2, s.z + dz, "lantern"]);
  }
}

/** 각도(북쪽 기준 시계 방향, 도) */
const angleOf = (dx: number, dz: number) => (Math.atan2(dx, -dz) * 180) / Math.PI;

/** 점 (px,pz) 에서 선분 (0,0)→(ax,az) 까지 거리 */
function segDist(px: number, pz: number, ax: number, az: number) {
  const len2 = ax * ax + az * az;
  const t = Math.max(0, Math.min(1, (px * ax + pz * az) / len2));
  return Math.hypot(px - ax * t, pz - az * t);
}

/** 광장 가운데 분수 수반 반지름 (바깥 석영 턱 포함) */
const FOUNTAIN_R = 5.4;

/**
 * 3단 분수 — 큰 수반 · 가운데 대야 · 꼭대기 대야(신호기).
 * 물줄기 · 물보라는 world-engine 의 FountainSpray 가 그린다.
 */
function fountain(P: (dx: number, y: number, dz: number, kind: StaticKind) => void) {
  for (let dx = -6; dx <= 6; dx++)
    for (let dz = -6; dz <= 6; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > FOUNTAIN_R) continue;
      if (r > 4.5) {
        // 수반 턱: 석영 반 블록
        P(dx, 0, dz, "quartz");
        P(dx, 1, dz, "quartz_slab");
      } else if (r > 1.6) {
        P(dx, -1, dz, "sand");
      }
    }
  // 수반 바닥 조명 (물 아래에서 은은하게 빛난다)
  for (const [dx, dz] of [[3, 2], [3, -2], [-3, 2], [-3, -2], [2, 3], [-2, 3], [2, -3], [-2, -3]] as const) P(dx, -1, dz, "sea_lantern");

  // 받침 · 기둥
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) P(dx, 0, dz, Math.abs(dx) + Math.abs(dz) === 2 ? "quartz_slab" : "quartz");
  P(0, 1, 0, "quartz");

  // 가운데 대야 (y2 바닥 · y3 테두리와 물)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const e = Math.max(Math.abs(dx), Math.abs(dz));
      if (e === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (e <= 1) {
        P(dx, 2, dz, "quartz");
        P(dx, 3, dz, dx === 0 && dz === 0 ? "quartz" : "water");
      } else {
        P(dx, 2, dz, "quartz");
        P(dx, 3, dz, "quartz_slab");
      }
    }
  // 가운데 대야에서 큰 수반으로 떨어지는 물줄기 8개
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, 2], [2, -2], [-2, -2]] as const) {
    P(dx, 1, dz, "waterfall");
    P(dx, 2, dz, "waterfall");
  }

  // 꼭대기 대야 (y4 기둥 · y5 반 블록 테두리 + 가운데 신호기)
  P(0, 4, 0, "quartz");
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      P(dx, 5, dz, Math.abs(dx) + Math.abs(dz) === 2 ? "gold" : "quartz_slab");
    }
  P(0, 5, 0, "beacon");
  // 꼭대기에서 가운데 대야로 흘러내리는 물
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) P(dx, 4, dz, "waterfall");
}

function buildPlaza(): StaticBlock[] {
  const out: StaticBlock[] = [];
  const { x: cx, z: cz } = PLAZA;
  const P = (dx: number, y: number, dz: number, kind: StaticKind) => out.push([cx + dx, y, cz + dz, kind]);

  /** 구조물 자리 (중심 기준 사각형) — 바닥 꽃 · 덤불을 피한다 */
  const reserved: [number, number, number, number][] = [
    ...PAVILIONS.map(([, s]): [number, number, number, number] => [s.x - cx - s.half - 1, s.x - cx + s.half + 1, s.z - cz - s.half - 1, s.z - cz + s.half + 1]),
    [CRAFT_STALL.dx - 3, CRAFT_STALL.dx + 3, CRAFT_STALL.dz - 3, CRAFT_STALL.dz + 3],
    [MISSION_STALL.dx - 3, MISSION_STALL.dx + 3, MISSION_STALL.dz - 3, MISSION_STALL.dz + 3],
    [STOCK_BOARD.dx - 3, STOCK_BOARD.dx + 3, STOCK_BOARD.dz - 1, STOCK_BOARD.dz + 1],
    [REVIEW_BOARD.dx - 3, REVIEW_BOARD.dx + 3, REVIEW_BOARD.dz - 1, REVIEW_BOARD.dz + 1],
  ];
  const isReserved = (dx: number, dz: number) => reserved.some(([x0, x1, z0, z1]) => dx >= x0 && dx <= x1 && dz >= z0 && dz <= z1);
  /** 중심에서 각 정자로 뻗는 길 */
  const spokes = PAVILIONS.map(([, s]) => [s.x - cx, s.z - cz] as const);
  /** 울타리 등불 기둥: 30도마다 (정자 사이 15도 어긋나게) */
  const fenceLamps = new Set<string>();
  for (let a = 15; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    fenceLamps.add(`${Math.round(Math.sin(rad) * R)},${Math.round(-Math.cos(rad) * R)}`);
  }

  /* ── 바닥: 분수 수반 · 고리길 · 정자 길 · 남쪽 앞마당 · 산책길 · 정원 ── */
  for (let dx = -R - 1; dx <= R + 1; dx++)
    for (let dz = -R - 1; dz <= R + 1; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > R + 0.5) continue;
      const x = cx + dx;
      const z = cz + dz;
      const ang = angleOf(dx, dz);
      const forecourt = Math.abs(ang) >= 140 && r > 9;
      const spoke = spokes.some(([ax, az]) => segDist(dx, dz, ax, az) <= 1.25);
      const spokeMid = spokes.some(([ax, az]) => segDist(dx, dz, ax, az) <= 0.5);
      let kind: StaticKind;
      let garden = false;
      if (r > R - 1.5) kind = "grass";
      else if (r <= FOUNTAIN_R) kind = "water";
      else if (r <= 6.4) kind = "quartz";
      else if (r <= 9) kind = r <= 7 || r > 8.4 ? "smooth_stone" : (dx + dz) % 2 === 0 ? "stonebrick" : "andesite";
      else if (forecourt) kind = dx % 4 === 0 || dz % 4 === 0 ? "smooth_stone" : hash(x, z, 2) < 0.18 ? "mossy_stonebrick" : "stonebrick";
      else if (spoke) kind = spokeMid ? "smooth_stone" : hash(x, z, 3) < 0.2 ? "mossy_stonebrick" : "stonebrick";
      else if (r >= 11.8 && r <= 13.2) kind = r <= 12.2 || r >= 12.8 ? "quartz" : "andesite";
      else {
        kind = "grass";
        garden = true;
      }
      out.push([x, 0, z, kind]);
      if (kind === "water") out.push([x, -1, z, "sand"]);

      // 섬 밑면: 가운데일수록 깊게
      const depth = R - r;
      out.push([x, -1, z, kind === "grass" ? "dirt" : kind === "water" ? "sand" : "stone"]);
      if (depth > 3) out.push([x, -2, z, hash(x, z, 1) < 0.2 ? "cobble" : "stone"]);
      if (depth > 7 && hash(x, z, 2) < 0.8) out.push([x, -3, z, "stone"]);
      if (depth > 11 && hash(x, z, 4) < 0.6) out.push([x, -4, z, "deepslate"]);
      if (depth > 15 && hash(x, z, 6) < 0.6) out.push([x, -5, z, "deepslate"]);
      if (depth > 19 && hash(x, z, 7) < 0.5) out.push([x, -6, z, hash(x, z, 9) < 0.15 ? "amethyst" : "deepslate"]);

      // 울타리: 생울타리 + 등불 기둥
      if (r > R - 0.5) {
        const lamp = fenceLamps.has(`${dx},${dz}`);
        out.push([x, 1, z, lamp ? "post" : "hedge"]);
        if (lamp) out.push([x, 2, z, "lantern"]);
      } else if ((garden || r > R - 1.5) && !isReserved(dx, dz)) {
        const hp = hash(x, z, 8);
        if (hp < 0.2) out.push([x, 1, z, FLOWERS[Math.floor(hash(x, z, 10) * FLOWERS.length)]!]);
        else if (garden && hp > 0.975) out.push([x, 1, z, "hedge"]);
      }
    }

  buildLetters(out, "DOES MC", cz - R - 3, 9);

  /* ── 가운데: 3단 분수 ── */
  fountain(P);
  // 분수 테두리 바깥 대각선 등불 기둥
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) lampPost(out, cx + dx, cz + dz);

  /* ── 고리길 바깥 · 산책길 안쪽 가로등 (정자 길 사이) ── */
  for (let a = -135; a <= 135; a += 30) {
    const rad = (a * Math.PI) / 180;
    lampPost(out, cx + Math.round(Math.sin(rad) * 10.4), cz - Math.round(Math.cos(rad) * 10.4));
  }

  /* ── 스폰 앞 게시판 두 개: 기둥 · 발밑 화단 · 양옆 등불 ── */
  for (const b of [STOCK_BOARD, REVIEW_BOARD]) {
    for (const ox of [-2, 2]) {
      for (let y = 1; y <= 5; y++) P(b.dx + ox, y, b.dz, "post");
      P(b.dx + ox, 0, b.dz, "deepslate_tiles");
    }
    for (let ox = -1; ox <= 1; ox++) {
      P(b.dx + ox, 0, b.dz + 1, "grass");
      P(b.dx + ox, 1, b.dz + 1, ox === 0 ? "flower_pink" : ox < 0 ? "flower_yellow" : "flower_blue");
    }
    for (const ox of [-3, 3]) {
      P(b.dx + ox, 1, b.dz, "post");
      P(b.dx + ox, 2, b.dz, "lantern");
    }
  }

  /* ── 정자 아홉 곳 + 내 섬 정자 ── */
  for (const [key, s] of PAVILIONS) pavilion(out, s, THEMES[key], key);

  /* ── 앞마당 양옆 노점: 제작대 (빨강 차양) · 미션 (청록 차양) ── */
  const stall = ({ dx: sdx, dz: sdz }: { dx: number; dz: number }, awn: StaticKind) => {
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) P(sdx + ox, 0, sdz + oz, Math.max(Math.abs(ox), Math.abs(oz)) === 2 ? "deepslate_tiles" : "spruce");
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      P(sdx + ox, 1, sdz + oz, "post");
      P(sdx + ox, 2, sdz + oz, "post");
    }
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) P(sdx + ox, 3, sdz + oz, (ox + 2) % 2 === 0 ? awn : "awn_white");
  };
  stall(CRAFT_STALL, "awn_red");
  stall(MISSION_STALL, "awn_cyan");
  /** 노점 안에서 광장 바깥쪽으로 한 칸 */
  const outward = (s: { dx: number; dz: number }) => [Math.sign(s.dx), Math.sign(s.dz)] as const;
  const craft = INTERACTABLES[0]!;
  const [cox, coz] = outward(CRAFT_STALL);
  out.push([craft.x, 1, craft.z, "crafting"], [craft.x + cox, 1, craft.z + coz, "bookshelf"], [craft.x + cox, 2, craft.z + coz, "bookshelf"]);
  out.push([craft.x + cox, 1, craft.z, "chest"], [craft.x - cox, 1, craft.z + coz, "lantern"]);
  const lect = INTERACTABLES[1]!;
  const [mox, moz] = outward(MISSION_STALL);
  out.push([lect.x, 1, lect.z, "lectern"], [lect.x + mox * 2, 1, lect.z, "bookshelf"], [lect.x + mox * 2, 2, lect.z, "bookshelf"]);
  out.push([lect.x - mox, 1, lect.z + moz, "lantern"]);

  /* ── 정자 사이 바깥쪽 벚나무 · 참나무 ── */
  for (const a of [-105, -75, -45, -15, 15, 45, 75, 105]) {
    const rad = (a * Math.PI) / 180;
    const tx = cx + Math.round(Math.sin(rad) * 20.5);
    const tz = cz - Math.round(Math.cos(rad) * 20.5);
    if (Math.abs(a) === 15) oakTree(out, tx, 1, tz);
    else cherryTree(out, tx, 1, tz, 1);
  }

  for (const s of PLAZA_SIGNS) out.push([s.x, s.y, s.z, s.facing === "+z" || s.facing === "-z" ? "sign" : "signx"]);

  /* ── 주변에 떠 있는 작은 섬들 ── */
  miniIsland(out, cx - 40, -4, cz - 24, 3, "cherry");
  miniIsland(out, cx + 41, 2, cz - 16, 2, "oak");
  miniIsland(out, cx - 37, 3, cz + 30, 2, "flowers");
  miniIsland(out, cx + 38, -6, cz + 32, 3, "pond");
  miniIsland(out, cx + 8, 9, cz - 44, 2, "amethyst");
  miniIsland(out, cx - 6, -9, cz + 42, 3, "cherry");

  return dedupeBlocks(out);
}

export const PLAZA_BLOCKS: StaticBlock[] = buildPlaza();
export const PLAZA_CELLS = new Set(PLAZA_BLOCKS.map(([x, y, z]) => cellKey(x, y, z)));

/** 내 섬 주변 장식 (월드에서만 보이고 섬 이미지·편집 검사에는 들어가지 않는다) */
function buildIslandDecor(): StaticBlock[] {
  const out: StaticBlock[] = [];
  const hcx = (HUB.x0 + HUB.x1) / 2;
  const hcz = (HUB.z0 + HUB.z1) / 2;
  for (let x = HUB.x0; x <= HUB.x1; x++)
    for (let z = HUB.z0; z <= HUB.z1; z++) {
      const e = Math.max(Math.abs(x - hcx), Math.abs(z - hcz));
      out.push([x, -1, z, "stone"]);
      if (e <= 2 || hash(x, z, 41) < 0.5) out.push([x, -2, z, hash(x, z, 42) < 0.3 ? "cobble" : "stone"]);
      if (e <= 1) out.push([x, -3, z, "deepslate"]);
      if (e === 0) out.push([x, -4, z, "deepslate"]);
    }
  /* 도착 정원 밑면 (가운데가 깊은 바위) · 서쪽 연못 폭포 */
  const { cx: acx, cz: acz, r: AR } = ARRIVAL;
  for (let x = Math.floor(acx - AR); x <= Math.ceil(acx + AR); x++)
    for (let z = Math.floor(acz - AR); z <= Math.ceil(acz + AR); z++) {
      const r = Math.hypot(x - acx, z - acz);
      if (r > AR || z <= HUB.z1) continue;
      const depth = 1 + Math.round((AR - r) * 1.2 + hash(x, z, 45) * 1.5);
      for (let k = 1; k <= depth; k++) {
        const kind: StaticKind = k === 1 ? "dirt" : k >= depth - 1 && depth > 4 ? "deepslate" : hash(x, z, k) < 0.08 ? "amethyst" : hash(x, z, k) < 0.3 ? "cobble" : "stone";
        out.push([x, -k, z, kind]);
      }
    }
  for (let k = 0; k <= 9; k++) out.push([-10, -k, ARRIVAL.cz, "waterfall"]);
  for (let k = 3; k <= 6; k++) out.push([-10, -k - 1, ARRIVAL.cz + 1, "waterfall"]);

  // 도착 정원에서 북쪽(내 섬)을 바라볼 때 양옆으로 보이게 배치
  miniIsland(out, 25, -3, 8, 3, "cherry");
  miniIsland(out, -24, 2, 0, 2, "oak");
  miniIsland(out, 23, 6, -12, 2, "flowers");
  miniIsland(out, -27, -5, -20, 3, "pond");
  miniIsland(out, 26, 3, -27, 2, "amethyst");
  miniIsland(out, 3, -9, 38, 3, "cherry");
  miniIsland(out, -20, 4, 30, 2, "flowers");
  // 건축 가능 범위는 비워 둬야 내 섬 편집을 막지 않는다
  return dedupeBlocks(out).filter(([x, y, z]) => !(inBuildArea(x, z) && y >= BUILD.minY && y <= BUILD.maxY) && !STATIC_CELLS.has(cellKey(x, y, z)));
}

export const ISLAND_DECOR: StaticBlock[] = buildIslandDecor();
