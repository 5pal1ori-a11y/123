/** 프리미엄 플랜 정의 — 클라이언트 · 서버 공용 */
import { RESALE_DEFAULT_FEE_PERCENT } from "@/lib/resale-shared";

export type PremiumPlanId = "basic" | "plus";

export type PremiumPlan = {
  id: PremiumPlanId;
  name: string;
  price: number;
  tagline: string;
  perks: string[];
  /** 모든 상품 추가 할인 % (store.ts PREMIUM_EXTRA_DISCOUNT 와 같게) */
  extraDiscountPercent: number;
  /** 다이아캐기 보상 배수 — fixed: 항상 이 배수 · random: chance 확률로 2~max 배 */
  mine: { kind: "random"; chance: number; max: number } | { kind: "fixed"; multiplier: number };
  resaleFeePercent: number;
  monthlyPoints: number;
  earlyAccessMinutes: number;
};

export const PREMIUM_DAYS = 30;

export const PREMIUM_PLANS: Record<PremiumPlanId, PremiumPlan> = {
  basic: {
    id: "basic",
    name: "BASIC PASS",
    price: 4900,
    tagline: "가볍게 시작하는 혜택",
    perks: ["디스코드 전용 역할", "다이아 캐기 랜덤 2배 ~ 최대 4배", "매달 1회 패스 구매자 전용 이벤트", "모든 제품 3% 추가 할인"],
    extraDiscountPercent: 3,
    mine: { kind: "random", chance: 0.3, max: 4 },
    resaleFeePercent: RESALE_DEFAULT_FEE_PERCENT,
    monthlyPoints: 0,
    earlyAccessMinutes: 0,
  },
  plus: {
    id: "plus",
    name: "DOES PASS+",
    price: 9900,
    tagline: "가장 많이 받는 프리미엄",
    perks: [
      "프리미엄 디스코드 역할",
      "다이아 캐기 보상 항상 2배",
      "모든 대상 제품 5% 추가 할인",
      "프리미엄 전용 월간 이벤트",
      "신규 상품 1시간 우선 구매",
      "도스마켓 판매 수수료 할인 (10% → 7%)",
      "매월 2,500원 포인트 지급",
    ],
    extraDiscountPercent: 5,
    mine: { kind: "fixed", multiplier: 2 },
    resaleFeePercent: 7,
    monthlyPoints: 2500,
    earlyAccessMinutes: 60,
  },
};
