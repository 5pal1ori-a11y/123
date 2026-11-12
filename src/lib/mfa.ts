/** MFA MARKET 연동 — 구매 시 MFA MARKET 재고에서 계정을 배정받고 16자리 코드를 발급받는다 */

import { randomUUID } from "crypto";
import {
  createProduct,
  getProductById,
  getShopById,
  getShopSettings,
  listMfaProducts,
  listMfaShopIds,
  listProductsAdmin,
  MFA_DEFAULT_CATEGORY,
  purchasePrecheck,
  purchaseWithPoints,
  setMfaStock,
  updateProduct,
  usesLocalFulfillment,
} from "@/lib/store";
import { getMfaStockCache } from "@/lib/mfa-cache";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";
import type { ExternalDelivery, Order } from "@/lib/types";

export type MfaConfig = { url: string; key: string };

export type MfaIssuedItem = {
  code: string;
  formatted: string;
  url: string;
  accountId: number;
  nickname: string;
  product: string | null;
};

type PurchaseResult =
  | { ok: true; order: Order; orders: Order[]; links?: ExternalDelivery["links"] }
  | { ok: false; error: string };

const TIMEOUT_MS = 10_000;

const lastShopRefresh = new Map<string, number>();

export function getMfaConfig(shopId: string): MfaConfig | null {
  const s = getShopSettings(shopId);
  const url = s.mfaApiUrl?.trim();
  const key = s.mfaApiKey?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function call<T>(
  cfg: MfaConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; data: T & { ok?: boolean; error?: string } }> {
  const res = await fetch(`${cfg.url}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${cfg.key}`,
      ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let data: T & { ok?: boolean; error?: string };
  try {
    data = (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    data = { ok: false, error: `MFA MARKET 응답 오류 (HTTP ${res.status})` } as T & { ok?: boolean; error?: string };
  }
  return { status: res.status, data };
}

export type MfaCatalogItem = {
  product: string;
  available: number;
  price: number | null;
  description: string | null;
};

export async function mfaFetchStock(cfg: MfaConfig) {
  const { status, data } = await call<{
    available: number;
    products: { product: string; available: number }[];
    catalog?: MfaCatalogItem[];
  }>(cfg, "/api/partner/stock");
  if (status !== 200 || !data.ok) throw new Error(data.error || `MFA MARKET 재고 조회 실패 (HTTP ${status})`);
  return { available: data.available, products: data.products ?? [], catalog: data.catalog };
}

function mfaProductSlug(shopId: string, name: string) {
  const base =
    `mfa-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`.slice(0, 40).replace(/-+$/, "") || "mfa";
  const taken = new Set(listProductsAdmin(shopId).map((p) => p.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/**
 * MFA MARKET 관리자(/check/admin)에서 가격을 정한 상품 종류를 자판기 상품으로 맞춘다.
 * 가격이 있으면 생성/가격 갱신 + 판매중, 가격이 없어지면 판매중지.
 */
function syncMfaCatalog(shopId: string, catalog: MfaCatalogItem[]) {
  const existing = listMfaProducts(shopId);
  const byKey = new Map(existing.map((p) => [(p.mfaProduct ?? "").trim().toLowerCase(), p]));
  const category = existing.find((p) => p.category)?.category || MFA_DEFAULT_CATEGORY;
  let changed = 0;
  for (const item of catalog) {
    const key = item.product.trim().toLowerCase();
    if (!key) continue;
    const current = byKey.get(key);
    if (item.price && item.price > 0) {
      if (!current) {
        try {
          createProduct(shopId, {
            name: item.product,
            slug: mfaProductSlug(shopId, item.product),
            description: item.description ?? `${item.product} 마인크래프트 계정 · 구매 즉시 16자리 확인 코드 발급`,
            price: item.price,
            category,
            active: true,
            mfaProduct: item.product,
          });
          changed++;
        } catch (err) {
          console.error("[mfa] catalog create failed", item.product, err);
        }
      } else {
        const patch: Parameters<typeof updateProduct>[2] = {};
        if (current.price !== item.price) patch.price = item.price;
        if (!current.active && current.mfaAutoInactive !== false) {
          patch.active = true;
          patch.mfaAutoInactive = true;
        }
        if (item.description && current.description !== item.description) patch.description = item.description;
        if (Object.keys(patch).length) {
          updateProduct(shopId, current.id, patch);
          changed++;
        }
      }
    } else if (current?.active) {
      updateProduct(shopId, current.id, { active: false, mfaAutoInactive: true });
      changed++;
    }
  }
  return changed;
}

const ADMIN_PATHS: Array<[string, RegExp]> = [
  ["GET", /^overview$/],
  ["GET", /^accounts$/],
  ["POST", /^accounts$/],
  ["POST", /^accounts\/bulk$/],
  ["PUT", /^accounts\/\d+$/],
  ["DELETE", /^accounts\/\d+$/],
  ["POST", /^accounts\/\d+\/(release|reissue)$/],
  ["GET", /^lookup$/],
  ["GET", /^products$/],
  ["PUT", /^products$/],
];

/** DOES 관리자 → MFA MARKET 재고 관리 API (/api/partner/admin/*) 중계 */
export async function mfaAdmin(
  shopId: string,
  method: string,
  path: string,
  search: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const cfg = getMfaConfig(shopId);
  if (!cfg) return { status: 400, data: { ok: false, error: "MFA MARKET 연동 설정이 없습니다." } };
  if (!ADMIN_PATHS.some(([m, re]) => m === method && re.test(path))) {
    return { status: 404, data: { ok: false, error: "Not found" } };
  }
  const { status, data } = await call<Record<string, unknown>>(cfg, `/api/partner/admin/${path}${search}`, {
    method,
    body,
  });
  if (method !== "GET" && status < 400) {
    lastShopRefresh.delete(shopId);
    await refreshMfaStock(shopId).catch((err) => console.error("[mfa] refresh after admin change failed", err));
  }
  return { status, data };
}

export async function mfaRelease(cfg: MfaConfig, orderRef: string) {
  const { status, data } = await call<{ released: number; viewed: number }>(cfg, "/api/partner/release", {
    method: "POST",
    body: { orderRef },
  });
  if (status !== 200 || !data.ok) throw new Error(data.error || `MFA MARKET 반환 실패 (HTTP ${status})`);
  return data;
}

function stockFor(products: { product: string; available: number }[], name: string) {
  const key = name.trim().toLowerCase();
  return products.find((p) => p.product.trim().toLowerCase() === key)?.available ?? 0;
}

/**
 * 마지막으로 본 재고를 KV 에 두고, 늘어난 상품만 입고 알림을 보낸다.
 * 재고 갱신은 여러 isolate(크론 · 페이지 · 관리자 패널)에서 일어나므로 메모리 캐시로 비교하면 알림이 겹친다.
 */
async function announceRestocks(shopId: string, counts: Record<string, number>) {
  const key = `vendix:mfa-seen:${shopId}`;
  await withLock(key, async () => {
    const seen = await kvGetJson<Record<string, number>>(key);
    if (seen && Object.keys(counts).every((id) => seen[id] === counts[id])) return;
    await kvPutJson(key, counts);
    if (!seen) return;

    const restocked = listMfaProducts(shopId).filter(
      (p) => p.active && (counts[p.id] ?? 0) > (seen[p.id] ?? 0),
    );
    const [{ postRestockLog }, { notifyRestockWatchers }, { refreshStockBoard }, { scheduleDiscordBackground }] =
      await Promise.all([
        import("@/lib/discord/logs"),
        import("@/lib/store-ext"),
        import("@/lib/discord/stock-board"),
        import("@/lib/discord/schedule"),
      ]);
    for (const p of restocked) {
      const before = seen[p.id] ?? 0;
      const added = counts[p.id]! - before;
      postRestockLog(shopId, { productName: p.name, addedCount: added, newTotal: counts[p.id]!, price: p.price });
      if (before === 0) notifyRestockWatchers(shopId, p.id, p.name, added);
    }
    scheduleDiscordBackground(refreshStockBoard(shopId).catch(() => null));
  });
}

/** MFA 연동 상품의 재고 캐시를 갱신한다. shopId 를 생략하면 전체 상점 */
export async function refreshMfaStock(shopId?: string) {
  const shopIds = new Set<string>(listMfaShopIds().filter((id) => !shopId || id === shopId));
  for (const p of listMfaProducts(shopId)) shopIds.add(p.shopId);
  let updated = 0;
  const errors: string[] = [];
  for (const sid of shopIds) {
    const cfg = getMfaConfig(sid);
    if (!cfg) continue;
    try {
      const stock = await mfaFetchStock(cfg);
      lastShopRefresh.set(sid, Date.now());
      if (stock.catalog) syncMfaCatalog(sid, stock.catalog);
      const counts: Record<string, number> = {};
      for (const p of listMfaProducts(sid)) {
        const count = stockFor(stock.products, p.mfaProduct ?? "");
        setMfaStock(p.id, count);
        counts[p.id] = count;
        updated++;
      }
      await announceRestocks(sid, counts).catch((err) => console.error("[mfa] restock notify failed", err));
    } catch (err) {
      errors.push(`${sid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { updated, errors };
}

/** 캐시가 maxAgeMs 보다 오래된 MFA 상품이 있으면 재고를 다시 받아온다. 실패해도 캐시를 그대로 쓴다 */
export async function refreshMfaStockIfStale(shopId: string, maxAgeMs = 30_000) {
  const now = Date.now();
  const stale =
    now - (lastShopRefresh.get(shopId) ?? 0) > maxAgeMs ||
    listMfaProducts(shopId).some((p) => {
      const cached = getMfaStockCache(p.id);
      return !cached || now - cached.at > maxAgeMs;
    });
  if (!stale || !getMfaConfig(shopId)) return;
  try {
    await refreshMfaStock(shopId);
  } catch (err) {
    console.error("[mfa] stock refresh failed", err);
  }
}

const maskCode = (formatted: string) => `${formatted.slice(0, 4)}-••••-••••-••••`;

/**
 * 포인트 구매. MFA 연동 상품이면 MFA MARKET 에서 코드를 먼저 발급받고,
 * 구매가 실패하면(잔액 부족 등) 발급된 계정을 즉시 반환한다.
 */
export async function purchaseWithPointsSmart(
  shopId: string,
  userId: string,
  productId: string,
  opts?: {
    quantity?: number;
    suppressDiscordNotify?: boolean;
    buyerDiscordId?: string | null;
    unitPriceOverride?: number;
  },
): Promise<PurchaseResult> {
  const product = getProductById(productId);
  const quantity = Math.max(1, Math.floor(opts?.quantity ?? 1));
  if (!product || product.shopId !== shopId || usesLocalFulfillment(productId, quantity)) {
    return purchaseWithPoints(shopId, userId, productId, opts);
  }

  const cfg = getMfaConfig(shopId);
  if (!cfg) return { ok: false, error: "MFA MARKET 연동 설정이 필요해요. 관리자에게 문의해 주세요." };

  if (quantity > 10) return { ok: false, error: "이 상품은 한 번에 10개까지 구매할 수 있어요." };
  const precheck = purchasePrecheck(shopId, userId, productId, quantity, opts?.unitPriceOverride);
  if (precheck) return { ok: false, error: precheck };
  const shop = getShopById(shopId);
  const orderRef = `vendix:${shop?.slug ?? shopId}:${randomUUID()}`;

  let issued: { items: MfaIssuedItem[]; available: number };
  try {
    const { status, data } = await call<{ items: MfaIssuedItem[]; available: number }>(cfg, "/api/partner/issue", {
      method: "POST",
      body: {
        product: product.mfaProduct,
        quantity,
        orderRef,
        buyerDiscordId: opts?.buyerDiscordId ?? null,
        source: `vendix:${shop?.slug ?? shopId}`,
      },
    });
    if (status === 409) {
      setMfaStock(product.id, data.available ?? 0);
      return {
        ok: false,
        error: (data.available ?? 0) === 0 ? "품절" : `재고 부족 (남은 ${data.available}개)`,
      };
    }
    if (status !== 200 || !data.ok || !Array.isArray(data.items) || data.items.length !== quantity) {
      // 일부만 발급됐거나 응답이 이상해도 잡힌 계정은 돌려놓는다
      await mfaRelease(cfg, orderRef).catch((e) => console.error("[mfa] release failed", orderRef, e));
      return { ok: false, error: data.error || "계정 코드 발급에 실패했어요. 잠시 후 다시 시도해 주세요." };
    }
    issued = data;
  } catch (err) {
    console.error("[mfa] issue failed", err);
    await mfaRelease(cfg, orderRef).catch((e) => console.error("[mfa] release failed", orderRef, e));
    return { ok: false, error: "MFA MARKET 연결에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  const links = issued.items.map((it, i) => ({
    label: issued.items.length > 1 ? `계정 정보 확인 ${i + 1}` : "계정 정보 확인하기",
    url: it.url,
  }));
  const external: ExternalDelivery = {
    codes: issued.items.map((it) => `코드: ${it.formatted}\n확인: ${it.url}`),
    stockLeft: issued.available,
    links,
    logHints: issued.items.map((it) => maskCode(it.formatted)),
  };

  let result: ReturnType<typeof purchaseWithPoints>;
  try {
    result = purchaseWithPoints(shopId, userId, productId, { ...opts, quantity, external });
  } catch (err) {
    await mfaRelease(cfg, orderRef).catch((e) => console.error("[mfa] release failed", orderRef, e));
    throw err;
  }
  if (!result.ok) {
    await mfaRelease(cfg, orderRef).catch((e) => console.error("[mfa] release failed", orderRef, e));
    return result;
  }
  return { ...result, links };
}

/** 장바구니 포인트 구매 (MFA 연동 상품 포함) */
export async function purchaseCartWithPointsSmart(
  shopId: string,
  userId: string,
  items: { productId: string; quantity: number }[],
): Promise<{ ok: true; orders: Order[]; total: number; partialError?: string } | { ok: false; error: string }> {
  const normalized = items
    .map((i) => ({ productId: i.productId, quantity: Math.max(1, Math.floor(i.quantity)) }))
    .filter((i) => i.productId);
  if (!normalized.length) return { ok: false, error: "장바구니가 비어 있어요" };

  const orders: Order[] = [];
  let total = 0;
  for (const item of normalized) {
    const result = await purchaseWithPointsSmart(shopId, userId, item.productId, { quantity: item.quantity });
    if (!result.ok) {
      if (!orders.length) return { ok: false, error: result.error };
      // 앞에서 결제된 상품은 이미 지급됐으니 그 결과를 돌려준다
      return { ok: true, orders, total, partialError: `${orders.length}개 구매 후 실패: ${result.error}` };
    }
    orders.push(...result.orders);
    total += result.orders.reduce((sum, o) => sum + o.amount, 0);
  }
  return { ok: true, orders, total };
}
