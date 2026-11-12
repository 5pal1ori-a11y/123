import type { TextureName } from "./textures";

/** 섬에 놓을 수 있는 아이템 */
export type ItemId =
  | "grass"
  | "diamond"
  | "tree"
  | "house"
  | "flag"
  | "lantern"
  | "pumpkin"
  | "cake"
  | "beacon"
  | "jukebox"
  | "chest"
  | "glowstone"
  | "flower"
  | BuildBlockId;

/** 개수 제한 없이 쓰는 건축 블록 */
export type BuildBlockId =
  | "stone"
  | "cobble"
  | "dirt"
  | "oak_planks"
  | "spruce_planks"
  | "oak_log"
  | "cherry_log"
  | "stonebrick"
  | "mossy_stonebrick"
  | "bricks"
  | "andesite"
  | "smooth_stone"
  | "deepslate_tiles"
  | "quartz"
  | "sand"
  | "sandstone"
  | "glass"
  | "ice"
  | "oak_leaves"
  | "cherry_leaves"
  | "hedge"
  | "bookshelf"
  | "sea_lantern"
  | "slime"
  | "wool_white"
  | "wool_red"
  | "wool_orange"
  | "wool_yellow"
  | "wool_lime"
  | "wool_cyan"
  | "wool_blue"
  | "wool_purple"
  | "wool_pink"
  | "wool_black"
  | "poppy"
  | "dandelion"
  | "cornflower";

/** [x, y, z, item] — y=0 이 섬 지면 */
export type PlacedBlock = [number, number, number, ItemId];

export type Faces = { top: TextureName; bottom: TextureName; side: TextureName; front?: TextureName };

/** 셀 기준(0~1) 상자 — 3D와 PNG가 같은 모델을 그린다 */
export type ModelBox = {
  min: [number, number, number];
  max: [number, number, number];
  faces: Faces;
  /** 스스로 빛나는 재질 */
  glow?: boolean;
  /** 반투명(유리) */
  clear?: boolean;
  /** 충돌 없음 (잎 등) */
  ghost?: boolean;
};

export type ItemDef = {
  label: string;
  /** 획득 경로 안내 */
  source: string;
  /** 꽉 찬 정육면체 블록인지 */
  cube: boolean;
  /** 차지하는 세로 칸 수 */
  height: number;
  /** 플레이어가 통과할 수 있는지 */
  passable?: boolean;
  limited?: boolean;
  /** 개수 제한 없는 건축 블록 */
  free?: boolean;
  model: ModelBox[];
};

const all = (t: TextureName): Faces => ({ top: t, bottom: t, side: t });
const full = (faces: Faces, extra?: Partial<ModelBox>): ModelBox => ({ min: [0, 0, 0], max: [1, 1, 1], faces, ...extra });
const flower = (petal: TextureName): ModelBox[] => [
  { min: [0.47, 0, 0.47], max: [0.53, 0.52, 0.53], faces: all("stem"), ghost: true },
  { min: [0.28, 0.14, 0.47], max: [0.47, 0.2, 0.53], faces: all("stem"), ghost: true },
  { min: [0.36, 0.48, 0.36], max: [0.64, 0.66, 0.64], faces: all(petal), ghost: true },
];

const cube = (label: string, faces: Faces, extra?: Partial<ModelBox>): ItemDef => ({
  label,
  source: "건축 블록 · 무제한",
  cube: !extra?.clear,
  height: 1,
  free: true,
  model: [full(faces, extra)],
});
const plant = (label: string, petal: TextureName): ItemDef => ({
  label,
  source: "건축 블록 · 무제한",
  cube: false,
  height: 1,
  passable: true,
  free: true,
  model: flower(petal),
});

const BUILD_ITEMS: Record<BuildBlockId, ItemDef> = {
  stone: cube("돌", all("stone")),
  cobble: cube("조약돌", all("cobble")),
  dirt: cube("흙", all("dirt")),
  oak_planks: cube("참나무 판자", all("oak_planks")),
  spruce_planks: cube("가문비 판자", all("spruce_planks")),
  oak_log: cube("참나무 원목", { top: "oak_log_top", bottom: "oak_log_top", side: "oak_log" }),
  cherry_log: cube("벚나무 원목", { top: "cherry_log_top", bottom: "cherry_log_top", side: "cherry_log" }),
  stonebrick: cube("석재 벽돌", all("stonebrick")),
  mossy_stonebrick: cube("이끼 낀 석재 벽돌", all("mossy_stonebrick")),
  bricks: cube("벽돌", all("bricks")),
  andesite: cube("안산암", all("andesite")),
  smooth_stone: cube("매끄러운 돌", all("smooth_stone")),
  deepslate_tiles: cube("심층암 타일", all("deepslate_tiles")),
  quartz: cube("석영 블록", all("quartz")),
  sand: cube("모래", all("sand")),
  sandstone: cube("사암", all("sandstone")),
  glass: cube("유리", all("glass"), { clear: true }),
  ice: cube("얼음", all("ice")),
  oak_leaves: { ...cube("참나무 잎", all("oak_leaves")), cube: false },
  cherry_leaves: { ...cube("벚나무 잎", all("cherry_leaves")), cube: false },
  hedge: cube("생울타리", all("hedge")),
  bookshelf: cube("책장", { top: "oak_planks", bottom: "oak_planks", side: "bookshelf" }),
  sea_lantern: cube("바다 랜턴", all("sea_lantern"), { glow: true }),
  slime: cube("슬라임 블록", all("slime")),
  wool_white: cube("하얀 양털", all("wool_white")),
  wool_red: cube("빨간 양털", all("wool_red")),
  wool_orange: cube("주황 양털", all("wool_orange")),
  wool_yellow: cube("노란 양털", all("wool_yellow")),
  wool_lime: cube("연두 양털", all("wool_lime")),
  wool_cyan: cube("청록 양털", all("wool_cyan")),
  wool_blue: cube("파란 양털", all("wool_blue")),
  wool_purple: cube("보라 양털", all("wool_purple")),
  wool_pink: cube("분홍 양털", all("wool_pink")),
  wool_black: cube("검은 양털", all("wool_black")),
  poppy: plant("양귀비", "petal_red"),
  dandelion: plant("민들레", "petal_yellow"),
  cornflower: plant("수레국화", "petal_blue"),
};

