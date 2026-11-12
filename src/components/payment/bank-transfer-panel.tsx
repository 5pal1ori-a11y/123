"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Check, Copy, Landmark } from "lucide-react";
import type { BankInfo } from "@/lib/bank";
import { formatKRW } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  reference: string;
  bank: BankInfo;
  depositorLabel?: string;
  expectedDepositorName?: string;
  depositSuffixPhrase?: string;
  submitLabel?: string;
  variant?: "default" | "landing" | "charge";
  onConfirm: (depositorName: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
};

export function BankTransferPanel({
  amount,
  reference,
  bank,
  depositorLabel = "입금자명",
  expectedDepositorName,
  submitLabel = "입금 완료 · 상품 받기",
  variant = "default",
  onConfirm,
  loading = false,
  error = null,
}: Props) {
  const [depositorName, setDepositorName] = useState(expectedDepositorName ?? "");
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onConfirm(depositorName);
  }

  const isLanding = variant === "landing";
  const isCharge = variant === "charge";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "overflow-hidden rounded-[1.25rem]",
        isCharge && "rounded-none border-0 bg-transparent shadow-none",
        isLanding ? "landing-glass-blur landing-shadow border border-white/10" : !isCharge && "glass-thick rounded-3xl",
      )}
    >
      <div
        className={cn(
          "border-b px-6 py-5",
          isCharge && "border-emerald-500/15 bg-emerald-500/[0.06]",
          isLanding ? "border-white/10 bg-white/[0.03]" : !isCharge && "border-glass-border bg-tint-soft/30",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl",
              isCharge && "border border-emerald-400/25 bg-emerald-500/15",
              isLanding ? "border border-white/10 bg-white/5" : !isCharge && "bg-tint/20",
            )}
          >
            <Landmark className={cn("size-5", isCharge ? "text-emerald-300" : isLanding ? "text-white" : "text-tint")} />
          </div>
          <div>
            <p className={cn("text-[13px] font-medium", isCharge ? "text-emerald-300/80" : isLanding ? "text-neutral-400" : "text-text-secondary")}>
              계좌이체 결제
            </p>
            <p className={cn("text-2xl font-semibold tracking-tight", isCharge ? "text-emerald-50" : isLanding ? "text-white" : "text-text")}>
              {formatKRW(amount)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className={cn("rounded-2xl p-4", isCharge ? "border border-white/8 bg-black/25" : isLanding ? "border border-white/10 bg-black/30" : "glass")}>
          <p className={cn("mb-3 text-[12px] font-medium uppercase tracking-wide", isCharge ? "text-emerald-400/70" : isLanding ? "text-neutral-500" : "text-label")}>
            입금 계좌
          </p>
          <div className="space-y-3">
            {[
              { label: "은행", value: bank.bankName, key: "bank" },
              { label: "계좌번호", value: bank.accountNumber, key: "account" },
              { label: "예금주", value: bank.accountHolder, key: "holder" },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3">
                <span className={cn("text-[13px]", isCharge ? "text-neutral-500" : isLanding ? "text-neutral-500" : "text-label")}>{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className={cn("font-mono text-[14px]", isCharge ? "text-emerald-50" : isLanding ? "text-neutral-200" : "text-text")}>{row.value}</span>
                  <button
                    type="button"
                    onClick={() => copy(row.value, row.key)}
                    className={cn(
                      "rounded-lg p-1.5 transition",
                      isCharge ? "text-emerald-400/60 hover:bg-emerald-500/10 hover:text-emerald-200" : isLanding ? "text-neutral-500 hover:bg-white/10 hover:text-white" : "text-label hover:bg-fill hover:text-text",
                    )}
                  >
                    {copied === row.key ? (
                      <Check className={cn("size-3.5", isCharge || isLanding ? "text-emerald-300" : "text-green")} />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={cn("rounded-2xl p-4", isCharge ? "border border-white/8 bg-black/25" : isLanding ? "border border-white/10 bg-black/30" : "glass")}>
          <p className={cn("mb-2 text-[12px] font-medium", isCharge ? "text-emerald-400/70" : isLanding ? "text-neutral-500" : "text-label")}>
            {expectedDepositorName ? "입금자명 (본인 이름)" : "입금자명 (메모)"}
          </p>
          {expectedDepositorName ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <code className={cn("font-mono text-[15px] font-semibold", isCharge ? "text-emerald-200" : isLanding ? "text-white" : "text-tint")}>
                  {expectedDepositorName}
                </code>
                <button
                  type="button"
                  onClick={() => copy(expectedDepositorName, "ref")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium",
                    isCharge ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : isLanding ? "border border-white/20 text-neutral-300" : "ios-pill bg-tint/15 text-tint",
                  )}
                >
                  {copied === "ref" ? <Check className="size-3" /> : <Copy className="size-3" />}
                  복사
                </button>
              </div>
              <p className={cn("mt-2 text-[12px] leading-relaxed", isCharge ? "text-neutral-500" : isLanding ? "text-neutral-500" : "text-label-secondary")}>
                송금 시 입금자명을 위와 같이 입력해주세요. 확인 후 자동으로 포인트가 충전됩니다.
              </p>
              <p className={cn("mt-1 text-[12px] font-medium leading-relaxed", isCharge || isLanding ? "text-amber-300/90" : "text-orange")}>
                실제 본인 이름으로 입금해주세요. 만약 별명으로 입금할시 서비스 이용이 제한될수있습니다
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <code className={cn("font-mono text-[15px] font-semibold", isCharge ? "text-emerald-200" : isLanding ? "text-white" : "text-tint")}>{reference}</code>
                <button
                  type="button"
                  onClick={() => copy(reference, "ref")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium",
                    isCharge ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : isLanding ? "border border-white/20 text-neutral-300" : "ios-pill bg-tint/15 text-tint",
                  )}
                >
                  {copied === "ref" ? <Check className="size-3" /> : <Copy className="size-3" />}
                  복사
                </button>
              </div>
              <p className={cn("mt-2 text-[12px] leading-relaxed", isCharge ? "text-neutral-500" : isLanding ? "text-neutral-500" : "text-label-secondary")}>
                송금 시 입금자명에 위 문구를 넣어 주세요. 확인되면 상품이 발급됩니다.
              </p>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <label className="block space-y-2">
            <span className={cn("text-[13px] font-medium", isCharge ? "text-emerald-300/80" : isLanding ? "text-neutral-400" : "text-text-secondary")}>{depositorLabel}</span>
            <input
              required
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              placeholder="실제 입금한 이름"
              className={cn(
                isCharge
                  ? "w-full rounded-xl border border-emerald-500/20 bg-black/30 px-4 py-3.5 text-[15px] text-emerald-50 outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/40"
                  : isLanding
                    ? "w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-neutral-600 focus:border-white/30"
                    : "ios-input",
              )}
            />
          </label>

          {error && (
            <p className={cn("rounded-2xl px-4 py-3 text-[13px]", isLanding ? "border border-red-500/30 bg-red-500/10 text-red-300" : "bg-red/10 text-red")}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !depositorName.trim()}
            className={cn(
              isCharge
                ? "charge-cta disabled:opacity-40"
                : isLanding
                  ? "landing-btn w-full disabled:opacity-40"
                  : cn(
                      "w-full rounded-2xl py-4 text-[15px] font-semibold transition",
                      "bg-tint text-white shadow-lg shadow-tint/25",
                      "hover:brightness-110 active:scale-[0.98]",
                      "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
                    ),
            )}
          >
            {loading ? "확인 중…" : submitLabel}
          </button>
        </form>

        <div className={cn("flex items-start gap-2 rounded-2xl p-3", isCharge ? "border border-white/8 bg-black/20" : isLanding ? "border border-white/10 bg-white/[0.03]" : "bg-fill/50")}>
          <Building2 className={cn("mt-0.5 size-4 shrink-0", isCharge ? "text-emerald-400/60" : isLanding ? "text-neutral-500" : "text-label")} />
          <p className={cn("text-[11px] leading-relaxed", isCharge ? "text-neutral-500" : isLanding ? "text-neutral-500" : "text-label-secondary")}>
            입금 후 1~3분 내 자동 확인됩니다. 미수령 시 주문 조회에서 상태를 확인하세요.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
