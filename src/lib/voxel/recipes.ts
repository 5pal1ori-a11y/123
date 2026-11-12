/** 마인크래프트 자바 에디션 제작법 (모양 · 무형 · 화로) */

import { COLORS } from "./blocks";

export type Ingredient = string; // 아이템 키 또는 #태그
export type Shaped = { kind: "shaped"; rows: string[]; key: Record<string, Ingredient>; out: string; count: number; group: string };
export type Shapeless = { kind: "shapeless"; items: Ingredient[]; out: string; count: number; group: string };
export type Recipe = Shaped | Shapeless;

const TAGS: Record<string, (k: string) => boolean> = {
  planks: (k) => k.endsWith("_planks"),
  logs: (k) => k.endsWith("_log"),
  stone_tool: (k) => k === "cobblestone" || k === "cobbled_deepslate",
  coals: (k) => k === "coal" || k === "charcoal",
  wool: (k) => k.endsWith("_wool"),
  stained_glass: (k) => k.endsWith("_stained_glass"),
};

export const TAG_SAMPLE: Record<string, string> = {
  planks: "oak_planks",
  logs: "oak_log",
  stone_tool: "cobblestone",
  coals: "coal",
  wool: "white_wool",
  stained_glass: "white_stained_glass",
};

export function matches(ing: Ingredient, key: string | null) {
  if (!key) return false;
  if (ing.startsWith("#")) return TAGS[ing.slice(1)]?.(key) ?? false;
  return ing === key;
}

const shaped = (group: string, out: string, count: number, rows: string[], key: Record<string, Ingredient>): Shaped => ({
  kind: "shaped",
  rows,
  key,
  out,
  count,
  group,
});
const shapeless = (group: string, out: string, count: number, items: Ingredient[]): Shapeless => ({ kind: "shapeless", items, out, count, group });

const WOODS = ["oak", "birch", "spruce", "acacia", "jungle"];
const MATS: [string, Ingredient][] = [
  ["wooden", "#planks"],
  ["stone", "#stone_tool"],
  ["iron", "iron_ingot"],
  ["golden", "gold_ingot"],
  ["diamond", "diamond"],
];
const ARMOR: [string, Ingredient][] = [
  ["leather", "leather"],
  ["iron", "iron_ingot"],
  ["golden", "gold_ingot"],
  ["diamond", "diamond"],
];
const STORAGE: [string, string][] = [
  ["iron_block", "iron_ingot"],
  ["gold_block", "gold_ingot"],
  ["diamond_block", "diamond"],
  ["emerald_block", "emerald"],
  ["lapis_block", "lapis_lazuli"],
  ["coal_block", "coal"],
  ["copper_block", "copper_ingot"],
  ["redstone_block", "redstone"],
];
const RAW_STORAGE: [string, string][] = [
  ["raw_iron_block", "raw_iron"],
  ["raw_gold_block", "raw_gold"],
  ["raw_copper_block", "raw_copper"],
];

