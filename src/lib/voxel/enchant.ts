/** 마법 부여 — 마인크래프트 자바 에디션의 비용 · 가중치 공식을 줄여서 따른다 */

import { item, type Stack } from "./items";
import { mulberry32 } from "./noise";

export type EnchKey =
  | "efficiency"
  | "silk_touch"
  | "fortune"
  | "unbreaking"
  | "sharpness"
  | "knockback"
  | "fire_aspect"
  | "looting"
  | "protection"
  | "feather_falling"
  | "respiration"
  | "power"
  | "infinity";

type Slot = "dig" | "sword" | "armor" | "boots" | "helmet" | "bow" | "durable";

type Def = { name: string; max: number; weight: number; slots: Slot[]; min: (l: number) => number; span: number; conflicts?: EnchKey[] };

export const ENCHANTS: Record<EnchKey, Def> = {
  efficiency: { name: "효율", max: 5, weight: 10, slots: ["dig"], min: (l) => 1 + 10 * (l - 1), span: 50 },
  silk_touch: { name: "섬세한 손길", max: 1, weight: 1, slots: ["dig"], min: () => 15, span: 50, conflicts: ["fortune"] },
  fortune: { name: "행운", max: 3, weight: 2, slots: ["dig"], min: (l) => 15 + 9 * (l - 1), span: 50, conflicts: ["silk_touch"] },
  unbreaking: { name: "내구성", max: 3, weight: 5, slots: ["durable"], min: (l) => 5 + 8 * (l - 1), span: 50 },
  sharpness: { name: "날카로움", max: 5, weight: 10, slots: ["sword"], min: (l) => 1 + 11 * (l - 1), span: 20 },
  knockback: { name: "밀치기", max: 2, weight: 5, slots: ["sword"], min: (l) => 5 + 20 * (l - 1), span: 50 },
  fire_aspect: { name: "발화", max: 2, weight: 2, slots: ["sword"], min: (l) => 10 + 20 * (l - 1), span: 50 },
  looting: { name: "약탈", max: 3, weight: 2, slots: ["sword"], min: (l) => 15 + 9 * (l - 1), span: 50 },
  protection: { name: "보호", max: 4, weight: 10, slots: ["armor"], min: (l) => 1 + 11 * (l - 1), span: 11 },
  feather_falling: { name: "가벼운 착지", max: 4, weight: 5, slots: ["boots"], min: (l) => 5 + 6 * (l - 1), span: 6 },
  respiration: { name: "호흡", max: 3, weight: 2, slots: ["helmet"], min: (l) => 10 * l, span: 30 },
  power: { name: "힘", max: 5, weight: 10, slots: ["bow"], min: (l) => 1 + 10 * (l - 1), span: 15 },
  infinity: { name: "무한", max: 1, weight: 1, slots: ["bow"], min: () => 20, span: 30 },
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export const roman = (n: number) => ROMAN[n] ?? String(n);

export function enchName(key: string, level: number) {
  const d = ENCHANTS[key as EnchKey];
  if (!d) return key;
  return d.max === 1 ? d.name : `${d.name} ${roman(level)}`;
}

function slotsOf(id: string): Slot[] {
  const def = item(id);
  if (!def) return [];
  if (id === "bow") return ["bow", "durable"];
  if (def.tool) {
    if (def.tool.kind === "sword") return ["sword", "durable"];
    if (def.tool.kind === "shears") return [];
    return ["dig", "durable"];
  }
  if (def.armor) return ["armor", "durable", ...(def.armor.slot === 3 ? (["boots"] as const) : def.armor.slot === 0 ? (["helmet"] as const) : [])];
  return [];
}

export function isEnchantable(s: Stack | null | undefined) {
  return Boolean(s && !s.ench && slotsOf(s.id).length);
}

/** 재료가 마법이 얼마나 잘 붙는지 (마인크래프트 enchantability) */
function enchantability(id: string) {
  const def = item(id);
  if (id === "bow") return 1;
  const mat = def?.tool?.material ?? def?.armor?.material;
  const armor = Boolean(def?.armor);
  switch (mat) {
    case "wooden":
      return 15;
    case "stone":
      return 5;
    case "iron":
      return armor ? 9 : 14;
    case "golden":
      return armor ? 25 : 22;
    case "diamond":
      return 10;
    case "leather":
      return 15;
    default:
      return 1;
  }
}

/** 주변 책장 수 → 세 칸의 레벨 비용 */
export function enchantCosts(shelves: number, seed: number): [number, number, number] {
  const b = Math.max(0, Math.min(15, shelves));
  const r = mulberry32((seed ^ 0x51ed) >>> 0);
  const base = 1 + Math.floor(r() * 8) + Math.floor(b / 2) + Math.floor(r() * (b + 1));
  return [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3) + 1, Math.max(base, b * 2)];
}

/** 아이템 · 비용 · 칸마다 정해진 결과 (화면 힌트와 실제 결과가 같도록 seed 로 고정) */
export function rollEnchants(id: string, cost: number, seed: number, slot: number): Record<string, number> {
  const slots = slotsOf(id);
  if (!slots.length) return {};
  const r = mulberry32((seed * 31 + slot * 7919 + id.length * 131) >>> 0);
  const e = enchantability(id);
  const q = Math.floor(e / 4) + 1;
  let m = cost + 1 + Math.floor(r() * q) + Math.floor(r() * q);
  m = Math.max(1, Math.round(m * (1 + (r() + r() - 1) * 0.15)));

  const pool = () => {
    const out: { key: EnchKey; level: number; weight: number }[] = [];
    for (const [key, d] of Object.entries(ENCHANTS) as [EnchKey, Def][]) {
      if (!d.slots.some((s) => slots.includes(s))) continue;
      for (let l = d.max; l >= 1; l--) {
        if (m >= d.min(l) && m <= d.min(l) + d.span) {
          out.push({ key, level: l, weight: d.weight });
          break;
        }
      }
    }
    return out;
  };
  const result: Record<string, number> = {};
  let cands = pool();
  const pick = () => {
    const total = cands.reduce((a, c) => a + c.weight, 0);
    if (!total) return null;
    let k = r() * total;
    for (const c of cands) {
      k -= c.weight;
      if (k <= 0) return c;
    }
    return cands[cands.length - 1]!;
  };
  const first = pick();
  if (!first) return { unbreaking: 1 };
  result[first.key] = first.level;
  while (r() < (m + 1) / 50) {
    m = Math.floor(m / 2);
    cands = pool().filter((c) => !(c.key in result) && !Object.keys(result).some((k) => ENCHANTS[k as EnchKey].conflicts?.includes(c.key)));
    const next = pick();
    if (!next) break;
    result[next.key] = next.level;
  }
  return result;
}

export const enchLevel = (s: Stack | null | undefined, key: EnchKey) => s?.ench?.[key] ?? 0;
