import { randomUUID } from "crypto";
import { verifyPassword } from "@/lib/auth";
import { ensureStoreExtensions } from "@/lib/store-bind";
import { planLimitError } from "@/lib/plans";
import type { DbStore } from "@/lib/store";
import type {
  BugReport,
  PlatformSupportMessage,
  PointCharge,
  ShopCategory,
  ShopCoupon,
  ShopReview,
  ShopTier,
  StaffPermission,
} from "@/lib/types";
import { normalizeStaffPermissions } from "@/lib/staff-perms";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";

type StoreApi = {
  getStore: () => DbStore;
  persist: (store?: DbStore) => void;
  pushLog: (actor: string, action: string, meta: Record<string, unknown>, shopId: string) => void;
  confirmPointCharge: (
    chargeId: string,
    shopId: string,
    depositorName: string,
    amount?: number,
    opts?: { resultLabel?: string; manual?: boolean },
  ) => { ok: true; charge: PointCharge } | { ok: false; error: string };
};

let storeApi: StoreApi | null = null;

export function bindStoreAdmin(api: StoreApi) {
  storeApi = api;
}

function s() {
  ensureStoreExtensions();
  if (!storeApi) throw new Error("store admin not bound");
  return storeApi;
}

// ─── Charges ─────────────────────────────────────────────────────────────

export function cancelPointCharge(chargeId: string, shopId: string) {
  const { getStore, persist, pushLog } = s();
  const store = getStore();
  const charge = store.charges.find((c) => c.id === chargeId && c.shopId === shopId);
  if (!charge) return { ok: false as const, error: "충전 요청 없음" };
  if (charge.status !== "pending") return { ok: false as const, error: "이미 처리됨" };
  charge.status = "cancelled";
  pushLog("admin", "charge.reject", { chargeId }, shopId);
  persist(store);
  return { ok: true as const, charge };
}

export function approvePointCharge(chargeId: string, shopId: string, depositorName?: string) {
  const { confirmPointCharge } = s();
  return confirmPointCharge(chargeId, shopId, depositorName ?? "관리자 승인", undefined, {
    resultLabel: "관리자 승인됨",
    manual: true,
  });
}

// ─── Categories ──────────────────────────────────────────────────────────

export function listCategories(shopId: string) {
  return s().getStore().categories.filter((c) => c.shopId === shopId);
}

