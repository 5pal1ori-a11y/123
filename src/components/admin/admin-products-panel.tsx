"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon, Package, Pencil, Plus, Search, Trash2, Boxes } from "lucide-react";
import { fadeUp, vxTransition } from "@/lib/motion";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { LicensePlan, ProductWithStock, ShopCategory } from "@/lib/types";
import { PlanLimitUsageBars } from "./plan-limit-usage";

type ProductsTab = "list" | "create" | "edit" | "stock" | "categories";

export type NewProductForm = {
  name: string;
  slug: string;
  price: string;
  category: string;
  description: string;
  thumbnail: string;
  purchaseLimitPerUser: string;
  tags: string;
  discordRoleId: string;
  mfaProduct: string;
  listingKind: "vending" | "individual";
  fulfillment: "auto" | "manual";
  manualNotice: string;
  stockBoardHidden: boolean;
};

type AdminProductsPanelProps = {
  shopSlug: string;
  shopPlan: LicensePlan;
  products: ProductWithStock[];
  categories: ShopCategory[];
  availableStock: number;
  lowStockCount: number;
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
  onDeleteProduct: (productId: string, name: string) => void;
  onDeleteCategory: (categoryId: string, name: string) => void;
  onCreateCategory: (name: string) => Promise<boolean>;
  onRenameCategory?: (categoryId: string, name: string) => Promise<boolean>;
  /** Landing preview: UI works, API writes are skipped */
  demoMode?: boolean;
};

function slugify(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (base) return base;
  return `item-${Date.now().toString(36)}`;
}

