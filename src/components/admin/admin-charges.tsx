"use client";

import { AlertTriangle, ArrowRight, Check, Wallet, X } from "lucide-react";
import type { PointCharge } from "@/lib/types";
import { formatKRW, formatTimeAgo } from "@/lib/utils";

export function AdminCharges({
  pending,
  userEmail,
  pointRevenue,
  minChargeAmount,
  busyId,
  onApprove,
  onReject,
  onOpenAccount,
}: {
  pending: PointCharge[];
  userEmail: (userId: string) => string;
  pointRevenue: number;
  minChargeAmount: number;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOpenAccount: () => void;
}) {
  const pendingSum = pending.reduce((s, c) => s + c.amount, 0);
  const missingDepositor = pending.filter((c) => !c.depositorName).length;

  return (
    <div className="admin-bento-grid">
      <section className="admin-hero relative overflow-hidden p-6 sm:p-8 lg:col-span-5 lg:row-span-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-35deg, transparent, transparent 12px, #111 12px, #111 13px)",
          }}
        />
        <p className="admin-hero-badge relative">대기 중 충전</p>
        <p
          className="relative mt-5 text-[2.35rem] font-black tracking-tight text-zinc-950 sm:text-5xl"
          style={{ letterSpacing: "-0.06em" }}
        >
          {formatKRW(pendingSum)}
        </p>
        <p className="relative mt-3 text-sm font-semibold text-zinc-600">
          승인하면 회원 포인트로 바로 들어가요
        </p>
        <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-black/5 pt-5 text-sm">
          <div>
            <p className="text-[11px] font-medium text-zinc-500">대기 건수</p>
            <p className="mt-1 text-base font-extrabold tracking-tight text-zinc-900">
              {pending.length.toLocaleString()}건
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-zinc-500">최소 충전</p>
            <p className="mt-1 text-base font-extrabold tracking-tight text-zinc-900">
              {formatKRW(minChargeAmount)}
            </p>
          </div>
        </div>
      </section>

      <section className="admin-bento flex items-center gap-4 p-5 lg:col-span-3">
        <div
          className="flex size-[72px] shrink-0 items-center justify-center rounded-2xl"
          style={{ background: "var(--ad-accent-soft)", color: "var(--ad-accent)" }}
        >
          <Wallet className="size-7" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--ad-muted)" }}>
            대기 건수
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight">
            {pending.length}
            <span className="ml-1 text-sm font-semibold" style={{ color: "var(--ad-muted)" }}>
              건
            </span>
          </p>
        </div>
      </section>

      <section className="admin-bento flex flex-col justify-between p-5 lg:col-span-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <AlertTriangle className="size-3.5" />
            입금자명 없음
          </p>
          <p className="mt-3 text-4xl font-black tracking-tight text-orange-400">
            {missingDepositor}
            <span className="ml-1 text-lg font-bold">건</span>
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--ad-muted)" }}>
            입금자 확인이 필요한 대기 건
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={onOpenAccount}
        className="admin-bento flex flex-col justify-between p-5 text-left lg:col-span-7"
      >
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--ad-muted)" }}>
            누적 포인트 매출
          </p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">{formatKRW(pointRevenue)}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--ad-muted)" }}>
            계좌·최소충전은 계좌관리에서 바꿔요
          </p>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--ad-accent)" }}>
          계좌 설정 <ArrowRight className="size-3.5" />
        </span>
      </button>

      <section className="admin-bento p-5 sm:p-6 lg:col-span-12">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-[17px] font-extrabold tracking-tight">승인 대기</h3>
          <p className="text-xs" style={{ color: "var(--ad-muted)" }}>
            {pending.length}건
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: "var(--ad-muted)" }}>
            대기 중인 충전이 없어요
          </p>
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
                  <p className="truncate text-[11px]" style={{ color: "var(--ad-muted)" }}>
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
      </section>
    </div>
  );
}
