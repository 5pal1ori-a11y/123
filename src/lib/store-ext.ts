import { randomUUID } from "crypto";
import { ensureStoreExtensions } from "@/lib/store-bind";
import { deviceLabelFromUa, ipAllowed } from "@/lib/request-meta";
import type {
  AdminNotification,
  AuthSession,
  LoginHistoryEntry,
  MonthlyReportRow,
  PointCharge,
  ShopSettings,
  UserNotification,
  WishlistItem,
} from "@/lib/types";

type StoreApi = {
  getStore: () => {
    wishlists: WishlistItem[];
    userNotifications: UserNotification[];
    loginHistory: LoginHistoryEntry[];
    authSessions: AuthSession[];
    adminNotifications: AdminNotification[];
    charges: PointCharge[];
    orders: { shopId: string; userId: string | null; productId: string; amount: number; status: string; paidAt: string | null; createdAt: string }[];
    products: { id: string; shopId: string; name: string }[];
    inventories: { productId: string; shopId: string; status: string }[];
    shops: { id: string; expiresAt: string; name: string }[];
    settings: ShopSettings[];
  };
  persist: (store: ReturnType<StoreApi["getStore"]>) => void;
  pushLog: (actor: string, action: string, meta: Record<string, unknown>, shopId: string | null) => void;
  availableCount: (store: ReturnType<StoreApi["getStore"]>, productId: string) => number;
};

let api: StoreApi | null = null;

export function bindStoreExt(deps: StoreApi) {
  api = deps;
}

function patchStoreCollections(s: ReturnType<StoreApi["getStore"]> & Record<string, unknown>) {
  if (!Array.isArray(s.wishlists)) s.wishlists = [];
  if (!Array.isArray(s.userNotifications)) s.userNotifications = [];
  if (!Array.isArray(s.loginHistory)) s.loginHistory = [];
  if (!Array.isArray(s.authSessions)) s.authSessions = [];
  if (!Array.isArray(s.adminNotifications)) s.adminNotifications = [];
  for (const w of s.wishlists as WishlistItem[]) {
    if (w.notifyRestock === undefined) w.notifyRestock = true;
    if (w.lastRestockNotifiedAt === undefined) w.lastRestockNotifiedAt = null;
  }
  return s;
}

function store() {
  ensureStoreExtensions();
  if (api) {
    return patchStoreCollections(api.getStore() as ReturnType<StoreApi["getStore"]> & Record<string, unknown>);
  }
  const g = globalThis as { __orelStore?: ReturnType<StoreApi["getStore"]> };
  if (g.__orelStore) {
    return patchStoreCollections(g.__orelStore as ReturnType<StoreApi["getStore"]> & Record<string, unknown>);
  }
  throw new Error("store-ext not initialized");
}

function save() {
  ensureStoreExtensions();
  if (!api) throw new Error("store-ext not initialized");
  api.persist(store());
}

// ─── Wishlist ───────────────────────────────────────────────────────────

export function toggleWishlist(shopId: string, userId: string, productId: string) {
  const s = store();
  const idx = s.wishlists.findIndex(
    (w) => w.shopId === shopId && w.userId === userId && w.productId === productId,
  );
  if (idx >= 0) {
    s.wishlists.splice(idx, 1);
    save();
    return { wishlisted: false };
  }
  s.wishlists.unshift({
    id: randomUUID(),
    shopId,
    userId,
    productId,
    createdAt: new Date().toISOString(),
    notifyRestock: true,
    lastRestockNotifiedAt: null,
  });
  save();
  return { wishlisted: true };
}

export function listWishlistProductIds(shopId: string, userId: string) {
  return store()
    .wishlists.filter((w) => w.shopId === shopId && w.userId === userId)
    .map((w) => w.productId);
}

export function notifyRestockWatchers(
  shopId: string,
  productId: string,
  productName: string,
  addedCount: number,
) {
  const s = store();
  const settings = s.settings.find((x) => x.shopId === shopId);
  if (settings?.restockNotifyEnabled === false) return 0;

  const now = new Date().toISOString();
  const watchers = s.wishlists.filter(
    (w) => w.shopId === shopId && w.productId === productId && w.notifyRestock !== false,
  );
  for (const w of watchers) {
    s.userNotifications.unshift({
      id: randomUUID(),
      shopId,
      userId: w.userId,
      type: "restock",
      title: "재입고 알림",
      body: `「${productName}」이(가) ${addedCount}개 재입고됐어요.`,
      productId,
      read: false,
      createdAt: now,
    });
    w.lastRestockNotifiedAt = now;
  }
  if (watchers.length) save();
  return watchers.length;
}

export function listUserNotifications(shopId: string, userId: string, unreadOnly = false) {
  return store()
    .userNotifications.filter(
      (n) =>
        n.shopId === shopId &&
        n.userId === userId &&
        (!unreadOnly || !n.read),
    )
    .slice(0, 30);
}

