"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coins, Gift } from "lucide-react";
import { fadeUp, vxTransition } from "@/lib/motion";

export type PaymentApiForm = {
  cultureGiftEnabled: boolean;
  culturelandId: string;
  culturelandPassword: string;
  nowpaymentsEnabled: boolean;
  nowpaymentsApiKey: string;
  nowpaymentsIpnSecret: string;
  nowpaymentsPayCurrency: string;
};

type ApiTab = "culture" | "coin";

export function PaymentApiPanel({
  form,
  onChange,
  saving,
  onSubmit,
}: {
  form: PaymentApiForm;
  onChange: (next: PaymentApiForm) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [tab, setTab] = useState<ApiTab>("culture");

  return (
    <motion.div
      className="toss-admin-panel is-wide px-1"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={{ ...vxTransition, delay: 0.04 }}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-neutral-500/15 text-neutral-300">
          <Coins className="size-5" />
        </span>
        <div>
          <h3 className="toss-admin-title text-lg">다른 결제</h3>
          <p className="toss-admin-hint text-xs">문화상품권 · 코인</p>
        </div>
      </div>

      <div className="toss-seg mb-6" role="tablist" aria-label="충전 API 종류">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "culture"}
          className={tab === "culture" ? "is-on" : ""}
          onClick={() => setTab("culture")}
        >
          문화상품권
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "coin"}
          className={tab === "coin" ? "is-on" : ""}
          onClick={() => setTab("coin")}
        >
          코인
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <AnimatePresence mode="wait">
          {tab === "culture" ? (
            <motion.div
              key="culture"
              className="space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Gift className="size-4 text-neutral-500" />
                  <div>
                    <p className="text-sm font-medium text-white">문화상품권</p>
                    <p className="text-xs text-neutral-500">PIN 입력 시 바로 충전</p>
                  </div>
                </div>
                <Toggle
                  on={form.cultureGiftEnabled}
                  disabled={saving}
                  onToggle={() =>
                    onChange({ ...form, cultureGiftEnabled: !form.cultureGiftEnabled })
                  }
                />
              </div>
              {form.cultureGiftEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    placeholder="컬쳐랜드 ID"
                    value={form.culturelandId}
                    onChange={(e) => onChange({ ...form, culturelandId: e.target.value })}
                    className="toss-admin-field"
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    placeholder="비밀번호"
                    value={form.culturelandPassword}
                    onChange={(e) => onChange({ ...form, culturelandPassword: e.target.value })}
                    className="toss-admin-field"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="coin"
              className="space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-white">코인 결제</p>
                  <p className="text-xs text-neutral-500">NOWPayments 키만 넣으면 됩니다</p>
                </div>
                <Toggle
                  on={form.nowpaymentsEnabled}
                  disabled={saving}
                  onToggle={() =>
                    onChange({ ...form, nowpaymentsEnabled: !form.nowpaymentsEnabled })
                  }
                />
              </div>
              {form.nowpaymentsEnabled && (
                <div className="space-y-3">
                  <input
                    placeholder="API 키"
                    value={form.nowpaymentsApiKey}
                    onChange={(e) => onChange({ ...form, nowpaymentsApiKey: e.target.value })}
                    className="toss-admin-field font-mono text-xs"
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    placeholder="알림 비밀키"
                    value={form.nowpaymentsIpnSecret}
                    onChange={(e) => onChange({ ...form, nowpaymentsIpnSecret: e.target.value })}
                    className="toss-admin-field font-mono text-xs"
                    autoComplete="new-password"
                  />
                  <input
                    placeholder="코인 (예: usdttrc20)"
                    value={form.nowpaymentsPayCurrency}
                    onChange={(e) => onChange({ ...form, nowpaymentsPayCurrency: e.target.value })}
                    className="toss-admin-field text-sm"
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={saving}
          className="toss-admin-primary vx-btn-press mt-6 disabled:opacity-40"
          whileTap={{ scale: 0.98 }}
        >
          {saving ? "저장 중…" : "저장"}
        </motion.button>
      </form>
    </motion.div>
  );
}

function Toggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${
        on ? "bg-accent" : "bg-neutral-700"
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${
          on ? "left-7" : "left-1"
        }`}
      />
    </button>
  );
}
