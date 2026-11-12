"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Crown, Gift, Globe, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LicensePlan } from "@/lib/types";
import {
  LICENSE_PLAN_FEATURES,
  LICENSE_PLAN_LABELS,
  LICENSE_PLAN_ORDER,
  formatPlanPrice,
} from "@/lib/plans";
import { staggerContainer, staggerItem } from "@/lib/motion";

const PLAN_ICONS: Record<LicensePlan, LucideIcon> = {
  free: Gift,
  lite: Globe,
  pro: Zap,
  pro_max: Crown,
};

const PLANS = LICENSE_PLAN_ORDER.map((id) => ({
  id,
  label: LICENSE_PLAN_LABELS[id],
  price: formatPlanPrice(id),
  features: LICENSE_PLAN_FEATURES[id],
  Icon: PLAN_ICONS[id],
}));

export function LandingPricingCards() {
  const plans = PLANS;
  return (
    <>
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        {...staggerContainer}
        initial="initial"
        animate="animate"
      >
        {plans.map((plan, i) => {
          const PlanIcon = plan.Icon;
          return (
            <motion.div
              key={plan.id}
              {...staggerItem}
              className={`quartz-card landing-shadow quartz-lift p-6 text-center ${
                plan.id === "pro"
                  ? "ring-1 ring-[color-mix(in_srgb,var(--vx-accent)_45%,transparent)]"
                  : ""
              }`}
            >
              <div
                className={`landing-icon-chip mx-auto mb-4 inline-flex landing-icon-float-${(["a", "b", "c", "d"] as const)[i]}`}
                style={{ animationDelay: `${i * 0.25}s` }}
              >
                <PlanIcon className="size-5" strokeWidth={1.75} />
              </div>
              <p className="text-sm text-neutral-500">{plan.label}</p>
              <p className="mt-2 text-3xl font-extrabold">{plan.price}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {plan.id === "free" ? "기본 플랜" : "/ 월 · 30일 이용"}
              </p>
              <ul className="mt-5 space-y-2 text-left text-sm text-text-secondary">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent/70" />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </motion.div>
      <motion.div
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      >
        <Link href="/activate" className="landing-btn vx-btn-press rounded-full px-6 py-2.5 text-sm">
          FREE로 시작하기
        </Link>
        <Link href="/purchase" className="landing-btn-outline vx-btn-press rounded-full px-6 py-2.5 text-sm">
          유료 플랜 구매
        </Link>
      </motion.div>
    </>
  );
}