export const ITEMS: Record<ItemId, ItemDef> = {
  grass: {
    label: "잔디 블록",
    source: "출석체크 1회",
    cube: true,
    height: 1,
    model: [full({ top: "grass_top", bottom: "dirt", side: "grass_side" })],
  },
  diamond: {
    label: "다이아 블록",
    source: "거래 완료 1건",
    cube: true,
    height: 1,
    model: [full(all("diamond_block"))],
  },
  tree: {
    label: "참나무",
    source: "후기 작성 1개",
    cube: false,
    height: 4,
    model: [
      { min: [0, 0, 0], max: [1, 4, 1], faces: { top: "oak_log_top", bottom: "oak_log_top", side: "oak_log" } },
      { min: [-1, 3, -1], max: [2, 5, 2], faces: all("oak_leaves"), ghost: true },
      { min: [0, 5, 0], max: [1, 6, 1], faces: all("oak_leaves"), ghost: true },
      { min: [-1, 5, 0], max: [0, 5.6, 1], faces: all("oak_leaves"), ghost: true },
      { min: [1, 5, 0], max: [2, 5.6, 1], faces: all("oak_leaves"), ghost: true },
      { min: [0, 5, -1], max: [1, 5.6, 0], faces: all("oak_leaves"), ghost: true },
      { min: [0, 5, 1], max: [1, 5.6, 2], faces: all("oak_leaves"), ghost: true },
    ],
  },
  house: {
    label: "청기와 저택",
    source: "가입 기본 지급",
    cube: false,
    height: 1,
    model: [
      /* 기단 · 석영 벽 · 모서리 기둥 · 금 띠 */
      { min: [-0.04, 0, -0.04], max: [1.04, 0.1, 1.04], faces: all("stonebrick") },
      { min: [0.06, 0.1, 0.06], max: [0.94, 0.78, 0.94], faces: all("manor_wall") },
      { min: [0.02, 0.1, 0.02], max: [0.14, 0.8, 0.14], faces: all("dark_planks") },
      { min: [0.86, 0.1, 0.02], max: [0.98, 0.8, 0.14], faces: all("dark_planks") },
      { min: [0.02, 0.1, 0.86], max: [0.14, 0.8, 0.98], faces: all("dark_planks") },
      { min: [0.86, 0.1, 0.86], max: [0.98, 0.8, 0.98], faces: all("dark_planks") },
      { min: [0.02, 0.78, 0.02], max: [0.98, 0.84, 0.98], faces: all("gold_block") },
      /* 문 · 불 켜진 창 · 문 옆 랜턴 · 화단 */
      { min: [0.38, 0.1, 0.94], max: [0.62, 0.62, 0.965], faces: all("manor_door") },
      { min: [0.17, 0.36, 0.94], max: [0.33, 0.62, 0.955], faces: all("window_lit"), glow: true },
      { min: [0.67, 0.36, 0.94], max: [0.83, 0.62, 0.955], faces: all("window_lit"), glow: true },
      { min: [0.945, 0.34, 0.3], max: [0.96, 0.64, 0.7], faces: all("window_lit"), glow: true },
      { min: [0.04, 0.34, 0.3], max: [0.055, 0.64, 0.7], faces: all("window_lit"), glow: true },
      { min: [0.3, 0.34, 0.04], max: [0.7, 0.64, 0.055], faces: all("window_lit"), glow: true },
      { min: [0.31, 0.5, 0.965], max: [0.36, 0.58, 1.0], faces: { top: "iron", bottom: "iron", side: "lantern" }, glow: true },
      { min: [0.64, 0.5, 0.965], max: [0.69, 0.58, 1.0], faces: { top: "iron", bottom: "iron", side: "lantern" }, glow: true },
      { min: [0.15, 0.3, 0.95], max: [0.35, 0.36, 1.03], faces: { top: "petal_pink", bottom: "spruce_planks", side: "spruce_planks" } },
      { min: [0.65, 0.3, 0.95], max: [0.85, 0.36, 1.03], faces: { top: "petal_red", bottom: "spruce_planks", side: "spruce_planks" } },
      { min: [0.32, 0.64, 0.95], max: [0.68, 0.69, 1.1], faces: all("roof_tiles") },
      /* 청기와 지붕 · 금 첨탑 · 굴뚝 */
      { min: [-0.1, 0.84, -0.1], max: [1.1, 0.95, 1.1], faces: all("roof_tiles") },
      { min: [0.0, 0.95, 0.0], max: [1.0, 1.06, 1.0], faces: all("roof_tiles") },
      { min: [0.12, 1.06, 0.12], max: [0.88, 1.17, 0.88], faces: all("roof_tiles") },
      { min: [0.25, 1.17, 0.25], max: [0.75, 1.28, 0.75], faces: all("roof_tiles") },
      { min: [0.38, 1.28, 0.38], max: [0.62, 1.38, 0.62], faces: all("roof_tiles") },
      { min: [0.46, 1.38, 0.46], max: [0.54, 1.56, 0.54], faces: all("gold_block") },
      { min: [0.43, 1.56, 0.43], max: [0.57, 1.62, 0.57], faces: all("gold_block") },
      { min: [0.7, 0.95, 0.16], max: [0.86, 1.46, 0.32], faces: all("stonebrick") },
      { min: [0.68, 1.46, 0.14], max: [0.88, 1.52, 0.34], faces: all("stonebrick") },
    ],
  },
  flag: {
    label: "인증 깃발",
    source: "디스코드 인증",
    cube: false,
    height: 2,
    passable: true,
    model: [
      { min: [0.44, 0, 0.44], max: [0.56, 2.5, 0.56], faces: all("oak_log") },
      { min: [0.56, 1.45, 0.47], max: [1.5, 2.4, 0.53], faces: all("banner"), ghost: true },
      { min: [0.4, 2.5, 0.4], max: [0.6, 2.62, 0.6], faces: all("gold_block") },
    ],
  },
  lantern: {
    label: "랜턴",
    source: "이벤트 한정",
    cube: false,
    height: 1,
    passable: true,
    limited: true,
    model: [
      { min: [0.3, 0, 0.3], max: [0.7, 0.48, 0.7], faces: { top: "iron", bottom: "iron", side: "lantern" }, glow: true },
      { min: [0.38, 0.48, 0.38], max: [0.62, 0.58, 0.62], faces: all("iron") },
    ],
  },
  pumpkin: {
    label: "잭오랜턴",
    source: "이벤트 한정",
    cube: true,
    height: 1,
    limited: true,
    model: [full({ top: "pumpkin_top", bottom: "pumpkin_side", side: "pumpkin_side", front: "pumpkin_face" })],
  },
  cake: {
    label: "케이크",
    source: "이벤트 한정",
    cube: false,
    height: 1,
    limited: true,
    model: [{ min: [0.0625, 0, 0.0625], max: [0.9375, 0.5, 0.9375], faces: { top: "cake_top", bottom: "cake_side", side: "cake_side" } }],
  },
  beacon: {
    label: "신호기",
    source: "이벤트 한정",
    cube: false,
    height: 1,
    limited: true,
    model: [
      { min: [0.1, 0, 0.1], max: [0.9, 0.2, 0.9], faces: all("obsidian") },
      { min: [0.22, 0.2, 0.22], max: [0.78, 0.8, 0.78], faces: all("beacon_core"), glow: true },
      { min: [0, 0, 0], max: [1, 1, 1], faces: all("glass"), clear: true },
    ],
  },
  jukebox: {
    label: "주크박스",
    source: "이벤트 한정",
    cube: true,
    height: 1,
    limited: true,
    model: [full({ top: "jukebox_top", bottom: "jukebox_side", side: "jukebox_side" })],
  },
  chest: {
    label: "보물 상자",
    source: "이벤트 한정",
    cube: false,
    height: 1,
    limited: true,
    model: [{ min: [0.0625, 0, 0.0625], max: [0.9375, 0.875, 0.9375], faces: { top: "chest_top", bottom: "chest_side", side: "chest_side", front: "chest_front" } }],
  },
  glowstone: {
    label: "발광석",
    source: "이벤트 한정",
    cube: true,
    height: 1,
    limited: true,
    model: [full(all("glowstone"), { glow: true })],
  },
  flower: {
    label: "꽃 화분",
    source: "이벤트 한정",
    cube: false,
    height: 1,
    passable: true,
    limited: true,
    model: [
      { min: [0.3, 0, 0.3], max: [0.7, 0.38, 0.7], faces: all("terracotta") },
      { min: [0.47, 0.38, 0.47], max: [0.53, 0.68, 0.53], faces: all("leaf_green") },
      { min: [0.38, 0.62, 0.38], max: [0.62, 0.84, 0.62], faces: all("wool_red") },
    ],
  },
  ...BUILD_ITEMS,
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const REWARD_ITEM_IDS = ITEM_IDS.filter((id) => !ITEMS[id].free);
export const BUILD_ITEM_IDS = ITEM_IDS.filter((id) => ITEMS[id].free);
export const DECO_POOL: ItemId[] = ["lantern", "pumpkin", "cake", "beacon", "jukebox", "chest", "glowstone", "flower"];

/** 이벤트/딜 키로 어떤 한정 장식품을 줄지 결정 */
export function decoForKey(key: string): ItemId {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DECO_POOL[h % DECO_POOL.length]!;
}

/**
 * 건축 가능 범위. 남쪽 끝(z1)은 다리 끝 발판(HUB)까지 — 그 너머는 도착 광장이라 넓히지 말 것.
 * 범위 안에는 새 정적 블록을 두면 안 된다 (유저가 이미 지어 둔 블록과 겹친다).
 */
export const BUILD = { x0: -16, x1: 16, z0: -16, z1: 10, minY: -6, maxY: 20, maxBlocks: 3000 };

export function inBuildArea(x: number, z: number) {
  return x >= BUILD.x0 && x <= BUILD.x1 && z >= BUILD.z0 && z <= BUILD.z1;
}

export type Allowance = Partial<Record<ItemId, number>>;

export function cellKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

/* ───────────── 고정 월드: 허브 · 다리 · 포털 ───────────── */

export type StaticKind =
  | "stonebrick"
  | "planks"
  | "obsidian"
  | "portal"
  | "portalz"
  | "stone"
  | "gold"
  | "glass"
  | "diamond"
  | "lantern"
  | "sign"
  | "signx"
  | "beacon"
  | "nether_bricks"
  | "nb_fence"
  | "quartz"
  | "sea_lantern"
  | "smooth_stone"
  | "end_frame"
  | "end_portal"
  | "end_stone"
  | "crafting"
  | "bookshelf"
  | "lectern"
  | "log"
  | "leaves"
  | "grass"
  | "dirt"
  | "purpur"
  | "chest"
  | "spruce"
  | "cherry_leaves"
  | "cherry_log"
  | "mossy_stonebrick"
  | "andesite"
  | "deepslate_tiles"
  | "deepslate"
  | "cobble"
  | "netherrack"
  | "water"
  | "waterfall"
  | "amethyst"
  | "diamond_ore"
  | "post"
  | "wool_red"
  | "wool_white"
  | "wool_yellow"
  | "wool_lime"
  | "wool_cyan"
  | "wool_purple"
  | "wool_pink"
  | "wool_orange"
  | "awn_red"
  | "awn_white"
  | "awn_cyan"
  | "flower_red"
  | "flower_yellow"
  | "flower_blue"
  | "flower_pink"
  | "tall_grass"
  | "banner"
  | "bridge"
  | "bridge_lamp"
  | "hedge"
  | "gate_green"
  | "gate_gold"
  | "target"
  | "sand"
  | "sandstone"
  | "carpet_red"
  | "gate_cyan"
  | "gate_lime"
  | "gate_orange"
  | "gate_end"
  | "slime"
  | "ice"
  | "bricks"
  | "wool_black"
  | "wool_blue"
  | "pad_pink"
  | "pad_purple"
  | "pad_end"
  | "pad_lime"
  | "pad_green"
  | "pad_cyan"
  | "pad_orange"
  | "pad_gold"
  | "pad_sky"
  | "pad_red"
  | "spruce_slab"
  | "quartz_slab"
  | "stone_slab"
  | "fence"
  | "emerald"
  | "iron_block"
  | "awn_yellow"
  | "awn_blue"
  | "awn_lime"
  | "awn_orange"
  | "awn_pink";

export type StaticBlock = [number, number, number, StaticKind];

const awning = (t: TextureName): ModelBox[] => [{ min: [0, 0, 0], max: [1, 0.28, 1], faces: all(t) }];
/** z 방향으로 놓인 나무 다리 (양옆 난간) */
const BRIDGE: ModelBox[] = [
  { min: [0, 0.55, 0], max: [1, 1, 1], faces: all("oak_planks") },
  { min: [0.04, 0.3, 0.1], max: [0.96, 0.55, 0.26], faces: all("dark_planks") },
  { min: [0.04, 0.3, 0.74], max: [0.96, 0.55, 0.9], faces: all("dark_planks") },
  { min: [0.02, 1, 0.42], max: [0.14, 1.6, 0.58], faces: all("dark_planks"), ghost: true },
  { min: [0.86, 1, 0.42], max: [0.98, 1.6, 0.58], faces: all("dark_planks"), ghost: true },
  { min: [0.04, 1.46, 0], max: [0.12, 1.54, 1], faces: all("gold_block"), ghost: true },
  { min: [0.88, 1.46, 0], max: [0.96, 1.54, 1], faces: all("gold_block"), ghost: true },
];
const gatez = (t: TextureName): ModelBox[] => [{ min: [0, 0, 0.4], max: [1, 1, 0.6], faces: all(t), glow: true, clear: true, ghost: true }];
/** 밟으면 이동하는 빛나는 워프 발판 (바닥에 얇게 깔린다) */
const pad = (t: TextureName) => ({ cube: false, passable: true, model: [{ min: [0, 0, 0], max: [1, 0.0625, 1], faces: all(t), glow: true, ghost: true }] as ModelBox[] });
const slab = (t: TextureName) => ({ cube: false, model: [{ min: [0, 0, 0], max: [1, 0.5, 1], faces: all(t) }] as ModelBox[] });

export const STATIC_MODELS: Record<StaticKind, { cube: boolean; passable?: boolean; model: ModelBox[] }> = {
  stonebrick: { cube: true, model: [full(all("stonebrick"))] },
  planks: { cube: true, model: [full(all("oak_planks"))] },
  obsidian: { cube: true, model: [full(all("obsidian"))] },
  portal: {
    cube: false,
    passable: true,
    model: [{ min: [0.4, 0, 0], max: [0.6, 1, 1], faces: all("portal"), glow: true, clear: true, ghost: true }],
  },
  stone: { cube: true, model: [full(all("stone"))] },
  gold: { cube: true, model: [full(all("gold_block"))] },
  glass: { cube: true, model: [full(all("glass"), { clear: true })] },
  diamond: { cube: true, model: [full(all("diamond_block"))] },
  lantern: { cube: false, passable: true, model: ITEMS.lantern.model },
  sign: {
    cube: false,
    passable: true,
    model: [
      { min: [0.45, 0, 0.45], max: [0.55, 0.62, 0.55], faces: all("oak_log") },
      { min: [0.04, 0.6, 0.44], max: [0.96, 1.16, 0.56], faces: all("oak_planks") },
    ],
  },
  signx: {
    cube: false,
    passable: true,
    model: [
      { min: [0.45, 0, 0.45], max: [0.55, 0.62, 0.55], faces: all("oak_log") },
      { min: [0.44, 0.6, 0.04], max: [0.56, 1.16, 0.96], faces: all("oak_planks") },
    ],
  },
  beacon: { cube: false, model: ITEMS.beacon.model },
  portalz: {
    cube: false,
    passable: true,
    model: [{ min: [0, 0, 0.4], max: [1, 1, 0.6], faces: all("portal"), glow: true, clear: true, ghost: true }],
  },
  nether_bricks: { cube: true, model: [full(all("nether_bricks"))] },
  nb_fence: {
    cube: false,
    model: [
      { min: [0.375, 0, 0.375], max: [0.625, 1, 0.625], faces: all("nether_bricks") },
      { min: [0, 0.75, 0.4375], max: [1, 0.9, 0.5625], faces: all("nether_bricks") },
      { min: [0, 0.35, 0.4375], max: [1, 0.5, 0.5625], faces: all("nether_bricks") },
    ],
  },
  quartz: { cube: true, model: [full(all("quartz"))] },
  sea_lantern: { cube: true, model: [full(all("sea_lantern"), { glow: true })] },
  smooth_stone: { cube: true, model: [full(all("smooth_stone"))] },
  end_frame: {
    cube: false,
    model: [{ min: [0, 0, 0], max: [1, 0.8125, 1], faces: { top: "end_frame_top", bottom: "end_stone", side: "end_frame_side" } }],
  },
  end_portal: {
    cube: false,
    passable: true,
    model: [{ min: [0, 0.7, 0], max: [1, 0.75, 1], faces: all("end_portal"), glow: true, ghost: true }],
  },
  end_stone: { cube: true, model: [full(all("end_stone"))] },
  crafting: { cube: true, model: [full({ top: "crafting_top", bottom: "oak_planks", side: "crafting_side", front: "crafting_front" })] },
  bookshelf: { cube: true, model: [full({ top: "oak_planks", bottom: "oak_planks", side: "bookshelf" })] },
  lectern: {
    cube: false,
    model: [
      { min: [0, 0, 0], max: [1, 0.125, 1], faces: all("spruce_planks") },
      { min: [0.25, 0.125, 0.25], max: [0.75, 0.85, 0.75], faces: all("spruce_planks") },
      { min: [0.02, 0.85, 0.02], max: [0.98, 1, 0.98], faces: { top: "lectern_top", bottom: "spruce_planks", side: "spruce_planks" } },
    ],
  },
  log: { cube: true, model: [full({ top: "oak_log_top", bottom: "oak_log_top", side: "oak_log" })] },
  leaves: { cube: false, passable: false, model: [full(all("oak_leaves"))] },
  grass: { cube: true, model: [full({ top: "grass_top", bottom: "dirt", side: "grass_side" })] },
  dirt: { cube: true, model: [full(all("dirt"))] },
  purpur: { cube: true, model: [full(all("purpur"))] },
  chest: { cube: false, model: ITEMS.chest.model },
  spruce: { cube: true, model: [full(all("spruce_planks"))] },
  cherry_leaves: { cube: false, model: [full(all("cherry_leaves"))] },
  cherry_log: { cube: true, model: [full({ top: "cherry_log_top", bottom: "cherry_log_top", side: "cherry_log" })] },
  mossy_stonebrick: { cube: true, model: [full(all("mossy_stonebrick"))] },
  andesite: { cube: true, model: [full(all("andesite"))] },
  deepslate_tiles: { cube: true, model: [full(all("deepslate_tiles"))] },
  deepslate: { cube: true, model: [full(all("deepslate"))] },
  cobble: { cube: true, model: [full(all("cobble"))] },
  netherrack: { cube: true, model: [full(all("netherrack"))] },
  water: {
    cube: false,
    passable: true,
    model: [{ min: [0, 0, 0], max: [1, 0.875, 1], faces: all("water"), clear: true }],
  },
  waterfall: {
    cube: false,
    passable: true,
    model: [{ min: [0.08, 0, 0.08], max: [0.92, 1, 0.92], faces: all("water"), clear: true, ghost: true }],
  },
  amethyst: { cube: true, model: [full(all("amethyst"), { glow: true })] },
  diamond_ore: { cube: true, model: [full(all("diamond_ore"))] },
  post: {
    cube: false,
    model: [
      { min: [0.4, 0, 0.4], max: [0.6, 1, 0.6], faces: all("spruce_planks") },
    ],
  },
  wool_red: { cube: true, model: [full(all("wool_red"))] },
  wool_white: { cube: true, model: [full(all("wool_white"))] },
  wool_yellow: { cube: true, model: [full(all("wool_yellow"))] },
  wool_lime: { cube: true, model: [full(all("wool_lime"))] },
  wool_cyan: { cube: true, model: [full(all("wool_cyan"))] },
  wool_purple: { cube: true, model: [full(all("wool_purple"))] },
  wool_pink: { cube: true, model: [full(all("wool_pink"))] },
  wool_orange: { cube: true, model: [full(all("wool_orange"))] },
  awn_red: { cube: false, model: awning("wool_red") },
  awn_white: { cube: false, model: awning("wool_white") },
  awn_cyan: { cube: false, model: awning("wool_cyan") },
  flower_red: { cube: false, passable: true, model: flower("petal_red") },
  flower_yellow: { cube: false, passable: true, model: flower("petal_yellow") },
  flower_blue: { cube: false, passable: true, model: flower("petal_blue") },
  flower_pink: { cube: false, passable: true, model: flower("petal_pink") },
  tall_grass: {
    cube: false,
    passable: true,
    model: [
      { min: [0.18, 0, 0.44], max: [0.25, 0.55, 0.51], faces: all("stem"), ghost: true },
      { min: [0.5, 0, 0.28], max: [0.57, 0.72, 0.35], faces: all("leaf_green"), ghost: true },
      { min: [0.72, 0, 0.6], max: [0.79, 0.5, 0.67], faces: all("stem"), ghost: true },
      { min: [0.38, 0, 0.7], max: [0.45, 0.42, 0.77], faces: all("leaf_green"), ghost: true },
    ],
  },
  banner: {
    cube: false,
    passable: true,
    model: [
      { min: [0.02, 0.88, 0], max: [0.98, 1, 0.1], faces: all("oak_log"), ghost: true },
      { min: [0.12, -0.15, 0.02], max: [0.88, 0.88, 0.06], faces: all("banner"), ghost: true },
    ],
  },
  bridge: { cube: false, model: BRIDGE },
  bridge_lamp: {
    cube: false,
    model: [
      ...BRIDGE,
      { min: [0.0, 1.6, 0.4], max: [0.16, 1.8, 0.6], faces: { top: "iron", bottom: "iron", side: "lantern" }, glow: true, ghost: true },
      { min: [0.84, 1.6, 0.4], max: [1.0, 1.8, 0.6], faces: { top: "iron", bottom: "iron", side: "lantern" }, glow: true, ghost: true },
    ],
  },
  hedge: { cube: true, model: [full(all("hedge"))] },
  gate_green: { cube: false, passable: true, model: gatez("portal_green") },
  gate_gold: { cube: false, passable: true, model: gatez("portal_gold") },
  target: { cube: true, model: [full({ top: "target_top", bottom: "target_top", side: "target_side" })] },
  sand: { cube: true, model: [full(all("sand"))] },
  sandstone: { cube: true, model: [full(all("sandstone"))] },
  carpet_red: { cube: false, passable: true, model: [{ min: [0, 0, 0], max: [1, 0.0625, 1], faces: all("wool_red") }] },
  gate_cyan: { cube: false, passable: true, model: gatez("portal_cyan") },
  gate_lime: { cube: false, passable: true, model: gatez("portal_lime") },
  gate_orange: { cube: false, passable: true, model: gatez("portal_orange") },
  gate_end: { cube: false, passable: true, model: gatez("end_portal") },
  slime: { cube: true, model: [full(all("slime"))] },
  ice: { cube: true, model: [full(all("ice"))] },
  bricks: { cube: true, model: [full(all("bricks"))] },
  wool_black: { cube: true, model: [full(all("wool_black"))] },
  wool_blue: { cube: true, model: [full(all("wool_blue"))] },
  pad_pink: pad("wool_pink"),
  pad_purple: pad("amethyst"),
  pad_end: pad("end_portal"),
  pad_lime: pad("wool_lime"),
  pad_green: pad("emerald_block"),
  pad_cyan: pad("wool_cyan"),
  pad_orange: pad("wool_orange"),
  pad_gold: pad("gold_block"),
  pad_sky: pad("sea_lantern"),
  pad_red: pad("wool_red"),
  spruce_slab: slab("spruce_planks"),
  quartz_slab: slab("quartz"),
  stone_slab: slab("smooth_stone"),
  fence: {
    cube: false,
    model: [
      { min: [0.375, 0, 0.375], max: [0.625, 1, 0.625], faces: all("spruce_planks") },
      { min: [0, 0.75, 0.4375], max: [1, 0.9, 0.5625], faces: all("spruce_planks") },
      { min: [0, 0.35, 0.4375], max: [1, 0.5, 0.5625], faces: all("spruce_planks") },
    ],
  },
  emerald: { cube: true, model: [full(all("emerald_block"))] },
  iron_block: { cube: true, model: [full(all("iron"))] },
  awn_yellow: { cube: false, model: awning("wool_yellow") },
  awn_blue: { cube: false, model: awning("wool_blue") },
  awn_lime: { cube: false, model: awning("wool_lime") },
  awn_orange: { cube: false, model: awning("wool_orange") },
  awn_pink: { cube: false, model: awning("wool_pink") },
};

/** 도착 광장 가운데 — 섬(북쪽)을 바라보며 시작한다 */
export const SPAWN = { x: 0.5, y: 1, z: 17.5, yaw: 0 };

/**
 * 섬과 도착 광장을 잇는 다리 끝 발판 (건축 범위 안이라 예전 칸만 그대로 쓴다).
 * 이 범위의 정적 블록을 새로 늘리면 유저가 이미 지어 둔 블록과 겹치므로 절대 넓히지 말 것.
 */
export const HUB = { x0: -3, x1: 3, z0: 8, z1: 10 };

/**
 * 도착 정원 (건축 범위 z ≤ 10 바깥이라 자유롭게 꾸민다)
 *
 *            ↑ 다리 → 내 섬
 *        ⛩ 도리이 (z 12) · 주인/스탯 표지판
 *   🌸                         🌸
 *  연못·폭포 ── 나침반 광장 ── 광장 워프 정자
 *  벤치                          (동쪽)
 *            전망대 · 벤치 (남쪽 끝)
 */
export const ARRIVAL = { cx: 0, cz: 20, r: 9.5 };

/** 광장으로 가는 워프 정자 (가운데 칸) */
export const ISLAND_WARP = { x: 6, z: 20 };
const POND = { x: -5, z: 20, r: 1.9 };
const TORII_Z = 12;

export type SignFacing = "+z" | "-z" | "-x" | "+x";

export type SignSpec = { x: number; y: number; z: number; facing: SignFacing; key: "owner" | "stats" | "parkour" | "portal" };

export const SIGNS: SignSpec[] = [
  { x: -2, y: 1, z: TORII_Z + 2, facing: "+z", key: "owner" },
  { x: 2, y: 1, z: TORII_Z + 2, facing: "+z", key: "stats" },
  { x: -3, y: 1, z: 22, facing: "+x", key: "parkour" },
  { x: 3, y: 1, z: 22, facing: "-x", key: "portal" },
];

/** 워프 발판 칸 — 밟고 있으면 메인 광장으로 */
export const PORTAL_CELLS: [number, number, number][] = [];

/** 좌표마다 고정된 0~1 난수 */
function noise(x: number, z: number, salt: number) {
  let h = (x * 374761393 + z * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const GARDEN_FLOWERS: StaticKind[] = ["flower_pink", "flower_pink", "flower_yellow", "flower_blue", "flower_red", "tall_grass", "tall_grass"];

/** 작은 벚나무 (줄기 3칸 · 반지름 2) */
function blossom(out: StaticBlock[], x: number, z: number) {
  for (let y = 1; y <= 3; y++) out.push([x, y, z, "cherry_log"]);
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = 3; dy <= 5; dy++) {
        const d = Math.hypot(dx, dz);
        const r = dy === 4 ? 2.4 : dy === 3 ? 2 : 1.3;
        if (d > r || (dx === 0 && dz === 0 && dy === 3)) continue;
        out.push([x + dx, dy, z + dz, "cherry_leaves"]);
      }
  for (const [dx, dz] of [[2, 1], [-2, -1], [1, -2], [-1, 2]] as const) {
    if (noise(x + dx, z + dz, 5) < 0.7) out.push([x + dx, 2, z + dz, "cherry_leaves"]);
  }
}

/** 동쪽 워프 정자: 벚나무 기둥 · 분홍 지붕 · 하늘빛 발판 */
function buildWarpGazebo(out: StaticBlock[]) {
  const { x: wx, z: wz } = ISLAND_WARP;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.max(Math.abs(dx), Math.abs(dz));
      out.push([wx + dx, 0, wz + dz, edge === 2 ? "deepslate_tiles" : "quartz"]);
      if (edge <= 1) {
        out.push([wx + dx, 1, wz + dz, "pad_sky"]);
        PORTAL_CELLS.push([wx + dx, 1, wz + dz]);
      }
      // 지붕: 가장자리 벚꽃잎 · 안쪽 분홍 양털, 그 위에 한 단 더
      out.push([wx + dx, 4, wz + dz, edge === 2 ? "cherry_leaves" : "wool_pink"]);
      if (edge <= 1) out.push([wx + dx, 5, wz + dz, "cherry_leaves"]);
    }
  for (const dx of [-2, 2])
    for (const dz of [-2, 2]) {
      for (let y = 1; y <= 3; y++) out.push([wx + dx, y, wz + dz, "cherry_log"]);
      out.push([wx + dx, 5, wz + dz, "lantern"]);
    }
  out.push([wx, 6, wz, "sea_lantern"]);
}

function buildArrival(out: StaticBlock[]) {
  const { cx, cz, r: R } = ARRIVAL;
  const garden: [number, number][] = [];
  for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++)
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) {
      const r = Math.hypot(x - cx, z - cz);
      if (r > R || z <= HUB.z1) continue;
      const pond = Math.hypot(x - POND.x, z - POND.z);
      const pathN = Math.abs(x - cx) <= 1 && z < cz;
      const pathS = Math.abs(x - cx) <= 1 && z > cz;
      const pathEW = Math.abs(z - cz) <= 1;
      let kind: StaticKind;
      if (pond <= POND.r || (z === cz && x < POND.x && x >= -9)) kind = "water";
      else if (pond <= POND.r + 0.8) kind = noise(x, z, 3) < 0.4 ? "mossy_stonebrick" : "cobble";
      else if (r > R - 1.3) kind = "grass";
      else if (r < 0.6) kind = "sea_lantern";
      else if (r <= 1.6) kind = "quartz";
      else if (r <= 2.6) kind = "deepslate_tiles";
      else if (r <= 3.4) kind = "quartz";
      else if (pathN || pathS) kind = x === cx ? "smooth_stone" : noise(x, z, 4) < 0.25 ? "mossy_stonebrick" : "stonebrick";
      else if (pathEW) kind = z === cz ? "smooth_stone" : noise(x, z, 4) < 0.25 ? "mossy_stonebrick" : "stonebrick";
      else kind = "grass";
      out.push([x, 0, z, kind]);
      if (kind === "water") out.push([x, -1, z, "sand"]);
      if (kind === "grass") garden.push([x, z]);
    }

  // 다리에서 나침반 광장까지 레드카펫
  for (let z = HUB.z1 + 1; z <= cz - 4; z++) out.push([cx, 1, z, "carpet_red"]);

  // ⛩ 도리이: 붉은 기둥 · 가로대 · 검은 갓돌
  for (const x of [-3, 3]) {
    out.push([x, 0, TORII_Z, "deepslate_tiles"]);
    for (let y = 1; y <= 6; y++) out.push([x, y, TORII_Z, "wool_red"]);
    out.push([x + Math.sign(x), 1, TORII_Z, "lantern"]);
  }
  for (let x = -3; x <= 3; x++) out.push([x, 4, TORII_Z, "wool_red"]);
  for (let x = -4; x <= 4; x++) out.push([x, 6, TORII_Z, "wool_red"]);
  for (let x = -5; x <= 5; x++) out.push([x, 7, TORII_Z, "wool_black"]);

  // 연못 벤치 (서남쪽) · 남쪽 전망대
  for (let x = -7; x <= -5; x++) out.push([x, 1, 23, "spruce_slab"], [x, 1, 24, "fence"]);
  for (let x = -3; x <= 3; x++) out.push([x, 1, 29, "fence"]);
  for (const x of [-2, -1, 1, 2]) out.push([x, 1, 27, "spruce_slab"], [x, 1, 26, "fence"]);
  out.push([0, 1, 28, "lantern"]);

  // 가로등 · 벚나무 두 그루
  for (const [x, z] of [[-4, 16], [4, 16], [-4, 24], [4, 24]] as const) out.push([x, 1, z, "post"], [x, 2, z, "post"], [x, 3, z, "lantern"]);
  blossom(out, -6, 14);
  blossom(out, 6, 14);

  buildWarpGazebo(out);

  // 비어 있는 잔디에 꽃
  const taken = new Set(out.filter((b) => b[1] >= 1).map(([x, y, z]) => cellKey(x, y, z)));
  for (const [x, z] of garden) {
    const gazebo = Math.abs(x - ISLAND_WARP.x) <= 2 && Math.abs(z - ISLAND_WARP.z) <= 2;
    if (gazebo || taken.has(cellKey(x, 1, z)) || noise(x, z, 9) > 0.3) continue;
    out.push([x, 1, z, GARDEN_FLOWERS[Math.floor(noise(x, z, 11) * GARDEN_FLOWERS.length)]!]);
  }
}

