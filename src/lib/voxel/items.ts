import { BLOCKS, blockByKey, COLORS, type BlockDef, type Tier, type ToolKind } from "./blocks";

export type ToolInfo = { kind: ToolKind; tier: Tier; speed: number; damage: number; durability: number; material: Material };
export type ArmorInfo = { slot: 0 | 1 | 2 | 3; defense: number; toughness: number; durability: number; material: Material };
export type FoodInfo = { hunger: number; saturation: number };

export type Material = "wooden" | "stone" | "iron" | "golden" | "diamond" | "leather";

export type ItemDef = {
  key: string;
  name: string;
  stack: number;
  /** 손에 들고 우클릭하면 놓이는 블록 */
  block?: number;
  tool?: ToolInfo;
  armor?: ArmorInfo;
  food?: FoodInfo;
  /** 화로 연료로 탈 수 있는 초 */
  fuel?: number;
  /** 근접 공격력 (없으면 1) */
  damage?: number;
  /** 도구 · 갑옷이 아닌데 닳는 것 (부싯돌과 부시 · 방패) */
  durability?: number;
  /** 아이콘: 블록이면 입체, 아니면 픽셀 스프라이트 이름 */
  icon: { block: number } | { sprite: string };
};

export type Stack = { id: string; count: number; dmg?: number; ench?: Record<string, number> };

const ITEMS = new Map<string, ItemDef>();

function add(def: ItemDef) {
  ITEMS.set(def.key, def);
}

const NOT_ITEMS = new Set(["air", "water", "lava", "lit_furnace", "wheat", "farmland", "grass_block_snow"]);
const SPRITE_BLOCKS = new Set(["torch", "ladder"]);

const BLOCK_FUEL: Record<string, number> = {
  crafting_table: 15,
  chest: 15,
  barrel: 15,
  bookshelf: 15,
  fletching_table: 15,
  smithing_table: 15,
  cartography_table: 15,
  note_block: 15,
  jukebox: 15,
  ladder: 15,
  coal_block: 800,
};

for (const b of BLOCKS) {
  if (NOT_ITEMS.has(b.key)) continue;
  const flat = b.shape === "cross" || SPRITE_BLOCKS.has(b.key);
  let fuel = BLOCK_FUEL[b.key];
  if (/_(log|planks)$/.test(b.key)) fuel = 15;
  if (/_sapling$/.test(b.key)) fuel = 5;
  if (/_wool$/.test(b.key)) fuel = 5;
  if (/_carpet$/.test(b.key)) fuel = 3.35;
  add({
    key: b.key,
    name: b.key === "bricks" ? "벽돌 블록" : b.name,
    stack: 64,
    block: b.id,
    fuel,
    icon: flat ? { sprite: b.key } : { block: b.id },
  });
}

const simple = (key: string, name: string, extra: Partial<ItemDef> = {}) =>
  add({ key, name, stack: 64, icon: { sprite: key }, ...extra });

simple("stick", "막대기", { fuel: 5 });
simple("coal", "석탄", { fuel: 80 });
simple("charcoal", "숯", { fuel: 80 });
simple("raw_iron", "철 원석");
simple("raw_copper", "구리 원석");
simple("raw_gold", "금 원석");
simple("iron_ingot", "철 주괴");
simple("copper_ingot", "구리 주괴");
simple("gold_ingot", "금 주괴");
simple("iron_nugget", "철 조각");
simple("gold_nugget", "금 조각");
simple("diamond", "다이아몬드");
simple("emerald", "에메랄드");
simple("redstone", "레드스톤 가루");
simple("lapis_lazuli", "청금석");
simple("glowstone_dust", "발광석 가루");
simple("flint", "부싯돌");
simple("wheat_seeds", "밀 씨앗", { block: blockByKey("wheat")!.id });
simple("wheat", "밀");
simple("bone", "뼈");
simple("bone_meal", "뼛가루");
simple("string", "실");
simple("gunpowder", "화약");
simple("feather", "깃털");
simple("leather", "가죽");
simple("bowl", "그릇", { fuel: 5 });
simple("snowball", "눈덩이", { stack: 16 });
simple("clay_ball", "점토 덩이");
simple("brick", "벽돌");
simple("paper", "종이");
simple("book", "책");
simple("arrow", "화살");
simple("bucket", "양동이", { stack: 16 });
simple("water_bucket", "물 양동이", { stack: 1 });
simple("lava_bucket", "용암 양동이", { stack: 1, fuel: 1000 });
simple("milk_bucket", "우유 양동이", { stack: 1 });
simple("sugar", "설탕");
simple("compass", "나침반");
simple("clock", "시계");
simple("flint_and_steel", "부싯돌과 부시", { stack: 1, durability: 64 });
simple("shield", "방패", { stack: 1, durability: 336, fuel: 15 });
simple("egg", "달걀", { stack: 16 });
for (const [c, ko] of COLORS) simple(`${c}_dye`, `${ko} 염료`);

const food = (key: string, name: string, hunger: number, saturation: number, stack = 64) =>
  simple(key, name, { food: { hunger, saturation }, stack });
