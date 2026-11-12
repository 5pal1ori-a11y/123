/** Verify-bot feature tiers (independent of shop licenses; set on guild). */
export type VerifyPlanTier = "free" | "pro" | "pro_max";

export const VERIFY_PLAN_LABELS: Record<VerifyPlanTier, string> = {
  free: "FREE",
  pro: "PRO",
  pro_max: "PRO MAX",
};

const RANK: Record<VerifyPlanTier, number> = { free: 0, pro: 1, pro_max: 2 };

export type VerifyPlanFeature =
  | "heatmap"
  | "audit_log"
  | "suspicion"
  | "auto_kick"
  | "slash_mod"
  | "turnstile"
  | "asn_chart"
  | "source_tracking"
  | "require_phone"
  | "recovery_unlimited";

const FEATURE_MIN: Record<VerifyPlanFeature, VerifyPlanTier> = {
  heatmap: "pro",
  audit_log: "pro",
  suspicion: "pro",
  auto_kick: "pro",
  slash_mod: "pro",
  turnstile: "pro_max",
  asn_chart: "pro_max",
  source_tracking: "pro",
  require_phone: "pro",
  recovery_unlimited: "pro_max",
};

export const VERIFY_RECOVERY_LIMIT: Record<VerifyPlanTier, number> = {
  free: 50,
  pro: 500,
  pro_max: 50_000,
};

export function verifyPlanMeets(plan: VerifyPlanTier, min: VerifyPlanTier) {
  return RANK[plan] >= RANK[min];
}

export function verifyHasFeature(plan: VerifyPlanTier, feature: VerifyPlanFeature) {
  return verifyPlanMeets(plan, FEATURE_MIN[feature]);
}

export function verifyFeatureError(plan: VerifyPlanTier, feature: VerifyPlanFeature): string | null {
  if (verifyHasFeature(plan, feature)) return null;
  const need = FEATURE_MIN[feature];
  return `이 기능은 Verify ${VERIFY_PLAN_LABELS[need]} 이상에서 사용할 수 있어요.`;
}

export function recoveryLimitFor(plan: VerifyPlanTier) {
  return VERIFY_RECOVERY_LIMIT[plan];
}