function buildStatic(): StaticBlock[] {
  const out: StaticBlock[] = [];
  for (let x = HUB.x0; x <= HUB.x1; x++)
    for (let z = HUB.z0; z <= HUB.z1; z++) {
      const kind: StaticKind = x === 0 ? "andesite" : Math.abs(x) === 3 ? "quartz" : (x * 7 + z * 13) % 5 === 0 ? "mossy_stonebrick" : "stonebrick";
      out.push([x, 0, z, kind]);
    }
  for (let z = 2; z < HUB.z0; z++) out.push([0, 0, z, z % 3 === 0 ? "bridge_lamp" : "bridge"]);
  buildArrival(out);
  for (const s of SIGNS) out.push([s.x, s.y, s.z, s.facing === "+z" || s.facing === "-z" ? "sign" : "signx"]);
  return dedupeBlocks(out);
}

/** 같은 칸에 여러 번 넣으면 마지막 것이 남는다 */
export function dedupeBlocks(list: StaticBlock[]): StaticBlock[] {
  const map = new Map<string, StaticBlock>();
  for (const b of list) map.set(cellKey(b[0], b[1], b[2]), b);
  return [...map.values()];
}

export const STATIC_BLOCKS: StaticBlock[] = buildStatic();
export const STATIC_CELLS = new Set(STATIC_BLOCKS.map(([x, y, z]) => cellKey(x, y, z)));

