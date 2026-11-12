"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Check, Wallet, X } from "lucide-react";
import { fadeUp, vxTransition } from "@/lib/motion";
import { formatKRW, formatTimeAgo } from "@/lib/utils";
import { formatPlanLabel } from "@/lib/plans";
import type { LicensePlan, PointCharge, ShopSettings } from "@/lib/types";
import { AccountBankPanel, type AccountBankForm } from "./account-bank-panel";
import { AutoChargePairingPanel } from "./auto-charge-pairing-panel";
import { PaymentApiPanel, type PaymentApiForm } from "./payment-api-panel";
import { AdminSecurityPanel } from "./admin-security-panel";
import { MfaMarketPanel } from "./mfa-market-panel";
import { AdminHero } from "./admin-bento";

type BillingFilter =
  | "pending"
  | "log"
  | "bank"
  | "auto"
  | "payment"
  | "mfa"
  | "security"
  | "license";

const FILTERS: { id: BillingFilter; label: string }[] = [
  { id: "pending", label: "대기충전" },
  { id: "log", label: "충전로그" },
  { id: "bank", label: "입금계좌" },
  { id: "auto", label: "자동충전" },
  { id: "payment", label: "다른결제" },
  { id: "mfa", label: "MFA 연동" },
  { id: "security", label: "보안" },
  { id: "license", label: "라이선스" },
];

const CHARGE_LOG_STATUS: Record<PointCharge["status"], string> = {
  pending: "대기",
  completed: "완료",
  cancelled: "취소",
  failed: "실패",
  expired: "만료",
};

