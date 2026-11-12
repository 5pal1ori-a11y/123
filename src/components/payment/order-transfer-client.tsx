"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import type { BankInfo } from "@/lib/bank";
import type { Order, Product } from "@/lib/types";
import { BankTransferPanel } from "@/components/payment/bank-transfer-panel";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { formatKRW } from "@/lib/utils";

export function OrderTransferClient({
  order,
  product,
  bank,
  shopSlug,
}: {
  order: Order;
  product: Product | null;
  bank: BankInfo;
  shopSlug: string;
}) {
  const router = useRouter();
  const base = useShopBase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(order.status === "pending");

  useEffect(() => {
    if (order.status === "dispensed") {
      const token = sessionStorage.getItem(`vendix-order-${order.orderUuid}`);
      const query = token ? `?t=${encodeURIComponent(token)}` : "";
      router.replace(shopPath(base, `/receipt/${order.orderUuid}${query}`));
    }
  }, [order.status, order.orderUuid, base, router]);

  useEffect(() => {
    if (!awaiting) return;
    const timer = setInterval(async () => {
      try {
        const token = sessionStorage.getItem(`vendix-order-${order.orderUuid}`);
        if (!token) return;
        const res = await fetch(
          `/api/orders/lookup?uuid=${encodeURIComponent(order.orderUuid)}&token=${encodeURIComponent(token)}`,
          { headers: shopHeaders(shopSlug) },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { order?: { status: string; orderUuid: string } };
        if (data.order?.status === "dispensed") {
          router.replace(
            shopPath(base, `/receipt/${data.order.orderUuid}?t=${encodeURIComponent(token)}`),
          );
        }
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [awaiting, order.orderUuid, shopSlug, base, router]);

  if (order.status === "dispensed") return null;

  if (awaiting) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-6 py-10 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
          <Clock className="size-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">입금 확인 대기 중</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          입금 신고가 접수됐어요.
          <br />
          관리자가 입금을 확인하면 상품이 자동으로 발급됩니다.
        </p>
        <p className="text-xs text-label">
          {product?.name ?? "주문"} · {formatKRW(order.amount)}
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400">
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          이 페이지를 닫아도 괜찮아요
        </p>
      </div>
    );
  }

  async function onConfirm(depositorName: string) {
    setLoading(true);
    setError(null);
    try {
      const accessToken =
        typeof window !== "undefined"
          ? sessionStorage.getItem(`vendix-order-${order.orderUuid}`)
          : null;
      if (!accessToken) throw new Error("주문 토큰이 없습니다. 처음부터 다시 주문해 주세요.");

      const res = await fetch(`/api/orders/${order.id}/transfer`, {
        method: "POST",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ depositorName, accessToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "입금 확인 실패");
      if (data.accessToken) {
        sessionStorage.setItem(`vendix-order-${data.order.orderUuid}`, data.accessToken);
      }
      if (data.awaitingAdmin || data.order?.status === "pending") {
        setAwaiting(true);
        setLoading(false);
        return;
      }
      router.push(
        shopPath(base, `/receipt/${data.order.orderUuid}?t=${encodeURIComponent(accessToken)}`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-6 py-10">
      <div className="text-center">
        <p className="ios-pill mx-auto bg-tint/15 text-tint">Step 2 · 계좌이체</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text">
          {product?.name ?? "주문 결제"}
        </h1>
        <p className="mt-2 text-[14px] text-text-secondary">
          아래 계좌로 입금 후 입금자명을 입력해주세요.
        </p>
      </div>
      <BankTransferPanel
        amount={order.amount}
        reference={order.orderUuid}
        bank={bank}
        onConfirm={onConfirm}
        loading={loading}
        error={error}
      />
    </div>
  );
}