export const RECIPES: Recipe[] = [
  ...WOODS.map((w) => shapeless("기본", `${w}_planks`, 4, [`${w}_log`])),
  shaped("기본", "stick", 4, ["#", "#"], { "#": "#planks" }),
  shaped("기본", "crafting_table", 1, ["##", "##"], { "#": "#planks" }),
  shaped("기본", "furnace", 1, ["###", "# #", "###"], { "#": "#stone_tool" }),
  shaped("기본", "chest", 1, ["###", "# #", "###"], { "#": "#planks" }),
  shaped("기본", "torch", 4, ["C", "S"], { C: "#coals", S: "stick" }),
  ...MATS.flatMap(([m, x]) => [
    shaped("도구", `${m}_pickaxe`, 1, ["XXX", " S ", " S "], { X: x, S: "stick" }),
    shaped("도구", `${m}_axe`, 1, ["XX", "XS", " S"], { X: x, S: "stick" }),
    shaped("도구", `${m}_shovel`, 1, ["X", "S", "S"], { X: x, S: "stick" }),
    shaped("도구", `${m}_hoe`, 1, ["XX", " S", " S"], { X: x, S: "stick" }),
    shaped("전투", `${m}_sword`, 1, ["X", "X", "S"], { X: x, S: "stick" }),
  ]),
  ...ARMOR.flatMap(([m, x]) => [
    shaped("전투", `${m}_helmet`, 1, ["XXX", "X X"], { X: x }),
    shaped("전투", `${m}_chestplate`, 1, ["X X", "XXX", "XXX"], { X: x }),
    shaped("전투", `${m}_leggings`, 1, ["XXX", "X X", "X X"], { X: x }),
    shaped("전투", `${m}_boots`, 1, ["X X", "X X"], { X: x }),
  ]),
  shaped("전투", "bow", 1, [" #S", "# S", " #S"], { "#": "stick", S: "string" }),
  shaped("전투", "arrow", 4, ["F", "S", "E"], { F: "flint", S: "stick", E: "feather" }),
  shaped("도구", "bucket", 1, ["I I", " I "], { I: "iron_ingot" }),
  shaped("도구", "shears", 1, [" I", "I "], { I: "iron_ingot" }),
  shaped("음식", "bowl", 4, ["# #", " # "], { "#": "#planks" }),
  shaped("음식", "bread", 1, ["WWW"], { W: "wheat" }),
  shapeless("음식", "mushroom_stew", 1, ["bowl", "red_mushroom", "brown_mushroom"]),
  shaped("재료", "paper", 3, ["SSS"], { S: "sugar_cane" }),
  shapeless("재료", "book", 1, ["paper", "paper", "paper", "leather"]),
  shapeless("재료", "bone_meal", 3, ["bone"]),
  shaped("건축", "bookshelf", 1, ["PPP", "BBB", "PPP"], { P: "#planks", B: "book" }),
  shaped("건축", "stone_bricks", 4, ["SS", "SS"], { S: "stone" }),
  shaped("건축", "bricks", 1, ["BB", "BB"], { B: "brick" }),
  shaped("건축", "sandstone", 1, ["SS", "SS"], { S: "sand" }),
  shaped("건축", "snow_block", 1, ["SS", "SS"], { S: "snowball" }),
  shaped("건축", "clay", 1, ["CC", "CC"], { C: "clay_ball" }),
  shaped("건축", "white_wool", 1, ["SS", "SS"], { S: "string" }),
  shaped("건축", "glowstone", 1, ["GG", "GG"], { G: "glowstone_dust" }),
  ...STORAGE.flatMap(([block, unit]) => [
    shaped("광물", block, 1, ["XXX", "XXX", "XXX"], { X: unit }),
    shapeless("광물", unit, 9, [block]),
  ]),
  shaped("광물", "iron_ingot", 1, ["XXX", "XXX", "XXX"], { X: "iron_nugget" }),
  shaped("광물", "gold_ingot", 1, ["XXX", "XXX", "XXX"], { X: "gold_nugget" }),
  shapeless("광물", "iron_nugget", 9, ["iron_ingot"]),
  shapeless("광물", "gold_nugget", 9, ["gold_ingot"]),
  ...RAW_STORAGE.flatMap(([block, unit]) => [shaped("광물", block, 1, ["XXX", "XXX", "XXX"], { X: unit }), shapeless("광물", unit, 9, [block])]),

  /* 염료 */
  shapeless("염료", "white_dye", 1, ["bone_meal"]),
  shapeless("염료", "red_dye", 1, ["poppy"]),
  shapeless("염료", "yellow_dye", 1, ["dandelion"]),
  shapeless("염료", "blue_dye", 1, ["cornflower"]),
  shapeless("염료", "blue_dye", 1, ["lapis_lazuli"]),
  shapeless("염료", "light_blue_dye", 1, ["blue_orchid"]),
  shapeless("염료", "black_dye", 1, ["#coals"]),
  shapeless("염료", "brown_dye", 1, ["brown_mushroom"]),
  shapeless("염료", "orange_dye", 2, ["red_dye", "yellow_dye"]),
  shapeless("염료", "pink_dye", 2, ["red_dye", "white_dye"]),
  shapeless("염료", "lime_dye", 2, ["green_dye", "white_dye"]),
  shapeless("염료", "cyan_dye", 2, ["blue_dye", "green_dye"]),
  shapeless("염료", "purple_dye", 2, ["red_dye", "blue_dye"]),
  shapeless("염료", "magenta_dye", 2, ["purple_dye", "pink_dye"]),
  shapeless("염료", "gray_dye", 2, ["black_dye", "white_dye"]),
  shapeless("염료", "light_gray_dye", 2, ["gray_dye", "white_dye"]),
  shapeless("염료", "light_blue_dye", 2, ["blue_dye", "white_dye"]),
  ...COLORS.filter(([c]) => c !== "white").map(([c]) => shapeless("염료", `${c}_wool`, 1, [`${c}_dye`, "#wool"])),
  ...COLORS.map(([c]) => shaped("건축", `${c}_carpet`, 3, ["WW"], { W: `${c}_wool` })),
  ...COLORS.map(([c]) => shaped("건축", `${c}_stained_glass`, 8, ["GGG", "GDG", "GGG"], { G: "glass", D: `${c}_dye` })),

  /* 건축 */
  shapeless("건축", "polished_granite", 4, ["granite", "granite", "granite", "granite"]),
  shapeless("건축", "polished_diorite", 4, ["diorite", "diorite", "diorite", "diorite"]),
  shapeless("건축", "polished_andesite", 4, ["andesite", "andesite", "andesite", "andesite"]),
  shaped("건축", "granite", 1, ["DQ"], { D: "diorite", Q: "redstone" }),
  shaped("건축", "diorite", 2, ["CQ", "QC"], { C: "cobblestone", Q: "redstone" }),
  shapeless("건축", "andesite", 2, ["diorite", "cobblestone"]),
  shaped("건축", "chiseled_stone_bricks", 1, ["S", "S"], { S: "stone_bricks" }),
  shaped("건축", "cut_sandstone", 4, ["SS", "SS"], { S: "sandstone" }),
  shaped("건축", "chiseled_sandstone", 1, ["S", "S"], { S: "cut_sandstone" }),
  shaped("건축", "polished_deepslate", 4, ["SS", "SS"], { S: "cobbled_deepslate" }),
  shaped("건축", "deepslate_bricks", 4, ["SS", "SS"], { S: "polished_deepslate" }),
  shaped("건축", "deepslate_tiles", 4, ["SS", "SS"], { S: "deepslate_bricks" }),
  shaped("건축", "cut_copper", 4, ["SS", "SS"], { S: "copper_block" }),
  shaped("건축", "packed_ice", 1, ["III", "III", "III"], { I: "ice" }),
  shaped("건축", "coarse_dirt", 4, ["DG", "GD"], { D: "dirt", G: "gravel" }),
  shaped("건축", "hay_block", 1, ["WWW", "WWW", "WWW"], { W: "wheat" }),
  shapeless("음식", "wheat", 9, ["hay_block"]),
  shaped("건축", "bone_block", 1, ["BBB", "BBB", "BBB"], { B: "bone_meal" }),
  shapeless("재료", "bone_meal", 9, ["bone_block"]),
  shaped("건축", "ladder", 3, ["S S", "SSS", "S S"], { S: "stick" }),
  shaped("건축", "jack_o_lantern", 1, ["P", "T"], { P: "pumpkin", T: "torch" }),
  shaped("건축", "redstone_lamp", 1, [" R ", "RGR", " R "], { R: "redstone", G: "glowstone" }),

  /* 기능 블록 */
  shaped("기본", "barrel", 1, ["PSP", "P P", "PSP"], { P: "#planks", S: "#planks" }),
  shaped("기본", "fletching_table", 1, ["FF", "PP", "PP"], { F: "flint", P: "#planks" }),
  shaped("기본", "smithing_table", 1, ["II", "PP", "PP"], { I: "iron_ingot", P: "#planks" }),
  shaped("기본", "cartography_table", 1, ["CC", "PP", "PP"], { C: "paper", P: "#planks" }),
  shaped("기본", "note_block", 1, ["PPP", "PRP", "PPP"], { P: "#planks", R: "redstone" }),
  shaped("기본", "jukebox", 1, ["PPP", "PDP", "PPP"], { P: "#planks", D: "diamond" }),
  shaped("기본", "enchanting_table", 1, [" B ", "DOD", "OOO"], { B: "book", D: "diamond", O: "obsidian" }),
  shaped("전투", "tnt", 1, ["GSG", "SGS", "GSG"], { G: "gunpowder", S: "sand" }),

  /* 도구 · 전투 */
  shapeless("도구", "flint_and_steel", 1, ["iron_ingot", "flint"]),
  shaped("도구", "compass", 1, [" I ", "IRI", " I "], { I: "iron_ingot", R: "redstone" }),
  shaped("도구", "clock", 1, [" G ", "GRG", " G "], { G: "gold_ingot", R: "redstone" }),
  shaped("전투", "shield", 1, ["PIP", "PPP", " P "], { P: "#planks", I: "iron_ingot" }),

  /* 음식 */
  shapeless("음식", "sugar", 1, ["sugar_cane"]),
  shaped("음식", "golden_apple", 1, ["GGG", "GAG", "GGG"], { G: "gold_ingot", A: "apple" }),
  shapeless("음식", "pumpkin_pie", 1, ["pumpkin", "sugar", "egg"]),
  shaped("음식", "cake", 1, ["MMM", "SES", "WWW"], { M: "milk_bucket", S: "sugar", E: "egg", W: "wheat" }),
];