/** 기본 부지: 처음 받는 섬 가운데의 둥근 잔디밭 (다리 칸은 비운다) */
export const STARTER_PLOT: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let x = -6; x <= 7; x++)
    for (let z = -6; z <= 7; z++) {
      const jitter = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 7 / 10;
      if (Math.hypot(x - 0.5, z - 0.5) + jitter > 6.2) continue;
      if (STATIC_CELLS.has(cellKey(x, 0, z))) continue;
      out.push([x, z]);
    }
  return out;
})();

/** 처음 가입하면 받는 섬: 둥근 잔디 부지 + 작은 집 + 나무 한 그루 */
export const STARTER_BLOCKS: PlacedBlock[] = [
  ...STARTER_PLOT.map(([x, z]) => [x, 0, z, "grass"] as PlacedBlock),
  [1, 1, 1, "house"],
  [0, 1, 0, "tree"],
];

export const STARTER_ALLOWANCE: Allowance = { grass: STARTER_PLOT.length, house: 1, tree: 1 };

/** 예전(잔디 4칸) 섬에 기본 부지를 깔아 준다 — 이미 블록이 있는 칸과 잔디가 모자라면 건너뛴다 */
export function withStarterPlot(blocks: PlacedBlock[], allowance: Allowance): PlacedBlock[] {
  const taken = new Set<string>();
  for (const b of blocks) for (const [x, y, z] of occupiedCells(b)) taken.add(cellKey(x, y, z));
  let spare = (allowance.grass ?? 0) - blocks.filter((b) => b[3] === "grass").length;
  const out = blocks.map((b) => [...b] as PlacedBlock);
  for (const [x, z] of STARTER_PLOT) {
    if (spare <= 0 || out.length >= BUILD.maxBlocks) break;
    if (taken.has(cellKey(x, 0, z))) continue;
    out.push([x, 0, z, "grass"]);
    spare--;
  }
  return out;
}