export function createCategory(shopId: string, name: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점을 찾을 수 없습니다.");

  const categoryCount = store.categories.filter((c) => c.shopId === shopId).length;
  const limitErr = planLimitError(shop.plan, "categories", categoryCount);
  if (limitErr) throw new Error(limitErr);

  const cat: ShopCategory = {
    id: randomUUID(),
    shopId,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  store.categories.push(cat);
  persist(store);
  return cat;
}

/** 상품은 카테고리를 이름으로 들고 있으므로, 이름을 바꾸면 그 카테고리의 상품도 같이 바꾼다 */
export function renameCategory(shopId: string, categoryId: string, name: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const cat = store.categories.find((c) => c.id === categoryId && c.shopId === shopId);
  if (!cat) throw new Error("카테고리를 찾을 수 없습니다.");
  const next = name.trim();
  if (!next) throw new Error("카테고리 이름을 입력해 주세요.");
  if (next === cat.name) return { category: cat, products: 0 };
  if (store.categories.some((c) => c.shopId === shopId && c.id !== cat.id && c.name === next)) {
    throw new Error("같은 이름의 카테고리가 이미 있어요.");
  }
  const prev = cat.name;
  cat.name = next;
  let products = 0;
  for (const p of store.products) {
    if (p.shopId === shopId && p.category === prev) {
      p.category = next;
      products++;
    }
  }
  persist(store);
  return { category: cat, products };
}

export function deleteCategory(shopId: string, categoryId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const idx = store.categories.findIndex((c) => c.id === categoryId && c.shopId === shopId);
  if (idx < 0) return false;
  store.categories.splice(idx, 1);
  persist(store);
  return true;
}

// ─── Products delete ─────────────────────────────────────────────────────

export function deleteProduct(shopId: string, productId: string) {
  const { getStore, persist, pushLog } = s();
  const store = getStore();
  const idx = store.products.findIndex((p) => p.id === productId && p.shopId === shopId);
  if (idx < 0) return false;
  const awaiting = store.orders.some(
    (o) => o.shopId === shopId && o.productId === productId && (o.status === "locked" || o.status === "pending"),
  );
  if (awaiting) {
    throw new Error("입금 확인을 기다리는 주문이 있어 삭제할 수 없어요. 주문을 처리하거나 취소한 뒤 삭제해 주세요.");
  }
  store.products.splice(idx, 1);
  store.inventories = store.inventories.filter(
    (i) => !(i.productId === productId && i.shopId === shopId),
  );
  pushLog("admin", "product.delete", { productId }, shopId);
  persist(store);
  return true;
}

// ─── Notices ─────────────────────────────────────────────────────────────

export function deleteNotice(shopId: string, noticeId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const idx = store.notices.findIndex((n) => n.id === noticeId && n.shopId === shopId);
  if (idx < 0) return false;
  store.notices.splice(idx, 1);
  persist(store);
  return true;
}

// ─── Events admin ────────────────────────────────────────────────────────

export function listEventsAdmin(shopId: string) {
  return s().getStore().events.filter((e) => e.shopId === shopId);
}

export function deleteEvent(shopId: string, eventId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const idx = store.events.findIndex((e) => e.id === eventId && e.shopId === shopId);
  if (idx < 0) return false;
  store.events.splice(idx, 1);
  persist(store);
  return true;
}

// ─── Tiers ───────────────────────────────────────────────────────────────

export function listTiers(shopId: string) {
  return s()
    .getStore()
    .tiers.filter((t) => t.shopId === shopId)
    .sort((a, b) => a.minTotalCharged - b.minTotalCharged);
}

export function createTier(
  shopId: string,
  input: {
    name: string;
    minTotalCharged: number;
    discountPercent: number;
    color?: string;
    discordRoleId?: string | null;
  },
) {
  const { getStore, persist } = s();
  const store = getStore();
  const name = input.name.trim();
  if (!name) throw new Error("등급명을 입력하세요.");
  if (!Number.isFinite(input.minTotalCharged) || input.minTotalCharged < 0) {
    throw new Error("최소 충전액을 확인하세요.");
  }
  if (!Number.isFinite(input.discountPercent) || input.discountPercent < 0 || input.discountPercent > 99) {
    throw new Error("할인율을 확인하세요.");
  }
  if (input.discordRoleId?.trim() && !cleanRoleId(input.discordRoleId)) {
    throw new Error("역할 ID는 숫자로 된 Discord 역할 ID여야 해요.");
  }
  const tier: ShopTier = {
    id: randomUUID(),
    shopId,
    name,
    minTotalCharged: Math.floor(input.minTotalCharged),
    discountPercent: Math.floor(input.discountPercent),
    color: input.color ?? "#f4f4f5",
    discordRoleId: cleanRoleId(input.discordRoleId),
    createdAt: new Date().toISOString(),
  };
  store.tiers.push(tier);
  persist(store);
  return tier;
}

function cleanRoleId(value: string | null | undefined) {
  const id = (value ?? "").replace(/[<@&>\s]/g, "");
  return /^\d{15,25}$/.test(id) ? id : null;
}

export function updateTier(
  shopId: string,
  tierId: string,
  patch: { name?: string; minTotalCharged?: number; discountPercent?: number; discordRoleId?: string | null },
) {
  const { getStore, persist } = s();
  const store = getStore();
  const tier = store.tiers.find((t) => t.id === tierId && t.shopId === shopId);
  if (!tier) throw new Error("등급을 찾을 수 없어요.");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("등급명을 입력하세요.");
    tier.name = name;
  }
  if (patch.minTotalCharged !== undefined) {
    if (!Number.isFinite(patch.minTotalCharged) || patch.minTotalCharged < 0) {
      throw new Error("최소 충전액을 확인하세요.");
    }
    tier.minTotalCharged = Math.floor(patch.minTotalCharged);
  }
  if (patch.discountPercent !== undefined) {
    if (!Number.isFinite(patch.discountPercent) || patch.discountPercent < 0 || patch.discountPercent > 99) {
      throw new Error("할인율을 확인하세요.");
    }
    tier.discountPercent = Math.floor(patch.discountPercent);
  }
  if (patch.discordRoleId !== undefined) {
    if (patch.discordRoleId?.trim() && !cleanRoleId(patch.discordRoleId)) {
      throw new Error("역할 ID는 숫자로 된 Discord 역할 ID여야 해요.");
    }
    tier.discordRoleId = cleanRoleId(patch.discordRoleId);
  }
  persist(store);
  return tier;
}

