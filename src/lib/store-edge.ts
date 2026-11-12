import type { Shop, ShopUser } from "@/lib/types";

type EdgeDbStore = {
  shops?: Shop[];
  users?: ShopUser[];
};

const g = globalThis as { __orelStore?: EdgeDbStore };

function getStoreEdge(): EdgeDbStore | null {
  return g.__orelStore ?? null;
}

export function findShopBySlugEdge(slug: string): Shop | null {
  const store = getStoreEdge();
  if (!store?.shops) return null;
  const shop = store.shops.find((s) => s.slug === slug.toLowerCase()) ?? null;
  return shop && shop.status !== "suspended" ? shop : null;
}

export function getUserByIdEdge(id: string): ShopUser | null {
  const store = getStoreEdge();
  if (!store?.users) return null;
  return store.users.find((u) => u.id === id) ?? null;
}
