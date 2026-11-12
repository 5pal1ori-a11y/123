/**
 * 블록 정의 — 배열 순서가 곧 블록 ID 라서 저장된 월드와 맞도록 **끝에만 추가**한다.
 * 단단함 · 도구 · 등급 · 드롭은 마인크래프트 자바 에디션 값을 따른다.
 */

export type ToolKind = "pickaxe" | "axe" | "shovel" | "hoe" | "sword" | "shears";
/** 0 나무 · 금, 1 돌, 2 철, 3 다이아몬드 */
export type Tier = 0 | 1 | 2 | 3;
export type Shape = "none" | "cube" | "cross" | "liquid" | "torch" | "layer" | "crop" | "cactus" | "farmland" | "ladder";
export type Tint = "grass" | "foliage" | null;
export type Drop = { item: string; min: number; max: number; chance?: number };

export type BlockDef = {
  id: number;
  key: string;
  name: string;
  /** +x −x +y −y +z −z 순서 텍스처 */
  faces: [string, string, string, string, string, string];
  shape: Shape;
  /** 부딪히는지 */
  solid: boolean;
  /** 옆 면을 가리고 빛을 막는지 */
  opaque: boolean;
  /** 잎 · 유리처럼 구멍 있는 텍스처 */
  cutout?: boolean;
  light?: number;
  /** −1 은 부술 수 없음 */
  hardness: number;
  tool?: ToolKind;
  /** 있으면 그 도구 · 등급 이상이어야 드롭 */
  tier?: Tier;
  needsTool?: boolean;
  /** undefined 면 자기 자신 1개, [] 면 아무것도 안 나옴 */
  drops?: Drop[];
  replaceable?: boolean;
  gravity?: boolean;
  tint?: Tint;
  /** 윗면만 색을 입힌다 (잔디 블록) */
  tintTop?: boolean;
  /** 놓을 때 바라보는 방향을 meta 에 저장 */
  facing?: boolean;
  /** 원목처럼 축을 meta 에 저장 */
  axis?: boolean;
  /** 아래에 받칠 블록이 필요 */
  needsSupport?: "ground" | "sand" | "farmland" | "any";
  liquid?: "water" | "lava";
  /** 우클릭으로 여는 화면 */
  gui?: "crafting" | "furnace" | "chest" | "enchanting";
  /** 묘목이 자라 될 나무 */
  sapling?: TreeKind;
};

export type TreeKind = "oak" | "birch" | "spruce" | "acacia" | "jungle";

const all = (t: string): BlockDef["faces"] => [t, t, t, t, t, t];
const column = (side: string, top: string, bottom = top): BlockDef["faces"] => [side, side, top, bottom, side, side];

type Spec = Omit<BlockDef, "id" | "faces" | "shape" | "solid" | "opaque" | "hardness"> &
  Partial<Pick<BlockDef, "faces" | "shape" | "solid" | "opaque" | "hardness">>;

const ore = (key: string, name: string, tier: Tier, drop: Drop, deep = false): Spec => ({
  key,
  name,
  faces: all(key),
  hardness: deep ? 4.5 : 3,
  tool: "pickaxe",
  tier,
  needsTool: true,
  drops: [drop],
});

const plant = (key: string, name: string, extra: Partial<Spec> = {}): Spec => ({
  key,
  name,
  faces: all(key),
  shape: "cross",
  solid: false,
  opaque: false,
  hardness: 0,
  replaceable: false,
  needsSupport: "ground",
  ...extra,
});