export function deleteTier(shopId: string, tierId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  store.tiers = store.tiers.filter((t) => !(t.id === tierId && t.shopId === shopId));
  for (const u of store.users) {
    if (u.shopId === shopId && u.tierId === tierId) u.tierId = null;
  }
  persist(store);
  return true;
}

// ─── Coupons ─────────────────────────────────────────────────────────────

export function listCoupons(shopId: string) {
  return s().getStore().coupons.filter((c) => c.shopId === shopId);
}

export function createCoupon(
  shopId: string,
  input: { code: string; discountPercent: number; maxUses: number; days?: number },
) {
  const { getStore, persist } = s();
  const store = getStore();
  const code = input.code.trim().toUpperCase();
  if (store.coupons.some((c) => c.shopId === shopId && c.code === code)) {
    throw new Error("이미 존재하는 쿠폰 코드");
  }
  const days = input.days ?? 30;
  const coupon: ShopCoupon = {
    id: randomUUID(),
    shopId,
    code,
    discountPercent: input.discountPercent,
    maxUses: input.maxUses,
    usedCount: 0,
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
    active: true,
    createdAt: new Date().toISOString(),
  };
  store.coupons.push(coupon);
  persist(store);
  return coupon;
}

export function deleteCoupon(shopId: string, couponId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  store.coupons = store.coupons.filter((c) => !(c.id === couponId && c.shopId === shopId));
  persist(store);
  return true;
}

// ─── Users admin ─────────────────────────────────────────────────────────

export function adminUpdateUser(
  shopId: string,
  userId: string,
  patch: {
    points?: number;
    pointsDelta?: number;
    tierId?: string | null;
    isSubAdmin?: boolean;
    staffPermissions?: StaffPermission[];
    banned?: boolean;
    banReason?: string | null;
  },
) {
  const { getStore, persist, pushLog } = s();
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) throw new Error("사용자 없음");
  if (patch.points !== undefined) user.points = Math.max(0, patch.points);
  if (patch.pointsDelta !== undefined) user.points = Math.max(0, user.points + patch.pointsDelta);
  if (patch.tierId !== undefined) user.tierId = patch.tierId;
  if (patch.isSubAdmin !== undefined) user.isSubAdmin = patch.isSubAdmin;
  if (patch.staffPermissions !== undefined) {
    user.staffPermissions = normalizeStaffPermissions(patch.staffPermissions);
  }
  if (patch.banned !== undefined) {
    user.banned = patch.banned;
    user.bannedAt = patch.banned ? new Date().toISOString() : null;
    if (!patch.banned) user.banReason = null;
    if (patch.banned) {
      for (const a of store.authSessions ?? []) {
        if (a.shopId === shopId && a.subjectId === userId && a.role === "user" && !a.revokedAt) {
          a.revokedAt = user.bannedAt!;
        }
      }
    }
  }
  if (patch.banReason !== undefined) {
    user.banReason = patch.banReason?.trim() || null;
  }
  pushLog("admin", "user.update", { userId, patch }, shopId);
  persist(store);
  return user;
}

export function deleteUser(shopId: string, userId: string) {
  const { getStore, persist, pushLog } = s();
  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === userId && u.shopId === shopId);
  if (idx < 0) return false;
  scrubUserRelatedData(store, shopId, userId);
  store.users.splice(idx, 1);
  pushLog("admin", "user.delete", { userId }, shopId);
  persist(store);
  return true;
}