export function AdminBillingHub({
  shopSlug,
  shopPlan,
  shopName,
  subLabel,
  pending,
  recentCharges = [],
  userEmail,
  pointRevenue,
  accountForm,
  onAccountChange,
  onSaveAccount,
  pushbulletToken,
  pushbulletSaved = false,
  pushbulletHint = null,
  pushbulletWrongKind = false,
  autoChargeEnabled,
  onPushbulletTokenChange,
  onAutoChargeEnabledChange,
  onSavePushbullet,
  paymentApiForm,
  onPaymentApiChange,
  onSavePaymentApis,
  settings,
  onSaveSecurity,
  licenseKey,
  onLicenseKeyChange,
  onExtendLicense,
  saving,
  busyId,
  onApprove,
  onReject,
  initialFilter = "pending",
}: {
  shopSlug: string;
  shopPlan: LicensePlan;
  shopName: string;
  subLabel: string;
  pending: PointCharge[];
  recentCharges?: PointCharge[];
  userEmail: (userId: string) => string;
  pointRevenue: number;
  accountForm: AccountBankForm;
  onAccountChange: (next: AccountBankForm) => void;
  onSaveAccount: (e: React.FormEvent) => void;
  pushbulletToken: string;
  pushbulletSaved?: boolean;
  pushbulletHint?: string | null;
  pushbulletWrongKind?: boolean;
  autoChargeEnabled: boolean;
  onPushbulletTokenChange: (v: string) => void;
  onAutoChargeEnabledChange: (v: boolean) => void;
  onSavePushbullet: () => void;
  paymentApiForm: PaymentApiForm;
  onPaymentApiChange: (next: PaymentApiForm) => void;
  onSavePaymentApis: (e: React.FormEvent) => void;
  settings: ShopSettings;
  onSaveSecurity: (body: Record<string, unknown>) => Promise<boolean>;
  licenseKey: string;
  onLicenseKeyChange: (v: string) => void;
  onExtendLicense: (e: React.FormEvent) => void;
  saving: boolean;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  initialFilter?: BillingFilter;
}) {
  const [filter, setFilter] = useState<BillingFilter>(initialFilter);
  const pendingSum = useMemo(() => pending.reduce((s, c) => s + c.amount, 0), [pending]);
  const missingDepositor = useMemo(
    () => pending.filter((c) => !c.depositorName).length,
    [pending],
  );

  return (
    <div className="space-y-4">
      <AdminHero
        className="lg:col-span-12"
        badge="계좌 · 충전"
        value={
          filter === "pending"
            ? formatKRW(pendingSum)
            : accountForm.bankAccount || "미등록"
        }
        hint={
          filter === "pending"
            ? `대기 ${pending.length}건 · 누적 매출 ${formatKRW(pointRevenue)}`
            : `${accountForm.bankName || "은행"} · ${accountForm.bankHolder || "예금주"}`
        }
        stats={[
          { label: "플랜", value: formatPlanLabel(shopPlan) },
          { label: "상태", value: subLabel },
          {
            label: "최소 충전",
            value: formatKRW(Number(accountForm.minChargeAmount) || 0),
          },
          {
            label: "자동충전",
            value: autoChargeEnabled && (pushbulletToken || pushbulletSaved) ? "ON" : "OFF",
          },
        ]}
      />

      <div className="admin-bento p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-neutral-500">필터</p>
          {pending.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter("pending")}
              className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/25"
            >
              대기 {pending.length}건
            </button>
          )}
        </div>
        <div className="admin-chip-row mt-2" role="tablist" aria-label="계좌·충전 필터">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`admin-chip ${filter === id ? "is-on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === "pending" && pending.length > 0 ? ` · ${pending.length}` : ""}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={filter}
            className="mt-5"
            initial={fadeUp.initial}
            animate={fadeUp.animate}
            exit={fadeUp.exit}
            transition={vxTransition}
          >
            {filter === "pending" && (
              <PendingChargesView
                pending={pending}
                pendingSum={pendingSum}
                missingDepositor={missingDepositor}
                pointRevenue={pointRevenue}
                minChargeAmount={Number(accountForm.minChargeAmount) || 0}
                userEmail={userEmail}
                busyId={busyId}
                onApprove={onApprove}
                onReject={onReject}
                onGoBank={() => setFilter("bank")}
              />
            )}

            {filter === "log" && (
              <ChargeLogView charges={recentCharges} userEmail={userEmail} />
            )}

            {filter === "bank" && (
              <AccountBankPanel
                form={accountForm}
                onChange={onAccountChange}
                saving={saving}
                onSubmit={onSaveAccount}
              />
            )}

            {filter === "auto" && (
              <AutoChargePairingPanel
                shopSlug={shopSlug}
                bankName={accountForm.bankName}
                pushbulletToken={pushbulletToken}
                pushbulletSaved={pushbulletSaved}
                pushbulletHint={pushbulletHint}
                pushbulletWrongKind={pushbulletWrongKind}
                autoChargeEnabled={autoChargeEnabled}
                onPushbulletTokenChange={onPushbulletTokenChange}
                onAutoChargeEnabledChange={onAutoChargeEnabledChange}
                onSave={onSavePushbullet}
                saving={saving}
              />
            )}

            {filter === "payment" && (
              <PaymentApiPanel
                form={paymentApiForm}
                onChange={onPaymentApiChange}
                saving={saving}
                onSubmit={onSavePaymentApis}
              />
            )}

            {filter === "mfa" && <MfaMarketPanel shopSlug={shopSlug} />}

            {filter === "security" && (
              <AdminSecurityPanel
                settings={settings}
                saving={saving}
                onSave={onSaveSecurity}
              />
            )}

            {filter === "license" && (
              <div>
                <h3 className="toss-admin-title text-lg">{shopName} 라이선스 연장</h3>
                <p className="mt-2 mb-4 text-xs text-neutral-500">
                  만료 후 7일 안에 키를 넣으면 30일 연장됩니다.
                </p>
                <form onSubmit={onExtendLicense} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={licenseKey}
                    onChange={(e) => onLicenseKeyChange(e.target.value)}
                    placeholder="DOES-XXXX-XXXX-XX"
                    className="admin-input flex-1 font-mono text-sm"
                    required
                  />
                  <button type="submit" disabled={saving} className="admin-btn shrink-0">
                    연장하기
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function PendingChargesView({
  pending,
  pendingSum,
  missingDepositor,
  pointRevenue,
  minChargeAmount,
  userEmail,
  busyId,
  onApprove,
  onReject,
  onGoBank,
}: {
  pending: PointCharge[];
  pendingSum: number;
  missingDepositor: number;
  pointRevenue: number;
  minChargeAmount: number;
  userEmail: (userId: string) => string;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onGoBank: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] text-neutral-500">대기 합계</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight">{formatKRW(pendingSum)}</p>
          <p className="mt-1 text-[11px] text-neutral-500">{pending.length}건</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-1 text-[11px] text-amber-400">
            <AlertTriangle className="size-3" /> 입금자명 없음
          </p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-orange-400">
            {missingDepositor}건
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">확인 필요</p>
        </div>
        <button
          type="button"
          onClick={onGoBank}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06]"
        >
          <p className="text-[11px] text-neutral-500">누적 포인트 매출</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight">{formatKRW(pointRevenue)}</p>
          <p className="mt-1 text-[11px] text-emerald-400">입금계좌 설정 →</p>
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-extrabold tracking-tight">승인 대기</h3>
          <p className="text-xs text-neutral-500">최소 {formatKRW(minChargeAmount)}</p>
        </div>
        {pending.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">대기 중인 충전이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl px-1.5 py-3 transition hover:bg-white/[0.04]"
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--ad-accent-soft)", color: "var(--ad-accent)" }}
                >
                  <Wallet className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight">{formatKRW(c.amount)}</p>
                  <p className="truncate text-[11px] text-neutral-500">
                    {userEmail(c.userId)} · {c.reference}
                    {c.depositorName ? ` · ${c.depositorName}` : " · 입금자 미입력"}
                    {" · "}
                    {formatTimeAgo(c.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => onApprove(c.id)}
                    className="admin-btn inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    <Check className="size-3.5" /> 승인
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => onReject(c.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-400/10 disabled:opacity-40"
                  >
                    <X className="size-3.5" /> 거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChargeLogView({
  charges,
  userEmail,
}: {
  charges: PointCharge[];
  userEmail: (userId: string) => string;
}) {
  const completedCount = charges.filter((c) => c.status === "completed").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-extrabold tracking-tight">충전 로그</h3>
          <p className="mt-1 text-xs text-neutral-500">
            최근 {charges.length}건 · 완료 {completedCount}건
          </p>
        </div>
      </div>
      {charges.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">충전 내역이 없어요</p>
      ) : (
        <ul className="space-y-1">
          {charges.map((c) => {
            const label = CHARGE_LOG_STATUS[c.status] ?? c.status;
            const tone =
              c.status === "completed"
                ? "text-emerald-400"
                : c.status === "pending"
                  ? "text-amber-300"
                  : "text-red-400";
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl px-1.5 py-3 transition hover:bg-white/[0.04]"
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--ad-accent-soft)", color: "var(--ad-accent)" }}
                >
                  <Wallet className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight">{formatKRW(c.amount)}</p>
                  <p className="truncate text-[11px] text-neutral-500">
                    {userEmail(c.userId)} · {c.reference}
                    {c.depositorName ? ` · ${c.depositorName}` : ""}
                    {" · "}
                    {new Date(c.completedAt ?? c.createdAt).toLocaleString("ko-KR")}
                  </p>
                  {c.failReason ? (
                    <p className="text-[11px] text-red-400/90">{c.failReason}</p>
                  ) : null}
                </div>
                <span className={`shrink-0 text-xs font-semibold ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