/** 마인크래프트 염료 16색 (양털 · 카펫 · 색유리) */
export const COLORS = [
  ["white", "하얀색", 0xf9fffe],
  ["orange", "주황색", 0xf9801d],
  ["magenta", "자홍색", 0xc74ebd],
  ["light_blue", "하늘색", 0x3ab3da],
  ["yellow", "노란색", 0xfed83d],
  ["lime", "연두색", 0x80c71f],
  ["pink", "분홍색", 0xf38baa],
  ["gray", "회색", 0x474f52],
  ["light_gray", "회백색", 0x9d9d97],
  ["cyan", "청록색", 0x169c9c],
  ["purple", "보라색", 0x8932b8],
  ["blue", "파란색", 0x3c44aa],
  ["brown", "갈색", 0x835432],
  ["green", "초록색", 0x5e7c16],
  ["red", "빨간색", 0xb02e26],
  ["black", "검은색", 0x1d1d21],
] as const;
export type ColorKey = (typeof COLORS)[number][0];

const stone = (key: string, name: string, extra: Partial<Spec> = {}): Spec => ({ key, name, hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true, ...extra });
const wood = (key: string, name: string, faces: BlockDef["faces"], extra: Partial<Spec> = {}): Spec => ({ key, name, faces, hardness: 2.5, tool: "axe", ...extra });