type UnderKind = "dirt" | "stone" | "cobble" | "deepslate" | "ore" | "amethyst";

/** 섬 아래로 늘어진 흙·돌·광석 (장식용, 레이아웃에 따라 자동 생성) — 가운데일수록 깊게 */
export function undersideBlocks(blocks: PlacedBlock[]): [number, number, number, UnderKind][] {
  const lowest = new Map<string, number>();
  for (const [x, y, z, id] of blocks) {
    if (!ITEMS[id].cube) continue;
    const k = `${x},${z}`;
    const cur = lowest.get(k);
    if (cur === undefined || y < cur) lowest.set(k, y);
  }
  if (!lowest.size) return [];
  let sx = 0;
  let sz = 0;
  for (const k of lowest.keys()) {
    const [x, z] = k.split(",").map(Number) as [number, number];
    sx += x + 0.5;
    sz += z + 0.5;
  }
  const cx = sx / lowest.size;
  const cz = sz / lowest.size;
  let R = 1;
  for (const k of lowest.keys()) {
    const [x, z] = k.split(",").map(Number) as [number, number];
    R = Math.max(R, Math.hypot(x + 0.5 - cx, z + 0.5 - cz) + 0.9);
  }
  const maxDepth = Math.min(9, 3 + Math.round(R * 0.8));
  const out: [number, number, number, UnderKind][] = [];
  for (const [k, y] of lowest) {
    const [x, z] = k.split(",").map(Number) as [number, number];
    const h = ((x * 73856093) ^ (z * 19349663)) >>> 0;
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / R;
    const depth = Math.max(1, Math.round((1 - d * d) * maxDepth) + (h % 3) - 1);
    for (let i = 1; i <= depth; i++) {
      const hi = (h >>> (i % 13)) % 23;
      let kind: UnderKind = i === 1 ? "dirt" : i === 2 && h % 2 ? "dirt" : hi < 4 ? "cobble" : "stone";
      if (i > 2 && hi === 7) kind = "ore";
      if (i >= depth - 1 && i > 3) kind = hi < 9 ? "deepslate" : kind;
      if (i === depth && i > 3 && hi % 5 === 0) kind = "amethyst";
      out.push([x, y - i, z, kind]);
    }
  }
  const taken = new Set<string>();
  for (const b of blocks) for (const [x, y, z] of occupiedCells(b)) taken.add(cellKey(x, y, z));
  return out.filter(([x, y, z]) => !STATIC_CELLS.has(cellKey(x, y, z)) && !taken.has(cellKey(x, y, z)));
}