/** 화로: 입력 → 결과 (아이템 하나에 10초) */
export const SMELTING: Record<string, string> = {
  raw_iron: "iron_ingot",
  raw_gold: "gold_ingot",
  raw_copper: "copper_ingot",
  iron_ore: "iron_ingot",
  gold_ore: "gold_ingot",
  copper_ore: "copper_ingot",
  sand: "glass",
  cobblestone: "stone",
  stone: "smooth_stone",
  cobbled_deepslate: "deepslate",
  clay_ball: "brick",
  porkchop: "cooked_porkchop",
  beef: "cooked_beef",
  chicken: "cooked_chicken",
  mutton: "cooked_mutton",
  oak_log: "charcoal",
  birch_log: "charcoal",
  spruce_log: "charcoal",
  acacia_log: "charcoal",
  jungle_log: "charcoal",
  iron_sword: "iron_nugget",
  iron_pickaxe: "iron_nugget",
  golden_sword: "gold_nugget",
  golden_pickaxe: "gold_nugget",
  iron_axe: "iron_nugget",
  iron_shovel: "iron_nugget",
  iron_hoe: "iron_nugget",
  golden_axe: "gold_nugget",
  golden_shovel: "gold_nugget",
  golden_hoe: "gold_nugget",
  iron_helmet: "iron_nugget",
  iron_chestplate: "iron_nugget",
  iron_leggings: "iron_nugget",
  iron_boots: "iron_nugget",
  golden_helmet: "gold_nugget",
  golden_chestplate: "gold_nugget",
  golden_leggings: "gold_nugget",
  golden_boots: "gold_nugget",
  cactus: "green_dye",
  stone_bricks: "cracked_stone_bricks",
  sandstone: "smooth_sandstone",
  clay: "terracotta",
  deepslate_bricks: "deepslate",
  coal_ore: "coal",
  diamond_ore: "diamond",
  emerald_ore: "emerald",
  lapis_ore: "lapis_lazuli",
  redstone_ore: "redstone",
  deepslate_iron_ore: "iron_ingot",
  deepslate_gold_ore: "gold_ingot",
  deepslate_copper_ore: "copper_ingot",
  deepslate_coal_ore: "coal",
  deepslate_diamond_ore: "diamond",
  deepslate_emerald_ore: "emerald",
  deepslate_lapis_ore: "lapis_lazuli",
  deepslate_redstone_ore: "redstone",
  raw_iron_block: "iron_block",
  raw_gold_block: "gold_block",
  raw_copper_block: "copper_block",
};

