"use client";

import { motion } from "framer-motion";
import { Banknote } from "lucide-react";
import { AutoChargeBankSelect } from "./auto-charge-bank-select";
import { fadeUp, vxTransition } from "@/lib/motion";

export type AccountBankForm = {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  minChargeAmount: string;
  depositSuffixPhrase: string;
};

export function AccountBankPanel({
  form,
  onChange,
  saving,
  onSubmit,
}: {
  form: AccountBankForm;
  onChange: (next: AccountBankForm) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <motion.div
      className="toss-admin-panel is-wide px-1"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={vxTransition}
    >
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Banknote className="size-5" />
        </span>
        <div>
          <h3 className="toss-admin-title text-lg">입금 계좌</h3>
          <p className="toss-admin-hint text-xs">손님에게 보여줄 계좌</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="은행">
          <AutoChargeBankSelect
            value={form.bankName}
            onChange={(bankName) => onChange({ ...form, bankName })}
            className="toss-admin-field w-full"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="계좌번호">
            <input
              placeholder="1234-56-789012"
              value={form.bankAccount}
              onChange={(e) => onChange({ ...form, bankAccount: e.target.value })}
              className="toss-admin-field"
            />
          </Field>
          <Field label="예금주">
            <input
              placeholder="홍길동"
              value={form.bankHolder}
              onChange={(e) => onChange({ ...form, bankHolder: e.target.value })}
              className="toss-admin-field"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="최소 충전 금액" hint="1원부터 설정 가능">
            <input
              type="number"
              min={1}
              step={1}
              value={form.minChargeAmount}
              onChange={(e) => onChange({ ...form, minChargeAmount: e.target.value })}
              className="toss-admin-field"
            />
          </Field>
          <Field
            label="입금자명 접미사"
            hint={form.depositSuffixPhrase.trim() ? "입금자명 뒤에 붙음" : "사용 안 함 — 입금자명만 표시"}
          >
            <div className="flex gap-2">
              <input
                placeholder="비워 두면 접미사 없음"
                value={form.depositSuffixPhrase}
                onChange={(e) => onChange({ ...form, depositSuffixPhrase: e.target.value })}
                className="toss-admin-field min-w-0 flex-1"
              />
              {form.depositSuffixPhrase ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...form, depositSuffixPhrase: "" })}
                  className="shrink-0 rounded-xl border border-red-500/30 px-3 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                >
                  삭제
                </button>
              ) : null}
            </div>
          </Field>
        </div>

        <motion.button
          type="submit"
          disabled={saving}
          className="toss-admin-primary vx-btn-press disabled:opacity-40"
          whileTap={{ scale: 0.98 }}
        >
          {saving ? "저장 중…" : "계좌 설정 저장"}
        </motion.button>
      </form>
    </motion.div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-500">
        {label}
        {hint ? <span className="text-neutral-600"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
