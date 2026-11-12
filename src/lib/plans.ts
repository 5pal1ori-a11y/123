import type { LicensePlan } from "@/lib/types";

export const LICENSE_PLAN_ORDER: LicensePlan[] = ["free", "lite", "pro", "pro_max"];

/** Paid plans available for license purchase */
export const PAID_LICENSE_PLANS: LicensePlan[] = ["lite", "pro", "pro_max"];

export const LICENSE_PLAN_PRICES: Record<LicensePlan, number> = {
  free: 0,
  lite: 4900,
  pro: 9900,
  pro_max: 14900,
};

export const LICENSE_PLAN_LABELS: Record<LicensePlan, string> = {
  free: "FREE",
  lite: "LITE",
  pro: "PRO",
  pro_max: "PRO MAX",
};

export const LICENSE_PLAN_FEATURES: Record<LicensePlan, string[]> = {
  free: ["기본적인 기능", "카테고리 제한 5개", "제품 제한 20개"],
  lite: ["FREE 모든 기능", "서브도메인", "쿠폰 기능"],
  pro: ["LITE 모든 기능", "계좌 자동충전", "회원등급", "Discord 메인 봇 자판기"],
  pro_max: ["PRO 모든 기능", "서브관리자 기능", "문의 기능", "개인봇(자체 토큰)"],
};

export const PLAN_LIMITS: Record<
  LicensePlan,
  { categories: number | null; products: number | null }
> = {
  free: { categories: 5, products: 20 },
  lite: { categories: null, products: null },
  pro: { categories: null, products: null },
  pro_max: { categories: null, products: null },
};

export type PlanFeature =
  | "coupon"
  | "aos_auto_charge"
  | "member_tiers"
  | "sub_admin"
  | "inquiry"
  | "discord_bot"
  | "personal_bot";

const PLAN_FEATURE_MIN: Record<PlanFeature, LicensePlan> = {
  coupon: "lite",
  aos_auto_charge: "pro",
  member_tiers: "pro",
  sub_admin: "pro_max",
  inquiry: "pro_max",
  /** DOES 메인 봇으로 자판기 사용 */
  discord_bot: "pro",
  /** 상점 자체 Discord 봇 토큰(개인봇) */
  personal_bot: "pro_max",
};

const PLAN_RANK: Record<LicensePlan, number> = {
  free: 0,
  lite: 1,
  pro: 2,
  pro_max: 3,
};

export const SUBSCRIPTION_DAYS = 30;
export const GRACE_DAYS = 7;
export const FREE_PLAN_DAYS = 365;

export function getLicensePriceForPlan(plan: LicensePlan) {
  return LICENSE_PLAN_PRICES[plan];
}

export function formatPlanLabel(plan: LicensePlan) {
  return LICENSE_PLAN_LABELS[plan];
}

export function formatPlanPrice(plan: LicensePlan) {
  if (plan === "free") return "무료";
  return `₩${LICENSE_PLAN_PRICES[plan].toLocaleString("ko-KR")}`;
}

export function planMeetsMinimum(plan: LicensePlan, required: LicensePlan) {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

export function shopHasFeature(plan: LicensePlan, feature: PlanFeature) {
  return planMeetsMinimum(plan, PLAN_FEATURE_MIN[feature]);
}

export function planLimitError(
  plan: LicensePlan,
  kind: "categories" | "products",
  current: number,
): string | null {
  const limit = PLAN_LIMITS[plan][kind];
  if (limit === null || current < limit) return null;
  const label = kind === "categories" ? "카테고리" : "제품";
  return `${formatPlanLabel(plan)} 플랜은 ${label}을(를) 최대 ${limit}개까지 등록할 수 있어요.`;
}

export type PlanUsageRow = {
  kind: "products" | "categories";
  label: string;
  current: number;
  limit: number | null;
  unlimited: boolean;
  remaining: number | null;
  pct: number | null;
  nearLimit: boolean;
};

export function buildPlanUsage(
  plan: LicensePlan,
  counts: { products: number; categories: number },
): PlanUsageRow[] {
  return (["products", "categories"] as const).map((kind) => {
    const limit = PLAN_LIMITS[plan][kind];
    const current = counts[kind];
    const unlimited = limit === null;
    const pct = unlimited || !limit ? null : Math.min(100, Math.round((current / limit) * 100));
    return {
      kind,
      label: kind === "products" ? "상품" : "카테고리",
      current,
      limit,
      unlimited,
      remaining: unlimited || limit == null ? null : Math.max(0, limit - current),
      pct,
      nearLimit: !unlimited && limit != null && current >= limit * 0.8,
    };
  });
}

export function formatPlanLimitLabel(plan: LicensePlan, kind: "products" | "categories") {
  const limit = PLAN_LIMITS[plan][kind];
  const label = kind === "products" ? "상품" : "카테고리";
  if (limit === null) return `${label} 무제한 (${formatPlanLabel(plan)})`;
  return `${label} 최대 ${limit}개 (${formatPlanLabel(plan)})`;
}

export function planFeatureError(plan: LicensePlan, feature: PlanFeature): string | null {
  if (shopHasFeature(plan, feature)) return null;
  const required = PLAN_FEATURE_MIN[feature];
  const labels: Record<PlanFeature, string> = {
    coupon: "쿠폰",
    aos_auto_charge: "계좌 자동충전",
    member_tiers: "회원등급",
    sub_admin: "서브관리자",
    inquiry: "문의",
    discord_bot: "Discord 메인 봇 자판기",
    personal_bot: "개인봇",
  };
  return `${labels[feature]} 기능은 ${formatPlanLabel(required)} 이상 플랜에서 사용할 수 있어요.`;
}