export function markUserNotificationRead(id: string, shopId: string, userId: string) {
  const s = store();
  const note = s.userNotifications.find(
    (n) => n.id === id && n.shopId === shopId && n.userId === userId,
  );
  if (!note) return false;
  note.read = true;
  save();
  return true;
}

// ─── Login history ───────────────────────────────────────────────────────

export function recordLoginHistory(input: {
  shopId: string;
  subjectId: string;
  role: "user" | "admin";
  ip: string;
  userAgent: string;
}) {
  const s = store();
  const entry: LoginHistoryEntry = {
    id: randomUUID(),
    shopId: input.shopId,
    subjectId: input.subjectId,
    role: input.role,
    ip: input.ip,
    userAgent: input.userAgent,
    deviceLabel: deviceLabelFromUa(input.userAgent),
    createdAt: new Date().toISOString(),
  };
  s.loginHistory.unshift(entry);
  if (s.loginHistory.length > 5000) s.loginHistory.length = 5000;
  save();
  return entry;
}

export function listLoginHistory(shopId: string, subjectId: string, role: "user" | "admin", limit = 20) {
  return store()
    .loginHistory.filter((e) => e.shopId === shopId && e.subjectId === subjectId && e.role === role)
    .slice(0, limit);
}

// ─── Sessions ────────────────────────────────────────────────────────────

export function createAuthSession(input: {
  shopId: string;
  subjectId: string;
  role: "user" | "admin";
  ip: string;
  userAgent: string;
}): AuthSession {
  const s = store();
  const now = new Date().toISOString();
  const session: AuthSession = {
    id: randomUUID(),
    shopId: input.shopId,
    subjectId: input.subjectId,
    role: input.role,
    ip: input.ip,
    userAgent: input.userAgent,
    deviceLabel: deviceLabelFromUa(input.userAgent),
    createdAt: now,
    lastActiveAt: now,
  };
  s.authSessions.unshift(session);
  if (s.authSessions.length > 3000) s.authSessions.length = 3000;
  save();
  return session;
}

/** Re-insert a cookie sid lost from KV eventual-consistency races. */
export function rehydrateAuthSession(input: {
  id: string;
  shopId: string;
  subjectId: string;
  role: "user" | "admin";
  ip?: string;
  userAgent?: string;
}): boolean {
  try {
    ensureStoreExtensions();
    const s = store();
    if (s.authSessions.some((a) => a.id === input.id)) return true;
    const now = new Date().toISOString();
    s.authSessions.unshift({
      id: input.id,
      shopId: input.shopId,
      subjectId: input.subjectId,
      role: input.role,
      ip: input.ip ?? "",
      userAgent: input.userAgent ?? "",
      deviceLabel: deviceLabelFromUa(input.userAgent ?? ""),
      createdAt: now,
      lastActiveAt: now,
    });
    if (s.authSessions.length > 3000) s.authSessions.length = 3000;
    save();
    return true;
  } catch {
    return false;
  }
}

export function touchAuthSession(sessionId: string) {
  try {
    if (!api) return false;
    const s = store();
    const session = s.authSessions.find((a) => a.id === sessionId);
    if (!session || session.revokedAt) return false;
    session.lastActiveAt = new Date().toISOString();
    // Do NOT persist here — fire-and-forget KV writes race with real mutations
    // (e.g. Discord link codes) and can wipe them.
    return true;
  } catch {
    return false;
  }
}

export function isAuthSessionValid(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  try {
    ensureStoreExtensions();
    const sessions = store().authSessions;
    if (!Array.isArray(sessions)) return false;
    return sessions.some((a) => a.id === sessionId && !a.revokedAt);
  } catch {
    return false;
  }
}