const SPECS: Spec[] = [
  { key: "air", name: "공기", faces: all("air"), shape: "none", solid: false, opaque: false, hardness: 0, replaceable: true, drops: [] },
  { key: "stone", name: "돌", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true, drops: [{ item: "cobblestone", min: 1, max: 1 }] },
  {
    key: "grass_block",
    name: "잔디 블록",
    faces: column("grass_block_side", "grass_block_top", "dirt"),
    hardness: 0.6,
    tool: "shovel",
    drops: [{ item: "dirt", min: 1, max: 1 }],
    tint: "grass",
    tintTop: true,
  },
  { key: "dirt", name: "흙", hardness: 0.5, tool: "shovel" },
  { key: "cobblestone", name: "조약돌", hardness: 2, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "oak_planks", name: "참나무 판자", hardness: 2, tool: "axe" },
  { key: "bedrock", name: "기반암", hardness: -1, drops: [] },
  { key: "sand", name: "모래", hardness: 0.5, tool: "shovel", gravity: true },
  {
    key: "gravel",
    name: "자갈",
    hardness: 0.6,
    tool: "shovel",
    gravity: true,
  },
  { key: "oak_log", name: "참나무 원목", faces: column("oak_log", "oak_log_top"), hardness: 2, tool: "axe", axis: true },
  {
    key: "oak_leaves",
    name: "참나무 잎",
    opaque: false,
    cutout: true,
    hardness: 0.2,
    tool: "hoe",
    tint: "foliage",
    drops: [
      { item: "oak_sapling", min: 1, max: 1, chance: 0.05 },
      { item: "stick", min: 1, max: 2, chance: 0.02 },
      { item: "apple", min: 1, max: 1, chance: 0.005 },
    ],
  },
  { key: "glass", name: "유리", opaque: false, cutout: true, hardness: 0.3, drops: [] },
  { key: "water", name: "물", shape: "liquid", solid: false, opaque: false, hardness: 100, drops: [], replaceable: true, liquid: "water" },
  { key: "lava", name: "용암", shape: "liquid", solid: false, opaque: false, hardness: 100, drops: [], replaceable: true, liquid: "lava", light: 15 },
  ore("coal_ore", "석탄 광석", 0, { item: "coal", min: 1, max: 1 }),
  ore("iron_ore", "철광석", 1, { item: "raw_iron", min: 1, max: 1 }),
  ore("copper_ore", "구리 광석", 1, { item: "raw_copper", min: 2, max: 5 }),
  ore("gold_ore", "금광석", 2, { item: "raw_gold", min: 1, max: 1 }),
  ore("redstone_ore", "레드스톤 광석", 2, { item: "redstone", min: 4, max: 5 }),
  ore("lapis_ore", "청금석 광석", 1, { item: "lapis_lazuli", min: 4, max: 9 }),
  ore("diamond_ore", "다이아몬드 광석", 2, { item: "diamond", min: 1, max: 1 }),
  ore("emerald_ore", "에메랄드 광석", 2, { item: "emerald", min: 1, max: 1 }),
  {
    key: "deepslate",
    name: "심층암",
    faces: column("deepslate", "deepslate_top"),
    hardness: 3,
    tool: "pickaxe",
    tier: 0,
    needsTool: true,
    axis: true,
    drops: [{ item: "cobbled_deepslate", min: 1, max: 1 }],
  },
  ore("deepslate_coal_ore", "심층암 석탄 광석", 0, { item: "coal", min: 1, max: 1 }, true),
  ore("deepslate_iron_ore", "심층암 철광석", 1, { item: "raw_iron", min: 1, max: 1 }, true),
  ore("deepslate_copper_ore", "심층암 구리 광석", 1, { item: "raw_copper", min: 2, max: 5 }, true),
  ore("deepslate_gold_ore", "심층암 금광석", 2, { item: "raw_gold", min: 1, max: 1 }, true),
  ore("deepslate_redstone_ore", "심층암 레드스톤 광석", 2, { item: "redstone", min: 4, max: 5 }, true),
  ore("deepslate_lapis_ore", "심층암 청금석 광석", 1, { item: "lapis_lazuli", min: 4, max: 9 }, true),
  ore("deepslate_diamond_ore", "심층암 다이아몬드 광석", 2, { item: "diamond", min: 1, max: 1 }, true),
  ore("deepslate_emerald_ore", "심층암 에메랄드 광석", 2, { item: "emerald", min: 1, max: 1 }, true),
  { key: "cobbled_deepslate", name: "심층암 조약돌", hardness: 3.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "birch_log", name: "자작나무 원목", faces: column("birch_log", "birch_log_top"), hardness: 2, tool: "axe", axis: true },
  {
    key: "birch_leaves",
    name: "자작나무 잎",
    opaque: false,
    cutout: true,
    hardness: 0.2,
    tool: "hoe",
    drops: [
      { item: "birch_sapling", min: 1, max: 1, chance: 0.05 },
      { item: "stick", min: 1, max: 2, chance: 0.02 },
    ],
  },
  { key: "birch_planks", name: "자작나무 판자", hardness: 2, tool: "axe" },
  { key: "spruce_log", name: "가문비나무 원목", faces: column("spruce_log", "spruce_log_top"), hardness: 2, tool: "axe", axis: true },
  {
    key: "spruce_leaves",
    name: "가문비나무 잎",
    opaque: false,
    cutout: true,
    hardness: 0.2,
    tool: "hoe",
    drops: [
      { item: "spruce_sapling", min: 1, max: 1, chance: 0.05 },
      { item: "stick", min: 1, max: 2, chance: 0.02 },
    ],
  },
  { key: "spruce_planks", name: "가문비나무 판자", hardness: 2, tool: "axe" },
  { key: "acacia_log", name: "아카시아나무 원목", faces: column("acacia_log", "acacia_log_top"), hardness: 2, tool: "axe", axis: true },
  {
    key: "acacia_leaves",
    name: "아카시아나무 잎",
    opaque: false,
    cutout: true,
    hardness: 0.2,
    tool: "hoe",
    tint: "foliage",
    drops: [
      { item: "acacia_sapling", min: 1, max: 1, chance: 0.05 },
      { item: "stick", min: 1, max: 2, chance: 0.02 },
    ],
  },
  { key: "acacia_planks", name: "아카시아나무 판자", hardness: 2, tool: "axe" },
  { key: "jungle_log", name: "정글나무 원목", faces: column("jungle_log", "jungle_log_top"), hardness: 2, tool: "axe", axis: true },
  {
    key: "jungle_leaves",
    name: "정글나무 잎",
    opaque: false,
    cutout: true,
    hardness: 0.2,
    tool: "hoe",
    tint: "foliage",
    drops: [
      { item: "jungle_sapling", min: 1, max: 1, chance: 0.025 },
      { item: "stick", min: 1, max: 2, chance: 0.02 },
    ],
  },
  { key: "jungle_planks", name: "정글나무 판자", hardness: 2, tool: "axe" },
  {
    key: "snow_block",
    name: "눈 블록",
    hardness: 0.2,
    tool: "shovel",
    tier: 0,
    needsTool: true,
    drops: [{ item: "snowball", min: 4, max: 4 }],
  },
  {
    key: "snow",
    name: "눈",
    faces: all("snow_block"),
    shape: "layer",
    solid: false,
    opaque: false,
    hardness: 0.1,
    tool: "shovel",
    tier: 0,
    needsTool: true,
    replaceable: true,
    needsSupport: "any",
    drops: [{ item: "snowball", min: 1, max: 1 }],
  },
  { key: "ice", name: "얼음", opaque: false, hardness: 0.5, tool: "pickaxe", drops: [] },
  {
    key: "cactus",
    name: "선인장",
    faces: column("cactus_side", "cactus_top", "cactus_bottom"),
    shape: "cactus",
    opaque: false,
    hardness: 0.4,
    needsSupport: "sand",
  },
  plant("dead_bush", "마른 덤불", { needsSupport: "sand", replaceable: true, drops: [{ item: "stick", min: 0, max: 2 }] }),
  plant("short_grass", "잔디", { tint: "grass", replaceable: true, drops: [{ item: "wheat_seeds", min: 1, max: 1, chance: 0.125 }] }),
  plant("fern", "고사리", { tint: "grass", replaceable: true, drops: [{ item: "wheat_seeds", min: 1, max: 1, chance: 0.125 }] }),
  plant("dandelion", "민들레"),
  plant("poppy", "양귀비"),
  plant("cornflower", "수레국화"),
  plant("sugar_cane", "사탕수수", { needsSupport: "sand" }),
  { key: "sandstone", name: "사암", faces: column("sandstone", "sandstone_top", "sandstone_bottom"), hardness: 0.8, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "clay", name: "점토", hardness: 0.6, tool: "shovel", drops: [{ item: "clay_ball", min: 4, max: 4 }] },
  { key: "mossy_cobblestone", name: "이끼 낀 조약돌", hardness: 2, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "obsidian", name: "흑요석", hardness: 50, tool: "pickaxe", tier: 3, needsTool: true },
  {
    key: "crafting_table",
    name: "제작대",
    faces: ["crafting_table_side", "crafting_table_side", "crafting_table_top", "oak_planks", "crafting_table_front", "crafting_table_front"],
    hardness: 2.5,
    tool: "axe",
    gui: "crafting",
  },
  {
    key: "furnace",
    name: "화로",
    faces: ["furnace_side", "furnace_side", "furnace_top", "furnace_top", "furnace_front", "furnace_side"],
    hardness: 3.5,
    tool: "pickaxe",
    tier: 0,
    needsTool: true,
    facing: true,
    gui: "furnace",
  },
  {
    key: "lit_furnace",
    name: "화로",
    faces: ["furnace_side", "furnace_side", "furnace_top", "furnace_top", "furnace_front_on", "furnace_side"],
    hardness: 3.5,
    tool: "pickaxe",
    tier: 0,
    needsTool: true,
    facing: true,
    gui: "furnace",
    light: 13,
    drops: [{ item: "furnace", min: 1, max: 1 }],
  },
  {
    key: "chest",
    name: "상자",
    faces: ["chest_side", "chest_side", "chest_top", "chest_top", "chest_front", "chest_side"],
    opaque: false,
    hardness: 2.5,
    tool: "axe",
    facing: true,
    gui: "chest",
  },
  { key: "torch", name: "횃불", faces: all("torch"), shape: "torch", solid: false, opaque: false, hardness: 0, light: 14, needsSupport: "any" },
  { key: "stone_bricks", name: "석재 벽돌", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "bricks", name: "벽돌", hardness: 2, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "bookshelf", name: "책장", faces: column("bookshelf", "oak_planks"), hardness: 1.5, tool: "axe", drops: [{ item: "book", min: 3, max: 3 }] },
  { key: "white_wool", name: "하얀색 양털", hardness: 0.8, tool: "shears" },
  {
    key: "farmland",
    name: "경작지",
    faces: column("dirt", "farmland", "dirt"),
    shape: "farmland",
    opaque: false,
    hardness: 0.6,
    tool: "shovel",
    drops: [{ item: "dirt", min: 1, max: 1 }],
  },
  {
    key: "wheat",
    name: "밀",
    faces: all("wheat_stage7"),
    shape: "crop",
    solid: false,
    opaque: false,
    hardness: 0,
    needsSupport: "farmland",
    drops: [],
  },
  { key: "granite", name: "화강암", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "diorite", name: "섬록암", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "andesite", name: "안산암", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "iron_block", name: "철 블록", hardness: 5, tool: "pickaxe", tier: 1, needsTool: true },
  { key: "gold_block", name: "금 블록", hardness: 3, tool: "pickaxe", tier: 2, needsTool: true },
  { key: "diamond_block", name: "다이아몬드 블록", hardness: 5, tool: "pickaxe", tier: 2, needsTool: true },
  { key: "emerald_block", name: "에메랄드 블록", hardness: 5, tool: "pickaxe", tier: 2, needsTool: true },
  {
    key: "pumpkin",
    name: "호박",
    faces: ["pumpkin_side", "pumpkin_side", "pumpkin_top", "pumpkin_top", "pumpkin_side", "pumpkin_side"],
    hardness: 1,
    tool: "axe",
  },
  plant("red_mushroom", "빨간 버섯", { needsSupport: "any" }),
  plant("brown_mushroom", "갈색 버섯", { needsSupport: "any", light: 1 }),
  plant("oak_sapling", "참나무 묘목", { sapling: "oak" }),
  plant("birch_sapling", "자작나무 묘목", { sapling: "birch" }),
  plant("spruce_sapling", "가문비나무 묘목", { sapling: "spruce" }),
  plant("acacia_sapling", "아카시아나무 묘목", { sapling: "acacia" }),
  plant("jungle_sapling", "정글나무 묘목", { sapling: "jungle" }),
  plant("blue_orchid", "파란색 난초"),
  { key: "smooth_stone", name: "매끄러운 돌", hardness: 2, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "lapis_block", name: "청금석 블록", hardness: 3, tool: "pickaxe", tier: 1, needsTool: true },
  { key: "coal_block", name: "석탄 블록", hardness: 5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "glowstone", name: "발광석", hardness: 0.3, light: 15, drops: [{ item: "glowstone_dust", min: 2, max: 4 }] },
  {
    key: "grass_block_snow",
    name: "잔디 블록",
    faces: column("grass_block_snow", "snow_block", "dirt"),
    hardness: 0.6,
    tool: "shovel",
    drops: [{ item: "dirt", min: 1, max: 1 }],
  },
  { key: "tuff", name: "응회암", hardness: 1.5, tool: "pickaxe", tier: 0, needsTool: true },
  { key: "copper_block", name: "구리 블록", hardness: 3, tool: "pickaxe", tier: 1, needsTool: true },
  { key: "redstone_block", name: "레드스톤 블록", hardness: 5, tool: "pickaxe", tier: 0, needsTool: true },
  ...COLORS.filter(([c]) => c !== "white").map(([c, ko]): Spec => ({ key: `${c}_wool`, name: `${ko} 양털`, hardness: 0.8, tool: "shears" })),
  ...COLORS.map(
    ([c, ko]): Spec => ({
      key: `${c}_carpet`,
      name: `${ko} 카펫`,
      faces: all(`${c}_wool`),
      shape: "layer",
      solid: false,
      opaque: false,
      hardness: 0.1,
      needsSupport: "any",
    }),
  ),
  ...COLORS.map(([c, ko]): Spec => ({ key: `${c}_stained_glass`, name: `${ko} 색유리`, opaque: false, cutout: true, hardness: 0.3, drops: [] })),
  {
    key: "jack_o_lantern",
    name: "잭 오 랜턴",
    faces: ["pumpkin_side", "pumpkin_side", "pumpkin_top", "pumpkin_top", "jack_o_lantern", "pumpkin_side"],
    hardness: 1,
    tool: "axe",
    facing: true,
    light: 15,
  },
  { key: "hay_block", name: "건초 더미", faces: column("hay_block_side", "hay_block_top"), hardness: 0.5, tool: "hoe", axis: true },
  stone("bone_block", "뼈 블록", { faces: column("bone_block_side", "bone_block_top"), hardness: 2, axis: true }),
  stone("polished_granite", "윤나는 화강암"),
  stone("polished_diorite", "윤나는 섬록암"),
  stone("polished_andesite", "윤나는 안산암"),
  stone("cracked_stone_bricks", "금 간 석재 벽돌"),
  stone("chiseled_stone_bricks", "조각된 석재 벽돌"),
  stone("smooth_sandstone", "매끄러운 사암", { faces: all("sandstone_top"), hardness: 2 }),
  stone("cut_sandstone", "깎인 사암", { faces: column("cut_sandstone", "sandstone_top"), hardness: 0.8 }),
  stone("chiseled_sandstone", "조각된 사암", { faces: column("chiseled_sandstone", "sandstone_top"), hardness: 0.8 }),
  stone("terracotta", "테라코타", { hardness: 1.25 }),
  { key: "packed_ice", name: "단단한 얼음", hardness: 0.5, tool: "pickaxe", drops: [] },
  { key: "tnt", name: "TNT", faces: column("tnt_side", "tnt_top", "tnt_bottom"), hardness: 0 },
  stone("enchanting_table", "마법 부여대", {
    faces: ["enchanting_table_side", "enchanting_table_side", "enchanting_table_top", "obsidian", "enchanting_table_side", "enchanting_table_side"],
    hardness: 5,
    light: 7,
    gui: "enchanting",
  }),
  stone("polished_deepslate", "윤나는 심층암", { hardness: 3.5 }),
  stone("deepslate_bricks", "심층암 벽돌", { hardness: 3.5 }),
  stone("deepslate_tiles", "심층암 타일", { hardness: 3.5 }),
  stone("cut_copper", "깎인 구리", { hardness: 3, tier: 1 }),
  wood("barrel", "통", column("barrel_side", "barrel_top", "barrel_bottom"), { gui: "chest" }),
  wood("fletching_table", "화살 제작대", ["fletching_table_side", "fletching_table_side", "fletching_table_top", "birch_planks", "fletching_table_front", "fletching_table_front"]),
  wood("smithing_table", "대장장이 작업대", ["smithing_table_side", "smithing_table_side", "smithing_table_top", "smithing_table_bottom", "smithing_table_front", "smithing_table_front"]),
  wood("cartography_table", "지도 제작대", ["cartography_table_side", "cartography_table_side", "cartography_table_top", "spruce_planks", "cartography_table_side", "cartography_table_side"]),
  { key: "coarse_dirt", name: "거친 흙", hardness: 0.5, tool: "shovel" },
  stone("raw_iron_block", "철 원석 블록", { hardness: 5, tier: 1 }),
  stone("raw_gold_block", "금 원석 블록", { hardness: 5, tier: 2 }),
  stone("raw_copper_block", "구리 원석 블록", { hardness: 5, tier: 1 }),
  {
    key: "ladder",
    name: "사다리",
    faces: all("ladder"),
    shape: "ladder",
    solid: false,
    opaque: false,
    cutout: true,
    hardness: 0.4,
    tool: "axe",
    needsSupport: "any",
  },
  { key: "note_block", name: "소리 블록", faces: all("note_block"), hardness: 0.8, tool: "axe" },
  { key: "jukebox", name: "주크박스", faces: column("jukebox_side", "jukebox_top"), hardness: 2, tool: "axe" },
  { key: "redstone_lamp", name: "레드스톤 조명", faces: all("redstone_lamp_on"), hardness: 0.3, light: 15 },
];

