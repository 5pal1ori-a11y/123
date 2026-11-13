/** 마인크래프트 계정 상품 공용 유틸 (클라이언트·서버 공용, 외부 의존 없음) */

export const MC_NICKNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

/** "BOOMER12345" → "BO*******5" (앞 2글자 + * + 마지막 1글자) */
export function maskMcNickname(name: string): string {
  const n = name.trim();
  if (!n) return "";
  if (n.length <= 3) return `${n[0]}${"*".repeat(Math.max(1, n.length - 1))}`;
  return `${n.slice(0, 2)}${"*".repeat(n.length - 3)}${n.slice(-1)}`;
}

export type McCapeSource = "minecraft" | "optifine";

export type McCapeInfo = {
  source: McCapeSource;
  /** 원본 텍스처 가로 기준값 (Mojang 64, OptiFine 46) — 앞면 크롭 배율 계산에 사용 */
  baseWidth: number;
  /** 망토 이름 (예: Aurora, Pan) */
  title?: string;
  /** true 면 이미 앞면만 그린 이미지 (크롭하지 않고 그대로 보여준다) */
  front?: boolean;
};

/**
 * 망토 표시 순서 (capes.me 종류 이름). 여기 없는 망토는 이 뒤에 capes.me 기본 순서로 붙는다.
 * Aurora → Moonlight Trail → Minecraft Experience → Crafter → Copper → Home → Menace → Purple Heart →
 * Zombie Horse → Vanilla → Cherry Blossom → Pan → Founder's → Migrator → Yearn → Common →
 * 15th Anniversary → Builder → Follower's → Hero → Twisted → Mojang Office
 */
export const CAPE_ORDER = [
  "aurora",
  "moonlighttrail",
  "mcexp",
  "crafter",
  "copper",
  "home",
  "menace",
  "twitch",
  "zombiehorse",
  "vanilla_cape",
  "cherry",
  "pan",
  "founders",
  "migrator_cape",
  "yearn",
  "common",
  "15A",
  "builder",
  "tiktok",
  "hero",
  "twisted",
  "mojangoffice",
];

export type McAccountInfo = {
  ok: boolean;
  capes: McCapeInfo[];
};
