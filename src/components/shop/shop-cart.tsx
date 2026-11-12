"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { calcProductPrice } from "@/lib/pricing";
import type { ProductWithStock, ShopEvent, ShopTier } from "@/lib/types";
import { shopHeaders } from "@/lib/shop-client";
import { TERMS_REQUIRED_MESSAGE, TermsConsent } from "@/components/shop/terms-consent";

export type CartLine = { productId: string; quantity: number };

export const CART_ADD_EVENT = "vendix:cart-add";

function cartKey(shopSlug: string) {
  return `vendix-cart:${shopSlug}`;
}

export function loadCart(shopSlug: string): CartLine[] {
  try {
    const raw = localStorage.getItem(cartKey(shopSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((i) => i.productId && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function saveCart(shopSlug: string, items: CartLine[]) {
  localStorage.setItem(cartKey(shopSlug), JSON.stringify(items));
}

export function emitCartAdd(detail?: { quantity?: number }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_ADD_EVENT, { detail }));
}

export function ShopCartBar({
  shopSlug,
  products,
  eventByProduct,
  tier,
  userPoints,
  onPurchased,
}: {
  shopSlug: string;
  products: ProductWithStock[];
  eventByProduct: Map<string, ShopEvent>;
  tier: ShopTier | null;
  userPoints: number;
  onPurchased: (codes: string[]) => void;
}) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const [fly, setFly] = useState(false);
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    setItems(loadCart(shopSlug));
  }, [shopSlug]);

  useEffect(() => {
    function onAdd() {
      setItems(loadCart(shopSlug));
      setBump((n) => n + 1);
      setFly(true);
      window.setTimeout(() => setFly(false), 650);
    }
    window.addEventListener(CART_ADD_EVENT, onAdd);
    return () => window.removeEventListener(CART_ADD_EVENT, onAdd);
  }, [shopSlug]);

  function update(next: CartLine[]) {
    setItems(next);
    saveCart(shopSlug, next);
  }

  const lines = useMemo(() => {
    return items
      .map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return null;
        const price = calcProductPrice(product, tier, eventByProduct.get(product.id) ?? null).finalPrice;
        return { ...line, product, price, subtotal: price * line.quantity };
      })
      .filter(Boolean) as {
      productId: string;
      quantity: number;
      product: ProductWithStock;
      price: number;
      subtotal: number;
    }[];
  }, [items, products, tier, eventByProduct]);

  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  async function checkout() {
    if (!lines.length) return;
    if (!agree) {
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase/points", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          agreeTerms: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        partialError?: string;
        orders?: { dispensedCode: string | null }[];
      };
      if (!res.ok) throw new Error(data.error ?? "결제 실패");
      const codes = (data.orders ?? [])
        .map((o) => o.dispensedCode)
        .filter((c): c is string => Boolean(c));
      update([]);
      setAgree(false);
      setOpen(false);
      onPurchased(codes);
      if (data.partialError) window.alert(`${data.partialError}\n남은 상품은 다시 담아 구매해 주세요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제 실패");
    } finally {
      setBusy(false);
    }
  }

  if (count === 0 && !open) return null;

  return (
    <>
      <AnimatePresence>
        {fly ? (
          <motion.div
            key={`fly-${bump}`}
            className="pointer-events-none fixed z-[45] size-3 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.8)]"
            initial={{ left: "50%", top: "55%", opacity: 1, scale: 1 }}
            animate={{ left: "calc(100% - 4.5rem)", top: "calc(100% - 4.5rem)", opacity: 0.2, scale: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        key={bump}
        initial={false}
        animate={{ scale: bump ? [1, 1.18, 0.94, 1.06, 1] : 1 }}
        transition={{ duration: 0.48, ease: [0.22, 1.2, 0.36, 1] }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 shadow-lg backdrop-blur-md lg:bottom-8 lg:right-8"
      >
        <motion.span
          animate={bump ? { rotate: [0, -18, 12, 0] } : { rotate: 0 }}
          transition={{ duration: 0.4 }}
        >
          <ShoppingCart className="size-4" />
        </motion.span>
        장바구니{" "}
        <motion.span
          key={count}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="tabular-nums"
        >
          {count}
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#101214] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                <p className="text-sm font-semibold text-white">장바구니</p>
                <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white">
                  <X className="size-4" />
                </button>
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
                {lines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-500">장바구니가 비어 있어요</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {lines.map((line) => (
                      <motion.div
                        key={line.productId}
                        layout
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12, height: 0 }}
                        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{line.product.name}</p>
                          <p className="text-xs text-neutral-500">{formatKRW(line.price)}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="rounded-lg bg-white/5 p-1 transition active:scale-90"
                            onClick={() =>
                              update(
                                items
                                  .map((i) =>
                                    i.productId === line.productId
                                      ? { ...i, quantity: Math.max(0, i.quantity - 1) }
                                      : i,
                                  )
                                  .filter((i) => i.quantity > 0),
                              )
                            }
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm">{line.quantity}</span>
                          <button
                            type="button"
                            className="rounded-lg bg-white/5 p-1 transition active:scale-90"
                            onClick={() =>
                              update(
                                items.map((i) =>
                                  i.productId === line.productId
                                    ? { ...i, quantity: Math.min(20, i.quantity + 1) }
                                    : i,
                                ),
                              )
                            }
                          >
                            <Plus className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="ml-1 rounded-lg p-1 text-red-400 transition active:scale-90"
                            onClick={() => update(items.filter((i) => i.productId !== line.productId))}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
              <div className="border-t border-white/8 p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-neutral-400">합계</span>
                  <motion.span
                    key={total}
                    initial={{ opacity: 0.4, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-bold text-white"
                  >
                    {formatKRW(total)}
                  </motion.span>
                </div>
                <p className="mb-3 text-[11px] text-neutral-500">보유 {formatKRW(userPoints)}</p>
                <TermsConsent
                  checked={agree}
                  onChange={(v) => {
                    setAgree(v);
                    if (v) setError(null);
                  }}
                  className="mb-3 text-neutral-200"
                />
                {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
                <motion.button
                  type="button"
                  disabled={busy || !lines.length || !agree || total > userPoints}
                  onClick={() => void checkout()}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-emerald-950 disabled:opacity-40"
                >
                  {busy ? "결제 중…" : total > userPoints ? "포인트 부족" : "포인트로 결제"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function addToCart(shopSlug: string, productId: string, quantity = 1) {
  const items = loadCart(shopSlug);
  const idx = items.findIndex((i) => i.productId === productId);
  if (idx >= 0) {
    items[idx]!.quantity = Math.min(20, items[idx]!.quantity + quantity);
  } else {
    items.push({ productId, quantity });
  }
  saveCart(shopSlug, items);
  emitCartAdd({ quantity });
  return items;
}
