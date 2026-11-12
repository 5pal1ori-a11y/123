"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate, formatKRW } from "@/lib/utils";
import type { Order, ProductWithStock, SystemLog } from "@/lib/types";
import { shopHeaders } from "@/lib/shop-client";

type AdminPayload = {
  shop: { id: string; slug: string; name: string; tagline: string };
  stats: {
    revenue: number;
    orderCount: number;
    available: number;
    locked: number;
    sold: number;
    byProduct: {
      productId: string;
      name: string;
      sales: number;
      revenue: number;
      available: number;
    }[];
  };
  products: ProductWithStock[];
  orders: Order[];
  logs: SystemLog[];
};

export function AdminConsole({ shopSlug }: { shopSlug: string }) {
  const storageKey = `orel-admin-${shopSlug}`;
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [codesText, setCodesText] = useState("");
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: "",
    slug: "",
    price: "",
    category: "License",
    description: "",
  });
  const [productMsg, setProductMsg] = useState<string | null>(null);

  const load = useCallback(
    async (key: string) => {
      const res = await fetch("/api/admin", {
        headers: { ...shopHeaders(shopSlug, false), "x-orel-admin": key },
      });
      if (!res.ok) {
        setAuthed(false);
        setError("인증 실패");
        return;
      }
      const json = (await res.json()) as AdminPayload;
      setData(json);
      setAuthed(true);
      setError(null);
      setProductId((prev) => prev || json.products[0]?.id || "");
    },
    [shopSlug],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      setPassword(saved);
      void load(saved);
    }
  }, [load, storageKey]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(storageKey, password);
    await load(password);
  }

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    setStockMsg(null);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { ...shopHeaders(shopSlug), "x-orel-admin": password },
      body: JSON.stringify({ productId, codesText }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStockMsg(json.error ?? "실패");
      return;
    }
    setStockMsg(`추가 ${json.added} · 중복 ${json.duplicates}`);
    setCodesText("");
    await load(password);
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setProductMsg(null);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { ...shopHeaders(shopSlug), "x-orel-admin": password },
      body: JSON.stringify({
        name: newProduct.name,
        slug: newProduct.slug,
        price: Number(newProduct.price),
        category: newProduct.category,
        description: newProduct.description,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setProductMsg(json.error ?? "실패");
      return;
    }
    setProductMsg(`등록됨: ${json.product.name}`);
    setNewProduct({
      name: "",
      slug: "",
      price: "",
      category: "License",
      description: "",
    });
    setProductId(json.product.id);
    await load(password);
  }

  if (!authed || !data) {
    return (
      <form onSubmit={login} className="surface mx-auto max-w-sm space-y-4 rounded-sm p-6">
        <p className="text-[10px] uppercase tracking-[0.22em] text-smoke">Admin</p>
        <h1 className="font-display text-3xl text-pearl">{shopSlug}</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          className="w-full border border-line bg-ink px-4 py-3 text-sm text-pearl outline-none focus:border-stone"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          className="w-full border border-pearl/40 py-3 text-[11px] uppercase tracking-[0.16em] text-pearl"
        >
          Unlock
        </button>
      </form>
    );
  }

  const { stats } = data;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Revenue", value: formatKRW(stats.revenue) },
          { label: "Orders", value: String(stats.orderCount) },
          { label: "Available", value: String(stats.available) },
          { label: "Locked / Sold", value: `${stats.locked} / ${stats.sold}` },
        ].map((card) => (
          <div key={card.label} className="surface rounded-sm p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-smoke">{card.label}</p>
            <p className="mt-2 font-mono text-lg text-platinum">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="surface rounded-sm p-6">
        <h2 className="font-display text-2xl text-pearl">Register product</h2>
        <p className="mt-1 text-sm text-stone">기본 상품은 없습니다. 직접 등록하세요.</p>
        <form onSubmit={createProduct} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            required
            value={newProduct.name}
            onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
            placeholder="상품명"
            className="border border-line bg-ink px-3 py-2 text-sm text-pearl outline-none focus:border-stone"
          />
          <input
            required
            value={newProduct.slug}
            onChange={(e) => setNewProduct((s) => ({ ...s, slug: e.target.value }))}
            placeholder="slug"
            className="border border-line bg-ink px-3 py-2 font-mono text-sm text-pearl outline-none focus:border-stone"
          />
          <input
            required
            type="number"
            min={0}
            value={newProduct.price}
            onChange={(e) => setNewProduct((s) => ({ ...s, price: e.target.value }))}
            placeholder="가격"
            className="border border-line bg-ink px-3 py-2 font-mono text-sm text-pearl outline-none focus:border-stone"
          />
          <input
            value={newProduct.category}
            onChange={(e) => setNewProduct((s) => ({ ...s, category: e.target.value }))}
            placeholder="Category"
            className="border border-line bg-ink px-3 py-2 text-sm text-pearl outline-none focus:border-stone"
          />
          <textarea
            value={newProduct.description}
            onChange={(e) => setNewProduct((s) => ({ ...s, description: e.target.value }))}
            placeholder="설명"
            rows={2}
            className="border border-line bg-ink px-3 py-2 text-sm text-pearl outline-none focus:border-stone sm:col-span-2"
          />
          <button
            type="submit"
            className="border border-pearl/40 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-pearl sm:col-span-2"
          >
            Create product
          </button>
          {productMsg && <p className="text-sm text-stone sm:col-span-2">{productMsg}</p>}
        </form>
      </section>

      <section className="surface rounded-sm p-6">
        <h2 className="font-display text-2xl text-pearl">Stock pool</h2>
        <form onSubmit={addStock} className="mt-4 space-y-3">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full border border-line bg-ink px-3 py-2 text-sm text-pearl outline-none"
          >
            {data.products.length === 0 && <option value="">상품을 먼저 등록하세요</option>}
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.availableCount} avail)
              </option>
            ))}
          </select>
          <textarea
            required
            value={codesText}
            onChange={(e) => setCodesText(e.target.value)}
            rows={5}
            placeholder={"CODE-001\nCODE-002"}
            className="w-full border border-line bg-ink px-3 py-2 font-mono text-sm text-pearl outline-none focus:border-stone"
          />
          <button
            type="submit"
            disabled={!productId}
            className="border border-pearl/40 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-pearl disabled:opacity-40"
          >
            Register codes
          </button>
          {stockMsg && <p className="text-sm text-stone">{stockMsg}</p>}
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="surface rounded-sm p-6">
          <h2 className="font-display text-2xl text-pearl">By product</h2>
          <ul className="mt-4 space-y-3">
            {stats.byProduct.length === 0 && (
              <li className="text-sm text-smoke">아직 상품이 없습니다.</li>
            )}
            {stats.byProduct.map((row) => (
              <li
                key={row.productId}
                className="flex justify-between border-b border-line pb-2 text-sm"
              >
                <span className="text-pearl">{row.name}</span>
                <span className="font-mono text-xs text-smoke">
                  {row.sales} sold · {row.available} left
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="surface rounded-sm p-6">
          <h2 className="font-display text-2xl text-pearl">Recent orders</h2>
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto">
            {data.orders.length === 0 && (
              <li className="text-sm text-smoke">아직 주문이 없습니다.</li>
            )}
            {data.orders.map((order) => (
              <li key={order.id} className="border-b border-line pb-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[10px] text-smoke">{order.orderUuid}</span>
                  <span className="text-[10px] uppercase text-smoke">{order.status}</span>
                </div>
                <div className="mt-1 flex justify-between text-stone">
                  <span>{order.buyerEmail}</span>
                  <span className="font-mono text-platinum">{formatKRW(order.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="surface rounded-sm p-6">
        <h2 className="font-display text-2xl text-pearl">Logs</h2>
        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto font-mono text-xs text-smoke">
          {data.logs.map((log) => (
            <li key={log.id}>
              [{formatDate(log.createdAt)}] {log.actor} · {log.action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
