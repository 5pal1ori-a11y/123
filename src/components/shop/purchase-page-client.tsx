"use client";

import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useShopUser } from "@/components/shop/user-context";
import { UserAuthPanel } from "@/components/shop/user-auth-panel";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { ProductWithStock } from "@/lib/types";
import { TERMS_REQUIRED_MESSAGE, TermsConsent } from "@/components/shop/terms-consent";

export function PurchasePageClient({
  shopSlug,
  products,
  embedded = false,
}: {
  shopSlug: string;
  products: ProductWithStock[];
  embedded?: boolean;
}) {
  const { user, loading, refresh } = useShopUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [boughtName, setBoughtName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [agree, setAgree] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  const step = code ? 3 : busy ? 2 : 1;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-white/70" />
      </div>
    );
  }

  if (!user) {
    if (embedded) return null;
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShoppingBag className="size-6" /> 구매
        </h1>
        <UserAuthPanel shopSlug={shopSlug} />
      </div>
    );
  }

  async function buy(productId: string, name: string) {
    if (!agree) {
      setError(TERMS_REQUIRED_MESSAGE);
      return;
    }
    setBusy(productId);
    setError(null);
    setCode(null);
    setBoughtName(name);
    setCopied(false);
    try {
      const res = await fetch("/api/purchase/points", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ productId, agreeTerms: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCode(data.order.dispensedCode);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "구매 실패");
      setBoughtName(null);
    } finally {
      setBusy(null);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <ShoppingBag className="size-6" /> 포인트 구매
        </h1>
      )}

      <div className="flow-steps">
        {[
          { n: "01", t: "상품 선택" },
          { n: "02", t: "포인트 결제" },
          { n: "03", t: "상품 수령" },
        ].map((s, i) => (
          <div key={s.n} className={`flow-step ${step === i + 1 ? "is-on" : step > i + 1 ? "opacity-80" : "opacity-50"}`}>
            <p className="n">{s.n}</p>
            <p className="t">{s.t}</p>
          </div>
        ))}
      </div>

      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div>
          <p className="text-xs text-label-secondary">보유 포인트</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{formatKRW(user.points)}</p>
        </div>
        <p className="text-xs text-label-secondary">선택 → 결제 → 바로 수령</p>
      </div>

      <AnimatePresence>
        {code && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-thick rounded-3xl p-5 text-center"
          >
            <KeyRound className="mx-auto size-8 text-green" />
            <p className="mt-2 font-semibold tracking-tight">상품을 발급했어요</p>
            {boughtName && <p className="mt-1 text-sm text-text-secondary">{boughtName}</p>}
            <code className="mt-3 block break-all rounded-xl bg-fill p-3 font-mono text-sm">{code}</code>
            <button type="button" onClick={() => void copyCode()} className="user-dash-btn mt-4 gap-2 px-5 py-2.5 text-sm">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "복사됨" : "복사하기"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <TermsConsent
        checked={agree}
        onChange={(v) => {
          setAgree(v);
          if (v) setError(null);
        }}
      />

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품 검색"
          className="ios-input flex-1"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="ios-input sm:max-w-[180px]"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "전체 카테고리" : c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((p) => (
          <div key={p.id} className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] text-label-secondary">{p.category}</p>
              <p className="truncate font-semibold tracking-tight">{p.name}</p>
              <p className="mt-1 text-sm font-bold">{formatKRW(p.price)}</p>
            </div>
            <button
              type="button"
              disabled={busy === p.id || !agree || p.stockStatus === "sold_out"}
              onClick={() => void buy(p.id, p.name)}
              className="user-dash-btn shrink-0 px-4 py-2 text-sm disabled:opacity-40"
            >
              {busy === p.id ? "…" : p.stockStatus === "sold_out" ? "품절" : "구매"}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass col-span-full rounded-2xl py-12 text-center text-sm text-label-secondary">
            조건에 맞는 상품이 없어요
          </div>
        )}
      </div>
    </div>
  );
}
