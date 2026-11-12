"use client";

import { useState } from "react";
import type { Order } from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/utils";
import { shopHeaders } from "@/lib/shop-client";

type Row = Order & { productName?: string };

export function OrderLookup({ shopSlug }: { shopSlug: string }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"email" | "uuid">("email");
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRows([]);
    try {
      const param =
        mode === "email"
          ? `email=${encodeURIComponent(query)}`
          : `uuid=${encodeURIComponent(query)}&token=${encodeURIComponent(token)}`;
      const res = await fetch(`/api/orders/lookup?${param}`, {
        headers: shopHeaders(shopSlug, false),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "조회 실패");
      setRows(data.orders ?? (data.order ? [data.order] : []));
      if ((data.orders?.length ?? 0) === 0 && !data.order) {
        setError("주문을 찾을 수 없습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form onSubmit={onSubmit} className="surface space-y-4 rounded-sm p-6">
        <div className="flex gap-2">
          {(["email", "uuid"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ${
                mode === m ? "border-pearl/40 text-pearl" : "border-line text-smoke"
              }`}
            >
              {m === "email" ? "Email" : "Order ID"}
            </button>
          ))}
        </div>
        <input
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-line bg-ink px-4 py-3 font-mono text-sm text-pearl outline-none focus:border-stone"
        />
        {mode === "uuid" && (
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="주문 접근 토큰"
            className="w-full border border-line bg-ink px-4 py-3 font-mono text-sm text-pearl outline-none focus:border-stone"
          />
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-line py-3 text-[11px] uppercase tracking-[0.16em] text-stone transition hover:border-pearl/40 hover:text-pearl disabled:opacity-40"
        >
          {loading ? "Looking up…" : "Retrieve"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      <ul className="space-y-3">
        {rows.map((order) => (
          <li key={order.id} className="surface rounded-sm p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] text-smoke">{order.orderUuid}</p>
                <p className="mt-1 text-pearl">{order.productName ?? order.productId}</p>
                <p className="mt-1 text-xs text-stone">{formatDate(order.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-platinum">{formatKRW(order.amount)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-smoke">
                  {order.status}
                </p>
              </div>
            </div>
            {order.status === "dispensed" && (
              <p className="mt-3 text-xs text-stone">
                영수증은 결제 완료 직후 화면에서만 열 수 있습니다.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
