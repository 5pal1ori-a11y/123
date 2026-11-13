"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Loader2, MessageSquarePlus, ShoppingBag } from "lucide-react";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";
import { productDiscountPercent } from "@/lib/pricing";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { useShopUser } from "@/components/shop/user-context";
import { UserAuthPanel } from "@/components/shop/user-auth-panel";
import { TERMS_REQUIRED_MESSAGE, TermsConsent } from "@/components/shop/terms-consent";

type OrderPayload = { id?: string; dispensedCode: string | null; orderUuid?: string };

export function CheckoutClient({
  product,
  shopSlug,
  quantity: initialQty,
  eventDiscountPercent = 0,
}: {
  product: ProductWithStock;
  shopSlug: string;
  quantity: number;
  eventDiscountPercent?: number;
}) {
  const router = useRouter();
  const base = useShopBase();
  const { user, loading: userLoading, refresh } = useShopUser();
  const [qty] = useState(Math.max(1, Math.min(initialQty, product.availableCount || 1)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDone, setReviewDone] = useState(false);

  async function submitReview() {
    if (!orderId) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const res = await fetch("/api/user/review", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, body: reviewBody.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "후기를 등록하지 못했어요.");
      setReviewDone(true);
      setReviewOpen(false);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "후기를 등록하지 못했어요.");
    } finally {
      setReviewBusy(false);
    }
  }
  const [copied, setCopied] = useState(false);
  const [agree, setAgree] = useState(false);

  const discount = Math.max(0, Math.min(90, eventDiscountPercent + productDiscountPercent(product)));
  const unit = discount > 0 ? Math.round(product.price * (1 - discount / 100)) : product.price;
  const total = unit * qty;
  const soldOut = product.stockStatus === "sold_out" || product.availableCount < qty;

  const imageUrl = useMemo(
    () => (product.thumbnail?.trim() ? product.thumbnail.trim() : null),
    [product.thumbnail],
  );

  function normalizeError(msg: string) {
    if (/unauthorized/i.test(msg)) return "로그인이 필요해요. 다시 로그인해 주세요.";
    if (/cross-origin/i.test(msg)) return "보안 검증에 실패했어요. 페이지를 새로고침 후 다시 시도해 주세요.";
    return msg;
  }

  async function payWithPoints() {
    if (!user) return;
    if (!agree) {
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body =
        qty === 1
          ? { productId: product.id, agreeTerms: true }
          : { items: [{ productId: product.id, quantity: qty }], agreeTerms: true };

      const res = await fetch("/api/purchase/points", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        orders?: OrderPayload[];
        order?: OrderPayload | null;
      };
      if (!res.ok) throw new Error(normalizeError(data.error ?? "결제 실패"));

      const orders: OrderPayload[] =
        data.orders && data.orders.length > 0
          ? data.orders
          : data.order
            ? [data.order]
            : [];
      if (orders.length === 0) throw new Error("결제 응답이 비어 있어요. 다시 시도해 주세요.");

      const got = orders
        .map((o) => o.dispensedCode)
        .filter((c): c is string => Boolean(c?.trim()));
      setCodes(got.length > 0 ? got : orders.map((o) => o.orderUuid ?? "주문 완료").filter(Boolean));
      setOrderId(orders.find((o) => o.id)?.id ?? null);
      setDone(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 실패");
    } finally {
      setBusy(false);
    }
  }

  async function payWithTransfer() {
    if (!user?.email) {
      setError("로그인 후 이용하거나, 마이페이지에서 구매해 주세요.");
      return;
    }
    if (!agree) {
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const createRes = await fetch("/api/orders", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          productId: product.id,
          buyerEmail: user.email,
          paymentMethod: "transfer",
          quantity: qty,
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
      setError(err instanceof Error ? err.message : "주문 실패");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto min-h-dvh max-w-lg px-4 py-8">
        <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center">
          <p className="text-lg font-bold text-emerald-100">구매 완료</p>
          <p className="mt-1 text-sm text-emerald-200/80">
            {codes.length > 0 ? `${codes.length}개 상품이 발급됐어요` : "주문이 완료됐어요"}
          </p>
          {codes.length > 0 ? (
            <div className="mt-4 space-y-2 text-left">
              {codes.map((c) => (
                <code
                  key={c}
                  className="block break-all rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white"
                >
                  {c}
                </code>
              ))}
            </div>
          ) : null}
          {codes.length > 0 ? (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-sm text-white"
              onClick={() => {
                void navigator.clipboard.writeText(codes.join("\n")).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "복사됨" : "전체 복사"}
            </button>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={shopPath(base, "/dashboard?tab=history")}
              className="rounded-2xl bg-white py-3 text-sm font-semibold text-black"
            >
              구매 내역 보기
            </Link>
            <Link
              href={shopPath(base, "/dashboard?tab=products")}
              className="rounded-2xl border border-white/15 py-3 text-sm text-neutral-300"
            >
              쇼핑 계속하기
            </Link>
            {orderId ? (
              reviewDone ? (
                <p className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 py-3 text-sm font-semibold text-emerald-300">
                  후기를 등록했어요. 감사합니다!
                </p>
              ) : reviewOpen ? (
                <div className="space-y-2 rounded-2xl border border-white/15 p-3 text-left">
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value.slice(0, 500))}
                    rows={3}
                    autoFocus
                    placeholder="제품에 대한 솔직한 후기를 남겨주세요. (5자 이상)"
                    className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/25"
                  />
                  {reviewError ? <p className="text-xs text-red-400">{reviewError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={reviewBusy || reviewBody.trim().length < 5}
                      onClick={() => void submitReview()}
                      className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                    >
                      {reviewBusy ? "등록 중…" : "후기 등록"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewOpen(false)}
                      className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-neutral-400"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 py-3 text-sm text-neutral-300"
                >
                  <MessageSquarePlus className="size-4" />
                  후기 바로 작성하기
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={shopPath(base, `/product/${product.slug}`)}
          className="flex size-10 items-center justify-center rounded-full border border-white/10 text-neutral-300"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-lg font-bold text-white">주문 / 결제</h1>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#111214]">
        <div className="flex gap-3 border-b border-white/8 p-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              <ShoppingBag className="size-7 text-neutral-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-neutral-500">{product.category}</p>
            <p className="truncate font-semibold text-white">{product.name}</p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatKRW(unit)} × {qty}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <Row label="상품금액" value={formatKRW(unit * qty)} />
          {discount > 0 ? <Row label="할인" value={`-${discount}%`} accent /> : null}
          <Row label="결제금액" value={formatKRW(total)} bold />
          {user ? <Row label="보유 포인트" value={formatKRW(user.points)} /> : null}
        </div>
      </div>

      {userLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-neutral-500" />
        </div>
      ) : !user ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-neutral-400">결제하려면 로그인해 주세요.</p>
          <UserAuthPanel shopSlug={shopSlug} />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {soldOut ? (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              재고가 부족해요. 수량을 줄이거나 다른 상품을 선택해 주세요.
            </p>
          ) : null}
          <TermsConsent checked={agree} onChange={(v) => { setAgree(v); if (v) setError(null); }} className="text-neutral-200" />
          <button
            type="button"
            disabled={busy || soldOut || !agree || user.points < total}
            onClick={() => void payWithPoints()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-black disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {user.points < total ? "포인트 부족" : `포인트로 ${formatKRW(total)} 결제`}
          </button>
          <button
            type="button"
            disabled={busy || soldOut || !agree}
            onClick={() => void payWithTransfer()}
            className="w-full rounded-2xl border border-white/15 py-3.5 text-sm font-semibold text-neutral-200 disabled:opacity-40"
          >
            계좌이체로 결제
          </button>
          <p className="text-center text-[11px] text-neutral-600">
            바로구매는 이 결제 화면에서만 확정됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-500">{label}</span>
      <span
        className={
          bold
            ? "text-base font-bold text-white"
            : accent
              ? "font-semibold text-red-400"
              : "text-neutral-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
