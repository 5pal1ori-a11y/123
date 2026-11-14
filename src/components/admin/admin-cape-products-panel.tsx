"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { CAPE_BY_TYPE } from "@/lib/capes-data";
import { SELLABLE_CAPES } from "@/lib/sellable-capes";
import { CapeFaceImg } from "@/components/capes/cape-face";
import type { ProductWithStock } from "@/lib/types";

/** 관리자: 판매하는 망토 10종 — 망토를 눌러 재고를 넣으면 '재고 있음', 0 이면 회색 + '재고없음' */
export function AdminCapeProductsPanel({
  shopSlug,
  products,
  onReload,
  onMessage,
}: {
  shopSlug: string;
  products: ProductWithStock[];
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
}) {
  const [open, setOpen] = useState<{ type: string; title: string } | null>(null);
  const [price, setPrice] = useState("");
  const [codes, setCodes] = useState("");
  const [busy, setBusy] = useState(false);

  const byType = (type: string) => products.find((p) => p.productKind === "mc_cape" && p.capeType === type);

  async function api(path: string, method: string, body: unknown) {
    const res = await fetch(path, { method, credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string; product?: { id: string } };
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  }

  function openCape(c: { type: string; title: string }) {
    const p = byType(c.type);
    setOpen(c);
    setPrice(p ? String(p.price) : "");
    setCodes("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    const p = byType(open.type);
    const priceNum = Number(price);
    const lines = codes.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!Number.isInteger(priceNum) || priceNum < 0) return onMessage("가격을 확인해 주세요.");
    if (!p && lines.length === 0 && !price.trim()) return onMessage("가격이나 재고를 넣어 주세요.");
    setBusy(true);
    try {
      let productId = p?.id;
      if (!productId) {
        const created = await api("/api/products", "POST", {
          name: `${open.title} 망토`,
          slug: `cape-${open.type}`,
          price: priceNum,
          category: "마인크래프트 망토",
          description: `${open.title} 망토 리딤 코드`,
          tags: [],
          productKind: "mc_cape",
          capeType: open.type,
          listingKind: "vending",
          fulfillment: "auto",
          purchaseLimitPerUser: null,
        });
        productId = created.product?.id;
      } else if (priceNum !== p?.price) {
        await api(`/api/products/${productId}`, "PATCH", { price: priceNum });
      }
      if (productId && lines.length) await api("/api/inventory", "POST", { productId, codes: lines });
      onMessage(lines.length ? `${open.title} 재고 ${lines.length}개를 넣었어요` : `${open.title} 저장했어요`);
      setOpen(null);
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="admin-bento p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">망토 상품</h2>
        <p className="mt-1 text-sm text-neutral-400">
          망토를 눌러 가격과 재고(리딤 코드, 한 줄에 하나)를 넣으세요. 재고가 없으면 상점에서 회색 · 재고없음으로 보여요.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SELLABLE_CAPES.map((c) => {
            const p = byType(c.type);
            const count = p?.availableCount ?? 0;
            const has = count > 0;
            const hash = CAPE_BY_TYPE[c.type]?.hash;
            return (
              <li key={c.type}>
                <button
                  type="button"
                  onClick={() => openCape(c)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.07]"
                  style={has ? undefined : { filter: "grayscale(1)", opacity: 0.6 }}
                >
                  <div className="flex h-[88px] items-center">{hash ? <CapeFaceImg hash={hash} width={54} alt={c.title} /> : null}</div>
                  <span className="text-[15px] font-bold text-white">{c.title}</span>
                  <span className={`text-xs font-semibold ${has ? "text-emerald-400" : "text-neutral-400"}`}>
                    {has ? `재고 ${count}개` : "재고없음"}
                  </span>
                  {p ? <span className="text-[11px] text-neutral-500">{p.price.toLocaleString("ko-KR")}원</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
              <form
                onSubmit={save}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#111] p-5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{open.title} 망토 재고</h3>
                  <button type="button" onClick={() => setOpen(null)} aria-label="닫기">
                    <X className="size-5 text-neutral-400" />
                  </button>
                </div>
                <label className="block text-sm text-neutral-300">
                  가격(원)
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className="toss-admin-field mt-1" />
                </label>
                <label className="block text-sm text-neutral-300">
                  재고 추가 — 리딤 코드 (한 줄에 하나)
                  <textarea value={codes} onChange={(e) => setCodes(e.target.value)} rows={6} className="toss-admin-field mt-1 font-mono text-xs" />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-black disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  저장
                </button>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