/** 본인 계정 삭제 (GDPR식) — 비밀번호 확인 후 관련 데이터 정리 */
export function deleteOwnAccount(
  shopId: string,
  userId: string,
  password: string,
): { ok: true } | { ok: false; error: string } {
  const { getStore, persist, pushLog } = s();
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false, error: "계정을 찾을 수 없어요." };
  if (user.isSubAdmin) {
    return { ok: false, error: "스태프 계정은 소유자에게 해제를 요청한 뒤 삭제할 수 있어요." };
  }
  if (user.passwordHash) {
    if (!password || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, error: "비밀번호가 올바르지 않아요." };
    }
  } else if (password.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: "소셜 계정은 확인란에 DELETE 를 입력해 주세요." };
  }
  const idx = store.users.findIndex((u) => u.id === userId && u.shopId === shopId);
  if (idx < 0) return { ok: false, error: "계정을 찾을 수 없어요." };
  scrubUserRelatedData(store, shopId, userId);
  store.users.splice(idx, 1);
  pushLog("user", "user.self_delete", { userId }, shopId);
  persist(store);
  return { ok: true };
}

function scrubUserRelatedData(store: DbStore, shopId: string, userId: string) {
  store.wishlists = (store.wishlists ?? []).filter(
    (w) => !(w.shopId === shopId && w.userId === userId),
  );
  store.userNotifications = (store.userNotifications ?? []).filter(
    (n) => !(n.shopId === shopId && n.userId === userId),
  );
  store.authSessions = (store.authSessions ?? []).filter(
    (a) => !(a.shopId === shopId && a.subjectId === userId),
  );
  store.loginHistory = (store.loginHistory ?? []).filter(
    (h) => !(h.shopId === shopId && h.subjectId === userId),
  );
  store.discordLinkCodes = (store.discordLinkCodes ?? []).filter(
    (c) => !(c.shopId === shopId && c.userId === userId),
  );
  for (const order of store.orders ?? []) {
    if (order.shopId === shopId && order.userId === userId) {
      order.buyerEmail = "deleted@anon.local";
      order.userId = null;
    }
  }
  for (const charge of store.charges ?? []) {
    if (charge.shopId === shopId && charge.userId === userId) {
      // keep charge row for shop ledger; unlink identity
      charge.depositorName = charge.depositorName ? "삭제됨" : null;
    }
  }
}