/** 아이템이 차지하는 셀들 (나무는 줄기 3칸) */
export function occupiedCells(b: PlacedBlock): [number, number, number][] {
  const h = ITEMS[b[3]].height;
  return Array.from({ length: h }, (_, i) => [b[0], b[1] + i, b[2]] as [number, number, number]);
}

export function countBlocks(blocks: PlacedBlock[]) {
  const counts: Allowance = {};
  for (const b of blocks) counts[b[3]] = (counts[b[3]] ?? 0) + 1;
  return counts;
}

export function inventoryOf(allowance: Allowance, blocks: PlacedBlock[]) {
  const used = countBlocks(blocks);
  const inv: Allowance = {};
  for (const id of ITEM_IDS) {
    if (ITEMS[id].free) {
      inv[id] = Infinity;
      continue;
    }
    const left = (allowance[id] ?? 0) - (used[id] ?? 0);
    if (left > 0) inv[id] = left;
  }
  return inv;
}

/** 저장 전 검증 — 문제가 있으면 오류 메시지 */
export function validateLayout(raw: unknown, allowance: Allowance): { ok: true; blocks: PlacedBlock[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "잘못된 섬 데이터" };
  if (raw.length > BUILD.maxBlocks) return { ok: false, error: `블록은 최대 ${BUILD.maxBlocks}개까지 놓을 수 있어요` };
  const blocks: PlacedBlock[] = [];
  const taken = new Set<string>();
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 4) return { ok: false, error: "잘못된 블록" };
    const [x, y, z, id] = item as unknown[];
    if (![x, y, z].every((n) => Number.isInteger(n))) return { ok: false, error: "잘못된 좌표" };
    if (typeof id !== "string" || !(id in ITEMS)) return { ok: false, error: "알 수 없는 아이템" };
    const b: PlacedBlock = [x as number, y as number, z as number, id as ItemId];
    if (!inBuildArea(b[0], b[2])) return { ok: false, error: "건축 범위를 벗어났어요" };
    for (const [cx, cy, cz] of occupiedCells(b)) {
      if (cy < BUILD.minY || cy > BUILD.maxY) return { ok: false, error: "건축 높이를 벗어났어요" };
      const k = cellKey(cx, cy, cz);
      if (taken.has(k) || STATIC_CELLS.has(k)) return { ok: false, error: "블록이 겹쳐요" };
      taken.add(k);
    }
    blocks.push(b);
  }
  const used = countBlocks(blocks);
  for (const id of ITEM_IDS) {
    if (ITEMS[id].free) continue;
    if ((used[id] ?? 0) > (allowance[id] ?? 0)) return { ok: false, error: `${ITEMS[id].label}이(가) 부족해요` };
  }
  return { ok: true, blocks };
}