food("apple", "사과", 4, 2.4);
food("bread", "빵", 5, 6);
food("porkchop", "익히지 않은 돼지고기", 3, 1.8);
food("cooked_porkchop", "익힌 돼지고기", 8, 12.8);
food("beef", "익히지 않은 소고기", 3, 1.8);
food("cooked_beef", "스테이크", 8, 12.8);
food("chicken", "익히지 않은 닭고기", 2, 1.2);
food("cooked_chicken", "익힌 닭고기", 6, 7.2);
food("mutton", "익히지 않은 양고기", 2, 1.2);
food("cooked_mutton", "익힌 양고기", 6, 9.6);
food("rotten_flesh", "썩은 살점", 4, 0.8);
food("mushroom_stew", "버섯 스튜", 6, 7.2, 1);
food("golden_apple", "황금 사과", 4, 9.6);
food("pumpkin_pie", "호박 파이", 8, 4.8);
food("cake", "케이크", 14, 2.8, 1);

/* 도구: 마인크래프트 자바 에디션 1.20 수치 */
const TIERS: Record<Exclude<Material, "leather">, { tier: Tier; speed: number; durability: number; label: string; bonus: number }> = {
  wooden: { tier: 0, speed: 2, durability: 59, label: "나무", bonus: 0 },
  stone: { tier: 1, speed: 4, durability: 131, label: "돌", bonus: 1 },
  iron: { tier: 2, speed: 6, durability: 250, label: "철", bonus: 2 },
  golden: { tier: 0, speed: 12, durability: 32, label: "금", bonus: 0 },
  diamond: { tier: 3, speed: 8, durability: 1561, label: "다이아몬드", bonus: 3 },
};
const TOOL_NAME: Record<Exclude<ToolKind, "shears">, string> = { pickaxe: "곡괭이", axe: "도끼", shovel: "삽", hoe: "괭이", sword: "검" };
const SWORD_DMG = { wooden: 4, stone: 5, iron: 6, golden: 4, diamond: 7 };
const AXE_DMG = { wooden: 7, stone: 9, iron: 9, golden: 7, diamond: 9 };

for (const mat of Object.keys(TIERS) as (keyof typeof TIERS)[]) {
  const t = TIERS[mat];
  for (const kind of Object.keys(TOOL_NAME) as (keyof typeof TOOL_NAME)[]) {
    const damage =
      kind === "sword" ? SWORD_DMG[mat] : kind === "axe" ? AXE_DMG[mat] : kind === "pickaxe" ? 2 + t.bonus : kind === "shovel" ? 2.5 + t.bonus : 1;
    add({
      key: `${mat}_${kind}`,
      name: `${t.label} ${TOOL_NAME[kind]}`,
      stack: 1,
      tool: { kind, tier: t.tier, speed: kind === "sword" ? 1.5 : t.speed, damage, durability: t.durability, material: mat },
      damage,
      fuel: mat === "wooden" ? 10 : undefined,
      icon: { sprite: `${mat}_${kind}` },
    });
  }
}
add({
  key: "shears",
  name: "가위",
  stack: 1,
  tool: { kind: "shears", tier: 0, speed: 5, damage: 1, durability: 238, material: "iron" },
  icon: { sprite: "shears" },
});
add({ key: "bow", name: "활", stack: 1, fuel: 15, icon: { sprite: "bow" }, tool: { kind: "sword", tier: 0, speed: 1, damage: 1, durability: 384, material: "wooden" } });

const ARMOR_SLOT = [
  ["helmet", "투구", 11],
  ["chestplate", "흉갑", 16],
  ["leggings", "레깅스", 15],
  ["boots", "부츠", 13],
] as const;
const LEATHER_NAME = ["가죽 모자", "가죽 튜닉", "가죽 바지", "가죽 장화"];
const ARMOR_MAT: Record<"leather" | "iron" | "golden" | "diamond", { label: string; def: number[]; mult: number; tough: number }> = {
  leather: { label: "가죽", def: [1, 3, 2, 1], mult: 5, tough: 0 },
  golden: { label: "금", def: [2, 5, 3, 1], mult: 7, tough: 0 },
  iron: { label: "철", def: [2, 6, 5, 2], mult: 15, tough: 0 },
  diamond: { label: "다이아몬드", def: [3, 8, 6, 3], mult: 33, tough: 2 },
};
for (const mat of Object.keys(ARMOR_MAT) as (keyof typeof ARMOR_MAT)[]) {
  const m = ARMOR_MAT[mat];
  ARMOR_SLOT.forEach(([slotKey, slotName, base], slot) => {
    add({
      key: `${mat}_${slotKey}`,
      name: mat === "leather" ? LEATHER_NAME[slot]! : `${m.label} ${slotName}`,
      stack: 1,
      armor: { slot: slot as 0 | 1 | 2 | 3, defense: m.def[slot]!, toughness: m.tough, durability: base * m.mult, material: mat },
      icon: { sprite: `${mat}_${slotKey}` },
    });
  });
}

export function item(key: string): ItemDef | undefined {
  return ITEMS.get(key);
}

export function itemName(key: string) {
  return ITEMS.get(key)?.name ?? key;
}

export function maxStack(key: string) {
  return ITEMS.get(key)?.stack ?? 64;
}

export function allItems() {
  return [...ITEMS.values()];
}

/** 블록 → 떨어뜨리는 아이템 키 (블록 아이템이면 자기 자신) */
export function blockItemKey(b: BlockDef) {
  return ITEMS.has(b.key) ? b.key : null;
}

export function maxDurability(key: string) {
  const d = ITEMS.get(key);
  return d?.tool?.durability ?? d?.armor?.durability ?? d?.durability ?? 0;
}

/** 같은 칸에 겹쳐 쌓을 수 있는지 */
export function stackable(a: Stack, b: Stack) {
  return a.id === b.id && a.dmg === undefined && b.dmg === undefined && !a.ench && !b.ench && maxStack(a.id) > 1;
}