export const BLOCKS: BlockDef[] = SPECS.map((s, id) => ({
  shape: "cube",
  solid: true,
  opaque: true,
  hardness: 1,
  faces: all(s.key),
  ...s,
  id,
}));

const BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));

export function blockByKey(key: string) {
  return BY_KEY.get(key);
}

/** 키 → ID (없으면 빌드 때 바로 알 수 있게 throw) */
export function bid(key: string) {
  const b = BY_KEY.get(key);
  if (!b) throw new Error(`unknown block ${key}`);
  return b.id;
}

export const B = {
  air: 0,
  stone: bid("stone"),
  grass: bid("grass_block"),
  dirt: bid("dirt"),
  cobble: bid("cobblestone"),
  bedrock: bid("bedrock"),
  sand: bid("sand"),
  gravel: bid("gravel"),
  water: bid("water"),
  lava: bid("lava"),
  deepslate: bid("deepslate"),
  snow: bid("snow"),
  snowBlock: bid("snow_block"),
  ice: bid("ice"),
  sandstone: bid("sandstone"),
  clay: bid("clay"),
  obsidian: bid("obsidian"),
  torch: bid("torch"),
  farmland: bid("farmland"),
  wheat: bid("wheat"),
  furnace: bid("furnace"),
  litFurnace: bid("lit_furnace"),
  chest: bid("chest"),
  cactus: bid("cactus"),
  sugarCane: bid("sugar_cane"),
  grassSnow: bid("grass_block_snow"),
  tuff: bid("tuff"),
  granite: bid("granite"),
  diorite: bid("diorite"),
  andesite: bid("andesite"),
  tnt: bid("tnt"),
  ladder: bid("ladder"),
  bookshelf: bid("bookshelf"),
  noteBlock: bid("note_block"),
} as const;