export type SceneItem = {
  x: number;
  y: number;
  z: number;
  model: ModelBox[];
  /** 꽉 찬 정육면체 (면 가리기 대상) */
  cube: boolean;
  passable: boolean;
  kind: "user" | "static" | "under";
  /** user 블록이면 blocks 배열 인덱스 */
  index?: number;
  id: string;
};

const UNDER_MODELS: Record<UnderKind, ModelBox[]> = {
  dirt: [full(all("dirt"))],
  stone: [full(all("stone"))],
  cobble: [full(all("cobble"))],
  deepslate: [full(all("deepslate"))],
  ore: [full(all("diamond_ore"))],
  amethyst: [full(all("amethyst"), { glow: true })],
};

export function staticItems(list: StaticBlock[]): SceneItem[] {
  return list.map(([x, y, z, kind]) => {
    const def = STATIC_MODELS[kind];
    return { x, y, z, model: def.model, cube: def.cube && kind !== "glass", passable: Boolean(def.passable), kind: "static", id: kind };
  });
}

/** 렌더러 공용 장면 목록 */
export function sceneItems(blocks: PlacedBlock[], opts?: { withStatic?: boolean }): SceneItem[] {
  const items: SceneItem[] = opts?.withStatic !== false ? staticItems(STATIC_BLOCKS) : [];
  blocks.forEach(([x, y, z, id], index) => {
    const def = ITEMS[id];
    items.push({ x, y, z, model: def.model, cube: def.cube, passable: Boolean(def.passable), kind: "user", index, id });
  });
  for (const [x, y, z, kind] of undersideBlocks(blocks)) {
    items.push({ x, y, z, model: UNDER_MODELS[kind], cube: true, passable: false, kind: "under", id: kind });
  }
  return items;
}