/** 화로에서 꺼낼 때 받는 경험치 (아이템 하나당) */
export const SMELT_XP: Record<string, number> = {
  iron_ingot: 0.7,
  gold_ingot: 1,
  copper_ingot: 0.7,
  diamond: 1,
  emerald: 1,
  glass: 0.1,
  stone: 0.1,
  smooth_stone: 0.1,
  brick: 0.3,
  terracotta: 0.35,
  charcoal: 0.15,
  green_dye: 1,
  cooked_porkchop: 0.35,
  cooked_beef: 0.35,
  cooked_chicken: 0.35,
  cooked_mutton: 0.35,
};

/** 제작에 쓰여도 그릇이 남는 재료 */
export const CRAFT_REMAINDER: Record<string, string> = { milk_bucket: "bucket", water_bucket: "bucket", lava_bucket: "bucket" };

export const SMELT_SECONDS = 10;

/** 제작 칸(정사각 n×n) → 결과 */
export function craft(grid: (string | null)[], size: number): { out: string; count: number } | null {
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  const filled: string[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = grid[y * size + x];
      if (!k) continue;
      filled.push(k);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (!filled.length) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const at = (x: number, y: number) => grid[(y0 + y) * size + (x0 + x)] ?? null;

  for (const r of RECIPES) {
    if (r.kind === "shaped") {
      const rh = r.rows.length;
      const rw = Math.max(...r.rows.map((row) => row.length));
      if (rw !== w || rh !== h) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++)
          for (let x = 0; x < w && ok; x++) {
            const ch = r.rows[y]![mirror ? w - 1 - x : x] ?? " ";
            const have = at(x, y);
            if (ch === " ") ok = have === null;
            else ok = matches(r.key[ch]!, have);
          }
        if (ok) return { out: r.out, count: r.count };
      }
    } else {
      if (r.items.length !== filled.length) continue;
      const left = [...filled];
      const ok = r.items.every((ing) => {
        const i = left.findIndex((k) => matches(ing, k));
        if (i < 0) return false;
        left.splice(i, 1);
        return true;
      });
      if (ok) return { out: r.out, count: r.count };
    }
  }
  return null;
}

/** 제작법 책에 보여 줄 3×3 칸 (태그는 대표 아이템으로) */
export function recipeGrid(r: Recipe): (string | null)[] {
  const g: (string | null)[] = Array(9).fill(null);
  const show = (ing: Ingredient) => (ing.startsWith("#") ? TAG_SAMPLE[ing.slice(1)] ?? null : ing);
  if (r.kind === "shaped") {
    r.rows.forEach((row, y) => [...row].forEach((ch, x) => (g[y * 3 + x] = ch === " " ? null : show(r.key[ch]!))));
  } else r.items.forEach((ing, i) => (g[i] = show(ing)));
  return g;
}

/** 3×3 이 필요한지 (2×2 인벤토리로 못 만듦) */
export function needsTable(r: Recipe) {
  if (r.kind === "shapeless") return r.items.length > 4;
  return r.rows.length > 2 || r.rows.some((row) => row.length > 2);
}