export function AdminProductsPanel({
  shopSlug,
  shopPlan,
  products,
  categories,
  availableStock,
  lowStockCount,
  onReload,
  onMessage,
  onDeleteProduct,
  onDeleteCategory,
  onCreateCategory,
  onRenameCategory,
  demoMode = false,
}: AdminProductsPanelProps) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = useState<ProductsTab>("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [codesText, setCodesText] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>({
    name: "",
    slug: "",
    price: "",
    category: categories[0]?.name ?? "",
    description: "",
    thumbnail: "",
    purchaseLimitPerUser: "",
    tags: "",
    discordRoleId: "",
    mfaProduct: "",
    listingKind: "vending",
    fulfillment: "auto",
    manualNotice: "",
    stockBoardHidden: false,
  });

  function startEdit(p: ProductWithStock) {
    setEditId(p.id);
    setSlugTouched(true);
    setNewProduct({
      name: p.name,
      slug: p.slug,
      price: String(p.price),
      category: p.category,
      description: p.description ?? "",
      thumbnail: p.thumbnail ?? "",
      purchaseLimitPerUser: p.purchaseLimitPerUser ? String(p.purchaseLimitPerUser) : "",
      tags: (p.tags ?? []).join(", "),
      discordRoleId: p.discordRoleId ?? "",
      mfaProduct: p.mfaProduct ?? "",
      listingKind: p.listingKind === "individual" ? "individual" : "vending",
      fulfillment: p.fulfillment === "manual" ? "manual" : "auto",
      manualNotice: p.manualNotice ?? "",
      stockBoardHidden: Boolean(p.stockBoardHidden),
    });
    setTab("edit");
  }

  useEffect(() => {
    if (!productId && products[0]) setProductId(products[0].id);
  }, [products, productId]);

  useEffect(() => {
    if (!newProduct.category && categories[0]) {
      setNewProduct((p) => ({ ...p, category: categories[0].name }));
    }
  }, [categories, newProduct.category]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  }, [products, search]);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const slug = (newProduct.slug.trim() || slugify(newProduct.name)).replace(/[^a-z0-9-]/gi, "").toLowerCase();
    if (!newProduct.name.trim()) {
      onMessage("상품명을 입력해 주세요.");
      return;
    }
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      onMessage("URL slug는 영문·숫자·하이픈만 가능해요. (예: my-product)");
      return;
    }
    const price = Number(newProduct.price);
    if (!Number.isFinite(price) || price < 0) {
      onMessage("가격을 확인해 주세요.");
      return;
    }
    if (demoMode) {
      onMessage("데모에서는 저장되지 않아요.");
      return;
    }
    const payload = {
      name: newProduct.name,
      slug,
      price,
      category: newProduct.category || "General",
      description: newProduct.description,
      thumbnail: newProduct.thumbnail.trim() || null,
      purchaseLimitPerUser: newProduct.purchaseLimitPerUser.trim()
        ? Number(newProduct.purchaseLimitPerUser)
        : null,
      tags: newProduct.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      discordRoleId: newProduct.discordRoleId.trim() || null,
      mfaProduct: newProduct.mfaProduct.trim() || null,
      listingKind: newProduct.listingKind,
      fulfillment: newProduct.fulfillment,
      manualNotice: newProduct.fulfillment === "manual" ? newProduct.manualNotice.trim() || null : null,
      stockBoardHidden: newProduct.stockBoardHidden,
    };
    try {
      if (tab === "edit" && editId) {
        const res = await fetch(`/api/products/${editId}`, {
          method: "PATCH",
          credentials: "include",
          headers: shopHeaders(shopSlug),
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          onMessage(data.error ?? "수정 실패");
          return;
        }
        onMessage("상품 수정됨");
        setEditId(null);
        setTab("list");
        await onReload();
        return;
      }
      const res = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onMessage(data.error ?? "등록 실패");
        return;
      }
      onMessage("상품 등록됨");
      setNewProduct({
        name: "",
        slug: "",
        price: "",
        category: newProduct.category,
        description: "",
        thumbnail: "",
        purchaseLimitPerUser: "",
        tags: "",
        discordRoleId: "",
        mfaProduct: "",
        listingKind: "vending",
        fulfillment: "auto",
        manualNotice: "",
        stockBoardHidden: false,
      });
      setSlugTouched(false);
      setTab("list");
      await onReload();
    } catch {
      onMessage(tab === "edit" ? "수정 중 오류가 발생했어요." : "등록 중 오류가 발생했어요.");
    }
  }

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    const codes = codesText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (demoMode) {
      onMessage("데모에서는 재고가 추가되지 않아요.");
      return;
    }
    const res = await fetch("/api/inventory", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({ productId, codes }),
    });
    onMessage(res.ok ? `재고 ${codes.length}건 추가됨` : "재고 추가 실패");
    if (res.ok) {
      setCodesText("");
      await onReload();
    }
  }

  return (
    <div className="space-y-5">
      <AdminHero
        productCount={products.length}
        availableStock={availableStock}
        lowStockCount={lowStockCount}
      />
      <div className="admin-bento p-4 sm:p-5">
        <PlanLimitUsageBars
          plan={shopPlan}
          productCount={products.length}
          categoryCount={categories.length}
        />
      </div>

      <div className="admin-bento p-4 sm:p-5">
        <div className="toss-seg" role="tablist" aria-label="제품 관리">
          {(
            [
              { id: "list" as const, label: "상품 목록" },
              { id: "create" as const, label: "상품 등록" },
              { id: "stock" as const, label: "재고 추가" },
              { id: "categories" as const, label: "카테고리" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-on" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "list" && (
            <motion.div
              key="list"
              className="mt-5 space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상품명 · 카테고리 검색"
                  className="toss-admin-field pl-10"
                />
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center">
                  <Package className="mx-auto size-10 text-neutral-600" />
                  <p className="mt-3 text-sm text-neutral-500">
                    {products.length === 0 ? "등록된 상품이 없어요" : "검색 결과 없음"}
                  </p>
                  {products.length === 0 && (
                    <button
                      type="button"
                      className="toss-admin-ghost mx-auto mt-4"
                      onClick={() => setTab("create")}
                    >
                      <Plus className="size-4" /> 첫 상품 등록
                    </button>
                  )}
                </div>
              ) : (
                <ul className="admin-product-list divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
                  {filtered.map((p) => (
                    <li key={p.id} className="admin-product-row">
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnail} alt="" referrerPolicy="no-referrer" className="admin-product-row-thumb" />
                      ) : (
                        <div className="admin-product-row-thumb-empty">
                          <Package className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{p.name}</p>
                        <p className="text-xs text-neutral-500">
                          {p.category} · {p.slug}
                          {p.tags?.length ? ` · ${p.tags.join(", ")}` : ""}
                          {p.purchaseLimitPerUser ? ` · 1인 ${p.purchaseLimitPerUser}개` : ""}
                          {p.mfaProduct ? ` · MFA: ${p.mfaProduct}` : ""}
                          {p.fulfillment === "manual" ? " · 수동지급" : " · 자동지급"}
                          {p.listingKind === "individual" ? " · 개별" : " · 자판기"}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="font-semibold text-accent">{formatKRW(p.price)}</p>
                        <p
                          className={`text-xs ${p.availableCount <= 3 ? "text-orange-400" : "text-neutral-500"}`}
                        >
                          재고 {p.availableCount}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="toss-admin-ghost hidden sm:inline-flex"
                      >
                        <Pencil className="size-3.5" /> 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setProductId(p.id);
                          setTab("stock");
                        }}
                        className="toss-admin-ghost hidden sm:inline-flex"
                      >
                        <Boxes className="size-3.5" /> 재고
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProduct(p.id, p.name)}
                        className="rounded-lg p-2 text-neutral-500 transition hover:bg-red-500/10 hover:text-red-400"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}

          {(tab === "create" || tab === "edit") && (
            <motion.form
              key={tab}
              onSubmit={createProduct}
              className="mt-5 space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="상품명">
                  <input
                    value={newProduct.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewProduct((p) => ({
                        ...p,
                        name,
                        slug: slugTouched ? p.slug : slugify(name),
                      }));
                    }}
                    className="toss-admin-field"
                    required
                  />
                </Field>
                <Field label="주소" hint="영문·숫자·하이픈">
                  <input
                    value={newProduct.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setNewProduct({ ...newProduct, slug: e.target.value });
                    }}
                    className="toss-admin-field font-mono text-sm"
                    placeholder="my-product"
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="가격 (원)">
                  <input
                    type="number"
                    min={0}
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="toss-admin-field"
                    required
                  />
                </Field>
                <Field label="카테고리">
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="toss-admin-field"
                  >
                    <option value="">선택</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="설명">
                <textarea
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="toss-admin-field min-h-[88px] resize-y"
                  rows={3}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="1인 구매 한도" hint="비우면 무제한">
                  <input
                    type="number"
                    min={1}
                    value={newProduct.purchaseLimitPerUser}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, purchaseLimitPerUser: e.target.value })
                    }
                    className="toss-admin-field"
                    placeholder="예: 1"
                  />
                </Field>
                <Field label="태그" hint="쉼표로 구분">
                  <input
                    value={newProduct.tags}
                    onChange={(e) => setNewProduct({ ...newProduct, tags: e.target.value })}
                    className="toss-admin-field"
                    placeholder="시즌1, v2"
                  />
                </Field>
                <Field label="디스코드 역할" hint="구매 시 지급">
                  <input
                    value={newProduct.discordRoleId}
                    onChange={(e) =>
                      setNewProduct({ ...newProduct, discordRoleId: e.target.value })
                    }
                    className="toss-admin-field font-mono text-sm"
                    placeholder="역할 ID"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="지급 방식">
                  <div className="flex gap-2">
                    {(
                      [
                        { id: "auto" as const, label: "자동지급" },
                        { id: "manual" as const, label: "수동지급" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`toss-admin-ghost flex-1 justify-center ${
                          newProduct.fulfillment === opt.id ? "is-on border-white/30 bg-white/10 text-white" : ""
                        }`}
                        onClick={() => setNewProduct({ ...newProduct, fulfillment: opt.id })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="재고현황 분류" hint="/추가 /삭제로도 변경">
                  <div className="flex gap-2">
                    {(
                      [
                        { id: "vending" as const, label: "자판기상품" },
                        { id: "individual" as const, label: "개별상품" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`toss-admin-ghost flex-1 justify-center ${
                          newProduct.listingKind === opt.id ? "is-on border-white/30 bg-white/10 text-white" : ""
                        }`}
                        onClick={() => setNewProduct({ ...newProduct, listingKind: opt.id })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {newProduct.fulfillment === "manual" ? (
                <Field label="수동지급 안내" hint="구매 직후 구매자와 디스코드 DM에 표시">
                  <textarea
                    value={newProduct.manualNotice}
                    onChange={(e) => setNewProduct({ ...newProduct, manualNotice: e.target.value })}
                    className="toss-admin-field min-h-[88px] resize-y"
                    rows={3}
                    placeholder="관리자가 확인 후 수동으로 지급합니다. 잠시만 기다려 주세요."
                    maxLength={800}
                  />
                </Field>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={newProduct.stockBoardHidden}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, stockBoardHidden: e.target.checked })
                  }
                />
                재고현황 채널에서 숨기기
              </label>
              <Field
                label="MFA MARKET 연동"
                hint="상품 종류 입력 시 재고 대신 MFA MARKET 계정 + 16자리 코드 지급"
              >
                <input
                  value={newProduct.mfaProduct}
                  onChange={(e) => setNewProduct({ ...newProduct, mfaProduct: e.target.value })}
                  className="toss-admin-field"
                  placeholder="비우면 일반 상품 (예: Normal MFA)"
                  list="mfa-product-options"
                  maxLength={40}
                />
                <datalist id="mfa-product-options">
                  <option value="Normal MFA" />
                  <option value="Full Access" />
                  <option value="NFA" />
                  <option value="SFA" />
                </datalist>
              </Field>
              <Field label="이미지 URL">
                <div className="flex gap-3">
                  <input
                    placeholder="https://…"
                    value={newProduct.thumbnail}
                    onChange={(e) => setNewProduct({ ...newProduct, thumbnail: e.target.value })}
                    className="toss-admin-field flex-1 font-mono text-xs"
                  />
                  {newProduct.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={newProduct.thumbnail}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-14 shrink-0 rounded-xl border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-600">
                      <ImageIcon className="size-5" />
                    </div>
                  )}
                </div>
              </Field>
              <button type="submit" className="toss-admin-primary vx-btn-press w-full sm:w-auto sm:min-w-[200px]">
                {tab === "edit" ? "상품 수정" : "상품 등록"}
              </button>
            </motion.form>
          )}

          {tab === "stock" && (
            <motion.form
              key="stock"
              onSubmit={addStock}
              className="mt-5 space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <Field label="대상 상품">
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="toss-admin-field"
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (재고 {p.availableCount})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="제품 재고 (한 줄에 하나)" hint={`${codesText.split(/\r?\n/).filter((l) => l.trim()).length}줄`}>
                <textarea
                  value={codesText}
                  onChange={(e) => setCodesText(e.target.value)}
                  placeholder={"XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"}
                  className="toss-admin-field min-h-[160px] resize-y font-mono text-xs leading-relaxed"
                />
              </Field>
              <button
                type="submit"
                disabled={!productId || !codesText.trim()}
                className="toss-admin-primary vx-btn-press w-full disabled:opacity-35 sm:w-auto sm:min-w-[200px]"
              >
                재고 추가
              </button>
            </motion.form>
          )}

          {tab === "categories" && (
            <motion.div
              key="categories"
              className="mt-5 space-y-4"
              initial={fadeUp.initial}
              animate={fadeUp.animate}
              exit={fadeUp.exit}
              transition={vxTransition}
            >
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!categoryName.trim()) return;
                  const ok = await onCreateCategory(categoryName.trim());
                  if (ok) setCategoryName("");
                }}
                className="flex gap-2"
              >
                <input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="새 카테고리명"
                  className="toss-admin-field flex-1"
                />
                <button type="submit" className="toss-admin-primary vx-btn-press shrink-0 px-6">
                  추가
                </button>
              </form>
              <ul className="flex flex-wrap gap-2">
                {categories.map((cat) =>
                  renaming?.id === cat.id ? (
                    <li key={cat.id}>
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const name = renaming.name.trim();
                          if (!name || name === cat.name || !onRenameCategory) {
                            setRenaming(null);
                            return;
                          }
                          if (await onRenameCategory(cat.id, name)) setRenaming(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={renaming.name}
                          maxLength={40}
                          onChange={(e) => setRenaming({ id: cat.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="toss-admin-field h-8 w-36 py-1 text-sm"
                        />
                        <button type="submit" className="toss-admin-primary vx-btn-press h-8 px-3 text-xs">
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          className="h-8 px-2 text-xs text-neutral-500 hover:text-neutral-300"
                        >
                          취소
                        </button>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={cat.id}
                      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
                      style={{
                        color: "var(--ad-text, #f4f4f5)",
                        background: "var(--ad-card, #121212)",
                        borderColor: "var(--ad-border, #2a2a2a)",
                      }}
                    >
                      <span>{cat.name}</span>
                      {onRenameCategory ? (
                        <button
                          type="button"
                          onClick={() => setRenaming({ id: cat.id, name: cat.name })}
                          className="text-neutral-500 transition hover:text-white"
                          aria-label="이름 수정"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(cat.id, cat.name)}
                        className="text-neutral-500 transition hover:text-red-400"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ),
                )}
                {categories.length === 0 && (
                  <li className="text-sm text-neutral-500">카테고리를 추가해 주세요</li>
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AdminHero({
  productCount,
  availableStock,
  lowStockCount,
}: {
  productCount: number;
  availableStock: number;
  lowStockCount: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "등록 상품", value: String(productCount) },
        { label: "가용 재고", value: availableStock.toLocaleString("ko-KR") },
        {
          label: "재고 부족",
          value: String(lowStockCount),
          warn: lowStockCount > 0,
        },
      ].map((s) => (
        <div
          key={s.label}
          className="admin-bento flex flex-col justify-center px-5 py-4"
        >
          <p className="text-xs text-neutral-500">{s.label}</p>
          <p className={`mt-1 text-2xl font-bold tracking-tight ${s.warn ? "text-orange-400" : "text-white"}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-500">
        {label}
        {hint ? <span className="text-neutral-600"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