export function listAuthSessions(shopId: string, subjectId: string, role: "user" | "admin") {
  return store()
    .authSessions.filter((a) => a.shopId === shopId && a.subjectId === subjectId && a.role === role && !a.revokedAt)
    .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

export function revokeAuthSession(sessionId: string, shopId: string, subjectId: string) {
  const s = store();
  const session = s.authSessions.find(
    (a) => a.id === sessionId && a.shopId === shopId && a.subjectId === subjectId && !a.revokedAt,
  );
  if (!session) return { ok: false as const, error: "세션 없음" };
  session.revokedAt = new Date().toISOString();
  save();
  return { ok: true as const };
}

export function revokeOtherAuthSessions(
  shopId: string,
  subjectId: string,
  role: "user" | "admin",
  currentSessionId: string,
) {
  const s = store();
  const now = new Date().toISOString();
  for (const a of s.authSessions) {
    if (a.shopId === shopId && a.subjectId === subjectId && a.role === role && a.id !== currentSessionId && !a.revokedAt) {
      a.revokedAt = now;
    }
  }
  save();
  return { ok: true as const, revoked: true };
}

// ─── IP whitelist ────────────────────────────────────────────────────────

export function isAdminIpAllowed(settings: ShopSettings, clientIp: string) {
  return ipAllowed(clientIp, settings.adminIpWhitelist ?? []);
}

// ─── Monthly report ──────────────────────────────────────────────────────

export function aggregateUserMonthlyReport(shopId: string, userId: string): MonthlyReportRow[] {
  const s = store();
  const map = new Map<string, MonthlyReportRow>();

  const monthKey = (iso: string) => iso.slice(0, 7);

  for (const c of s.charges) {
    if (c.shopId !== shopId || c.userId !== userId || c.status !== "completed") continue;
    const key = monthKey(c.completedAt ?? c.createdAt);
    const row = map.get(key) ?? {
      month: key,
      chargeTotal: 0,
      chargeCount: 0,
      purchaseTotal: 0,
      purchaseCount: 0,
    };
    row.chargeTotal += c.amount;
    row.chargeCount += 1;
    map.set(key, row);
  }

  for (const o of s.orders) {
    if (o.shopId !== shopId || o.userId !== userId || o.status !== "dispensed") continue;
    const key = monthKey(o.paidAt ?? o.createdAt);
    const row = map.get(key) ?? {
      month: key,
      chargeTotal: 0,
      chargeCount: 0,
      purchaseTotal: 0,
      purchaseCount: 0,
    };
    row.purchaseTotal += o.amount;
    row.purchaseCount += 1;
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
}

// ─── Charge failure ──────────────────────────────────────────────────────

export function markChargeFailed(chargeId: string, shopId: string, reason: string) {
  const s = store();
  const charge = s.charges.find((c) => c.id === chargeId && c.shopId === shopId);
  if (!charge || charge.status !== "pending") return { ok: false as const, error: "충전 없음" };
  charge.status = "failed";
  charge.failReason = reason;
  save();
  return { ok: true as const, charge };
}

export function expireStalePendingCharges(shopId: string, maxAgeMinutes?: number) {
  const s = store();
  const settings = s.settings.find((x) => x.shopId === shopId);
  if (settings?.autoExpireChargesEnabled === false) return 0;
  const mins = Math.max(1, maxAgeMinutes ?? settings?.chargeExpireMinutes ?? 10);
  const now = Date.now();
  const fallbackCutoff = now - mins * 60 * 1000;
  let expired = 0;
  for (const c of s.charges) {
    if (c.shopId !== shopId || c.status !== "pending") continue;
    if (c.nowpaymentsId) continue;
    const stale =
      c.expiresAt != null
        ? now > new Date(c.expiresAt).getTime()
        : new Date(c.createdAt).getTime() < fallbackCutoff;
    if (stale) {
      c.status = "expired";
      c.failReason = `${mins}분 초과로 만료됨`;
      expired += 1;
    }
  }
  if (expired) save();
  return expired;
}

function kstParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

function yesterdayKstDateKey() {
  // 어제 KST: 현재 KST 자정 − 1일
  const { dateKey } = kstParts();
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000;
  return kstParts(new Date(utcGuess + 12 * 60 * 60 * 1000)).dateKey;
}

/** 관리자 폴링 시 돌아가는 자동화 패스 */
export function runShopAutomations(shopId: string) {
  const expired = expireStalePendingCharges(shopId);
  const digest = maybePushDailySalesDigest(shopId);
  checkLowStockAlerts(shopId);
  return { expired, digest };
}

export function maybePushDailySalesDigest(shopId: string) {
  const s = store();
  const settings = s.settings.find((x) => x.shopId === shopId);
  if (!settings?.dailySalesDigestEnabled) return false;

  const { dateKey, hour } = kstParts();
  const targetHour = Math.min(23, Math.max(0, settings.dailyDigestHourKst ?? 9));
  if (hour < targetHour) return false;
  if (settings.lastDailyDigestAt?.startsWith(dateKey)) return false;

  const yKey = yesterdayKstDateKey();
  let purchaseTotal = 0;
  let purchaseCount = 0;
  let chargeTotal = 0;
  let chargeCount = 0;

  for (const o of s.orders) {
    if (o.shopId !== shopId || o.status !== "dispensed") continue;
    const paid = o.paidAt || o.createdAt;
    if (kstParts(new Date(paid)).dateKey !== yKey) continue;
    purchaseTotal += o.amount;
    purchaseCount += 1;
  }
  for (const c of s.charges) {
    if (c.shopId !== shopId || c.status !== "completed" || !c.completedAt) continue;
    if (kstParts(new Date(c.completedAt)).dateKey !== yKey) continue;
    chargeTotal += c.amount;
    chargeCount += 1;
  }

  const note: AdminNotification = {
    id: randomUUID(),
    shopId,
    type: "sales_digest",
    title: "일일 매출 요약",
    body: `${yKey} · 구매 ${purchaseCount}건 ${purchaseTotal.toLocaleString()}원 · 충전 ${chargeCount}건 ${chargeTotal.toLocaleString()}원`,
    read: false,
    createdAt: new Date().toISOString(),
    meta: { date: yKey, purchaseTotal, purchaseCount, chargeTotal, chargeCount },
  };
  s.adminNotifications.unshift(note);
  settings.lastDailyDigestAt = `${dateKey}T${String(hour).padStart(2, "0")}:00:00+09:00`;
  save();
  return true;
}

// ─── Low stock alerts ────────────────────────────────────────────────────

export function checkLowStockAlerts(shopId: string) {
  if (!api) return [];
  const s = store();
  const settings = s.settings.find((x) => x.shopId === shopId);
  const threshold = settings?.lowStockThreshold ?? 5;
  const enabled = settings?.lowStockAlertsEnabled ?? true;
  if (!enabled) return [];

  const created: AdminNotification[] = [];
  for (const p of s.products.filter((x) => x.shopId === shopId)) {
    const count = api.availableCount(s, p.id);
    if (count > threshold) continue;
    const recent = s.adminNotifications.some(
      (n) =>
        n.shopId === shopId &&
        n.type === "low_stock" &&
        n.meta?.productId === p.id &&
        !n.read &&
        Date.now() - new Date(n.createdAt).getTime() < 86_400_000,
    );
    if (recent) continue;
    const note: AdminNotification = {
      id: randomUUID(),
      shopId,
      type: "low_stock",
      title: "재고 부족",
      body: `${p.name} — 남은 재고 ${count}개`,
      read: false,
      createdAt: new Date().toISOString(),
      meta: { productId: p.id, count },
    };
    s.adminNotifications.unshift(note);
    created.push(note);
  }
  if (created.length) save();
  return created;
}

export function listAdminNotifications(shopId: string, unreadOnly = false) {
  return store()
    .adminNotifications.filter((n) => n.shopId === shopId && (!unreadOnly || !n.read))
    .slice(0, 50);
}

export function markAdminNotificationRead(id: string, shopId: string) {
  const s = store();
  const n = s.adminNotifications.find((x) => x.id === id && x.shopId === shopId);
  if (!n) return false;
  n.read = true;
  save();
  return true;
}

// ─── License renewal notice ──────────────────────────────────────────────

export function getLicenseRenewalNotice(shopId: string) {
  const shop = store().shops.find((s) => s.id === shopId);
  if (!shop) return null;
  const expiresMs = new Date(shop.expiresAt).getTime();
  const daysLeft = Math.ceil((expiresMs - Date.now()) / 86_400_000);
  if (daysLeft > 14) return null;
  if (daysLeft < 0) {
    return {
      level: "danger" as const,
      title: "라이선스 만료",
      body: `${shop.name} 상점 라이선스가 만료되었습니다. 연장이 필요합니다.`,
      daysLeft,
    };
  }
  return {
    level: daysLeft <= 7 ? ("warning" as const) : ("info" as const),
    title: "라이선스 갱신 알림",
    body: `라이선스 만료까지 ${daysLeft}일 남았습니다. 미리 연장해 주세요.`,
    daysLeft,
  };
}

export function ensureLicenseExpiryNotification(shopId: string) {
  const notice = getLicenseRenewalNotice(shopId);
  if (!notice || notice.daysLeft > 7 || notice.daysLeft < 0) return null;
  const s = store();
  const exists = s.adminNotifications.some(
    (n) =>
      n.shopId === shopId &&
      n.type === "license_expiry" &&
      !n.read &&
      Date.now() - new Date(n.createdAt).getTime() < 3 * 86_400_000,
  );
  if (exists) return null;
  const note: AdminNotification = {
    id: randomUUID(),
    shopId,
    type: "license_expiry",
    title: notice.title,
    body: notice.body,
    read: false,
    createdAt: new Date().toISOString(),
    meta: { daysLeft: notice.daysLeft },
  };
  s.adminNotifications.unshift(note);
  save();
  return note;
}

// ─── Product stock snapshot ────────────────────────────────────────────────

export function getProductStockMap(shopId: string, productIds: string[]) {
  if (!api) return {};
  const s = store();
  const out: Record<string, number> = {};
  for (const id of productIds) {
    const product = s.products.find((p) => p.id === id && p.shopId === shopId);
    if (product) out[id] = api.availableCount(s, id);
  }
  return out;
}

export function getProductSalesCounts(shopId: string) {
  const s = store();
  const counts = new Map<string, number>();
  for (const o of s.orders) {
    if (o.shopId !== shopId || o.status !== "dispensed") continue;
    const pid = o.productId;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
}