export function listUsersAdmin(shopId: string) {
  return s()
    .getStore()
    .users.filter((u) => u.shopId === shopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(({ passwordHash: _, ...u }) => u);
}

// ─── Reviews ─────────────────────────────────────────────────────────────

export function listReviewsAdmin(shopId: string) {
  return s().getStore().reviews.filter((r) => r.shopId === shopId);
}

export function updateReview(
  shopId: string,
  reviewId: string,
  patch: { body?: string; rating?: number; approved?: boolean },
) {
  const { getStore, persist } = s();
  const store = getStore();
  const review = store.reviews.find((r) => r.id === reviewId && r.shopId === shopId);
  if (!review) throw new Error("후기 없음");
  if (patch.body !== undefined) review.body = patch.body.trim();
  if (patch.rating !== undefined) review.rating = patch.rating;
  if (patch.approved !== undefined) review.approved = patch.approved;
  persist(store);
  return review;
}

export function deleteReview(shopId: string, reviewId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  store.reviews = store.reviews.filter((r) => !(r.id === reviewId && r.shopId === shopId));
  persist(store);
  return true;
}

const REVIEWABLE_STATUSES = new Set(["dispensed", "paid", "awaiting_fulfillment"]);

/** 구매 1건당 후기 1개 — 아직 쓸 수 있는 후기 수 */
export function reviewableCount(shopId: string, userId: string, productId: string) {
  const store = s().getStore();
  const bought = store.orders.filter(
    (o) => o.shopId === shopId && o.userId === userId && o.productId === productId && REVIEWABLE_STATUSES.has(o.status),
  ).length;
  const written = store.reviews.filter(
    (r) => r.shopId === shopId && r.userId === userId && r.productId === productId,
  ).length;
  return Math.max(0, bought - written);
}

export function submitPurchaseReview(shopId: string, userId: string, productId: string, comment: string) {
  const body = comment.trim();
  if (body.length < 5) return { ok: false as const, error: "후기는 5자 이상 작성해 주세요." };
  if (body.length > 500) return { ok: false as const, error: "후기는 500자까지 쓸 수 있어요." };
  const store = s().getStore();
  const bought = store.orders.some(
    (o) => o.shopId === shopId && o.userId === userId && o.productId === productId && REVIEWABLE_STATUSES.has(o.status),
  );
  if (!bought) return { ok: false as const, error: "구매한 상품에만 후기를 남길 수 있어요." };
  if (reviewableCount(shopId, userId, productId) <= 0) {
    return { ok: false as const, error: "이 상품에는 이미 후기를 남겼어요." };
  }
  const review = createReview({ shopId, userId, productId, body, approved: true });
  return { ok: true as const, review };
}

export function createReview(input: {
  shopId: string;
  userId: string;
  productId?: string | null;
  rating?: number;
  body: string;
  approved?: boolean;
}) {
  const { getStore, persist } = s();
  const store = getStore();
  const review: ShopReview = {
    id: randomUUID(),
    shopId: input.shopId,
    userId: input.userId,
    productId: input.productId ?? null,
    rating: input.rating ?? 0,
    body: input.body.trim(),
    approved: input.approved ?? false,
    createdAt: new Date().toISOString(),
  };
  store.reviews.unshift(review);
  persist(store);

  const user = store.users.find((u) => u.id === input.userId);
  const product = input.productId
    ? store.products.find((p) => p.id === input.productId)
    : null;
  const mention = user?.discordId ? `<@${user.discordId}>` : user?.discordUsername || user?.name || "유저";

  scheduleDiscordBackground(
    import("@/lib/discord/logs").then(({ postReviewLog }) =>
      postReviewLog(input.shopId, {
        authorMention: mention,
        authorDiscordId: user?.discordId ?? null,
        productName: product?.name ?? "상품",
        body: review.body,
      }),
    ),
  );

  return review;
}

// ─── Bug reports ─────────────────────────────────────────────────────────

export function listBugReports(shopId: string) {
  return s().getStore().bugReports.filter((b) => b.shopId === shopId);
}

export function createBugReport(input: {
  shopId: string;
  userId?: string | null;
  email: string;
  subject: string;
  body: string;
}) {
  const { getStore, persist } = s();
  const store = getStore();
  const report: BugReport = {
    id: randomUUID(),
    shopId: input.shopId,
    userId: input.userId ?? null,
    email: input.email.trim(),
    subject: input.subject.trim(),
    body: input.body.trim(),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  store.bugReports.unshift(report);
  persist(store);
  return report;
}

export function resolveBugReport(shopId: string, reportId: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const report = store.bugReports.find((b) => b.id === reportId && b.shopId === shopId);
  if (!report) return false;
  report.status = "resolved";
  persist(store);
  return true;
}

export function listAllBugReportsPlatform() {
  return s().getStore().bugReports;
}

// ─── Platform support (shop → DOES) ────────────────────────────────────

export function createPlatformSupportMessage(input: {
  shopId: string;
  shopSlug: string;
  shopName: string;
  senderEmail: string;
  body: string;
  aiReply?: string | null;
}) {
  const { getStore, persist } = s();
  const store = getStore();
  const now = new Date().toISOString();
  const aiReply = input.aiReply?.trim() || null;
  const msg: PlatformSupportMessage = {
    id: randomUUID(),
    shopId: input.shopId,
    shopSlug: input.shopSlug,
    shopName: input.shopName,
    senderEmail: input.senderEmail.trim(),
    body: input.body.trim(),
    status: "open",
    reply: null,
    aiReply,
    aiRepliedAt: aiReply ? now : null,
    createdAt: now,
    repliedAt: null,
  };
  store.platformSupport.unshift(msg);
  persist(store);
  return msg;
}

export function setPlatformSupportAiReply(id: string, aiReply: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const msg = store.platformSupport.find((m) => m.id === id);
  if (!msg) return null;
  msg.aiReply = aiReply.trim();
  msg.aiRepliedAt = new Date().toISOString();
  persist(store);
  return msg;
}

export function listPlatformSupportForShop(shopId: string) {
  return s().getStore().platformSupport.filter((m) => m.shopId === shopId);
}

export function listPlatformSupportInbox() {
  return s().getStore().platformSupport;
}

export function replyPlatformSupport(id: string, reply: string) {
  const { getStore, persist } = s();
  const store = getStore();
  const msg = store.platformSupport.find((m) => m.id === id);
  if (!msg) return null;
  msg.reply = reply.trim();
  msg.status = "answered";
  msg.repliedAt = new Date().toISOString();
  persist(store);
  return msg;
}
