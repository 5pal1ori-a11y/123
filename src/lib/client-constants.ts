import type { LicensePlan } from "@/lib/types";
import { getLicensePriceForPlan, PAID_LICENSE_PLANS } from "@/lib/plans";

export function getLicensePrice(plan: LicensePlan = "lite") {
  return getLicensePriceForPlan(plan);
}

export const LICENSE_PLANS: LicensePlan[] = PAID_LICENSE_PLANS;
