/**
 * 다이아 캐기 — 광석 등급 · 곡괭이 강화 · 확률표 (store 에 의존하지 않는 순수 로직)
 *
 * 기본(나무 곡괭이) 확률·기대값은 예전 출석 랜덤박스와 완전히 같다 (하루 기대값 약 187P).
 * 곡괭이를 강화할수록 꽝(돌멩이) 확률을 4%p씩 줄이고, 그만큼을 철 이상 구간에 원래 비율대로 나눠 준다.
 * 강화 비용은 늘어나는 기대값으로 본전을 뽑는 데 2개월~1년 반이 걸리도록 잡았다 (포인트 소비처).
 */

export type OreKey = "stone" | "coal" | "iron" | "gold" | "diamond" | "emerald" | "netherite";

export const ORES: { key: OreKey; name: string; color: string; glow: string }[] = [
  { key: "stone", name: "돌멩이", color: "#94a3b8", glow: "#64748b" },
  { key: "coal", name: "석탄", color: "#cbd5e1", glow: "#475569" },
  { key: "iron", name: "철", color: "#fed7aa", glow: "#fb923c" },
  { key: "gold", name: "금", color: "#fde047", glow: "#f59e0b" },
  { key: "diamond", name: "다이아", color: "#67e8f9", glow: "#06b6d4" },
  { key: "emerald", name: "에메랄드", color: "#6ee7b7", glow: "#10b981" },
  { key: "netherite", name: "네더라이트", color: "#c4b5fd", glow: "#8b5cf6" },
];

/** 확률 구간 (예전 RANDOM_BOX_TABLE 과 같은 구간 · 가중치) — 구간마다 광석을 붙였다 */
export const MINE_TABLE: { min: number; max: number; weight: number; ore: OreKey }[] = [
  { min: 0, max: 0, weight: 25, ore: "stone" },
  { min: 1, max: 99, weight: 30, ore: "coal" },
  { min: 100, max: 199, weight: 15, ore: "iron" },
  { min: 200, max: 299, weight: 14, ore: "iron" },
  { min: 300, max: 499, weight: 8, ore: "gold" },
  { min: 500, max: 799, weight: 4, ore: "gold" },
  { min: 800, max: 1199, weight: 2, ore: "diamond" },
  { min: 1200, max: 1799, weight: 1.2, ore: "diamond" },
  { min: 1800, max: 2399, weight: 0.5, ore: "emerald" },
  { min: 2400, max: 2999, weight: 0.25, ore: "emerald" },
  { min: 3000, max: 3000, weight: 0.05, ore: "netherite" },
];

export const PICKAXES: { level: number; name: string; cost: number; stoneCut: number; color: string }[] = [
  { level: 0, name: "나무 곡괭이", cost: 0, stoneCut: 0, color: "#b45309" },
  { level: 1, name: "돌 곡괭이", cost: 1_000, stoneCut: 4, color: "#94a3b8" },
  { level: 2, name: "철 곡괭이", cost: 3_000, stoneCut: 8, color: "#e2e8f0" },
  { level: 3, name: "다이아 곡괭이", cost: 8_000, stoneCut: 12, color: "#67e8f9" },
  { level: 4, name: "네더라이트 곡괭이", cost: 20_000, stoneCut: 16, color: "#a78bfa" },
];
export const MAX_PICKAXE_LEVEL = PICKAXES.length - 1;

export function pickaxe(level: number | null | undefined) {
  return PICKAXES[Math.max(0, Math.min(MAX_PICKAXE_LEVEL, Math.floor(level ?? 0)))]!;
}

/** 곡괭이 등급을 반영한 확률표 */
export function mineTable(level: number | null | undefined) {
  const cut = pickaxe(level).stoneCut;
  const table = MINE_TABLE.map((b) => ({ ...b }));
  if (!cut) return table;
  table[0]!.weight -= cut;
  const hi = table.filter((b) => b.min >= 100);
  const sum = hi.reduce((s, b) => s + b.weight, 0);
  for (const b of hi) b.weight += (cut * b.weight) / sum;
  return table;
}

/** 광석별 확률(%) — 패널·곡괭이 카드에 보여 준다 */
export function oreOdds(level: number | null | undefined) {
  const table = mineTable(level);
  const total = table.reduce((s, b) => s + b.weight, 0);
  return ORES.map((o) => ({
    key: o.key,
    name: o.name,
    pct: (table.filter((b) => b.ore === o.key).reduce((s, b) => s + b.weight, 0) / total) * 100,
  }));
}

export function expectedMine(level: number | null | undefined) {
  const table = mineTable(level);
  const total = table.reduce((s, b) => s + b.weight, 0);
  return table.reduce((s, b) => s + ((b.min + b.max) / 2) * b.weight, 0) / total;
}

/** unit: 0 이상 1 미만 난수를 돌려주는 함수 (보안 난수) */
export function rollMine(level: number | null | undefined, unit: () => number) {
  const table = mineTable(level);
  const total = table.reduce((s, b) => s + b.weight, 0);
  let pick = unit() * total;
  let band = table[table.length - 1]!;
  for (const b of table) {
    if (pick < b.weight) {
      band = b;
      break;
    }
    pick -= b.weight;
  }
  return { base: band.min + Math.floor(unit() * (band.max - band.min + 1)), ore: band.ore };
}

export function oreForBase(base: number): OreKey {
  const band = MINE_TABLE.find((b) => base >= b.min && base <= b.max);
  return band?.ore ?? (base >= 3000 ? "netherite" : "stone");
}

export function oreInfo(key: OreKey | string | null | undefined) {
  return ORES.find((o) => o.key === key) ?? ORES[0]!;
}

/** 서버 공동 목표 기본값 — 이번 주(월요일 0시, 한국 시간부터) 서버 전체 채굴 횟수 */
export const DEFAULT_MINE_GOAL = 200;
export const FESTIVAL_HOURS = 24;
export const FESTIVAL_MULTIPLIER = 2;

/** 한국 시간 기준 이번 주 월요일 날짜 (YYYY-MM-DD) */
export function kstWeekStart(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}
