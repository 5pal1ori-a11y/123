"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { shopUrl } from "@/lib/domain";
import { BankTransferPanel } from "@/components/payment/bank-transfer-panel";
import type { BankInfo } from "@/lib/bank";
import type { LicensePlan } from "@/lib/types";
import {
  LICENSE_PLAN_FEATURES,
  LICENSE_PLAN_LABELS,
  LICENSE_PLAN_PRICES,
  PAID_LICENSE_PLANS,
  formatPlanPrice,
} from "@/lib/plans";

type PendingLicense = {
  id: string;
  amount: number;
  plan: LicensePlan;
  reference: string;
  bank: BankInfo;
};

const PLANS = PAID_LICENSE_PLANS;

export function LicensePurchase() {
  const [plan, setPlan] = useState<LicensePlan>("lite");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLicense | null>(null);
  const [waitingApproval, setWaitingApproval] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerEmail: email, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성 실패");
      setPending({
        id: data.license.id,
        amount: data.license.amount,
        plan: data.license.plan,
        reference: data.reference,
        bank: data.bank,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    if (waitingApproval) {
      return (
        <div className="glass-thick landing-shadow p-8 text-center">
          <h3 className="text-xl font-bold">승인 대기 중</h3>
          <p className="mt-3 text-sm text-neutral-400">
            입금이 확인되면 관리자가 {LICENSE_PLAN_LABELS[pending.plan]} 라이선스 키를 발급해요.
            <br />
            키는 이메일({email})로 안내되거나 /activate에서 입력할 수 있어요.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <BankTransferPanel
          variant="landing"
          amount={pending.amount}
          reference={pending.reference}
          bank={pending.bank}
          submitLabel="입금 완료 — 승인 요청"
          onConfirm={async () => {
            setWaitingApproval(true);
          }}
        />
        <p className="text-center text-sm text-neutral-400">
          플랜: <strong className="text-white">{LICENSE_PLAN_LABELS[pending.plan]}</strong> · 월{" "}
          {formatKRW(pending.amount)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {PLANS.map((p) => {
          const selected = plan === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={`glass-thick landing-shadow p-3 text-left transition sm:p-5 ${
                selected ? "ring-2 ring-[color-mix(in_srgb,var(--vx-accent)_50%,transparent)]" : "opacity-80 hover:opacity-100"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:text-xs">
                {LICENSE_PLAN_LABELS[p]}
              </p>
              <p className="mt-1.5 text-base font-extrabold sm:mt-2 sm:text-2xl">
                {formatPlanPrice(p)}
              </p>
              <p className="text-[10px] text-neutral-500 sm:text-xs">/ 월</p>
              <ul className="mt-3 hidden space-y-1 text-xs text-neutral-400 sm:block">
                {LICENSE_PLAN_FEATURES[p].slice(0, 3).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <article className="glass-thick landing-shadow overflow-hidden">
        <header className="border-b border-white/10 p-6">
          <h3 className="text-xl font-bold">{LICENSE_PLAN_LABELS[plan]} 선택됨</h3>
          <p className="mt-1 text-sm text-neutral-400">30일 이용 · 만료 후 7일 유예 · 라이선스로 연장할 수 있어요</p>
        </header>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-400">이메일</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ios-input"
            />
          </label>
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="landing-btn w-full disabled:opacity-40">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> 주문 생성 중…
              </span>
            ) : (
              `${LICENSE_PLAN_LABELS[plan]} · ${formatKRW(LICENSE_PLAN_PRICES[plan])}/월 주문하기`
            )}
          </button>
          <p className="text-center text-xs text-neutral-500">
            예: {shopUrl("atelier").replace(/^https?:\/\//, "")}
          </p>
        </form>
      </article>
    </div>
  );
}

export function PlatformFeatures() {
  return (
    <div className="grid grid-cols-6 gap-5">
      {PLANS.map((p, i) => (
        <div key={p} className={`${i === 1 ? "col-span-full lg:col-span-2" : "col-span-full sm:col-span-3 lg:col-span-2"}`}>
          <div className="glass landing-shadow quartz-lift h-full p-6">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{LICENSE_PLAN_LABELS[p]}</p>
            <p className="mt-2 text-lg font-bold">{formatPlanPrice(p)}/월</p>
            <ul className="mt-3 space-y-1 text-sm text-neutral-400">
              {LICENSE_PLAN_FEATURES[p].map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