/** 섬 위에서 시작할 자리 — 위 두 칸이 비어 있는 섬 블록 중 중심에 가까운 곳 */
export function islandSpawn(blocks: PlacedBlock[]): { x: number; y: number; z: number } {
  const filled = new Set<string>();
  for (const b of blocks) for (const [x, y, z] of occupiedCells(b)) filled.add(cellKey(x, y, z));
  for (const [x, y, z] of STATIC_BLOCKS) filled.add(cellKey(x, y, z));
  const candidates = blocks
    .filter((b) => ITEMS[b[3]].cube)
    .filter(([x, y, z]) => !filled.has(cellKey(x, y + 1, z)) && !filled.has(cellKey(x, y + 2, z)))
    .sort((a, b) => Math.hypot(a[0] - 0.5, a[2] - 0.5) - Math.hypot(b[0] - 0.5, b[2] - 0.5) || b[1] - a[1]);
  const top = candidates[0];
  if (!top) return { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
  return { x: top[0] + 0.5, y: top[1] + 1, z: top[2] + 0.5 };
}

export type IslandStats = {
  attendance: number;
  reviews: number;
  orders: number;
  events: number;
  verified: boolean;
};

export type IslandView = {
  userId: string;
  owner: { name: string; discordUsername: string | null; discordId: string | null };
  blocks: PlacedBlock[];
  allowance: Allowance;
  stats: IslandStats;
  level: number;
  updatedAt: string;
  /** 본인 섬이면 true (편집 가능) */
  mine: boolean;
};

/** 활동 점수 기반 섬 레벨 — 결제 금액과 무관 */
export function islandLevel(stats: IslandStats) {
  const xp = stats.attendance * 2 + stats.reviews * 5 + stats.orders * 3 + stats.events * 8 + (stats.verified ? 10 : 0);
  return Math.max(1, Math.floor(Math.sqrt(xp / 4)) + 1);
}
