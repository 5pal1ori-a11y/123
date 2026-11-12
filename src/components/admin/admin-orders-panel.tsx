"use client";

import { useEffect, useMemo, useState } from "react";
import { shopHeaders } from "@/lib/shop-client";
import { PanelEmpty, PanelFrame, PanelList, PanelRow, PanelTabBody } from "./admin-panel-ui";

type AdminOrder = {
  id: string;
  productId: string;
  buyerEmail: string;
  paymentMethod: string;
  status: string;
  amount: number;
  quantity: number;
  dispensedCode?: string | null;
  productName?: string | null;
  createdAt: string;
  paidAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  locked: "잠금",
  paid: "결제",
  awaiting_fulfillment: "지급대기",
  dispensed: "지급완료",
  failed: "실패",
  expired: "만료",
};

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "awaiting_fulfillment", label: "지급대기" },
  { id: "dispensed", label: "지급완료" },
  { id: "pending", label: "대기" },
  { id: "failed", label: "실패" },
] as const;

export function AdminOrdersPanel({ shopSlug }: { shopSlug: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [error, setError] = useState<string | null>(null);
  const [fulfillId, setFulfillId] = useState<string | null>(null);
  const [fulfillText, setFulfillText] = useState("");
  const [fulfilling, setFulfilling] = useState(false);
  const [query, setQuery] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copyCode(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/orders?limit=0", {
          credentials: "include",
          headers: shopHeaders(shopSlug),
        });
        if (!res.ok) throw new Error("load");
        const json = (await res.json()) as { orders: AdminOrder[] };
        if (!cancelled) setOrders(json.orders ?? []);
      } catch {
        if (!cancelled) setError("주문을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopSlug]);

  async function fulfillOrder(orderId: string) {
    const text = fulfillText.trim();
    if (!text) {
      setError("지급 내용을 입력해 주세요.");
      return;
    }
    setFulfilling(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/fulfill`, {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryText: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; order?: AdminOrder };
      if (!res.ok) throw new Error(data.error ?? "지급 실패");
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...data.order, status: "dispensed", dispensedCode: text } : o)));
      setFulfillId(null);
      setFulfillText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "지급 실패");
    } finally {
      setFulfilling(false);
    }
  }

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? orders : orders.filter((o) => o.status === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((o) =>
      [o.buyerEmail, o.productName, o.dispensedCode, o.id].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [orders, filter, query]);

  const stats = useMemo(
    () => [
      { label: "전체", value: orders.length },
      { label: "지급완료", value: orders.filter((o) => o.status === "dispensed").length },
      { label: "지급대기", value: orders.filter((o) => o.status === "awaiting_fulfillment").length },
      { label: "대기", value: orders.filter((o) => o.status === "pending").length },
      {
        label: "실패·만료",
        value: orders.filter((o) => o.status === "failed" || o.status === "expired").length,
        warn: true,
      },
    ],
    [orders],
  );

  return (
    <PanelFrame
      stats={stats}
      tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
      activeTab={filter}
      onTabChange={(id) => setFilter(id as typeof filter)}
    >
      <PanelTabBody tabKey={filter}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이메일 · 상품명 · 지급 내용으로 검색"
          className="toss-admin-field mb-3 text-sm"
        />
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-500">불러오는 중…</p>
        ) : error ? (
          <PanelEmpty message={error} />
        ) : filtered.length === 0 ? (
          <PanelEmpty message="표시할 주문이 없어요" />
        ) : (
          <PanelList>
            {filtered.map((o) => (
              <PanelRow key={o.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{o.buyerEmail}</p>
                  <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                    {o.productName ? `${o.productName} · ` : ""}
                    {STATUS_LABEL[o.status] ?? o.status} · {o.paymentMethod} · 수량 {o.quantity}
                  </p>
                  {o.dispensedCode ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenCode((cur) => (cur === o.id ? null : o.id))}
                        className="toss-admin-ghost px-3 py-1.5 text-xs"
                      >
                        {openCode === o.id ? "지급 내용 닫기" : "지급 내용 보기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyCode(o.id, o.dispensedCode ?? "")}
                        className="toss-admin-ghost px-3 py-1.5 text-xs"
                      >
                        {copied === o.id ? "복사됨" : "복사"}
                      </button>
                    </div>
                  ) : null}
                  {o.dispensedCode && openCode === o.id ? (
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-neutral-200">
                      {o.dispensedCode}
                    </pre>
                  ) : null}
                  {o.status === "awaiting_fulfillment" ? (
                    fulfillId === o.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={fulfillText}
                          onChange={(e) => setFulfillText(e.target.value)}
                          className="toss-admin-field min-h-[72px] text-xs"
                          placeholder="구매자에게 전달할 지급 내용"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={fulfilling}
                            onClick={() => void fulfillOrder(o.id)}
                            className="toss-admin-primary px-3 py-1.5 text-xs"
                          >
                            {fulfilling ? "지급 중…" : "지급 완료로 변경"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFulfillId(null);
                              setFulfillText("");
                            }}
                            className="toss-admin-ghost px-3 py-1.5 text-xs"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFulfillId(o.id);
                          setFulfillText("");
                        }}
                        className="toss-admin-ghost mt-2 px-3 py-1.5 text-xs"
                      >
                        수동지급
                      </button>
                    )
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">
                    ₩{o.amount.toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {new Date(o.paidAt ?? o.createdAt).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </PanelRow>
            ))}
          </PanelList>
        )}
      </PanelTabBody>
    </PanelFrame>
  );
}
