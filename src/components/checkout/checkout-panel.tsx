"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";
import { StockBadge } from "@/components/ui/stock-badge";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { TERMS_REQUIRED_MESSAGE, TermsConsent } from "@/components/shop/terms-consent";

export function CheckoutPanel({
  product,
  shopSlug,
}: {
  product: ProductWithStock;
  shopSlug: string;
}) {
  const router = useRouter();
  const base = useShopBase();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const soldOut = product.stockStatus === "sold_out";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) {
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          productId: product.id,
          buyerEmail: email,
          paymentMethod: "transfer",
          agreeTerms: true,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error ?? "주문 생성 실패");

      if (created.accessToken && created.order?.orderUuid) {
        sessionStorage.setItem(`vendix-order-${created.order.orderUuid}`, created.accessToken);
      }

      router.push(shopPath(base, `/payment/${created.order.orderUuid}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-thick space-y-6 overflow-hidden rounded-3xl p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="ios-pill bg-tint/15 text-tint">계좌이체</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text">{product.name}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            {product.description}
          </p>
        </div>
        <StockBadge status={product.stockStatus} />
      </div>

      <div className="flex items-baseline justify-between rounded-2xl bg-fill/60 px-4 py-4">
        <span className="text-[13px] text-label">결제 금액</span>
        <span className="text-xl font-semibold text-text">{formatKRW(product.price)}</span>
      </div>

      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-text-secondary">수령 이메일</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="ios-input"
        />
      </label>

      <div className="rounded-2xl bg-tint-soft/40 px-4 py-3 text-[12px] leading-relaxed text-text-secondary">
        다음 단계에서 입금 계좌 정보가 표시됩니다. 입금 확인 후 상품이 자동 발급됩니다.
      </div>

      <TermsConsent
        checked={agree}
        onChange={(v) => {
          setAgree(v);
          if (v) setError(null);
        }}
        className="text-text"
      />

      {error && (
        <p className="rounded-2xl bg-red/10 px-4 py-3 text-[13px] text-red">{error}</p>
      )}

      <button
        type="submit"
        disabled={soldOut || loading || !agree}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tint py-4 text-[15px] font-semibold text-white shadow-lg shadow-tint/25 disabled:opacity-40"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> 주문 생성 중…
          </>
        ) : soldOut ? (
          "품절"
        ) : (
          "계좌이체 주문하기"
        )}
      </button>

      <Link
        href={shopPath(base, "/")}
        className="flex items-center justify-center gap-1.5 text-[13px] text-label transition hover:text-text"
      >
        <ArrowLeft className="size-3.5" />
        카탈로그로
      </Link>
    </form>
  );
}
