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
};

export type McAccountInfo = {
  ok: boolean;
  capes: McCapeInfo[];
};