export const ORE_KEYS = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"] as const;
export type OreKey = (typeof ORE_KEYS)[number];

export const ORE_INFO: Record<OreKey, { name: string; stone: number; deep: number; item: string }> = {
  coal: { name: "석탄", stone: bid("coal_ore"), deep: bid("deepslate_coal_ore"), item: "coal" },
  iron: { name: "철", stone: bid("iron_ore"), deep: bid("deepslate_iron_ore"), item: "raw_iron" },
  copper: { name: "구리", stone: bid("copper_ore"), deep: bid("deepslate_copper_ore"), item: "raw_copper" },
  gold: { name: "금", stone: bid("gold_ore"), deep: bid("deepslate_gold_ore"), item: "raw_gold" },
  redstone: { name: "레드스톤", stone: bid("redstone_ore"), deep: bid("deepslate_redstone_ore"), item: "redstone" },
  lapis: { name: "청금석", stone: bid("lapis_ore"), deep: bid("deepslate_lapis_ore"), item: "lapis_lazuli" },
  diamond: { name: "다이아몬드", stone: bid("diamond_ore"), deep: bid("deepslate_diamond_ore"), item: "diamond" },
  emerald: { name: "에메랄드", stone: bid("emerald_ore"), deep: bid("deepslate_emerald_ore"), item: "emerald" },
};

export function oreOf(id: number): OreKey | null {
  for (const k of ORE_KEYS) if (ORE_INFO[k].stone === id || ORE_INFO[k].deep === id) return k;
  return null;
}
