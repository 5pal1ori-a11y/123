import { loadDbJsonFromKv, getKvBinding } from "@/lib/db-persist";

type StoreGlobal = {
  __orelStore?: Record<string, unknown>;
  __vendixUseKv?: boolean;
  __vendixStoreInit?: Promise<void>;
  __orelFromKv?: boolean;
};

const g = globalThis as StoreGlobal;

function patchEdgeStore(raw: Record<string, unknown>) {
  const listKeys = [
    "licenses",
    "shops",
    "products",
    "inventories",
    "orders",
    "logs",
    "users",
    "notices",
    "platformNotices",
    "events",
    "charges",
    "settings",
    "categories",
    "tiers",
    "coupons",
    "reviews",
    "bugReports",
    "inquiries",
    "platformSupport",
    "wishlists",
    "loginHistory",
    "authSessions",
    "adminNotifications",
    "userNotifications",
    "discordLinkCodes",
    "bannerAds",
  ] as const;

  for (const key of listKeys) {
    if (!Array.isArray(raw[key])) raw[key] = [];
  }
  return raw;
}

function emptyEdgeStore() {
  return patchEdgeStore({
    licenses: [],
    shops: [],
    products: [],
    inventories: [],
    orders: [],
    logs: [],
    users: [],
    notices: [],
    platformNotices: [],
    events: [],
    charges: [],
    settings: [],
    categories: [],
    tiers: [],
    coupons: [],
    reviews: [],
    bugReports: [],
    inquiries: [],
    platformSupport: [],
    wishlists: [],
    loginHistory: [],
    authSessions: [],
    adminNotifications: [],
    userNotifications: [],
  });
}

/** Edge-safe KV bootstrap (no Node fs/crypto). Used from middleware on Cloudflare. */
export async function initStoreKvOnly(): Promise<void> {
  if (g.__orelStore) return;

  try {
    const kvJson = await loadDbJsonFromKv();
    if (kvJson) {
      try {
        g.__vendixUseKv = true;
        g.__orelStore = patchEdgeStore(JSON.parse(kvJson) as Record<string, unknown>);
        g.__orelFromKv = true;
        return;
      } catch {
        // corrupt payload — do not overwrite KV
      }
    }
  } catch {
    // KV read failed — continue without throwing
  }

  if (g.__vendixStoreInit) {
    try {
      await g.__vendixStoreInit;
    } catch {
      g.__vendixStoreInit = undefined;
    }
    return;
  }

  g.__vendixStoreInit = (async () => {
    try {
      const kv = await getKvBinding();
      if (!kv) return;

      const existing = await kv.get("vendix:db");
      if (existing) {
        try {
          g.__vendixUseKv = true;
          g.__orelStore = patchEdgeStore(JSON.parse(existing) as Record<string, unknown>);
          g.__orelFromKv = true;
          return;
        } catch {
          g.__orelStore = emptyEdgeStore();
          return;
        }
      }

      g.__vendixUseKv = true;
      g.__orelStore = emptyEdgeStore();
      g.__orelFromKv = true;
      await kv.put("vendix:db", JSON.stringify(g.__orelStore));
    } catch {
      if (!g.__orelStore) g.__orelStore = emptyEdgeStore();
    } finally {
      g.__vendixStoreInit = undefined;
    }
  })();

  try {
    await g.__vendixStoreInit;
  } catch {
    g.__vendixStoreInit = undefined;
    if (!g.__orelStore) g.__orelStore = emptyEdgeStore();
  }
}

export function isKvMode(): boolean {
  return Boolean(g.__vendixUseKv);
}

export function markKvMode(): void {
  g.__vendixUseKv = true;
}
