"use client";

import { useState } from "react";
import { Check, Copy, Loader2, MessageSquarePlus, ShoppingBag, Coins, BarChart3 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { ChargeStatus, OrderStatus, MonthlyReportRow } from "@/lib/types";
import type { UserCharge, UserOrder } from "./user-dashboard-types";
import {
  PanelEmpty,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "@/components/admin/admin-panel-ui";

const ORDER_STATUS: Record<OrderStatus, string> = {
  pending: "대기",
  locked: "잠금",
  paid: "결제완료",
  awaiting_fulfillment: "지급대기",
  dispensed: "지급완료",
  failed: "실패",
  expired: "만료",
};

const CHARGE_STATUS: Record<ChargeStatus, string> = {
  pending: "대기",
  completed: "완료",
  cancelled: "취소",
  failed: "실패",
  expired: "만료",
};

function orderBadge(status: OrderStatus) {
  if (status === "dispensed" || status === "paid") return "text-emerald-400";
  if (status === "awaiting_fulfillment") return "text-amber-300";
  if (status === "failed" || status === "expired") return "text-red-400";
  return "text-orange-400";
}

function chargeBadge(status: ChargeStatus) {
  if (status === "completed") return "text-emerald-400";
  if (status === "cancelled" || status === "failed" || status === "expired") return "text-red-400";
  return "text-orange-400";
}

type SubTab = "orders" | "charges" | "report";

function ReviewForm({ shopSlug, orderId, onDone }: { shopSlug: string; orderId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/user/review", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "후기를 등록하지 못했어요.");
      setOpen(false);
      setBody("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "후기를 등록하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-white/30 hover:bg-white/5"
      >
        <MessageSquarePlus className="size-3.5" /> 후기 작성
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="제품에 대한 솔직한 후기를 남겨주세요. (5자 이상)"
        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/25"
      />
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <PanelPrimaryBtn className="px-4 py-2 text-xs" disabled={busy || body.trim().length < 5} onClick={() => void submit()}>
          {busy ? "등록 중…" : "후기 등록"}
        </PanelPrimaryBtn>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-white/10 px-4 py-2 text-xs text-neutral-400 hover:bg-white/5"
        >
          취소
        </button>
      </div>
    </div>
  );
}

export function UserHistoryTab({
  shopSlug,
  loading,
  orders,
  charges,
  monthlyReport,
  copiedId,
  onCopyCode,
  onReviewed,
}: {
  shopSlug: string;
  loading: boolean;
  orders: UserOrder[];
  charges: UserCharge[];
  monthlyReport: MonthlyReportRow[];
  copiedId: string | null;
  onCopyCode: (orderId: string, code: string) => void;
  onReviewed?: () => void;
}) {
  const [sub, setSub] = useState<SubTab>("orders");

  return (
    <div className="w-full">
      <PanelFrame
        stats={[
          { label: "구매", value: orders.length },
          { label: "충전", value: charges.length },
        ]}
        tabs={[
          { id: "orders", label: `구매 (${orders.length})` },
          { id: "charges", label: `충전 (${charges.length})` },
          { id: "report", label: "월별 리포트" },
        ]}
        activeTab={sub}
        onTabChange={(id) => setSub(id as SubTab)}
      >
        {sub === "report" && (
          <PanelTabBody tabKey="report">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-neutral-500" />
              </div>
            ) : monthlyReport.length === 0 ? (
              <PanelEmpty message="월별 데이터가 아직 없어요" />
            ) : (
              <div className="space-y-3">
                {monthlyReport.map((row) => (
                  <div
                    key={row.month}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <p className="flex items-center gap-2 font-semibold text-white">
                      <BarChart3 className="size-4 text-neutral-500" />
                      {row.month.replace("-", "년 ")}월
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500">충전</p>
                        <p className="font-bold text-white">{formatKRW(row.chargeTotal)}</p>
                        <p className="text-[11px] text-neutral-600">{row.chargeCount}건</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500">구매</p>
                        <p className="font-bold text-white">{formatKRW(row.purchaseTotal)}</p>
                        <p className="text-[11px] text-neutral-600">{row.purchaseCount}건</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelTabBody>
        )}

        {sub === "orders" && (
          <PanelTabBody tabKey="orders">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-neutral-500" />
              </div>
            ) : orders.length === 0 ? (
              <PanelEmpty message="구매 내역이 없어요" />
            ) : (
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-white">
                          <ShoppingBag className="size-4 shrink-0 text-neutral-500" />
                          {order.productName}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {new Date(order.paidAt ?? order.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-white">{formatKRW(order.amount)}</p>
                        <p className={`mt-0.5 text-xs ${orderBadge(order.status)}`}>
                          {ORDER_STATUS[order.status]}
                        </p>
                      </div>
                    </div>
                    {order.status === "awaiting_fulfillment" ? (
                      <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        관리자 확인 후 지급됩니다. 지급이 완료되면 여기서 지급완료로 바뀌고 디스코드 DM이 와요.
                      </p>
                    ) : null}
                    {order.dispensedCode && order.status !== "awaiting_fulfillment" ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="block flex-1 break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
                          {order.dispensedCode}
                        </code>
                        <PanelPrimaryBtn
                          className="shrink-0 px-4 py-2 text-xs"
                          onClick={() => onCopyCode(order.id, order.dispensedCode!)}
                        >
                          {copiedId === order.id ? (
                            <>
                              <Check className="mr-1 inline size-3.5" /> 복사됨
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 inline size-3.5" /> 복사
                            </>
                          )}
                        </PanelPrimaryBtn>
                      </div>
                    ) : null}
                    {order.canReview && onReviewed ? (
                      <ReviewForm shopSlug={shopSlug} orderId={order.id} onDone={onReviewed} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </PanelTabBody>
        )}

        {sub === "charges" && (
          <PanelTabBody tabKey="charges">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-neutral-500" />
              </div>
            ) : charges.length === 0 ? (
              <PanelEmpty message="충전 내역이 없어요" />
            ) : (
              <PanelList>
                {charges.map((charge) => (
                  <PanelRow key={charge.id}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium text-white">
                        <Coins className="size-4 shrink-0 text-neutral-500" />
                        {formatKRW(charge.amount)}
                      </p>
                      <p className="truncate text-xs text-neutral-500">{charge.reference}</p>
                      {(charge as UserCharge & { failReason?: string }).failReason ? (
                        <p className="text-[11px] text-red-400/90">
                          {(charge as UserCharge & { failReason?: string }).failReason}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-neutral-600">
                        {new Date(charge.completedAt ?? charge.createdAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${chargeBadge(charge.status)}`}>
                      {CHARGE_STATUS[charge.status]}
                    </span>
                  </PanelRow>
                ))}
              </PanelList>
            )}
          </PanelTabBody>
        )}
      </PanelFrame>
    </div>
  );
}
