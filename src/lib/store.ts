import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { keepAlive, loadDbJsonFromKv, saveDbJsonToKv } from "@/lib/db-persist";
import { isKvMode, markKvMode } from "@/lib/store-init";
import { ensureStoreExtensions } from "@/lib/store-bind";
import { isValidShopSlug } from "@/lib/domain";
import type {
  BugReport,
  ChargeMethod,
  ExternalDelivery,
  InventoryItem,
  License,
  LicensePlan,
  Notice,
  PlatformNotice,
  PlatformSupportMessage,
  Order,
  PointCharge,
  Product,
  ProductWithStock,
  PublicUser,
  Shop,
  ShopBannerAd,
  BannerAdPeriod,
  ShopCategory,
  ShopCoupon,
  ShopEvent,
  ShopInquiry,
  ShopInquiryMessage,
  ShopModerationStatus,
  ShopReview,
  ShopSettings,
  ShopTier,
  ShopUser,
  AdminNotification,
  AuthSession,
  LoginHistoryEntry,
  WishlistItem,
  UserNotification,
  DiscordLinkCode,
  RandomBoxClaim,
  SubscriptionStatus,
  SystemLog,
} from "@/lib/types";
import {
  FREE_PLAN_DAYS,
  GRACE_DAYS,
  SUBSCRIPTION_DAYS,
  getLicensePriceForPlan,
  planLimitError,
} from "@/lib/plans";
import { generateOrderAccessToken } from "@/lib/security";
import { hashPassword, makeDeviceKey, verifyPassword } from "@/lib/auth";
import { calcProductPrice } from "@/lib/pricing";
import { normDepositorName } from "@/lib/auto-charge-push-parse";
import { resolveStockStatus } from "@/lib/types";
import { maskMcNickname } from "@/lib/mc-account";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { clearMfaStockCache, getMfaStockCache, setMfaStockCache } from "@/lib/mfa-cache";

const LOCK_MINUTES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

export type DbStore = {
  licenses: License[];
  shops: Shop[];
  products: Product[];
  inventories: InventoryItem[];
  orders: Order[];
  logs: SystemLog[];
  users: ShopUser[];
  notices: Notice[];
  platformNotices: PlatformNotice[];
  events: ShopEvent[];
  charges: PointCharge[];
  settings: ShopSettings[];
  categories: ShopCategory[];
  tiers: ShopTier[];
  coupons: ShopCoupon[];
  reviews: ShopReview[];
  bugReports: BugReport[];
  inquiries: ShopInquiry[];
  platformSupport: PlatformSupportMessage[];
  wishlists: WishlistItem[];
  loginHistory: LoginHistoryEntry[];
  authSessions: AuthSession[];
  adminNotifications: AdminNotification[];
  userNotifications: UserNotification[];
  discordLinkCodes: DiscordLinkCode[];
  bannerAds: ShopBannerAd[];
  randomBoxClaims: RandomBoxClaim[];
};

function emptyStore(): DbStore {
  return {
    licenses: [],
    shops: [],
    products: [],
    inventories: [],
    orders: [],
    logs: [],
    users: [],
    notices: [],
    platformNotices: seedPlatformNotices(),
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
    discordLinkCodes: [],
    bannerAds: [],
    randomBoxClaims: [],
  };
}

function seedPlatformNotices(): PlatformNotice[] {
  const now = new Date().toISOString();
  return [
    {
      id: "platform-welcome",
      title: "DOES를 소개합니다",
      body: "라이선스 키 한 장으로 나만의 디지털 자판기를 열 수 있는 DOES가 정식으로 문을 열었습니다.\n\n상점 등록부터 코드 발급까지, 판매에 필요한 흐름만 담았어요. 궁금한 점은 FAQ를 확인해 주세요.",
      pinned: true,
      createdAt: now,
    },
    {
      id: "platform-infra",
      title: "Cloudflare 기반 인프라 적용",
      body: "DOES는 Cloudflare CDN과 DDoS 방어를 기본으로 적용하고 있습니다.\n\n전 세계 어디서나 빠르고 안정적으로 서비스를 이용하실 수 있으며, 중요 데이터는 AES-256으로 암호화해 저장합니다.",
      pinned: false,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function defaultSettings(shopId: string): ShopSettings {
  return {
    shopId,
    backgroundMusicUrl: null,
    backgroundMusicEnabled: false,
    welcomeMessage: "만나서 반가워요.",
    discordInviteUrl: null,
    maintenanceMode: false,
    maintenanceMessage: "잠시 점검 중이에요. 곧 다시 열려요.",
    minChargeAmount: 1000,
    chargePresets: [5000, 10000, 30000, 50000],
    autoChargeEnabled: true,
    autoChargeCultureGift: true,
    autoChargeCoin: true,
    pushbulletAccessToken: null,
    pushbulletEnabled: false,
    iosGenToken: null,
    cryptoWalletAddress: null,
    cryptoWalletLabel: null,
    cultureGiftEnabled: false,
    culturelandId: null,
    culturelandPassword: null,
    nowpaymentsEnabled: false,
    nowpaymentsApiKey: null,
    nowpaymentsIpnSecret: null,
    nowpaymentsPayCurrency: "usdttrc20",
    depositSuffixPhrase: "",
    adminIpWhitelist: [],
    lowStockThreshold: 5,
    lowStockAlertsEnabled: true,
    salesGoalDaily: null,
    discordBotEnabled: false,
    discordGuildId: null,
    discordOwnerId: null,
    discordOwnerUsername: null,
    discordOwnerAvatar: null,
    discordPurchaseLogChannelId: null,
    discordChargeLogChannelId: null,
    discordAdminLogChannelId: null,
    discordReviewLogChannelId: null,
    discordRestockLogChannelId: null,
    discordRestockRoleId: null,
    discordRandomBoxLogChannelId: null,
    discordStockChannelId: null,
    discordStockMessageId: null,
    spendRoles: [],
    discordAdminRoleId: null,
    discordBotToken: null,
    discordApplicationId: null,
    discordPublicKey: null,
    discordEmbedTitle: "자판기",
    discordEmbedDescription: "원하는 메뉴를 선택하세요.",
    discordEmbedColor: 0x5865f2,
    discordShowNotices: true,
    discordShowProducts: true,
    discordShowBuy: true,
    discordShowCharge: true,
    discordShowInfo: true,
    discordBtnStyleNotices: 2,
    discordBtnStyleProducts: 1,
    discordBtnStyleBuy: 3,
    discordBtnStyleCharge: 3,
    discordBtnStyleInfo: 2,
    discordBtnLabelNotices: "공지",
    discordBtnLabelProducts: "제품",
    discordBtnLabelBuy: "구매",
    discordBtnLabelCharge: "충전",
    discordBtnLabelInfo: "정보",
    discordPurchaseLogTitle: "구매 로그",
    discordPurchaseLogTemplate:
      "**{user}** 구매\n상품 `{product}`\n금액 **{amount}**\n주문 `{order}`",
    discordReviewLogTitle: "후기 로그",
    discordReviewLogTemplate: "{product}\n{body}",
    bannerAdsEnabled: true,
    bannerWeeklyPrice: 5000,
    bannerMonthlyPrice: 15000,
    koreaOnlyAccess: false,
    blockVpnProxy: false,
    maskPiiInAdmin: true,
    termsVersion: "1.0",
    termsBody:
      "본 상점 이용 시 서비스 정책과 디지털 상품 특성(교환·환불 제한 등)에 동의합니다. 부정 이용 시 이용이 제한될 수 있습니다.",
    privacyVersion: "1.0",
    privacyBody:
      "이메일·닉네임·결제·주문 정보는 서비스 제공과 고객 지원 목적으로만 처리하며, 관련 법령에 따라 보관·삭제됩니다.",
    restockNotifyEnabled: true,
    autoExpireChargesEnabled: true,
    chargeExpireMinutes: 10,
    dailySalesDigestEnabled: false,
    dailyDigestHourKst: 9,
    lastDailyDigestAt: null,
    bannerAutoApprove: false,
    tierUpgradeNotifyEnabled: true,
    welcomeBonusEnabled: false,
    welcomeBonusPoints: 1000,
  };
}

function normalizePlan(plan: unknown): LicensePlan {
  if (plan === "free" || plan === "lite" || plan === "pro" || plan === "pro_max") return plan;
  return "pro";
}

function addSubscriptionDates(fromMs: number, days = SUBSCRIPTION_DAYS) {
  const expiresAt = new Date(fromMs + days * DAY_MS).toISOString();
  const graceUntil = new Date(new Date(expiresAt).getTime() + GRACE_DAYS * DAY_MS).toISOString();
  return { expiresAt, graceUntil };
}

function normalizeShop(raw: Shop & {
  adminUsername?: string;
  adminPasswordHash?: string | null;
  androidDeviceKey?: string | null;
  plan?: LicensePlan;
  expiresAt?: string;
  graceUntil?: string;
  moderationStatus?: ShopModerationStatus;
  moderationReason?: string | null;
  moderationFlaggedAt?: string | null;
}): Shop {
  const plan = normalizePlan(raw.plan);
  const baseMs = raw.expiresAt ? new Date(raw.expiresAt).getTime() : Date.now() + SUBSCRIPTION_DAYS * DAY_MS;
  const dates = raw.expiresAt && raw.graceUntil
    ? { expiresAt: raw.expiresAt, graceUntil: raw.graceUntil }
    : addSubscriptionDates(Math.max(Date.now(), baseMs));

  const moderationStatus: ShopModerationStatus = raw.moderationStatus ?? "ok";
  const shop: Shop = {
    ...raw,
    plan,
    expiresAt: dates.expiresAt,
    graceUntil: dates.graceUntil,
    logoUrl: raw.logoUrl ?? null,
    adminUsername: raw.adminUsername ?? "admin",
    adminPasswordHash: raw.adminPasswordHash ?? null,
    androidDeviceKey: raw.androidDeviceKey ?? null,
    moderationStatus,
    moderationReason: raw.moderationReason ?? null,
    moderationFlaggedAt: raw.moderationFlaggedAt ?? null,
  };
  if (!shop.adminPasswordHash && shop.adminPassword) {
    shop.adminPasswordHash = hashPassword(shop.adminPassword);
  }
  shop.adminPassword = "";
  if (!shop.androidDeviceKey) {
    shop.androidDeviceKey = makeDeviceKey();
  }
  return shop;
}

const globalForStore = globalThis as unknown as {
  __orelStore?: DbStore;
  __orelStoreLoadedAt?: number;
  /** 메모리 DB가 KV에서 읽어 온 것인지 — 아니면 빈 DB로 KV 전체를 덮어쓸 수 있다 */
  __orelFromKv?: boolean;
};

/** Skip re-fetching full KV DB on every Discord/API hit within the same isolate. */
const STORE_CACHE_TTL_MS = 5_000;

function markStoreFresh() {
  globalForStore.__orelStoreLoadedAt = Date.now();
}

function storeCacheValid() {
  const loadedAt = globalForStore.__orelStoreLoadedAt ?? 0;
  return Boolean(globalForStore.__orelStore) && Date.now() - loadedAt < STORE_CACHE_TTL_MS;
}

function normalizeInquiry(i: Partial<ShopInquiry> & { id: string; shopId: string; userId: string }): ShopInquiry {
  const createdAt = i.createdAt || new Date().toISOString();
  const body = (i.body ?? "").trim();
  const reply = i.reply ?? null;
  const messages: ShopInquiryMessage[] = Array.isArray(i.messages) && i.messages.length
    ? i.messages
    : [
        ...(body
          ? [{ id: `${i.id}_u`, from: "user" as const, body, createdAt }]
          : []),
        ...(reply
          ? [
              {
                id: `${i.id}_a`,
                from: "admin" as const,
                body: reply,
                createdAt: i.repliedAt || createdAt,
              },
            ]
          : []),
      ];
  const adminJoinedAt = i.adminJoinedAt ?? (reply ? i.repliedAt ?? createdAt : null);
  return {
    id: i.id,
    shopId: i.shopId,
    userId: i.userId,
    subject: i.subject || body.slice(0, 40) || "문의",
    body,
    status: i.status === "answered" ? "answered" : "open",
    reply,
    repliedAt: i.repliedAt ?? null,
    discordChannelId: i.discordChannelId ?? null,
    discordMessageId: i.discordMessageId ?? null,
    createdAt,
    messages,
    aiEnabled: adminJoinedAt ? false : i.aiEnabled !== false,
    adminJoinedAt,
  };
}

function parseDbRaw(raw: Partial<DbStore>): DbStore {
  try {
    return parseDbRawUnsafe(raw);
  } catch {
    return emptyStore();
  }
}

function parseDbRawUnsafe(raw: Partial<DbStore>): DbStore {
  return {
    licenses: (raw.licenses ?? []).map((l) => ({
      ...l,
      plan: normalizePlan((l as License).plan),
      key: l.key ?? null,
      depositorName: l.depositorName ?? null,
      paidAt: l.paidAt ?? null,
    })),
    shops: (raw.shops ?? []).map((s) =>
      normalizeShop({
        ...(s as Shop),
        bankName: s.bankName ?? null,
        bankAccount: s.bankAccount ?? null,
        bankHolder: s.bankHolder ?? null,
      }),
    ),
    products: (raw.products ?? []).map((p) => ({
      ...p,
      purchaseLimitPerUser: (p as Product).purchaseLimitPerUser ?? null,
      tags: Array.isArray((p as Product).tags) ? (p as Product).tags : [],
      discordRoleId: (p as Product).discordRoleId ?? null,
    })),
    inventories: raw.inventories ?? [],
    orders: (raw.orders ?? []).map((o) => ({
      ...o,
      depositorName: o.depositorName ?? null,
      userId: (o as Order).userId ?? null,
      accessToken: (o as Order).accessToken ?? null,
      quantity: (o as Order).quantity ?? 1,
    })),
    logs: raw.logs ?? [],
    users: (raw.users ?? []).map((u) => ({
      ...(u as ShopUser),
      bankDepositorName:
        (u as ShopUser).bankDepositorName &&
        (u as ShopUser).bankDepositorName === (u as ShopUser).name &&
        /[()]/.test((u as ShopUser).bankDepositorName ?? "")
          ? null
          : ((u as ShopUser).bankDepositorName ?? null),
      tierId: (u as ShopUser).tierId ?? null,
      isSubAdmin: (u as ShopUser).isSubAdmin ?? false,
      staffPermissions: Array.isArray((u as ShopUser).staffPermissions)
        ? (u as ShopUser).staffPermissions
        : [],
      banned: (u as ShopUser).banned ?? false,
      banReason: (u as ShopUser).banReason ?? null,
      bannedAt: (u as ShopUser).bannedAt ?? null,
      acceptedTermsVersion: (u as ShopUser).acceptedTermsVersion ?? null,
      acceptedPrivacyVersion: (u as ShopUser).acceptedPrivacyVersion ?? null,
    })),
    notices: raw.notices ?? [],
    platformNotices: Array.isArray(raw.platformNotices)
      ? raw.platformNotices
      : seedPlatformNotices(),
    events: raw.events ?? [],
    charges: (raw.charges ?? []).map((c) => ({
      ...c,
      method: (c as PointCharge).method ?? "bank",
      failReason: (c as PointCharge).failReason ?? null,
      expiresAt:
        (c as PointCharge).expiresAt ??
        new Date(new Date(c.createdAt).getTime() + 10 * 60 * 1000).toISOString(),
      nowpaymentsId: (c as PointCharge).nowpaymentsId ?? null,
      payAddress: (c as PointCharge).payAddress ?? null,
      payAmount: (c as PointCharge).payAmount ?? null,
      payCurrency: (c as PointCharge).payCurrency ?? null,
      discordLogChannelId: (c as PointCharge).discordLogChannelId ?? null,
      discordLogMessageId: (c as PointCharge).discordLogMessageId ?? null,
      discordApplicationId: (c as PointCharge).discordApplicationId ?? null,
      discordInteractionToken: (c as PointCharge).discordInteractionToken ?? null,
    })),
    settings: (raw.settings ?? []).map((s) => ({
      ...defaultSettings(s.shopId),
      ...s,
      autoChargeEnabled: s.autoChargeEnabled ?? true,
      depositSuffixPhrase: cleanDepositSuffix(s.depositSuffixPhrase),
    })),
    categories: raw.categories ?? [],
    tiers: raw.tiers ?? [],
    coupons: raw.coupons ?? [],
    reviews: raw.reviews ?? [],
    bugReports: raw.bugReports ?? [],
    inquiries: (raw.inquiries ?? []).map((i) => normalizeInquiry(i as ShopInquiry)),
    platformSupport: (raw.platformSupport ?? []).map((m) => ({
      ...m,
      aiReply: (m as PlatformSupportMessage).aiReply ?? null,
      aiRepliedAt: (m as PlatformSupportMessage).aiRepliedAt ?? null,
      reply: (m as PlatformSupportMessage).reply ?? null,
      repliedAt: (m as PlatformSupportMessage).repliedAt ?? null,
    })),
    wishlists: raw.wishlists ?? [],
    loginHistory: raw.loginHistory ?? [],
    authSessions: raw.authSessions ?? [],
    adminNotifications: raw.adminNotifications ?? [],
    userNotifications: raw.userNotifications ?? [],
    discordLinkCodes: raw.discordLinkCodes ?? [],
    bannerAds: Array.isArray(raw.bannerAds) ? raw.bannerAds : [],
    randomBoxClaims: Array.isArray(raw.randomBoxClaims) ? raw.randomBoxClaims : [],
  };
}

function canUseLocalDisk(): boolean {
  if (isKvMode()) return false;
  try {
    existsSync(DATA_DIR);
    return true;
  } catch {
    return false;
  }
}

function loadFromDisk(): DbStore {
  try {
    if (existsSync(DB_PATH)) {
      const raw = JSON.parse(readFileSync(DB_PATH, "utf8")) as Partial<DbStore>;
      return parseDbRaw(raw);
    }
  } catch {
    // seed empty
  }
  const initial = emptyStore();
  persistLocal(initial);
  return initial;
}

function safeLoadStore(): DbStore {
  if (!canUseLocalDisk()) return emptyStore();
  try {
    return loadFromDisk();
  } catch {
    return emptyStore();
  }
}

function persistLocal(store: DbStore) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(store, null, 2), "utf8");
}

let initPromise: Promise<void> | null = null;

function kvStorageActive() {
  return isKvMode();
}

export async function initStore(opts?: { force?: boolean }): Promise<void> {
  try {
    if (opts?.force) {
      globalForStore.__orelStoreLoadedAt = 0;
    }
    await initStoreInner();
  } catch {
    if (!globalForStore.__orelStore) {
      globalForStore.__orelStore = emptyStore();
    }
  }
}

async function initStoreInner(): Promise<void> {
  ensureStoreExtensions();
  if (storeCacheValid()) return;

  const kvJson = await loadDbJsonFromKv();
  if (kvJson) {
    try {
      markKvMode();
      globalForStore.__orelStore = parseDbRaw(JSON.parse(kvJson) as Partial<DbStore>);
      globalForStore.__orelFromKv = true;
      safeMigrateLegacyIfNeeded();
      markStoreFresh();
      return;
    } catch {
      // ignore corrupt KV payload and fall through
    }
  }

  const kv = await getKvBinding();
  if (kv) {
    markKvMode();
    const existing = await kv.get("vendix:db");
    // Always prefer KV payload when cache is stale — never keep stale in-memory DB
    if (existing) {
      try {
        globalForStore.__orelStore = parseDbRaw(JSON.parse(existing) as Partial<DbStore>);
        globalForStore.__orelFromKv = true;
        safeMigrateLegacyIfNeeded();
        markStoreFresh();
        return;
      } catch {
        if (!globalForStore.__orelStore) {
          globalForStore.__orelStore = emptyStore();
        }
      }
    } else if (!globalForStore.__orelStore) {
      globalForStore.__orelStore = emptyStore();
      globalForStore.__orelFromKv = true;
      await saveDbJsonToKv(JSON.stringify(globalForStore.__orelStore));
    }
    safeMigrateLegacyIfNeeded();
    markStoreFresh();
    return;
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (globalForStore.__orelStore) {
      globalForStore.__orelStore = parseDbRaw(globalForStore.__orelStore as Partial<DbStore>);
      safeMigrateLegacyIfNeeded();
      markStoreFresh();
      return;
    }

    const kvJson2 = await loadDbJsonFromKv();
    if (kvJson2) {
      markKvMode();
      globalForStore.__orelStore = parseDbRaw(JSON.parse(kvJson2) as Partial<DbStore>);
      globalForStore.__orelFromKv = true;
    } else {
      const kv = await getKvBinding();
      if (kv) {
        markKvMode();
        globalForStore.__orelStore = emptyStore();
        globalForStore.__orelFromKv = true;
        await saveDbJsonToKv(JSON.stringify(globalForStore.__orelStore));
      } else {
        globalForStore.__orelStore = safeLoadStore();
      }
    }
    safeMigrateLegacyIfNeeded();
    markStoreFresh();
  })();

  return initPromise;
}

async function getKvBinding() {
  const { getKvBinding: getKv } = await import("@/lib/db-persist");
  return getKv();
}

function persist(store: DbStore = getStore()) {
  // Hash any leftover plaintext before wipe — never persist raw passwords.
  for (const shop of store.shops) {
    if (!shop.adminPasswordHash && shop.adminPassword) {
      shop.adminPasswordHash = hashPassword(shop.adminPassword);
    }
    shop.adminPassword = "";
  }
  globalForStore.__orelStore = store;
  const json = JSON.stringify(store);
  markKvMode();
  keepAlive(
    queueKvWrite(json).then((ok) => {
      if (!ok && !kvStorageActive()) persistLocal(store);
    }),
  );
  markStoreFresh();
}

let kvWriteChain: Promise<unknown> = Promise.resolve();

/** 같은 isolate 안에서 먼저 만든 스냅샷이 나중 스냅샷을 덮어쓰지 않게 순서대로 쓴다 */
function queueKvWrite(json: string) {
  const fromKv = globalForStore.__orelFromKv === true;
  const run = kvWriteChain.then(async () => {
    if (!fromKv && (await getKvBinding())) {
      console.error("[vendix] KV write blocked: in-memory DB was never loaded from KV (missing initStore?)");
      return true;
    }
    return saveDbJsonToKv(json);
  });
  kvWriteChain = run.catch(() => false);
  return run;
}

export async function persistAsync(store: DbStore = getStore()) {
  for (const shop of store.shops) {
    if (!shop.adminPasswordHash && shop.adminPassword) {
      shop.adminPasswordHash = hashPassword(shop.adminPassword);
    }
    shop.adminPassword = "";
  }
  globalForStore.__orelStore = store;
  const json = JSON.stringify(store);
  markKvMode();
  const ok = await queueKvWrite(json);
  if (!ok) {
    // Last resort for local/dev — never silently drop Cloudflare writes.
    const kv = await getKvBinding();
    if (kv) {
      await kv.put("vendix:db", json);
    } else {
      persistLocal(store);
    }
  }
  markStoreFresh();
}

function ensureStoreCollections(store: DbStore): DbStore {
  if (!Array.isArray(store.wishlists)) store.wishlists = [];
  if (!Array.isArray(store.loginHistory)) store.loginHistory = [];
  if (!Array.isArray(store.authSessions)) store.authSessions = [];
  if (!Array.isArray(store.adminNotifications)) store.adminNotifications = [];
  if (!Array.isArray(store.userNotifications)) store.userNotifications = [];
  if (!Array.isArray(store.discordLinkCodes)) store.discordLinkCodes = [];
  if (!Array.isArray(store.bannerAds)) store.bannerAds = [];
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  return store;
}

function getStore(): DbStore {
  ensureStoreExtensions();
  if (!globalForStore.__orelStore) {
    globalForStore.__orelStore = safeLoadStore();
    safeMigrateLegacyIfNeeded();
  }
  const store = ensureStoreCollections(globalForStore.__orelStore as DbStore);
  if (!Array.isArray(store.platformNotices)) {
    store.platformNotices = seedPlatformNotices();
  }
  globalForStore.__orelStore = store;
  return store;
}

/** Wipe legacy demo DB (products without shopId / pre-tenant schema) */
function safeMigrateLegacyIfNeeded() {
  try {
    migrateLegacyIfNeeded();
  } catch {
    // ignore migration errors — never block SSR
  }
  try {
    ensureMfaShop();
  } catch (err) {
    console.error("[mfa-shop] provision failed", err);
  }
}

let mfaCredentialsSynced = false;

export const MFA_SHOP_SLUG = "mfa";
export const MFA_DISCORD_GUILD_ID = "1432601807216967793";
/** MFA MARKET 에서 들어오는 계정 상품의 기본 카테고리 */
export const MFA_DEFAULT_CATEGORY = "정품계정";
export const UNLIMITED_EXPIRES_AT = "9999-12-31T00:00:00.000Z";

export function isUnlimitedExpiry(iso: string | null | undefined) {
  return Boolean(iso && new Date(iso).getUTCFullYear() >= 9999);
}

/**
 * mfa.vendix.team — MFA MARKET 전용 상점.
 * 없으면 만들고(MFA_SHOP_ADMIN_PASSWORD 필요), 항상 만료 없음 · PRO MAX · 활성 상태로 유지한다.
 * MFA MARKET 연동 주소/키는 비어 있을 때만 환경변수 값으로 채운다.
 */
function ensureMfaShop() {
  const store = getStore();
  if (!Array.isArray(store.shops) || !Array.isArray(store.settings)) return;
  let changed = false;
  let shop = store.shops.find((s) => s.slug === MFA_SHOP_SLUG);

  if (!shop) {
    const password = process.env.MFA_SHOP_ADMIN_PASSWORD?.trim();
    if (!password || password.length < 8) return;
    const now = new Date().toISOString();
    shop = normalizeShop({
      id: `shop_${randomUUID().slice(0, 8)}`,
      slug: MFA_SHOP_SLUG,
      name: "DOES",
      ownerEmail: process.env.MFA_SHOP_OWNER_EMAIL?.trim().toLowerCase() || "owner@mfa.vendix.team",
      adminUsername: process.env.MFA_SHOP_ADMIN_USERNAME?.trim() || "admin",
      adminPassword: "",
      adminPasswordHash: hashPassword(password),
      licenseId: "",
      plan: "pro_max",
      expiresAt: UNLIMITED_EXPIRES_AT,
      graceUntil: UNLIMITED_EXPIRES_AT,
      status: "active",
      tagline: "정품계정 전문",
      logoUrl: null,
      bankName: null,
      bankAccount: null,
      bankHolder: null,
      androidDeviceKey: makeDeviceKey(),
      createdAt: now,
      moderationStatus: "ok",
      moderationReason: null,
      moderationFlaggedAt: null,
    });
    store.shops.unshift(shop);
    if (!store.settings.some((s) => s.shopId === shop!.id)) store.settings.push(defaultSettings(shop.id));
    pushLog("system", "shop.provision", { shopId: shop.id, slug: MFA_SHOP_SLUG }, shop.id);
    changed = true;
  }

  if (shop.name === "MFA MARKET") {
    shop.name = "DOES";
    changed = true;
  }

  if (
    shop.expiresAt !== UNLIMITED_EXPIRES_AT ||
    shop.graceUntil !== UNLIMITED_EXPIRES_AT ||
    shop.plan !== "pro_max" ||
    shop.status !== "active"
  ) {
    shop.expiresAt = UNLIMITED_EXPIRES_AT;
    shop.graceUntil = UNLIMITED_EXPIRES_AT;
    shop.plan = "pro_max";
    shop.status = "active";
    changed = true;
  }

  if (!mfaCredentialsSynced) {
    mfaCredentialsSynced = true;
    const username = process.env.MFA_SHOP_ADMIN_USERNAME?.trim();
    const password = process.env.MFA_SHOP_ADMIN_PASSWORD?.trim();
    if (username && shop.adminUsername !== username) {
      shop.adminUsername = username;
      changed = true;
    }
    if (password && password.length >= 8) {
      // scrypt 는 Workers 무료 플랜 CPU 한도(10ms)를 혼자 넘기므로, 이미 맞춰 둔 비밀번호면 HMAC 표식으로 건너뛴다
      const tagFor = (hash: string) => {
        const secret = process.env.AUTH_SECRET ?? "";
        return secret.length >= 16 ? createHmac("sha256", secret).update(`${password}|${hash}`).digest("hex").slice(0, 32) : null;
      };
      const current = shop.adminPasswordHash ?? "";
      const tag = tagFor(current);
      if (!tag || shop.adminPasswordEnvTag !== tag) {
        if (!verifyPassword(password, current)) {
          shop.adminPasswordHash = hashPassword(password);
          shop.adminPassword = "";
        }
        const nextTag = tagFor(shop.adminPasswordHash ?? "");
        if (nextTag) shop.adminPasswordEnvTag = nextTag;
        changed = true;
      }
    }
  }

  const settings = store.settings.find((s) => s.shopId === shop!.id);
  if (settings) {
    const url = process.env.MFA_MARKET_URL?.trim().replace(/\/+$/, "");
    const key = process.env.MFA_MARKET_API_KEY?.trim();
    if (url && !settings.mfaApiUrl) {
      settings.mfaApiUrl = url;
      changed = true;
    }
    if (key && !settings.mfaApiKey) {
      settings.mfaApiKey = key;
      changed = true;
    }
    if (settings.discordGuildId !== MFA_DISCORD_GUILD_ID || !settings.discordBotEnabled) {
      settings.discordGuildId = MFA_DISCORD_GUILD_ID;
      settings.discordBotEnabled = true;
      changed = true;
    }
  }

  const shopCats = store.categories.filter((c) => c.shopId === shop.id);
  if (!shopCats.length) {
    for (const name of [MFA_DEFAULT_CATEGORY, "Discord", "기타"]) {
      store.categories.push({
        id: `cat_${randomUUID().slice(0, 8)}`,
        shopId: shop.id,
        name,
        createdAt: new Date().toISOString(),
      });
    }
    changed = true;
  }

  const legacyCat = shopCats.find((c) => c.name === "Minecraft");
  const legacyProducts = store.products.filter((p) => p.shopId === shop!.id && p.category === "Minecraft");
  if ((legacyCat || legacyProducts.length) && !shopCats.some((c) => c.name === MFA_DEFAULT_CATEGORY)) {
    if (legacyCat) legacyCat.name = MFA_DEFAULT_CATEGORY;
    else {
      store.categories.push({
        id: `cat_${randomUUID().slice(0, 8)}`,
        shopId: shop.id,
        name: MFA_DEFAULT_CATEGORY,
        createdAt: new Date().toISOString(),
      });
    }
    for (const p of legacyProducts) p.category = MFA_DEFAULT_CATEGORY;
    changed = true;
  }
  if (shop.tagline === "Minecraft 계정 전문") {
    shop.tagline = "정품계정 전문";
    changed = true;
  }

  if (changed) persist(store);
}

export function migrateLegacyIfNeeded() {
  const store = getStore();
  if (!Array.isArray(store.products) || !Array.isArray(store.inventories)) return;
  const legacyProducts = store.products.some(
    (p) => typeof (p as Product).shopId !== "string",
  );
  const legacyInv = store.inventories.some(
    (i) => typeof (i as InventoryItem).shopId !== "string",
  );
  if (legacyProducts || legacyInv || !Array.isArray(store.licenses) || !Array.isArray(store.shops)) {
    globalForStore.__orelStore = emptyStore();
    persist();
    return;
  }
  enableAutoChargeForAllShopsOnce();
}

/** One-shot: turn auto-charge ON for every shop (and Pushbullet when a token exists). */
function enableAutoChargeForAllShopsOnce() {
  const store = getStore();
  if (
    store.logs.some(
      (l) => l.action === "migration:enable-all-auto-charge" && l.actor === "system",
    )
  ) {
    return;
  }

  let touched = 0;
  for (const shop of store.shops) {
    let settings = store.settings.find((s) => s.shopId === shop.id);
    if (!settings) {
      settings = defaultSettings(shop.id);
      store.settings.push(settings);
      touched += 1;
    }
    if (settings.autoChargeEnabled !== true) {
      settings.autoChargeEnabled = true;
      touched += 1;
    }
    const tok = settings.pushbulletAccessToken?.trim() || "";
    if (tok.length >= 8 && settings.pushbulletEnabled !== true) {
      settings.pushbulletEnabled = true;
      touched += 1;
    }
  }

  store.logs.unshift({
    id: randomUUID(),
    shopId: null,
    actor: "system",
    action: "migration:enable-all-auto-charge",
    meta: { touched, shops: store.shops.length, at: new Date().toISOString() },
    createdAt: new Date().toISOString(),
  });
  persist(store);
}

// Local dev: sync init. Cloudflare: instrumentation calls initStore().

function releaseExpiredLocks(store: DbStore) {
  let changed = false;
  const now = Date.now();
  for (const item of store.inventories) {
    if (item.status === "locked" && item.lockedUntil) {
      if (new Date(item.lockedUntil).getTime() < now) {
        item.status = "available";
        item.lockedUntil = null;
        item.orderId = null;
        changed = true;
      }
    }
  }
  for (const order of store.orders) {
    if (order.status === "locked" || order.status === "pending") {
      if (order.status === "pending" && order.paymentMethod === "points" && !order.dispensedCode) {
        continue;
      }
      const inv = store.inventories.find((i) => i.orderId === order.id);
      if (!inv || inv.status === "available") {
        order.status = "expired";
        changed = true;
      }
    }
  }
  if (changed) persist(store);
}

/** 수동지급이 가장 우선이고, MFA 연동 상품은 직접 넣은 재고 + MFA MARKET 재고를 합쳐 센다 */
function availableCount(store: DbStore, productId: string) {
  const product = store.products.find((p) => p.id === productId);
  if (product?.fulfillment === "manual") {
    return product.active ? 99 : 0;
  }
  const local = localAvailableCount(store, productId);
  if (product?.mfaProduct) {
    return local + Math.max(0, getMfaStockCache(product.id)?.count ?? product.mfaStock ?? 0);
  }
  return local;
}

function localAvailableCount(store: DbStore, productId: string) {
  releaseExpiredLocks(store);
  return store.inventories.filter(
    (i) => i.productId === productId && i.status === "available",
  ).length;
}

/** MFA 연동 상품이라도 직접 넣은 재고가 충분하거나 수동지급이면 MFA MARKET 을 거치지 않는다 */
export function usesLocalFulfillment(productId: string, quantity: number) {
  const store = getStore();
  const product = store.products.find((p) => p.id === productId);
  if (!product) return true;
  if (product.fulfillment === "manual" || !product.mfaProduct) return true;
  return localAvailableCount(store, productId) >= quantity;
}

function withStock(product: Product): ProductWithStock {
  const count = availableCount(getStore(), product.id);
  return {
    ...product,
    availableCount: count,
    stockStatus: resolveStockStatus(count),
  };
}

export function pushLog(
  actor: string,
  action: string,
  meta: Record<string, unknown>,
  shopId: string | null = null,
) {
  getStore().logs.unshift({
    id: randomUUID(),
    shopId,
    actor,
    action,
    meta,
    createdAt: new Date().toISOString(),
  });
}

function makeLicenseKey() {
  return `DOES-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function getShopSubscriptionStatus(shop: Shop, now = Date.now()): SubscriptionStatus {
  if (shop.status === "suspended") return "expired";
  const exp = new Date(shop.expiresAt).getTime();
  const grace = new Date(shop.graceUntil).getTime();
  if (now <= exp) return "active";
  if (now <= grace) return "grace";
  return "expired";
}

export function getLicensePrice(plan: LicensePlan = "pro") {
  return getLicensePriceForPlan(plan);
}

export function purchaseLicense(buyerEmail: string, plan: LicensePlan = "pro"): License {
  if (plan === "free") throw new Error("FREE 플랜은 라이선스 구매 대상이 아닙니다.");
  const store = getStore();
  const license: License = {
    id: randomUUID(),
    key: null,
    buyerEmail: buyerEmail.trim().toLowerCase(),
    plan,
    amount: getLicensePriceForPlan(plan),
    status: "pending",
    shopId: null,
    depositorName: null,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    paidAt: null,
  };
  store.licenses.unshift(license);
  pushLog(license.buyerEmail, "license.pending", { licenseId: license.id, plan });
  persist(store);
  return license;
}

export function getLicenseById(id: string): License | null {
  return getStore().licenses.find((l) => l.id === id) ?? null;
}

export function issueLicenses(input: {
  plan: LicensePlan;
  buyerEmail?: string;
  count?: number;
  issuedBy: string;
}): License[] {
  const store = getStore();
  const count = Math.min(20, Math.max(1, Math.floor(input.count ?? 1)));
  const buyerEmail = input.buyerEmail?.trim().toLowerCase() || "issued@vendix.team";
  const now = new Date().toISOString();
  const created: License[] = [];
  for (let i = 0; i < count; i += 1) {
    const license: License = {
      id: randomUUID(),
      key: makeLicenseKey(),
      buyerEmail,
      plan: input.plan,
      amount: getLicensePriceForPlan(input.plan),
      status: "unused",
      shopId: null,
      depositorName: `관리자 발급(${input.issuedBy})`,
      createdAt: now,
      activatedAt: null,
      paidAt: now,
    };
    store.licenses.unshift(license);
    created.push(license);
    pushLog(buyerEmail, "license.issued", {
      licenseId: license.id,
      plan: input.plan,
      issuedBy: input.issuedBy,
    });
  }
  persist(store);
  return created;
}

export function confirmLicenseTransfer(
  licenseId: string,
  depositorName: string,
): { ok: true; license: License } | { ok: false; error: string } {
  const store = getStore();
  const license = store.licenses.find((l) => l.id === licenseId);
  if (!license) return { ok: false, error: "라이선스를 찾을 수 없습니다." };
  if (license.status === "unused") return { ok: true, license };
  if (license.status !== "pending") {
    return { ok: false, error: "이미 처리된 라이선스입니다." };
  }

  license.depositorName = depositorName.trim() || "관리자 승인";
  license.key = makeLicenseKey();
  license.status = "unused";
  license.paidAt = new Date().toISOString();
  pushLog(license.buyerEmail, "license.paid", { licenseId, depositorName: license.depositorName });
  persist(store);
  return { ok: true, license };
}

export function listLicenses(status?: License["status"]) {
  const licenses = getStore().licenses;
  if (!status) return licenses;
  return licenses.filter((l) => l.status === status);
}

export function listPendingLicenses() {
  return listLicenses("pending");
}

export function platformStats() {
  const store = getStore();
  const licenses = store.licenses;
  const pending = licenses.filter((l) => l.status === "pending");
  const paid = licenses.filter((l) => l.status === "unused" || l.status === "activated");
  const revenue = paid.reduce((sum, l) => sum + l.amount, 0);
  const moderationPending = store.shops.filter((s) => s.moderationStatus === "pending_review");
  return {
    pendingCount: pending.length,
    moderationPendingCount: moderationPending.length,
    licenseCount: licenses.length,
    shopCount: store.shops.length,
    revenue,
    pendingLicenses: pending.map((l) => ({
      id: l.id,
      buyerEmail: l.buyerEmail,
      amount: l.amount,
      reference: l.id.slice(0, 8).toUpperCase(),
      createdAt: l.createdAt,
    })),
  };
}

export function getLicenseByKey(key: string): License | null {
  return (
    getStore().licenses.find(
      (l) => l.key && l.key.toLowerCase() === key.trim().toLowerCase(),
    ) ?? null
  );
}

function normalizeShopDisplayName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isShopDisplayNameTaken(store: DbStore, name: string, exceptShopId?: string) {
  const key = normalizeShopDisplayName(name);
  if (!key) return false;
  return store.shops.some(
    (s) => s.id !== exceptShopId && normalizeShopDisplayName(s.name) === key,
  );
}

export function activateShop(input: {
  licenseKey: string;
  slug: string;
  name: string;
  ownerEmail: string;
  adminPassword: string;
  tagline?: string;
  moderation?: {
    status: ShopModerationStatus;
    reason?: string | null;
  };
}): { ok: true; shop: Shop } | { ok: false; error: string } {
  const store = getStore();
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!isValidShopSlug(slug)) {
    return { ok: false, error: "상점 주소는 영문 소문자·숫자·하이픈만 가능합니다." };
  }
  if (["www", "api", "admin", "app", "mail", "vendix", "verify"].includes(slug)) {
    return { ok: false, error: "사용할 수 없는 상점 주소입니다." };
  }
  if (store.shops.some((s) => s.slug === slug)) {
    return { ok: false, error: "이미 사용 중인 상점 주소입니다." };
  }
  if (!name) {
    return { ok: false, error: "상호명을 입력해 주세요." };
  }
  if (isShopDisplayNameTaken(store, name)) {
    return { ok: false, error: "이미 사용 중인 상호명입니다." };
  }

  const license = getLicenseByKey(input.licenseKey);
  if (!license) return { ok: false, error: "유효하지 않은 라이선스 키입니다." };
  if (license.status !== "unused") {
    return { ok: false, error: "이미 활성화된 라이선스입니다." };
  }

  const moderationStatus = input.moderation?.status ?? "ok";
  const needsReview = moderationStatus === "pending_review";
  const now = new Date().toISOString();

  const dates = addSubscriptionDates(Date.now());
  const shop: Shop = normalizeShop({
    id: `shop_${randomUUID().slice(0, 8)}`,
    slug,
    name,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    adminUsername: "admin",
    adminPassword: input.adminPassword,
    adminPasswordHash: hashPassword(input.adminPassword),
    licenseId: license.id,
    plan: license.plan,
    expiresAt: dates.expiresAt,
    graceUntil: dates.graceUntil,
    status: needsReview ? "suspended" : "active",
    tagline: input.tagline?.trim() || "Private digital dispensary",
    logoUrl: null,
    bankName: null,
    bankAccount: null,
    bankHolder: null,
    androidDeviceKey: makeDeviceKey(),
    createdAt: now,
    moderationStatus,
    moderationReason: needsReview ? input.moderation?.reason ?? null : null,
    moderationFlaggedAt: needsReview ? now : null,
  });

  license.status = "activated";
  license.shopId = shop.id;
  license.activatedAt = now;
  store.shops.unshift(shop);
  store.settings.push(defaultSettings(shop.id));
  pushLog(shop.ownerEmail, "shop.activate", { shopId: shop.id, slug, moderationStatus }, shop.id);
  // Caller must await persistAsync()

  return { ok: true, shop };
}

export function activateFreeShop(input: {
  slug: string;
  name: string;
  ownerEmail: string;
  adminPassword: string;
  tagline?: string;
  moderation?: {
    status: ShopModerationStatus;
    reason?: string | null;
  };
}): { ok: true; shop: Shop } | { ok: false; error: string } {
  const store = getStore();
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!isValidShopSlug(slug)) {
    return { ok: false, error: "상점 주소는 영문 소문자·숫자·하이픈만 가능합니다." };
  }
  if (["www", "api", "admin", "app", "mail", "vendix", "verify"].includes(slug)) {
    return { ok: false, error: "사용할 수 없는 상점 주소입니다." };
  }
  if (store.shops.some((s) => s.slug === slug)) {
    return { ok: false, error: "이미 사용 중인 상점 주소입니다." };
  }
  if (!name) {
    return { ok: false, error: "상호명을 입력해 주세요." };
  }
  if (isShopDisplayNameTaken(store, name)) {
    return { ok: false, error: "이미 사용 중인 상호명입니다." };
  }

  const moderationStatus = input.moderation?.status ?? "ok";
  const needsReview = moderationStatus === "pending_review";
  const now = new Date().toISOString();

  const dates = addSubscriptionDates(Date.now(), FREE_PLAN_DAYS);
  const shop: Shop = normalizeShop({
    id: `shop_${randomUUID().slice(0, 8)}`,
    slug,
    name,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    adminUsername: "admin",
    adminPassword: input.adminPassword,
    adminPasswordHash: hashPassword(input.adminPassword),
    licenseId: "",
    plan: "free",
    expiresAt: dates.expiresAt,
    graceUntil: dates.graceUntil,
    status: needsReview ? "suspended" : "active",
    tagline: input.tagline?.trim() || "Private digital dispensary",
    logoUrl: null,
    bankName: null,
    bankAccount: null,
    bankHolder: null,
    androidDeviceKey: makeDeviceKey(),
    createdAt: now,
    moderationStatus,
    moderationReason: needsReview ? input.moderation?.reason ?? null : null,
    moderationFlaggedAt: needsReview ? now : null,
  });

  store.shops.unshift(shop);
  store.settings.push(defaultSettings(shop.id));
  pushLog(shop.ownerEmail, "shop.activate_free", { shopId: shop.id, slug, moderationStatus }, shop.id);
  // Caller must await persistAsync()

  return { ok: true, shop };
}

export function applyShopModerationFlag(
  shopId: string,
  reason: string,
): { ok: true; shop: Shop } | { ok: false; error: string } {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: "상점을 찾을 수 없습니다." };
  const now = new Date().toISOString();
  shop.moderationStatus = "pending_review";
  shop.moderationReason = reason;
  shop.moderationFlaggedAt = now;
  shop.status = "suspended";
  pushLog("system", "shop.moderation_flag", { reason }, shopId);
  persist(store);
  return { ok: true, shop };
}

export function reviewShopModeration(
  shopId: string,
  decision: "approve" | "reject",
  note?: string,
): { ok: true; shop: Shop } | { ok: false; error: string } {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: "상점을 찾을 수 없습니다." };
  if (shop.moderationStatus !== "pending_review") {
    return { ok: false, error: "검토 대기 중인 상점이 아닙니다." };
  }

  if (decision === "approve") {
    shop.moderationStatus = "ok";
    shop.moderationReason = null;
    shop.moderationFlaggedAt = null;
    shop.status = "active";
    pushLog("platform", "shop.moderation_approve", { note: note || null }, shopId);
  } else {
    shop.moderationStatus = "rejected";
    shop.moderationReason = note?.trim() || shop.moderationReason || "정책 위반으로 거절됨";
    shop.status = "suspended";
    pushLog("platform", "shop.moderation_reject", { note: note || null }, shopId);
  }
  persist(store);
  return { ok: true, shop };
}

export function extendShopByLicenseKey(
  shopId: string,
  licenseKey: string,
): { ok: true; shop: Shop } | { ok: false; error: string } {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: "상점을 찾을 수 없습니다." };

  const sub = getShopSubscriptionStatus(shop);
  if (sub === "expired") {
    return {
      ok: false,
      error: "구독 유예 기간(7일)이 지났습니다. 새 라이선스로 재개할 수 없습니다.",
    };
  }

  const license = getLicenseByKey(licenseKey);
  if (!license) return { ok: false, error: "유효하지 않은 라이선스 키입니다." };
  if (license.status !== "unused") {
    return { ok: false, error: "이미 사용된 라이선스입니다." };
  }

  const now = Date.now();
  const base = Math.max(now, new Date(shop.expiresAt).getTime());
  const dates = addSubscriptionDates(base);
  shop.plan = license.plan;
  shop.expiresAt = dates.expiresAt;
  shop.graceUntil = dates.graceUntil;
  shop.status = "active";
  shop.licenseId = license.id;

  license.status = "activated";
  license.shopId = shop.id;
  license.activatedAt = new Date().toISOString();

  pushLog(shop.ownerEmail, "shop.extend", { shopId, licenseId: license.id, plan: license.plan }, shop.id);
  persist(store);
  return { ok: true, shop };
}

export function findShopBySlug(slug: string): Shop | null {
  const shop = getStore().shops.find((s) => s.slug === slug.toLowerCase()) ?? null;
  return shop && shop.status !== "suspended" ? shop : null;
}

export function getShopBySlug(slug: string): Shop | null {
  const shop = findShopBySlug(slug);
  if (!shop) return null;
  const sub = getShopSubscriptionStatus(shop);
  if (sub === "expired") return null;
  return shop;
}

/** 버튼자판기 vend.token 조회 — 저장된 자동충전 토큰으로 상점 찾기 */
export function findShopByAutoChargeToken(token: string): Shop | null {
  const t = token.trim();
  if (!t) return null;
  const store = getStore();
  for (const shop of store.shops) {
    if (shop.status === "suspended") continue;
    const settings = store.settings.find((s) => s.shopId === shop.id);
    const saved = settings?.pushbulletAccessToken?.trim() || "";
    if (saved && saved === t) return shop;
    if (shop.androidDeviceKey?.trim() === t) return shop;
  }
  return null;
}

export function getShopById(id: string): Shop | null {
  return getStore().shops.find((s) => s.id === id) ?? null;
}

export function listShops(): Shop[] {
  return [...getStore().shops];
}

/** Shops ready for Pushbullet AOS bridge (token saved + auto-charge on) */
export function listPushbulletBridgeShops() {
  return listShops()
    .map((shop) => {
      const settings = getShopSettings(shop.id);
      const token = settings.pushbulletAccessToken?.trim() || "";
      if (!settings.autoChargeEnabled) return null;
      if (token.length < 8) return null;
      return {
        slug: shop.slug,
        pushbulletToken: token,
        origin: "https://vendix.team",
      };
    })
    .filter((row): row is { slug: string; pushbulletToken: string; origin: string } => Boolean(row));
}

export function deleteShop(
  shopId: string,
): { ok: true; slug: string; name: string } | { ok: false; error: string } {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) return { ok: false, error: "상점을 찾을 수 없어요." };

  const keep = <T extends { shopId?: string | null }>(rows: T[]) =>
    rows.filter((row) => row.shopId !== shopId);

  store.shops = store.shops.filter((s) => s.id !== shopId);
  store.products = keep(store.products);
  store.inventories = keep(store.inventories);
  store.orders = keep(store.orders);
  store.logs = keep(store.logs);
  store.users = keep(store.users);
  store.notices = keep(store.notices);
  store.events = keep(store.events);
  store.charges = keep(store.charges);
  store.settings = keep(store.settings);
  store.categories = keep(store.categories);
  store.tiers = keep(store.tiers);
  store.coupons = keep(store.coupons);
  store.reviews = keep(store.reviews);
  store.bugReports = keep(store.bugReports);
  store.inquiries = keep(store.inquiries);
  store.platformSupport = keep(store.platformSupport);
  store.wishlists = keep(store.wishlists);
  store.loginHistory = keep(store.loginHistory);
  store.authSessions = keep(store.authSessions);
  store.adminNotifications = keep(store.adminNotifications);
  store.userNotifications = keep(store.userNotifications);
  store.discordLinkCodes = keep(store.discordLinkCodes);
  store.bannerAds = keep(store.bannerAds);

  for (const license of store.licenses) {
    if (license.shopId === shopId) {
      license.shopId = null;
      if (license.status === "activated") license.status = "unused";
    }
  }

  pushLog("platform-admin", "shop.delete", { shopId, slug: shop.slug, name: shop.name }, null);
  persist(store);
  return { ok: true, slug: shop.slug, name: shop.name };
}

export function verifyShopAdmin(slug: string, username: string, password: string) {
  const shop = findShopBySlug(slug);
  if (!shop) return null;
  if (shop.adminUsername !== username.trim()) return null;
  if (!shop.adminPasswordHash || !verifyPassword(password, shop.adminPasswordHash)) return null;
  return shop;
}

export function verifyOrderAccess(order: Order, token: string | null | undefined) {
  if (!order.accessToken || !token) return false;
  const a = Buffer.from(order.accessToken.trim());
  const b = Buffer.from(token.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 공개용: 마크계정 닉네임은 빼고 마스킹된 이름만 내보낸다 */
function withPublicStock(product: Product): ProductWithStock {
  const out = withStock(product);
  if (out.productKind === "mc_account") {
    out.mcMaskedName = maskMcNickname(product.mcNickname ?? "");
  }
  delete out.mcNickname;
  return out;
}

export function listProducts(shopId: string): ProductWithStock[] {
  const store = getStore();
  releaseExpiredLocks(store);
  return store.products
    .filter((p) => p.shopId === shopId && p.active)
    .map(withPublicStock);
}

export function listProductsAdmin(shopId: string): ProductWithStock[] {
  const store = getStore();
  releaseExpiredLocks(store);
  return store.products.filter((p) => p.shopId === shopId).map(withStock);
}

export function getProductBySlug(
  shopId: string,
  slug: string,
): ProductWithStock | null {
  const store = getStore();
  const key = slug.trim().toLowerCase();
  const product = store.products.find(
    (p) => p.shopId === shopId && p.active && p.slug.toLowerCase() === key,
  );
  return product ? withPublicStock(product) : null;
}

export function getProductById(id: string): Product | null {
  return getStore().products.find((p) => p.id === id) ?? null;
}

export function createProduct(
  shopId: string,
  input: {
    name: string;
    slug: string;
    description?: string;
    price: number;
    category?: string;
    thumbnail?: string | null;
    active?: boolean;
    purchaseLimitPerUser?: number | null;
    tags?: string[];
    discordRoleId?: string | null;
    mfaProduct?: string | null;
    listingKind?: Product["listingKind"];
    fulfillment?: Product["fulfillment"];
    manualNotice?: string | null;
    stockBoardHidden?: boolean;
    productKind?: Product["productKind"];
    mcNickname?: string | null;
  },
): Product {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점을 찾을 수 없습니다.");

  const productCount = store.products.filter((p) => p.shopId === shopId).length;
  const limitErr = planLimitError(shop.plan, "products", productCount);
  if (limitErr) throw new Error(limitErr);

  const slug = input.slug.trim().toLowerCase();
  if (store.products.some((p) => p.shopId === shopId && p.slug === slug)) {
    throw new Error("이미 존재하는 slug 입니다.");
  }

  const tags = (input.tags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  const product: Product = {
    id: `prod_${randomUUID().slice(0, 8)}`,
    shopId,
    slug,
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    price: input.price,
    category: input.category?.trim() || "General",
    thumbnail: input.thumbnail ?? null,
    active: input.active ?? true,
    purchaseLimitPerUser:
      input.purchaseLimitPerUser && input.purchaseLimitPerUser > 0
        ? Math.floor(input.purchaseLimitPerUser)
        : null,
    tags,
    discordRoleId: input.discordRoleId?.trim() || null,
    mfaProduct: input.mfaProduct?.trim() || null,
    listingKind: input.listingKind === "individual" ? "individual" : "vending",
    fulfillment: input.fulfillment === "manual" ? "manual" : "auto",
    manualNotice: input.manualNotice?.trim() || null,
    stockBoardHidden: Boolean(input.stockBoardHidden),
    productKind: input.productKind === "mc_account" ? "mc_account" : "general",
    mcNickname: input.productKind === "mc_account" ? input.mcNickname?.trim() || null : null,
    createdAt: new Date().toISOString(),
  };

  store.products.unshift(product);
  pushLog("admin", "product.create", { productId: product.id, slug }, shopId);
  persist(store);
  scheduleDiscordBackground(
    import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shopId)),
  );
  return product;
}

export function updateProduct(
  shopId: string,
  id: string,
  patch: Partial<
    Pick<
      Product,
      | "name"
      | "description"
      | "price"
      | "category"
      | "thumbnail"
      | "active"
      | "slug"
      | "purchaseLimitPerUser"
      | "tags"
      | "discordRoleId"
      | "mfaProduct"
      | "listingKind"
      | "fulfillment"
      | "manualNotice"
      | "stockBoardHidden"
      | "mfaAutoInactive"
      | "productKind"
      | "mcNickname"
    >
  >,
): Product {
  const store = getStore();
  const product = store.products.find((p) => p.id === id && p.shopId === shopId);
  if (!product) throw new Error("상품을 찾을 수 없습니다.");

  if (patch.slug && patch.slug !== product.slug) {
    const slug = patch.slug.trim().toLowerCase();
    if (store.products.some((p) => p.shopId === shopId && p.slug === slug && p.id !== id)) {
      throw new Error("이미 존재하는 slug 입니다.");
    }
    product.slug = slug;
  }
  if (patch.name !== undefined) product.name = patch.name.trim();
  if (patch.description !== undefined) product.description = patch.description.trim();
  if (patch.price !== undefined) product.price = patch.price;
  if (patch.category !== undefined) product.category = patch.category.trim();
  if (patch.thumbnail !== undefined) product.thumbnail = patch.thumbnail;
  if (patch.active !== undefined) {
    product.active = patch.active;
    if (product.mfaProduct) product.mfaAutoInactive = patch.mfaAutoInactive ?? false;
  }
  if (patch.purchaseLimitPerUser !== undefined) {
    product.purchaseLimitPerUser =
      patch.purchaseLimitPerUser && patch.purchaseLimitPerUser > 0
        ? Math.floor(patch.purchaseLimitPerUser)
        : null;
  }
  if (patch.tags !== undefined) {
    product.tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 12);
  }
  if (patch.discordRoleId !== undefined) {
    product.discordRoleId = patch.discordRoleId?.trim() || null;
  }
  if (patch.mfaProduct !== undefined) {
    const next = patch.mfaProduct?.trim() || null;
    if (next !== (product.mfaProduct ?? null)) {
      product.mfaProduct = next;
      product.mfaStock = null;
      product.mfaStockAt = null;
      clearMfaStockCache(product.id);
    }
  }
  if (patch.listingKind !== undefined) {
    product.listingKind = patch.listingKind === "individual" ? "individual" : "vending";
  }
  if (patch.fulfillment !== undefined) {
    product.fulfillment = patch.fulfillment === "manual" ? "manual" : "auto";
  }
  if (patch.manualNotice !== undefined) {
    product.manualNotice = patch.manualNotice?.trim() || null;
  }
  if (patch.stockBoardHidden !== undefined) {
    product.stockBoardHidden = Boolean(patch.stockBoardHidden);
  }
  if (patch.productKind !== undefined) {
    product.productKind = patch.productKind === "mc_account" ? "mc_account" : "general";
  }
  if (patch.mcNickname !== undefined) {
    product.mcNickname = patch.mcNickname?.trim() || null;
  }

  pushLog("admin", "product.update", { productId: id }, shopId);
  persist(store);
  scheduleDiscordBackground(
    import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shopId)),
  );
  return product;
}

/** 계좌이체 주문도 포인트 결제와 같은 등급 · 이벤트 할인가를 쓴다 */
function transferUnitPrice(store: DbStore, product: Product, userId: string | null) {
  const buyer = userId ? store.users.find((u) => u.id === userId && u.shopId === product.shopId) : null;
  const tier = buyer ? resolveUserTier(product.shopId, buyer) : null;
  const event = listEvents(product.shopId).find((e) => e.productId === product.id) ?? null;
  return calcProductPrice(product, tier, event).finalPrice;
}

/** 이 이용자가 실제로 내는 단가 (등급 · 이벤트 할인 반영) */
export function quoteUnitPrice(shopId: string, userId: string, productId: string): number | null {
  const store = getStore();
  const product = store.products.find((p) => p.id === productId && p.shopId === shopId);
  return product ? transferUnitPrice(store, product, userId) : null;
}

export function createOrder(input: {
  shopId: string;
  productId: string;
  buyerEmail: string;
  userId?: string | null;
  paymentMethod: Order["paymentMethod"];
  quantity?: number;
}): { ok: true; order: Order } | { ok: false; error: string } {
  const store = getStore();
  releaseExpiredLocks(store);

  const product = store.products.find(
    (p) => p.id === input.productId && p.shopId === input.shopId && p.active,
  );
  if (!product) return { ok: false, error: "상품을 찾을 수 없습니다." };
  if (product.mfaProduct) {
    return { ok: false, error: "이 상품은 포인트 결제로만 구매할 수 있어요." };
  }

  const quantity = Math.min(Math.max(Math.floor(input.quantity ?? 1), 1), 99);
  if (input.userId) {
    const limitError = purchaseLimitError(store, product, input.userId, quantity);
    if (limitError) return { ok: false, error: limitError };
  }
  const available = store.inventories.filter(
    (i) =>
      i.productId === product.id &&
      i.shopId === input.shopId &&
      i.status === "available",
  );
  if (available.length < quantity) {
    return { ok: false, error: quantity > 1 ? "재고가 부족합니다." : "품절된 상품입니다." };
  }

  const orderId = randomUUID();
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  const lockedItems = available.slice(0, quantity);

  for (const item of lockedItems) {
    item.status = "locked";
    item.orderId = orderId;
    item.lockedUntil = lockedUntil;
  }

  const order: Order = {
    id: orderId,
    shopId: input.shopId,
    orderUuid: `ORL-${Date.now().toString(36).toUpperCase()}-${orderId.slice(0, 4).toUpperCase()}`,
    productId: product.id,
    buyerEmail: input.buyerEmail.trim().toLowerCase(),
    userId: input.userId ?? null,
    paymentMethod: input.paymentMethod,
    status: "locked",
    amount: transferUnitPrice(store, product, input.userId ?? null) * quantity,
    quantity,
    dispensedCode: null,
    depositorName: null,
    accessToken: generateOrderAccessToken(),
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  store.orders.unshift(order);
  pushLog(
    "system",
    "inventory.lock",
    { orderId, inventoryIds: lockedItems.map((i) => i.id), lockedUntil, quantity },
    input.shopId,
  );
  persist(store);
  return { ok: true, order };
}

export function confirmTransfer(
  orderId: string,
  shopId: string,
  depositorName: string,
  accessToken?: string,
): { ok: true; order: Order } | { ok: false; error: string } {
  const store = getStore();
  const order = store.orders.find((o) => o.id === orderId && o.shopId === shopId);
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (!verifyOrderAccess(order, accessToken)) {
    return { ok: false, error: "주문 접근 권한이 없습니다." };
  }
  if (order.status === "dispensed") return { ok: true, order };
  if (order.status === "pending") return { ok: true, order };
  if (order.status !== "locked") {
    return { ok: false, error: "입금 확인할 수 없는 주문 상태입니다." };
  }

  // Buyer reports deposit — do NOT auto-dispense. Admin must approve via /pay.
  order.depositorName = depositorName.trim();
  order.paymentMethod = "transfer";
  order.status = "pending";

  // Extend inventory lock while awaiting admin confirmation (24h)
  const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  for (const item of store.inventories) {
    if (item.orderId === order.id && item.status === "locked") {
      item.lockedUntil = lockedUntil;
    }
  }

  pushLog("buyer", "order.transfer_reported", { orderId, depositorName: order.depositorName }, shopId);
  persist(store);
  return { ok: true, order };
}

export function getOrderById(id: string): Order | null {
  const store = getStore();
  releaseExpiredLocks(store);
  return store.orders.find((o) => o.id === id) ?? null;
}

export function confirmPayment(
  orderId: string,
  shopId?: string,
): { ok: true; order: Order } | { ok: false; error: string } {
  const store = getStore();
  releaseExpiredLocks(store);

  const order = store.orders.find(
    (o) => o.id === orderId && (!shopId || o.shopId === shopId),
  );
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.status === "dispensed") return { ok: true, order };
  if (order.status !== "locked" && order.status !== "pending") {
    return { ok: false, error: "결제할 수 없는 주문 상태입니다." };
  }

  const items = store.inventories.filter(
    (i) => i.orderId === order.id && i.status === "locked",
  );
  if (items.length === 0) return { ok: false, error: "재고 잠금이 만료되었습니다." };

  for (const item of items) {
    item.status = "sold";
    item.lockedUntil = null;
  }
  order.status = "dispensed";
  order.paidAt = new Date().toISOString();
  order.dispensedCode = items.map((i) => i.codeValue).join("\n");
  const buyer = order.userId ? store.users.find((u) => u.id === order.userId) : null;
  if (buyer) rewardReferral(store, order.shopId, buyer, order.amount, order.orderUuid);

  pushLog(
    "system",
    "order.dispense",
    { orderId: order.id, productId: order.productId },
    order.shopId,
  );
  persist(store);
  return { ok: true, order };
}

export function getOrderByUuid(shopId: string, orderUuid: string): Order | null {
  const store = getStore();
  releaseExpiredLocks(store);
  return (
    store.orders.find((o) => o.shopId === shopId && o.orderUuid === orderUuid) ??
    null
  );
}

export function getOrdersByEmail(shopId: string, email: string): Order[] {
  const store = getStore();
  releaseExpiredLocks(store);
  const normalized = email.trim().toLowerCase();
  return store.orders.filter(
    (o) => o.shopId === shopId && o.buyerEmail === normalized,
  );
}

export function listOrders(shopId: string): Order[] {
  const store = getStore();
  releaseExpiredLocks(store);
  return store.orders.filter((o) => o.shopId === shopId);
}

export function listInventories(
  shopId: string,
  productId?: string,
  opts?: { maskSold?: boolean },
): InventoryItem[] {
  const store = getStore();
  releaseExpiredLocks(store);
  const maskSold = opts?.maskSold ?? true;
  let items = store.inventories.filter((i) => i.shopId === shopId);
  if (productId) items = items.filter((i) => i.productId === productId);
  return items.map((i) => ({
    ...i,
    codeValue:
      maskSold && i.status === "sold"
        ? `${i.codeValue.slice(0, 4)}••••••••`
        : i.codeValue,
  }));
}

export function addInventoryCodes(
  shopId: string,
  productId: string,
  codes: string[],
  actor = "admin",
): { added: number; duplicates: number; beforeAvailable: number; productName: string } {
  const store = getStore();
  const product = store.products.find(
    (p) => p.id === productId && p.shopId === shopId,
  );
  if (!product) throw new Error("상품 없음");

  const beforeAvailable = availableCount(store, productId);

  const existing = new Set(
    store.inventories
      .filter((i) => i.productId === productId)
      .map((i) => i.codeValue),
  );

  let added = 0;
  let duplicates = 0;
  const now = new Date().toISOString();

  for (const raw of codes) {
    const code = raw.trim();
    if (!code) continue;
    if (existing.has(code)) {
      duplicates += 1;
      continue;
    }
    existing.add(code);
    store.inventories.push({
      id: randomUUID(),
      shopId,
      productId,
      codeValue: code,
      status: "available",
      orderId: null,
      lockedUntil: null,
      createdAt: now,
    });
    added += 1;
  }

  pushLog(actor, "inventory.bulk_add", { productId, added, duplicates }, shopId);
  persist(store);
  return { added, duplicates, beforeAvailable, productName: product.name };
}

/** 재고 삭제 — 판매된 재고는 주문 기록이라 지우지 않는다 */
export function deleteInventoryItems(
  shopId: string,
  ids: string[],
  actor = "admin",
): { deleted: number; skippedSold: number; productIds: string[] } {
  const store = getStore();
  const want = new Set(ids);
  let deleted = 0;
  let skippedSold = 0;
  const productIds = new Set<string>();
  store.inventories = store.inventories.filter((i) => {
    if (i.shopId !== shopId || !want.has(i.id)) return true;
    if (i.status === "sold") {
      skippedSold += 1;
      return true;
    }
    deleted += 1;
    productIds.add(i.productId);
    return false;
  });
  if (deleted > 0) {
    pushLog(actor, "inventory.delete", { deleted, productIds: [...productIds] }, shopId);
    persist(store);
  }
  return { deleted, skippedSold, productIds: [...productIds] };
}

export function adminStats(shopId: string) {
  const store = getStore();
  releaseExpiredLocks(store);
  const dispensed = store.orders.filter(
    (o) => o.shopId === shopId && o.status === "dispensed",
  );
  const revenue = dispensed.reduce((sum, o) => sum + o.amount, 0);
  const inventories = store.inventories.filter((i) => i.shopId === shopId);
  const available = inventories.filter((i) => i.status === "available").length;
  const locked = inventories.filter((i) => i.status === "locked").length;
  const sold = inventories.filter((i) => i.status === "sold").length;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const paidAtMs = (o: (typeof dispensed)[number]) =>
    o.paidAt ? new Date(o.paidAt).getTime() : 0;

  const dailyOrders = dispensed.filter((o) => paidAtMs(o) >= todayStart);
  const dailyRevenue = dailyOrders.reduce((sum, o) => sum + o.amount, 0);
  const dailyOrderCount = dailyOrders.length;
  const dailyAvgAmount = dailyOrderCount ? Math.round(dailyRevenue / dailyOrderCount) : 0;

  const yesterdayStart = todayStart - 86_400_000;
  const yesterdayRevenue = dispensed
    .filter((o) => {
      const t = paidAtMs(o);
      return t >= yesterdayStart && t < todayStart;
    })
    .reduce((sum, o) => sum + o.amount, 0);

  const monthlyRevenue = dispensed
    .filter((o) => paidAtMs(o) >= monthStart)
    .reduce((sum, o) => sum + o.amount, 0);
  const pointRevenue = store.charges
    .filter((c) => c.shopId === shopId && c.status === "completed")
    .reduce((sum, c) => sum + c.amount, 0);

  const byProduct = store.products
    .filter((p) => p.shopId === shopId)
    .map((p) => {
      const sales = dispensed.filter((o) => o.productId === p.id).length;
      return {
        productId: p.id,
        name: p.name,
        sales,
        revenue: sales * p.price,
        available: availableCount(store, p.id),
      };
    });

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthlyChart = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStart = new Date(now.getFullYear(), now.getMonth(), day).getTime();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), day + 1).getTime();
    const revenue = dispensed
      .filter((o) => {
        if (!o.paidAt) return false;
        const t = new Date(o.paidAt).getTime();
        return t >= dayStart && t < dayEnd;
      })
      .reduce((sum, o) => sum + o.amount, 0);
    return { day, revenue };
  });

  const topProduct = [...byProduct].sort((a, b) => b.sales - a.sales)[0] ?? null;

  const nowMs = now.getTime();
  const hourMs = 3_600_000;
  const hourlySeries = Array.from({ length: 12 }, (_, i) => {
    const start = nowMs - (12 - i) * hourMs;
    const end = start + hourMs;
    const count = dispensed.filter((o) => {
      const t = paidAtMs(o);
      return t >= start && t < end;
    }).length;
    return { hour: new Date(start).getHours(), count };
  });
  const hourlyRate = hourlySeries[hourlySeries.length - 1]?.count ?? 0;

  const dailySeries = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (89 - i));
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86_400_000;
    const dayOrders = dispensed.filter((o) => {
      const t = paidAtMs(o);
      return t >= dayStart && t < dayEnd;
    });
    const dayRevenue = dayOrders.reduce((sum, o) => sum + o.amount, 0);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      revenue: dayRevenue,
      orders: dayOrders.length,
    };
  });

  const last7Avg = dailySeries.slice(-7).reduce((s, d) => s + d.revenue, 0) / 7;
  const settings = getShopSettings(shopId);
  const autoGoal = Math.max(Math.round(last7Avg * 1.25) || 0, dailyRevenue, 50_000);
  const salesGoal =
    settings.salesGoalDaily && settings.salesGoalDaily > 0
      ? settings.salesGoalDaily
      : autoGoal;

  const shopProducts = store.products.filter((p) => p.shopId === shopId);
  const lowStockCount = shopProducts.filter((p) => availableCount(store, p.id) <= 5).length;
  const inventoryTotal = available + locked + sold;
  const inventoryPct = inventoryTotal ? Math.round((available / inventoryTotal) * 100) : 0;

  const recentOrders = [...dispensed]
    .sort((a, b) => paidAtMs(b) - paidAtMs(a) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((o) => {
      const product = store.products.find((p) => p.id === o.productId);
      return {
        id: o.id,
        productName: product?.name ?? "상품",
        buyerEmail: o.buyerEmail,
        amount: o.amount,
        paymentMethod: o.paymentMethod,
        paidAt: o.paidAt ?? o.createdAt,
      };
    });

  return {
    revenue,
    dailyRevenue,
    yesterdayRevenue,
    dailyOrderCount,
    dailyAvgAmount,
    monthlyRevenue,
    pointRevenue,
    orderCount: dispensed.length,
    userCount: store.users.filter((u) => u.shopId === shopId).length,
    available,
    locked,
    sold,
    inventoryPct,
    lowStockCount,
    hourlyRate,
    hourlySeries,
    dailySeries,
    salesGoal,
    byProduct,
    monthlyChart,
    topProduct,
    recentOrders,
  };
}

export function listLogs(shopId: string, limit = 50): SystemLog[] {
  return getStore()
    .logs.filter((l) => l.shopId === shopId)
    .slice(0, limit);
}

/** Reset DB file if it still has old seed without shops (dev helper) */
export function resetDatabase() {
  globalForStore.__orelStore = emptyStore();
  persist();
}

// ─── Users ───────────────────────────────────────────────────────────────

export function toPublicUser(u: ShopUser): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    bankDepositorName: u.bankDepositorName ?? null,
    avatar: u.avatar,
    points: u.points,
    totalCharged: u.totalCharged,
    discordId: u.discordId,
    discordUsername: u.discordUsername,
    theme: u.theme,
    tierId: u.tierId,
    isSubAdmin: u.isSubAdmin,
    staffPermissions: u.staffPermissions ?? [],
    banned: u.banned ?? false,
    banReason: u.banReason ?? null,
    acceptedTermsVersion: u.acceptedTermsVersion ?? null,
    acceptedPrivacyVersion: u.acceptedPrivacyVersion ?? null,
    minecraftUuid: u.minecraftUuid ?? null,
    minecraftName: u.minecraftName ?? null,
    minecraftManual: u.minecraftManual ?? false,
  };
}

// ─── Referral ────────────────────────────────────────────────────────────

/** 추천받은 사람이 산 금액 중 추천인에게 돌려주는 비율 */
export const REFERRAL_RATE = 0.05;
const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeReferralCode(store: DbStore) {
  for (;;) {
    const bytes = randomBytes(6);
    const code = [...bytes].map((b) => REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length]).join("");
    if (!store.users.some((u) => u.referralCode === code)) return code;
  }
}

export function ensureReferralCode(userId: string) {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;
  if (!user.referralCode) {
    user.referralCode = makeReferralCode(store);
    persist(store);
  }
  return user.referralCode;
}

export function getReferralSummary(shopId: string, userId: string) {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return null;
  const code = ensureReferralCode(userId);
  const referrer = user.referredBy ? store.users.find((u) => u.id === user.referredBy) : null;
  return {
    code,
    ratePercent: Math.round(REFERRAL_RATE * 100),
    referredBy: referrer
      ? { name: referrer.name || referrer.discordUsername || "회원", code: referrer.referralCode ?? null }
      : null,
    invitedCount: store.users.filter((u) => u.shopId === shopId && u.referredBy === userId).length,
    earned: user.referralEarned ?? 0,
  };
}

export function applyReferralCode(
  shopId: string,
  userId: string,
  rawCode: string,
): { ok: true; referrerName: string } | { ok: false; error: string } {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  if (user.referredBy) return { ok: false, error: "추천인은 한 번만 등록할 수 있어요." };
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "추천인 코드를 입력해 주세요." };
  const owner = store.users.find((u) => u.shopId === shopId && u.referralCode === code);
  if (!owner) return { ok: false, error: "없는 추천인 코드예요." };
  if (owner.id === user.id) return { ok: false, error: "내 코드는 등록할 수 없어요." };
  if (owner.referredBy === user.id) return { ok: false, error: "서로를 추천인으로 등록할 수는 없어요." };
  if (owner.signupIp && user.signupIp && owner.signupIp === user.signupIp) {
    return { ok: false, error: "같은 네트워크에서 만든 계정끼리는 추천할 수 없어요." };
  }
  user.referredBy = owner.id;
  pushLog(user.email, "referral.apply", { userId: user.id, referrerId: owner.id, code }, shopId);
  persist(store);
  return { ok: true, referrerName: owner.name || owner.discordUsername || "회원" };
}

/** 추천받은 사람이 결제하면 추천인에게 결제액의 REFERRAL_RATE 만큼 포인트를 준다 */
function rewardReferral(store: DbStore, shopId: string, buyer: ShopUser, paid: number, ref: string) {
  if (!buyer.referredBy || paid <= 0) return;
  const owner = store.users.find((u) => u.id === buyer.referredBy && u.shopId === shopId);
  if (!owner || owner.banned) return;
  const reward = Math.floor(paid * REFERRAL_RATE);
  if (reward <= 0) return;
  owner.points += reward;
  owner.referralEarned = (owner.referralEarned ?? 0) + reward;
  pushLog(
    "system",
    "referral.reward",
    { ownerId: owner.id, buyerId: buyer.id, paid, reward, ref },
    shopId,
  );
}

/** 관리자가 "없음" 같은 말로 비워 둔 입금 문구는 빈 값으로 본다 */
export function cleanDepositSuffix(value: string | null | undefined) {
  const v = (value ?? "").trim();
  return /^(없음|없다|무|none|null|no|x|-)$/i.test(v) ? "" : v;
}

/** 계좌 입금자명 — 기본은 최초 설정 후 고정, 웹 충전 폼에서는 overwrite 로 바꿀 수 있다 */
export function setUserBankDepositorName(
  userId: string,
  depositorName: string,
  opts?: { overwrite?: boolean },
) {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;
  const name = depositorName.trim().slice(0, 40);
  if (!name) return null;
  if (user.bankDepositorName?.trim() && !opts?.overwrite) return user;
  if (user.bankDepositorName === name) return user;
  user.bankDepositorName = name;
  persist(store);
  return user;
}

export function getUserByDiscordId(shopId: string, discordId: string): ShopUser | null {
  return (
    getStore().users.find((u) => u.shopId === shopId && u.discordId === discordId) ?? null
  );
}

export function findUsersByDiscordId(discordId: string): ShopUser[] {
  return getStore().users.filter((u) => u.discordId === discordId);
}

export function findShopByDiscordGuildId(guildId: string): Shop | null {
  const store = getStore();
  const settings = store.settings.find(
    (s) => s.discordBotEnabled && s.discordGuildId === guildId,
  );
  if (!settings) return null;
  return store.shops.find((s) => s.id === settings.shopId) ?? null;
}

/** Match shop linked to a Discord guild even if the bot flag is off. */
export function findShopLinkedToDiscordGuild(guildId: string): Shop | null {
  const store = getStore();
  const settings = store.settings.find((s) => s.discordGuildId === guildId);
  if (!settings) return null;
  return store.shops.find((s) => s.id === settings.shopId) ?? null;
}

export function findShopByDiscordApplicationId(applicationId: string): Shop | null {
  const store = getStore();
  const settings = store.settings.find(
    (s) => s.discordBotEnabled && s.discordApplicationId === applicationId,
  );
  if (!settings) return null;
  return store.shops.find((s) => s.id === settings.shopId) ?? null;
}

export function getDiscordCredentials(shopId: string) {
  const settings = getShopSettings(shopId);
  const platform = {
    publicKey: process.env.DISCORD_PUBLIC_KEY?.trim() ?? "",
    applicationId: process.env.DISCORD_APPLICATION_ID?.trim() ?? "",
    botToken: process.env.DISCORD_BOT_TOKEN?.trim() ?? "",
  };
  return {
    publicKey: settings.discordPublicKey?.trim() || platform.publicKey,
    applicationId: settings.discordApplicationId?.trim() || platform.applicationId,
    botToken: settings.discordBotToken?.trim() || platform.botToken,
    usingShopToken: Boolean(settings.discordBotToken?.trim()),
  };
}

export function createDiscordLinkCode(shopId: string, userId: string) {
  const store = getStore();
  if (!Array.isArray(store.discordLinkCodes)) store.discordLinkCodes = [];
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false as const, error: "사용자 없음" };
  // 8 hex chars — easier to type, less collision
  const code = randomBytes(4).toString("hex").toUpperCase();
  const now = Date.now();
  store.discordLinkCodes = store.discordLinkCodes.filter(
    (c) => c.userId !== userId && new Date(c.expiresAt).getTime() > now,
  );
  const entry: DiscordLinkCode = {
    code,
    shopId,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
  };
  store.discordLinkCodes.unshift(entry);
  // Caller must await persistAsync() — avoid void persist races
  return { ok: true as const, code, expiresAt: entry.expiresAt };
}

function normalizeDiscordLinkCode(raw: string) {
  let s = String(raw ?? "").trim().toUpperCase();
  s = s.replace(/^\/?연동\s*/i, "");
  s = s.replace(/^코드\s*[:=：]?\s*/i, "");
  s = s.replace(/^CODE\s*[:=]?\s*/i, "");
  s = s.replace(/[^A-Z0-9]/g, "");
  return s;
}

export function consumeDiscordLinkCode(
  shopId: string,
  code: string,
  discordId: string,
  discordUsername: string,
) {
  const store = getStore();
  if (!Array.isArray(store.discordLinkCodes)) store.discordLinkCodes = [];
  const normalized = normalizeDiscordLinkCode(code);
  if (!normalized || normalized.length < 4) {
    return { ok: false as const, error: "코드를 확인해 주세요." };
  }

  const idx = store.discordLinkCodes.findIndex(
    (c) => c.shopId === shopId && c.code === normalized,
  );

  if (idx < 0) {
    const otherIdx = store.discordLinkCodes.findIndex((c) => c.code === normalized);
    if (otherIdx >= 0) {
      const other = store.discordLinkCodes[otherIdx]!;
      if (new Date(other.expiresAt).getTime() < Date.now()) {
        store.discordLinkCodes.splice(otherIdx, 1);
        return { ok: false as const, error: "코드가 만료됐어요. 웹에서 다시 발급해 주세요." };
      }
      return {
        ok: false as const,
        error:
          "이 코드는 다른 상점용이에요. 웹에서 코드를 발급한 상점과 Discord 서버(길드) 연결이 같은지 확인해 주세요.",
      };
    }
    const pending = store.discordLinkCodes.filter(
      (c) => c.shopId === shopId && new Date(c.expiresAt).getTime() > Date.now(),
    ).length;
    return {
      ok: false as const,
      error:
        pending > 0
          ? "코드가 일치하지 않아요. 웹에 표시된 코드를 그대로 복사해 주세요."
          : "코드가 없거나 만료됐어요. 웹 설정 → Discord에서 코드를 다시 발급해 주세요.",
    };
  }

  const entry = store.discordLinkCodes[idx]!;
  if (new Date(entry.expiresAt).getTime() < Date.now()) {
    store.discordLinkCodes.splice(idx, 1);
    return { ok: false as const, error: "코드가 만료됐어요. 웹에서 다시 발급해 주세요." };
  }
  const taken = store.users.find(
    (u) => u.shopId === shopId && u.discordId === discordId && u.id !== entry.userId,
  );
  if (taken) return { ok: false as const, error: "이미 다른 계정에 연동된 디스코드예요." };
  const user = store.users.find((u) => u.id === entry.userId && u.shopId === shopId);
  if (!user) return { ok: false as const, error: "사용자 없음" };
  user.discordId = discordId;
  user.discordUsername = discordUsername;
  store.discordLinkCodes.splice(idx, 1);
  return { ok: true as const, user };
}

/** 연동된 회원의 저장된 Discord 이름이 지금 username 과 다르면 고친다. 바뀌었으면 true */
export function syncDiscordUsername(shopId: string, discordId: string, username: string) {
  const name = username.trim().slice(0, 64);
  if (!name) return false;
  const user = getStore().users.find((u) => u.shopId === shopId && u.discordId === discordId);
  if (!user || user.discordUsername === name) return false;
  user.discordUsername = name;
  return true;
}

export function unlinkDiscord(shopId: string, userId: string) {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false as const, error: "사용자 없음" };
  user.discordId = null;
  user.discordUsername = null;
  return { ok: true as const, user };
}

/**
 * 로그인한 계정에 Discord 를 연동한다.
 * 그 Discord 가 Microsoft 로그인 이전의 예전 계정에 붙어 있으면 지금 계정을 예전 계정으로 합친다
 * (예전 계정의 포인트·주문 기록을 살리기 위해). 결과의 user 가 앞으로 쓸 계정이다.
 */
export function linkDiscordToUser(input: {
  shopId: string;
  userId: string;
  discordId: string;
  discordUsername: string;
  avatar?: string | null;
}): { ok: true; user: ShopUser; merged: boolean } | { ok: false; error: string } {
  const store = getStore();
  const discordId = input.discordId.trim();
  if (!/^\d{5,30}$/.test(discordId)) return { ok: false, error: "Discord 계정 정보가 올바르지 않아요." };
  const user = store.users.find((u) => u.id === input.userId && u.shopId === input.shopId);
  if (!user) return { ok: false, error: "로그인 정보를 찾을 수 없어요. 다시 로그인해 주세요." };
  if (user.banned) return { ok: false, error: user.banReason || "이용이 제한된 계정이에요." };

  const other = store.users.find((u) => u.shopId === input.shopId && u.discordId === discordId && u.id !== user.id);
  if (!other) {
    user.discordId = discordId;
    user.discordUsername = input.discordUsername;
    if (!user.avatar && input.avatar) user.avatar = input.avatar;
    pushLog(user.email, "user.discord.link", { userId: user.id, discordId }, input.shopId);
    return { ok: true, user, merged: false };
  }
  if (other.banned) return { ok: false, error: other.banReason || "이용이 제한된 Discord 계정이에요." };
  if (other.microsoftId || other.isSubAdmin || !user.microsoftId) {
    return { ok: false, error: "이미 다른 계정에 연동된 Discord 예요." };
  }

  const settings = getShopSettings(input.shopId);
  const bonus = settings.welcomeBonusEnabled ? Math.max(0, settings.welcomeBonusPoints) : 0;
  other.microsoftId = user.microsoftId;
  other.minecraftUuid = user.minecraftUuid ?? null;
  other.minecraftName = user.minecraftName ?? null;
  other.minecraftManual = user.minecraftManual ?? false;
  if (other.minecraftName) other.name = other.minecraftName;
  other.discordUsername = input.discordUsername;
  if (input.avatar) other.avatar = input.avatar;
  other.points += Math.max(0, user.points - bonus);
  other.totalCharged += user.totalCharged;
  if (!other.bankDepositorName && user.bankDepositorName) other.bankDepositorName = user.bankDepositorName;

  const moved: { userId?: string | null }[][] = [
    store.orders,
    store.charges,
    store.reviews,
    store.wishlists,
    store.inquiries,
    store.userNotifications,
    store.randomBoxClaims,
    store.loginHistory,
  ] as unknown as { userId?: string | null }[][];
  for (const list of moved) {
    if (!Array.isArray(list)) continue;
    for (const row of list) if (row.userId === user.id) row.userId = other.id;
  }
  if (Array.isArray(store.authSessions)) {
    store.authSessions = store.authSessions.filter((s) => !(s.role === "user" && s.subjectId === user.id));
  }
  store.users = store.users.filter((u) => u.id !== user.id);
  pushLog(other.email, "user.discord.merge", { from: user.id, into: other.id, discordId }, input.shopId);
  return { ok: true, user: other, merged: true };
}

export function getUserById(id: string): ShopUser | null {
  return getStore().users.find((u) => u.id === id) ?? null;
}

export function getUserByEmail(shopId: string, email: string): ShopUser | null {
  const normalized = email.trim().toLowerCase();
  return getStore().users.find((u) => u.shopId === shopId && u.email === normalized) ?? null;
}

export function registerUser(input: {
  shopId: string;
  email: string;
  password: string;
  name: string;
  /** 가입 IP — 주면 한 아이피당 한 계정으로 제한한다 */
  ip?: string | null;
  acceptedTermsVersion?: string | null;
  acceptedPrivacyVersion?: string | null;
}): { ok: true; user: ShopUser } | { ok: false; error: string } {
  const store = getStore();
  const email = input.email.trim().toLowerCase();
  if (store.users.some((u) => u.shopId === input.shopId && u.email === email)) {
    return { ok: false, error: "이미 가입된 이메일입니다." };
  }
  const ip = input.ip?.trim() || "";
  // unknown IP(프록시 뒤 등)는 제한하지 않는다 — 전원이 못 가입하는 사고를 막기 위해
  if (ip && ip !== "unknown" && store.users.some((u) => u.shopId === input.shopId && u.signupIp === ip)) {
    return { ok: false, error: "이미 이 네트워크에서 가입한 계정이 있어요. 한 아이피당 한 계정만 가입할 수 있어요." };
  }
  const user: ShopUser = {
    id: `usr_${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    email,
    passwordHash: hashPassword(input.password),
    googleId: null,
    signupIp: ip || null,
    name: input.name.trim() || email.split("@")[0],
    bankDepositorName: null,
    avatar: null,
    points: 0,
    totalCharged: 0,
    discordId: null,
    discordUsername: null,
    theme: "dark",
    tierId: null,
    isSubAdmin: false,
    staffPermissions: [],
    banned: false,
    banReason: null,
    bannedAt: null,
    acceptedTermsVersion: input.acceptedTermsVersion ?? null,
    acceptedPrivacyVersion: input.acceptedPrivacyVersion ?? null,
    createdAt: new Date().toISOString(),
  };
  const settings = getShopSettings(input.shopId);
  if (settings.welcomeBonusEnabled && settings.welcomeBonusPoints > 0) {
    user.points = settings.welcomeBonusPoints;
    store.userNotifications.unshift({
      id: randomUUID(),
      shopId: input.shopId,
      userId: user.id,
      type: "welcome",
      title: "환영 보너스",
      body: `가입 축하 포인트 ${settings.welcomeBonusPoints.toLocaleString()}P가 지급됐어요.`,
      productId: null,
      read: false,
      createdAt: user.createdAt,
    });
  }
  store.users.unshift(user);
  pushLog(email, "user.register", { userId: user.id }, input.shopId);
  persist(store);
  return { ok: true, user };
}

export function loginUser(shopId: string, email: string, password: string) {
  const user = getUserByEmail(shopId, email);
  if (!user || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  if (user.banned) return null;
  return user;
}

export function upsertDiscordUser(input: {
  shopId: string;
  discordId: string;
  discordUsername: string;
  email?: string | null;
  avatar?: string | null;
  acceptedTermsVersion?: string | null;
  acceptedPrivacyVersion?: string | null;
}): { ok: true; user: ShopUser; created: boolean } | { ok: false; error: string } {
  const store = getStore();
  const discordId = input.discordId.trim();
  if (!/^\d{5,30}$/.test(discordId)) {
    return { ok: false, error: "Discord 계정 정보가 올바르지 않아요." };
  }

  const existing = store.users.find(
    (u) => u.shopId === input.shopId && u.discordId === discordId,
  );
  if (existing) {
    if (existing.banned) {
      return { ok: false, error: existing.banReason || "이용이 제한된 계정이에요." };
    }
    existing.discordUsername = input.discordUsername;
    if (input.avatar) existing.avatar = input.avatar;
    if (!existing.name?.trim()) existing.name = input.discordUsername;
    persist(store);
    return { ok: true, user: existing, created: false };
  }

  const placeholder = `discord_${discordId}@users.vendix.local`;
  let email = input.email?.trim().toLowerCase() || placeholder;
  const byEmail = store.users.find((u) => u.shopId === input.shopId && u.email === email);
  // 비밀번호 계정은 이메일만으로 합치지 않음 (가입 시 이메일 인증이 없어 선점·탈취 가능) — 계정 설정에서 직접 연동
  if (byEmail && byEmail.passwordHash) {
    email = placeholder;
  } else if (byEmail) {
    if (byEmail.banned) {
      return { ok: false, error: byEmail.banReason || "이용이 제한된 계정이에요." };
    }
    if (byEmail.discordId && byEmail.discordId !== discordId) {
      return { ok: false, error: "이미 다른 Discord 계정이 연동된 이메일이에요." };
    }
    byEmail.discordId = discordId;
    byEmail.discordUsername = input.discordUsername;
    if (input.avatar) byEmail.avatar = input.avatar;
    if (input.acceptedTermsVersion) byEmail.acceptedTermsVersion = input.acceptedTermsVersion;
    if (input.acceptedPrivacyVersion) {
      byEmail.acceptedPrivacyVersion = input.acceptedPrivacyVersion;
    }
    persist(store);
    return { ok: true, user: byEmail, created: false };
  }

  const taken = store.users.find(
    (u) => u.shopId === input.shopId && u.discordId === discordId,
  );
  if (taken) {
    return { ok: false, error: "이미 연동된 Discord 계정이에요." };
  }

  const now = new Date().toISOString();
  const user: ShopUser = {
    id: `usr_${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    email,
    passwordHash: null,
    googleId: null,
    name: input.discordUsername,
    bankDepositorName: null,
    avatar: input.avatar ?? null,
    points: 0,
    totalCharged: 0,
    discordId,
    discordUsername: input.discordUsername,
    theme: "dark",
    tierId: null,
    isSubAdmin: false,
    staffPermissions: [],
    banned: false,
    banReason: null,
    bannedAt: null,
    acceptedTermsVersion: input.acceptedTermsVersion ?? null,
    acceptedPrivacyVersion: input.acceptedPrivacyVersion ?? null,
    createdAt: now,
  };

  grantWelcomeBonus(store, user);

  store.users.unshift(user);
  pushLog(email, "user.discord", { userId: user.id, discordId }, input.shopId);
  persist(store);
  return { ok: true, user, created: true };
}

/** 새로 가입한 유저에게 상점 설정의 환영 포인트를 준다 */
function grantWelcomeBonus(store: ReturnType<typeof getStore>, user: ShopUser) {
  const settings = getShopSettings(user.shopId);
  if (!settings.welcomeBonusEnabled || settings.welcomeBonusPoints <= 0) return;
  user.points = settings.welcomeBonusPoints;
  store.userNotifications.unshift({
    id: randomUUID(),
    shopId: user.shopId,
    userId: user.id,
    type: "welcome",
    title: "환영 보너스",
    body: `가입 축하 포인트 ${settings.welcomeBonusPoints.toLocaleString()}P가 지급됐어요.`,
    productId: null,
    read: false,
    createdAt: user.createdAt,
  });
}

/**
 * Microsoft 계정 로그인. 이메일로 기존 계정과 자동 연결하지 않는다
 * (다른 사람이 같은 이메일을 주장해 남의 계정에 들어가는 것을 막기 위해 Microsoft 고유 ID로만 찾는다).
 */
export function upsertMicrosoftUser(input: {
  shopId: string;
  microsoftId: string;
  name: string;
  email?: string | null;
  acceptedTermsVersion?: string | null;
  acceptedPrivacyVersion?: string | null;
  /** undefined 면 조회 실패 — 예전 값을 그대로 둔다. null 이면 마인크래프트를 안 가진 계정 */
  minecraft?: { uuid: string; name: string } | null;
}): { ok: true; user: ShopUser; created: boolean } | { ok: false; error: string } {
  const store = getStore();
  const microsoftId = input.microsoftId.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(microsoftId)) {
    return { ok: false, error: "Microsoft 계정 정보가 올바르지 않아요." };
  }
  const name = input.name.trim().slice(0, 40) || "Microsoft 사용자";

  const existing = store.users.find((u) => u.shopId === input.shopId && u.microsoftId === microsoftId);
  if (existing) {
    if (existing.banned) {
      return { ok: false, error: existing.banReason || "이용이 제한된 계정이에요." };
    }
    if (!existing.name?.trim()) existing.name = name;
    if (input.minecraft) {
      existing.minecraftUuid = input.minecraft.uuid;
      existing.minecraftName = input.minecraft.name;
      existing.minecraftManual = false;
    } else if (input.minecraft === null && !existing.minecraftManual) {
      existing.minecraftUuid = null;
      existing.minecraftName = null;
    }
    if (existing.minecraftName) existing.name = existing.minecraftName;
    persist(store);
    return { ok: true, user: existing, created: false };
  }

  const wanted = input.email?.trim().toLowerCase() || "";
  const emailTaken = !wanted || store.users.some((u) => u.shopId === input.shopId && u.email === wanted);
  const email = emailTaken ? `ms_${microsoftId.slice(0, 24).toLowerCase()}@users.vendix.local` : wanted;

  const user: ShopUser = {
    id: `usr_${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    email,
    passwordHash: null,
    googleId: null,
    microsoftId,
    minecraftUuid: input.minecraft?.uuid ?? null,
    minecraftName: input.minecraft?.name ?? null,
    name: input.minecraft?.name || name,
    bankDepositorName: null,
    avatar: null,
    points: 0,
    totalCharged: 0,
    discordId: null,
    discordUsername: null,
    theme: "dark",
    tierId: null,
    isSubAdmin: false,
    staffPermissions: [],
    banned: false,
    banReason: null,
    bannedAt: null,
    acceptedTermsVersion: input.acceptedTermsVersion ?? null,
    acceptedPrivacyVersion: input.acceptedPrivacyVersion ?? null,
    createdAt: new Date().toISOString(),
  };
  grantWelcomeBonus(store, user);
  store.users.unshift(user);
  pushLog(email, "user.microsoft", { userId: user.id }, input.shopId);
  persist(store);
  return { ok: true, user, created: true };
}

export function upsertGoogleUser(input: {
  shopId: string;
  googleId: string;
  email: string;
  name: string;
  avatar: string | null;
}): ShopUser {
  const store = getStore();
  let user = store.users.find(
    (u) => u.shopId === input.shopId && (u.googleId === input.googleId || u.email === input.email),
  );
  if (user) {
    user.googleId = input.googleId;
    user.name = input.name;
    user.avatar = input.avatar;
    persist(store);
    return user;
  }
  user = {
    id: `usr_${randomUUID().slice(0, 8)}`,
    shopId: input.shopId,
    email: input.email.trim().toLowerCase(),
    passwordHash: null,
    googleId: input.googleId,
    name: input.name,
    bankDepositorName: null,
    avatar: input.avatar,
    points: 0,
    totalCharged: 0,
    discordId: null,
    discordUsername: null,
    theme: "dark",
    tierId: null,
    isSubAdmin: false,
    staffPermissions: [],
    banned: false,
    banReason: null,
    bannedAt: null,
    acceptedTermsVersion: null,
    acceptedPrivacyVersion: null,
    createdAt: new Date().toISOString(),
  };
  store.users.unshift(user);
  pushLog(input.email, "user.google", { userId: user.id }, input.shopId);
  persist(store);
  return user;
}

/**
 * Microsoft 쪽 확인이 안 될 때(정품 프로필 조회 불가) 본인이 자바 닉네임을 직접 등록한다.
 * 확인된 정품 프로필이 있으면 바꿀 수 없고, 같은 상점에서 한 닉네임은 한 계정만 쓴다.
 */
export function setManualMinecraftName(
  userId: string,
  profile: { uuid: string; name: string } | null,
): { ok: true; user: ShopUser } | { ok: false; error: string } {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: "사용자를 찾을 수 없어요." };
  if (user.minecraftUuid && !user.minecraftManual) {
    return { ok: false, error: "Microsoft 계정으로 확인된 마인크래프트 닉네임은 바꿀 수 없어요." };
  }
  if (!profile) {
    user.minecraftUuid = null;
    user.minecraftName = null;
    user.minecraftManual = false;
    persist(store);
    return { ok: true, user };
  }
  const taken = store.users.find((u) => u.shopId === user.shopId && u.id !== user.id && u.minecraftUuid === profile.uuid);
  if (taken) return { ok: false, error: "이미 다른 계정이 쓰고 있는 닉네임이에요." };
  user.minecraftUuid = profile.uuid;
  user.minecraftName = profile.name;
  user.minecraftManual = true;
  user.name = profile.name;
  persist(store);
  return { ok: true, user };
}

export function updateUserProfile(
  userId: string,
  patch: Partial<Pick<ShopUser, "name" | "theme">>,
) {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) throw new Error("사용자 없음");
  if (patch.name !== undefined && !user.minecraftName) user.name = patch.name.trim();
  if (patch.theme !== undefined) user.theme = patch.theme;
  persist(store);
  return user;
}

export function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { ok: false; error: string } {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user || !user.passwordHash) {
    return { ok: false, error: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다." };
  }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: "새 비밀번호는 6자 이상이어야 합니다." };
  }
  user.passwordHash = hashPassword(newPassword);
  persist(store);
  return { ok: true };
}

export function changeUserEmail(
  userId: string,
  newEmail: string,
  password: string,
): { ok: true; user: ShopUser } | { ok: false; error: string } {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user || !user.passwordHash) {
    return { ok: false, error: "소셜 로그인 계정은 이메일을 변경할 수 없습니다." };
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: "비밀번호가 올바르지 않습니다." };
  }
  const email = newEmail.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "올바른 이메일을 입력하세요." };
  if (store.users.some((u) => u.shopId === user.shopId && u.email === email && u.id !== userId)) {
    return { ok: false, error: "이미 사용 중인 이메일입니다." };
  }
  user.email = email;
  persist(store);
  return { ok: true, user };
}

export function resolveUserTier(shopId: string, user: ShopUser): ShopTier | null {
  const tiers = getStore()
    .tiers.filter((t) => t.shopId === shopId)
    .sort((a, b) => b.minTotalCharged - a.minTotalCharged);
  if (user.tierId) {
    const assigned = tiers.find((t) => t.id === user.tierId);
    if (assigned) return assigned;
  }
  return tiers.find((t) => user.totalCharged >= t.minTotalCharged) ?? null;
}

export function createInquiry(input: {
  shopId: string;
  userId: string;
  subject: string;
  body: string;
}): ShopInquiry {
  const store = getStore();
  const now = new Date().toISOString();
  const inquiry: ShopInquiry = {
    id: randomUUID(),
    shopId: input.shopId,
    userId: input.userId,
    subject: input.subject.trim() || input.body.trim().slice(0, 40) || "문의",
    body: input.body.trim(),
    status: "open",
    reply: null,
    repliedAt: null,
    discordChannelId: null,
    discordMessageId: null,
    createdAt: now,
    messages: [
      {
        id: randomUUID(),
        from: "user",
        body: input.body.trim(),
        createdAt: now,
      },
    ],
    aiEnabled: true,
    adminJoinedAt: null,
  };
  store.inquiries.unshift(inquiry);
  pushLog(input.userId, "inquiry.create", { inquiryId: inquiry.id }, input.shopId);
  persist(store);

  // Discord 관리 로그 채널에 티켓 동기화
  const settings = getShopSettings(input.shopId);
  const user = store.users.find((u) => u.id === input.userId);
  const channelId = settings.discordAdminLogChannelId;
  if (channelId) {
    void import("@/lib/discord/rest").then(async ({ postChannelMessage }) => {
      const { separator, textDisplay, v2Message } = await import("@/lib/discord/components");
      const res = await postChannelMessage(
        channelId,
        v2Message([
          textDisplay("## 새 문의 티켓"),
          textDisplay(`**${inquiry.subject}**\n${inquiry.body.slice(0, 800)}`),
          separator(true, 1),
          textDisplay(`**유저** ${user?.email ?? input.userId}\n**티켓** ${inquiry.id.slice(0, 8)}`),
          textDisplay(`-# <t:${Math.floor(new Date(inquiry.createdAt).getTime() / 1000)}:f>`),
        ]),
        input.shopId,
      );
      if (res.ok && res.json && typeof res.json === "object") {
        const s = getStore();
        const row = s.inquiries.find((i) => i.id === inquiry.id);
        if (row) {
          row.discordChannelId = channelId;
          row.discordMessageId = (res.json as { id?: string }).id ?? null;
          persist(s);
        }
      }
    });
  }

  return inquiry;
}

export function replyInquiry(
  shopId: string,
  inquiryId: string,
  reply: string,
  actor = "admin",
) {
  const store = getStore();
  const inquiry = store.inquiries.find((i) => i.id === inquiryId && i.shopId === shopId);
  if (!inquiry) return null;
  const now = new Date().toISOString();
  const text = reply.trim();
  inquiry.reply = text;
  inquiry.status = "answered";
  inquiry.repliedAt = now;
  inquiry.aiEnabled = false;
  inquiry.adminJoinedAt = inquiry.adminJoinedAt || now;
  inquiry.messages = inquiry.messages ?? [];
  inquiry.messages.push({
    id: randomUUID(),
    from: "admin",
    body: text,
    createdAt: now,
  });
  pushLog(actor, "inquiry.reply", { inquiryId }, shopId);
  persist(store);

  if (inquiry.discordChannelId) {
    void Promise.all([import("@/lib/discord/rest"), import("@/lib/discord/components")]).then(
      ([{ postChannelMessage }, { separator, textDisplay, v2Message }]) =>
        postChannelMessage(
          inquiry.discordChannelId!,
          v2Message([
            textDisplay(`## 문의 답변 · 티켓 \`${inquiry.id.slice(0, 8)}\``),
            separator(true, 1),
            textDisplay(reply.trim().slice(0, 1800)),
          ]),
          shopId,
        ),
    );
  }
  return inquiry;
}

export function listUserInquiries(shopId: string, userId: string) {
  return getStore().inquiries.filter((i) => i.shopId === shopId && i.userId === userId).map(normalizeInquiry);
}

export function listInquiriesAdmin(shopId: string) {
  return getStore().inquiries.filter((i) => i.shopId === shopId).map(normalizeInquiry);
}

export function getLatestInquiryForUser(shopId: string, userId: string) {
  const row = getStore().inquiries.find((i) => i.shopId === shopId && i.userId === userId);
  return row ? normalizeInquiry(row) : null;
}

export function appendInquiryUserMessage(
  shopId: string,
  userId: string,
  body: string,
): { inquiry: ShopInquiry; created: boolean } {
  const text = body.trim();
  if (!text) throw new Error("내용을 입력해 주세요.");
  const store = getStore();
  const inquiry = store.inquiries.find((i) => i.shopId === shopId && i.userId === userId);
  const now = new Date().toISOString();
  if (!inquiry) {
    const created = createInquiry({
      shopId,
      userId,
      subject: text.slice(0, 40),
      body: text,
    });
    return { inquiry: created, created: true };
  }
  const row = normalizeInquiry(inquiry);
  row.messages.push({
    id: randomUUID(),
    from: "user",
    body: text,
    createdAt: now,
  });
  row.body = text;
  Object.assign(inquiry, row);
  persist(store);
  return { inquiry, created: false };
}

export function appendInquiryAiMessage(shopId: string, inquiryId: string, body: string) {
  const store = getStore();
  const inquiry = store.inquiries.find((i) => i.id === inquiryId && i.shopId === shopId);
  if (!inquiry) return null;
  const row = normalizeInquiry(inquiry);
  if (!row.aiEnabled) return row;
  const now = new Date().toISOString();
  row.messages.push({
    id: randomUUID(),
    from: "ai",
    body: body.trim(),
    createdAt: now,
  });
  Object.assign(inquiry, row);
  persist(store);
  return inquiry;
}

export function listUsers(shopId: string) {
  return getStore().users.filter((u) => u.shopId === shopId);
}

// ─── Settings ────────────────────────────────────────────────────────────

export function getShopSettings(shopId: string): ShopSettings {
  const store = getStore();
  let settings = store.settings.find((s) => s.shopId === shopId);
  if (!settings) {
    settings = defaultSettings(shopId);
    store.settings.push(settings);
    persist(store);
  } else if (settings.autoChargeEnabled === undefined) {
    settings.autoChargeEnabled = true;
    persist(store);
  }
  const suffix = cleanDepositSuffix(settings.depositSuffixPhrase);
  if (settings.depositSuffixPhrase !== suffix) {
    settings.depositSuffixPhrase = suffix;
    persist(store);
  }
  if (settings.autoChargeCultureGift === undefined) settings.autoChargeCultureGift = true;
  if (settings.autoChargeCoin === undefined) settings.autoChargeCoin = true;
  if (settings.pushbulletAccessToken === undefined) settings.pushbulletAccessToken = null;
  if (settings.pushbulletEnabled === undefined) settings.pushbulletEnabled = false;
  if (settings.iosGenToken === undefined) settings.iosGenToken = null;
  if (settings.cryptoWalletAddress === undefined) settings.cryptoWalletAddress = null;
  if (settings.cryptoWalletLabel === undefined) settings.cryptoWalletLabel = null;
  if (settings.cultureGiftEnabled === undefined) settings.cultureGiftEnabled = false;
  if (settings.culturelandId === undefined) settings.culturelandId = null;
  if (settings.culturelandPassword === undefined) settings.culturelandPassword = null;
  if (settings.nowpaymentsEnabled === undefined) settings.nowpaymentsEnabled = false;
  if (settings.nowpaymentsApiKey === undefined) settings.nowpaymentsApiKey = null;
  if (settings.nowpaymentsIpnSecret === undefined) settings.nowpaymentsIpnSecret = null;
  if (settings.nowpaymentsPayCurrency === undefined) settings.nowpaymentsPayCurrency = "usdttrc20";
  if (settings.adminIpWhitelist === undefined) settings.adminIpWhitelist = [];
  if (settings.lowStockThreshold === undefined) settings.lowStockThreshold = 5;
  if (settings.lowStockAlertsEnabled === undefined) settings.lowStockAlertsEnabled = true;
  if (settings.salesGoalDaily === undefined) settings.salesGoalDaily = null;
  if (settings.discordBotEnabled === undefined) settings.discordBotEnabled = false;
  if (settings.discordGuildId === undefined) settings.discordGuildId = null;
  if (settings.discordOwnerId === undefined) settings.discordOwnerId = null;
  if (settings.discordOwnerUsername === undefined) settings.discordOwnerUsername = null;
  if (settings.discordOwnerAvatar === undefined) settings.discordOwnerAvatar = null;
  if (settings.discordPurchaseLogChannelId === undefined) settings.discordPurchaseLogChannelId = null;
  if (settings.discordChargeLogChannelId === undefined) settings.discordChargeLogChannelId = null;
  if (settings.discordAdminLogChannelId === undefined) settings.discordAdminLogChannelId = null;
  if (settings.discordReviewLogChannelId === undefined) settings.discordReviewLogChannelId = null;
  if (settings.discordRestockLogChannelId === undefined) settings.discordRestockLogChannelId = null;
  if (settings.discordRestockRoleId === undefined) settings.discordRestockRoleId = null;
  if (settings.discordRandomBoxLogChannelId === undefined) settings.discordRandomBoxLogChannelId = null;
  if (settings.discordStockChannelId === undefined) settings.discordStockChannelId = null;
  if (settings.discordStockMessageId === undefined) settings.discordStockMessageId = null;
  if (!Array.isArray(settings.spendRoles)) settings.spendRoles = [];
  if (settings.discordAdminRoleId === undefined) settings.discordAdminRoleId = null;
  if (settings.discordBotToken === undefined) settings.discordBotToken = null;
  if (settings.discordApplicationId === undefined) settings.discordApplicationId = null;
  if (settings.discordPublicKey === undefined) settings.discordPublicKey = null;
  if (settings.discordEmbedTitle === undefined) settings.discordEmbedTitle = "자판기";
  if (settings.discordEmbedDescription === undefined) {
    settings.discordEmbedDescription = "원하는 메뉴를 선택하세요.";
  }
  if (settings.discordEmbedColor === undefined) settings.discordEmbedColor = 0x5865f2;
  if (settings.discordShowNotices === undefined) settings.discordShowNotices = true;
  if (settings.discordShowProducts === undefined) settings.discordShowProducts = true;
  if (settings.discordShowBuy === undefined) settings.discordShowBuy = true;
  if (settings.discordShowCharge === undefined) settings.discordShowCharge = true;
  if (settings.discordShowInfo === undefined) settings.discordShowInfo = true;
  if (settings.discordBtnStyleNotices === undefined) settings.discordBtnStyleNotices = 2;
  if (settings.discordBtnStyleProducts === undefined) settings.discordBtnStyleProducts = 1;
  if (settings.discordBtnStyleBuy === undefined) settings.discordBtnStyleBuy = 3;
  if (settings.discordBtnStyleCharge === undefined) settings.discordBtnStyleCharge = 3;
  if (settings.discordBtnStyleInfo === undefined) settings.discordBtnStyleInfo = 2;
  if (settings.discordBtnLabelNotices === undefined) settings.discordBtnLabelNotices = "공지";
  if (settings.discordBtnLabelProducts === undefined) settings.discordBtnLabelProducts = "제품";
  if (settings.discordBtnLabelBuy === undefined) settings.discordBtnLabelBuy = "구매";
  if (settings.discordBtnLabelCharge === undefined) settings.discordBtnLabelCharge = "충전";
  if (settings.discordBtnLabelInfo === undefined) settings.discordBtnLabelInfo = "정보";
  if (settings.discordPurchaseLogTitle === undefined) settings.discordPurchaseLogTitle = "구매 로그";
  if (settings.discordPurchaseLogTemplate === undefined) {
    settings.discordPurchaseLogTemplate =
      "**{user}** 구매\n상품 `{product}`\n금액 **{amount}**\n주문 `{order}`";
  }
  if (settings.discordReviewLogTitle === undefined) settings.discordReviewLogTitle = "후기 로그";
  if (settings.discordReviewLogTemplate === undefined) {
    settings.discordReviewLogTemplate = "{product}\n{body}";
  }
  if (settings.bannerAdsEnabled === undefined) settings.bannerAdsEnabled = true;
  if (settings.bannerWeeklyPrice === undefined) settings.bannerWeeklyPrice = 5000;
  if (settings.bannerMonthlyPrice === undefined) settings.bannerMonthlyPrice = 15000;
  if (settings.koreaOnlyAccess === undefined) settings.koreaOnlyAccess = false;
  if (settings.blockVpnProxy === undefined) settings.blockVpnProxy = false;
  if (settings.maskPiiInAdmin === undefined) settings.maskPiiInAdmin = true;
  if (settings.loginMicrosoftEnabled === undefined) settings.loginMicrosoftEnabled = true;
  if (settings.loginDiscordEnabled === undefined) settings.loginDiscordEnabled = true;
  if (settings.termsVersion === undefined) settings.termsVersion = "1.0";
  if (settings.termsBody === undefined) {
    settings.termsBody =
      "본 상점 이용 시 서비스 정책과 디지털 상품 특성(교환·환불 제한 등)에 동의합니다. 부정 이용 시 이용이 제한될 수 있습니다.";
  }
  if (settings.privacyVersion === undefined) settings.privacyVersion = "1.0";
  if (settings.privacyBody === undefined) {
    settings.privacyBody =
      "이메일·닉네임·결제·주문 정보는 서비스 제공과 고객 지원 목적으로만 처리하며, 관련 법령에 따라 보관·삭제됩니다.";
  }
  if (settings.restockNotifyEnabled === undefined) settings.restockNotifyEnabled = true;
  if (settings.autoExpireChargesEnabled === undefined) settings.autoExpireChargesEnabled = true;
  if (settings.chargeExpireMinutes === undefined) settings.chargeExpireMinutes = 10;
  if (settings.dailySalesDigestEnabled === undefined) settings.dailySalesDigestEnabled = false;
  if (settings.dailyDigestHourKst === undefined) settings.dailyDigestHourKst = 9;
  if (settings.lastDailyDigestAt === undefined) settings.lastDailyDigestAt = null;
  if (settings.bannerAutoApprove === undefined) settings.bannerAutoApprove = false;
  if (settings.tierUpgradeNotifyEnabled === undefined) settings.tierUpgradeNotifyEnabled = true;
  if (settings.welcomeBonusEnabled === undefined) settings.welcomeBonusEnabled = false;
  if (settings.welcomeBonusPoints === undefined) settings.welcomeBonusPoints = 1000;
  return settings;
}

export function regenerateDeviceKey(shopId: string): string {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점 없음");
  shop.androidDeviceKey = makeDeviceKey();
  pushLog("admin", "android.key_regenerated", {}, shopId);
  persist(store);
  return shop.androidDeviceKey;
}

export function updateShopSettings(shopId: string, patch: Partial<Omit<ShopSettings, "shopId">>) {
  const store = getStore();
  const settings = getShopSettings(shopId);
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (settings as Record<string, unknown>)[key] = value;
    }
  }
  pushLog("admin", "settings.update", patch, shopId);
  persist(store);
  return settings;
}

/** MFA MARKET 연동 설정 저장. API 키가 활동 로그에 남지 않도록 updateShopSettings 를 거치지 않는다 */
export function saveMfaSettings(shopId: string, input: { url?: string | null; key?: string | null }) {
  const store = getStore();
  const settings = getShopSettings(shopId);
  if (input.url !== undefined) settings.mfaApiUrl = input.url?.trim().replace(/\/+$/, "") || null;
  if (input.key !== undefined) settings.mfaApiKey = input.key?.trim() || null;
  pushLog(
    "admin",
    "settings.mfa",
    { url: settings.mfaApiUrl ?? null, keySet: Boolean(settings.mfaApiKey) },
    shopId,
  );
  persist(store);
  return settings;
}

/** MFA MARKET 연동(주소+키)이 설정된 상점 ID */
export function listMfaShopIds() {
  return getStore()
    .settings.filter((s) => s.mfaApiUrl?.trim() && s.mfaApiKey?.trim())
    .map((s) => s.shopId);
}

export function listMfaProducts(shopId?: string) {
  return getStore().products.filter((p) => p.mfaProduct && (!shopId || p.shopId === shopId));
}

/** 재고 캐시만 갱신한다 (KV 저장 없음). 주문이 생길 때 함께 저장된다 */
export function setMfaStock(productId: string, count: number) {
  const product = getStore().products.find((p) => p.id === productId);
  if (!product || !product.mfaProduct) return;
  product.mfaStock = Math.max(0, Math.floor(count));
  product.mfaStockAt = new Date().toISOString();
  setMfaStockCache(productId, count);
}

export function updateShopBank(
  shopId: string,
  bank: Partial<Pick<Shop, "bankName" | "bankAccount" | "bankHolder">>,
) {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점 없음");
  if (bank.bankName !== undefined) shop.bankName = bank.bankName;
  if (bank.bankAccount !== undefined) shop.bankAccount = bank.bankAccount;
  if (bank.bankHolder !== undefined) shop.bankHolder = bank.bankHolder;
  persist(store);
  return shop;
}

export function updateShopProfile(
  shopId: string,
  patch: Partial<Pick<Shop, "name" | "tagline" | "logoUrl">>,
) {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점 없음");
  if (patch.name !== undefined) {
    const name = patch.name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error("상호명을 입력해 주세요.");
    if (isShopDisplayNameTaken(store, name, shopId)) {
      throw new Error("이미 사용 중인 상호명입니다.");
    }
    shop.name = name;
  }
  if (patch.tagline !== undefined) shop.tagline = patch.tagline.trim();
  if (patch.logoUrl !== undefined) {
    shop.logoUrl = patch.logoUrl?.trim() || null;
  }
  pushLog("admin", "shop.profile_update", patch, shopId);
  persist(store);
  return shop;
}

export function updateShopAdminCredentials(
  shopId: string,
  patch: { adminUsername?: string; adminPassword?: string },
) {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) throw new Error("상점 없음");
  if (patch.adminUsername !== undefined) {
    const username = patch.adminUsername.trim();
    if (!username) throw new Error("관리자 아이디를 입력해 주세요.");
    shop.adminUsername = username;
  }
  if (patch.adminPassword !== undefined && patch.adminPassword.length > 0) {
    if (patch.adminPassword.length < 4) {
      throw new Error("비밀번호는 4자 이상이어야 합니다.");
    }
    shop.adminPasswordHash = hashPassword(patch.adminPassword);
  }
  pushLog("admin", "shop.admin_update", { adminUsername: patch.adminUsername }, shopId);
  persist(store);
  return shop;
}

// ─── Notices & Events ────────────────────────────────────────────────────

export function listNotices(shopId: string) {
  return getStore()
    .notices.filter((n) => n.shopId === shopId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export function createNotice(shopId: string, title: string, body: string, pinned = false) {
  const store = getStore();
  const notice: Notice = {
    id: randomUUID(),
    shopId,
    title: title.trim(),
    body: body.trim(),
    pinned,
    createdAt: new Date().toISOString(),
  };
  store.notices.unshift(notice);
  persist(store);
  return notice;
}

// ─── Platform notices (vendix.team) ─────────────────────────────────────

export function listPlatformNotices() {
  return (getStore().platformNotices ?? [])
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export function getPlatformNotice(id: string) {
  return getStore().platformNotices.find((n) => n.id === id) ?? null;
}

export function createPlatformNotice(title: string, body: string, pinned = false) {
  const store = getStore();
  const notice: PlatformNotice = {
    id: randomUUID(),
    title: title.trim(),
    body: body.trim(),
    pinned,
    createdAt: new Date().toISOString(),
  };
  store.platformNotices.unshift(notice);
  persist(store);
  return notice;
}

export function deletePlatformNotice(id: string) {
  const store = getStore();
  const idx = store.platformNotices.findIndex((n) => n.id === id);
  if (idx === -1) return false;
  store.platformNotices.splice(idx, 1);
  persist(store);
  return true;
}

export function updatePlatformNotice(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
): PlatformNotice | null {
  const store = getStore();
  const notice = store.platformNotices.find((n) => n.id === id);
  if (!notice) return null;

  if (patch.title !== undefined) notice.title = patch.title.trim();
  if (patch.body !== undefined) notice.body = patch.body.trim();
  if (patch.pinned !== undefined) notice.pinned = patch.pinned;

  persist(store);
  return notice;
}

export function listEvents(shopId: string) {
  const now = Date.now();
  return getStore()
    .events.filter((e) => e.shopId === shopId && e.active)
    .filter((e) => new Date(e.endsAt).getTime() >= now);
}

export function createEvent(
  shopId: string,
  input: Omit<ShopEvent, "id" | "shopId">,
) {
  const store = getStore();
  const event: ShopEvent = { id: randomUUID(), shopId, ...input };
  store.events.unshift(event);
  persist(store);
  return event;
}

// ─── Point charges ───────────────────────────────────────────────────────

/** 대기 충전 자동 만료 (pending → expired) */
export function expireShopPendingCharges(shopId: string, maxAgeMinutes?: number) {
  const store = getStore();
  const settings = getShopSettings(shopId);
  if (settings.autoExpireChargesEnabled === false) return 0;
  const mins = Math.max(1, maxAgeMinutes ?? settings.chargeExpireMinutes ?? 10);
  const now = Date.now();
  const fallbackCutoff = now - mins * 60 * 1000;
  let expired = 0;
  for (const c of store.charges) {
    if (c.shopId !== shopId || c.status !== "pending") continue;
    // 코인 결제는 NOWPayments 웹훅이 끝을 정한다
    if (c.nowpaymentsId) continue;
    // expiresAt이 있으면 그 시각만 사용 — fallbackCutoff와 OR하면 TTL을 늘려도 조기 만료됨
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
  if (expired) persist(store);
  return expired;
}

export function createPointCharge(
  shopId: string,
  userId: string,
  amount: number,
  method: ChargeMethod = "bank",
  expectedDepositorName?: string | null,
) {
  const store = getStore();
  const settings = getShopSettings(shopId);
  const ttlMs = Math.max(1, settings.chargeExpireMinutes ?? 10) * 60 * 1000;
  const now = Date.now();
  const charge: PointCharge = {
    id: randomUUID(),
    shopId,
    userId,
    amount,
    method,
    reference: randomBytes(4).toString("hex").toUpperCase(),
    depositorName: method === "bank" ? (expectedDepositorName?.trim() || null) : null,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    completedAt: null,
    failReason: null,
    nowpaymentsId: null,
    payAddress: null,
    payAmount: null,
    payCurrency: null,
    discordLogChannelId: null,
    discordLogMessageId: null,
    discordApplicationId: null,
    discordInteractionToken: null,
  };
  store.charges.unshift(charge);
  persist(store);
  return charge;
}

export function getUserPendingBankCharge(shopId: string, userId: string) {
  return (
    getStore().charges.find(
      (c) =>
        c.shopId === shopId &&
        c.userId === userId &&
        c.status === "pending" &&
        c.method === "bank",
    ) ?? null
  );
}

export function cancelUserPointCharge(chargeId: string, shopId: string, userId: string) {
  const store = getStore();
  const charge = store.charges.find(
    (c) => c.id === chargeId && c.shopId === shopId && c.userId === userId,
  );
  if (!charge) return { ok: false as const, error: "충전 요청 없음" };
  if (charge.status !== "pending") return { ok: false as const, error: "이미 처리된 요청이에요." };
  charge.status = "cancelled";
  pushLog("user", "charge.cancel", { chargeId, method: charge.method }, shopId);
  persist(store);
  return { ok: true as const, charge };
}

export function listPendingCharges(shopId: string) {
  expireShopPendingCharges(shopId);
  return getStore().charges.filter((c) => c.shopId === shopId && c.status === "pending");
}

export function listRecentCharges(shopId: string, limit = 40) {
  expireShopPendingCharges(shopId);
  return getStore()
    .charges.filter((c) => c.shopId === shopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function getPointCharge(chargeId: string, shopId: string) {
  return getStore().charges.find((c) => c.id === chargeId && c.shopId === shopId) ?? null;
}

export function attachChargePayment(
  chargeId: string,
  shopId: string,
  payment: {
    nowpaymentsId: string;
    payAddress: string;
    payAmount: number;
    payCurrency: string;
  },
) {
  const store = getStore();
  const charge = store.charges.find((c) => c.id === chargeId && c.shopId === shopId);
  if (!charge) return null;
  charge.nowpaymentsId = payment.nowpaymentsId;
  charge.payAddress = payment.payAddress;
  charge.payAmount = payment.payAmount;
  charge.payCurrency = payment.payCurrency;
  persist(store);
  return charge;
}

export function confirmPointCharge(
  chargeId: string,
  shopId: string,
  depositorName: string,
  amount?: number,
  opts?: { resultLabel?: string; /** 관리자가 직접 확인 — 늦게 들어온 입금도 승인 */ manual?: boolean },
): { ok: true; charge: PointCharge } | { ok: false; error: string } {
  const store = getStore();
  const charge = store.charges.find((c) => c.id === chargeId && c.shopId === shopId);
  if (!charge) return { ok: false, error: "충전 요청 없음" };
  if (charge.status === "completed") return { ok: true, charge };
  const lateManual = opts?.manual && charge.status === "expired";
  if (charge.status !== "pending" && !lateManual) {
    return { ok: false, error: "이미 처리되었거나 만료된 요청이에요." };
  }
  const settings = getShopSettings(shopId);
  const expireMins = Math.max(1, settings.chargeExpireMinutes ?? 10);
  const expMs = charge.expiresAt
    ? new Date(charge.expiresAt).getTime()
    : new Date(charge.createdAt).getTime() + expireMins * 60 * 1000;
  const skipExpiry =
    opts?.manual || settings.autoExpireChargesEnabled === false || Boolean(charge.nowpaymentsId);
  if (!skipExpiry && Date.now() > expMs) {
    charge.status = "expired";
    charge.failReason = `${expireMins}분 초과로 만료됨`;
    persist(store);
    return { ok: false, error: `충전 요청이 ${expireMins}분 초과로 만료되었어요.` };
  }
  if (amount !== undefined && amount !== charge.amount) {
    return { ok: false, error: "금액 불일치" };
  }

  const user = store.users.find((u) => u.id === charge.userId);
  if (!user) return { ok: false, error: "사용자 없음" };

  const prevTier = resolveUserTier(shopId, user);

  const incomingName = depositorName.trim();
  const genericName =
    !incomingName || incomingName === "관리자 승인" || incomingName === "Discord 승인";
  charge.status = "completed";
  // Discord/관리자 승인 라벨로 기존 입금자명을 덮어쓰지 않음
  if (!genericName) {
    charge.depositorName = incomingName;
  } else if (!charge.depositorName) {
    charge.depositorName = incomingName || "관리자 승인";
  }
  charge.completedAt = new Date().toISOString();
  user.points += charge.amount;
  user.totalCharged += charge.amount;

  const nextTier = resolveUserTier(shopId, user);
  if (
    settings.tierUpgradeNotifyEnabled &&
    nextTier &&
    nextTier.id !== prevTier?.id
  ) {
    store.userNotifications.unshift({
      id: randomUUID(),
      shopId,
      userId: user.id,
      type: "tier_upgrade",
      title: "등급 승급",
      body: `「${nextTier.name}」 등급으로 올라갔어요.`,
      productId: null,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  pushLog(user.email, "charge.complete", { chargeId, amount: charge.amount }, shopId);
  persist(store);

  if (user.discordId && store.tiers.some((t) => t.shopId === shopId && t.discordRoleId)) {
    const userId = user.id;
    scheduleDiscordBackground(
      import("@/lib/discord/spend-roles").then(({ grantTierRolesForUser }) =>
        grantTierRolesForUser(shopId, userId),
      ),
    );
  }

  const depositor = charge.depositorName || "-";
  const balance = user.points;
  const mention = user.discordId ? `<@${user.discordId}>` : user.email;
  const uname = user.discordUsername || user.name || user.email;

  scheduleDiscordBackground(
    import("@/lib/discord/logs").then(({ postChargeCompleteLog }) =>
      postChargeCompleteLog(shopId, {
        userMention: mention,
        userName: uname,
        depositorName: depositor,
        amount: charge.amount,
        balance,
      }),
    ),
  );

  // Flip "충전 요청" / "충전 안내" Discord messages → 충전 완료 (auto + manual)
  scheduleDiscordBackground(
    import("@/lib/discord/charge-message").then(({ markChargeMessagesCompleted }) =>
      markChargeMessagesCompleted({
        shopId,
        charge,
        balance,
        resultLabel: opts?.resultLabel || "승인됨",
      }),
    ),
  );

  if (user.discordId) {
    const amountLabel = `${charge.amount.toLocaleString()}원`;
    void import("@/lib/discord/dm").then(async ({ sendDiscordDm }) => {
      const { separator, textDisplay, v2Message } = await import("@/lib/discord/components");
      await sendDiscordDm(
        user.discordId!,
        v2Message([
          textDisplay("## 충전 완료"),
          separator(true, 1),
          textDisplay(`**충전 금액**\n${amountLabel}`),
          textDisplay(`**현재 잔액**\n${balance.toLocaleString()}원`),
          separator(true, 1),
          textDisplay(`-# DOES · <t:${Math.floor(Date.now() / 1000)}:f>`),
        ]),
        shopId,
      );
    });
  }
  return { ok: true, charge };
}

/** Discord `/수동충전` 등 — 잔액 직접 지급 (충전로그에도 completed 행 기록) */
export function creditUserPoints(
  shopId: string,
  userId: string,
  amount: number,
  reason = "수동 충전",
): { ok: true; balance: number; charge: PointCharge } | { ok: false; error: string } {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false, error: "사용자 없음" };
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "금액 오류" };
  const now = new Date().toISOString();
  const charge: PointCharge = {
    id: randomUUID(),
    shopId,
    userId,
    amount: n,
    method: "bank",
    reference: `MANUAL-${randomBytes(3).toString("hex").toUpperCase()}`,
    depositorName: reason,
    status: "completed",
    createdAt: now,
    expiresAt: null,
    completedAt: now,
    failReason: null,
    nowpaymentsId: null,
    payAddress: null,
    payAmount: null,
    payCurrency: null,
    discordLogChannelId: null,
    discordLogMessageId: null,
    discordApplicationId: null,
    discordInteractionToken: null,
  };
  user.points += n;
  user.totalCharged += n;
  store.charges.unshift(charge);
  pushLog(user.email, "charge.manual", { amount: n, reason, chargeId: charge.id }, shopId);
  persist(store);
  return { ok: true, balance: user.points, charge };
}

export const RANDOM_BOX_MIN = 0;
export const RANDOM_BOX_MAX = 3000;
export const RANDOM_BOX_JACKPOT = 1200;

/** 출석체크 확률표 (합 100%). 0원 = 꽝. 구간 안에서는 1원 단위 균등 */
export const RANDOM_BOX_TABLE: { min: number; max: number; weight: number }[] = [
  { min: 0, max: 0, weight: 25 },
  { min: 1, max: 99, weight: 30 },
  { min: 100, max: 199, weight: 15 },
  { min: 200, max: 299, weight: 14 },
  { min: 300, max: 499, weight: 8 },
  { min: 500, max: 799, weight: 4 },
  { min: 800, max: 1199, weight: 2 },
  { min: 1200, max: 1799, weight: 1.2 },
  { min: 1800, max: 2399, weight: 0.5 },
  { min: 2400, max: 2999, weight: 0.25 },
  { min: 3000, max: 3000, weight: 0.05 },
];

export function kstDayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function secureUnit() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 0x1_0000_0000;
}

function rollRandomBoxAmount() {
  const total = RANDOM_BOX_TABLE.reduce((s, b) => s + b.weight, 0);
  let pick = secureUnit() * total;
  let band = RANDOM_BOX_TABLE[RANDOM_BOX_TABLE.length - 1]!;
  for (const b of RANDOM_BOX_TABLE) {
    if (pick < b.weight) {
      band = b;
      break;
    }
    pick -= b.weight;
  }
  return band.min + Math.floor(secureUnit() * (band.max - band.min + 1));
}

export function getTodayRandomBoxClaim(shopId: string, userId: string): RandomBoxClaim | null {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  const dayKey = kstDayKey();
  const discordId = store.users.find((u) => u.id === userId)?.discordId;
  const ids = new Set([userId]);
  if (discordId) {
    for (const u of store.users) if (u.shopId === shopId && u.discordId === discordId) ids.add(u.id);
  }
  return (
    store.randomBoxClaims.find(
      (c) => c.shopId === shopId && ids.has(c.userId) && c.dayKey === dayKey,
    ) ?? null
  );
}

export function claimRandomBox(
  shopId: string,
  userId: string,
):
  | {
      ok: true;
      already: boolean;
      amount: number;
      jackpot: boolean;
      balance: number;
      dayKey: string;
    }
  | { ok: false; error: string } {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const existing = getTodayRandomBoxClaim(shopId, userId);
  if (existing) {
    return {
      ok: true,
      already: true,
      amount: existing.amount,
      jackpot: existing.jackpot,
      balance: user.points,
      dayKey: existing.dayKey,
    };
  }

  const amount = rollRandomBoxAmount();
  const now = new Date();
  const claim: RandomBoxClaim = {
    id: randomUUID(),
    shopId,
    userId,
    dayKey: kstDayKey(now),
    amount,
    jackpot: amount >= RANDOM_BOX_JACKPOT,
    createdAt: now.toISOString(),
  };
  store.randomBoxClaims.unshift(claim);
  const cutoff = shiftDayKey(claim.dayKey, -RANDOM_BOX_HISTORY_DAYS);
  if (store.randomBoxClaims.length > 500) {
    store.randomBoxClaims = store.randomBoxClaims.filter((c) => c.dayKey >= cutoff);
  }

  if (amount <= 0) {
    persist(store);
    return { ok: true, already: false, amount: 0, jackpot: false, balance: user.points, dayKey: claim.dayKey };
  }

  const credited = creditUserPoints(shopId, userId, amount, "출석체크");
  if (!credited.ok) {
    const idx = getStore().randomBoxClaims.findIndex((c) => c.id === claim.id);
    if (idx >= 0) getStore().randomBoxClaims.splice(idx, 1);
    return credited;
  }

  return {
    ok: true,
    already: false,
    amount,
    jackpot: claim.jackpot,
    balance: credited.balance,
    dayKey: claim.dayKey,
  };
}

export function resetRandomBoxClaims(shopId?: string) {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  store.randomBoxClaims = shopId
    ? store.randomBoxClaims.filter((c) => c.shopId !== shopId)
    : [];
  persist(store);
}

const RANDOM_BOX_HISTORY_DAYS = 120;

export function shiftDayKey(dayKey: string, days: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function getRandomBoxHistory(shopId: string, userId: string) {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  const today = kstDayKey();
  const month = today.slice(0, 7);
  const mine = store.randomBoxClaims.filter((c) => c.shopId === shopId && c.userId === userId);
  const byDay = new Map<string, { amount: number; jackpot: boolean }>();
  for (const c of mine) {
    if (!byDay.has(c.dayKey)) byDay.set(c.dayKey, { amount: c.amount, jackpot: c.jackpot });
  }

  let streak = 0;
  let cursor = byDay.has(today) ? today : shiftDayKey(today, -1);
  while (byDay.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  let best = 0;
  let run = 0;
  const sortedDays = [...byDay.keys()].sort();
  for (let i = 0; i < sortedDays.length; i++) {
    run = i > 0 && shiftDayKey(sortedDays[i - 1], 1) === sortedDays[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const days = [...byDay.entries()]
    .filter(([k]) => k.startsWith(month) || k >= shiftDayKey(today, -6))
    .map(([dayKey, v]) => ({ dayKey, amount: v.amount, jackpot: v.jackpot }));

  const monthClaims = mine.filter((c) => c.dayKey.startsWith(month));
  return {
    today,
    streak,
    bestStreak: best,
    totalDays: byDay.size,
    totalAmount: mine.reduce((s, c) => s + c.amount, 0),
    monthDays: monthClaims.length,
    monthAmount: monthClaims.reduce((s, c) => s + c.amount, 0),
    bestAmount: mine.reduce((m, c) => Math.max(m, c.amount), 0),
    days,
  };
}

export function listTopRandomBoxDraws(shopId: string, days = 7, limit = 3) {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  const since = shiftDayKey(kstDayKey(), -(days - 1));
  return store.randomBoxClaims
    .filter((c) => c.shopId === shopId && c.dayKey >= since && c.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
    .map((c) => {
      const user = store.users.find((u) => u.id === c.userId);
      return {
        discordId: user?.discordId ?? null,
        name: user?.discordUsername || user?.name || "이용자",
        amount: c.amount,
        createdAt: c.createdAt,
      };
    });
}

export function listTodayRandomBoxDraws(shopId: string, limit = 16) {
  const store = getStore();
  if (!Array.isArray(store.randomBoxClaims)) store.randomBoxClaims = [];
  const dayKey = kstDayKey();
  return store.randomBoxClaims
    .filter((c) => c.shopId === shopId && c.dayKey === dayKey)
    .slice(0, limit)
    .map((c) => {
      const user = store.users.find((u) => u.id === c.userId);
      return {
        userId: c.userId,
        name: user?.name || user?.discordUsername || "이용자",
        amount: c.amount,
        jackpot: c.jackpot,
        createdAt: c.createdAt,
      };
    });
}

export function autoMatchCharge(input: {
  shopId: string;
  amount: number;
  depositorText: string;
  depositorName?: string | null;
  /** 버튼자판기 iOS 창 (기본: 설정 chargeExpireMinutes) */
  maxAgeMinutes?: number;
  /** depositor_name exact match (버튼자판기 /auto-charge) */
  exactName?: boolean;
}): { ok: true; charge: PointCharge } | { ok: false; error: string } {
  const store = getStore();
  const settings = getShopSettings(input.shopId);
  const windowMs =
    Math.max(1, input.maxAgeMinutes ?? settings.chargeExpireMinutes ?? 10) * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  const pending = store.charges.filter(
    (c) =>
      c.shopId === input.shopId &&
      c.status === "pending" &&
      c.method === "bank" &&
      c.amount === input.amount &&
      new Date(c.createdAt).getTime() >= cutoff,
  );
  if (!pending.length) {
    return { ok: false, error: "같은 금액의 대기 중인 충전이 없어요." };
  }

  const text = input.depositorText.toUpperCase().replace(/\s/g, "");
  const parsedName = input.depositorName ? normDepositorName(input.depositorName) : null;

  function loose(value: string) {
    return normDepositorName(value).replace(/[\s()[\]·._-]/g, "").toUpperCase();
  }

  /** 은행 알림은 보내는 분 이름을 7~10자에서 자르므로 앞부분이 같으면 같은 사람으로 본다 */
  function namesMatch(expected: string | null | undefined, candidate: string | null) {
    if (!expected || !candidate) return false;
    const a = loose(expected);
    const b = loose(candidate);
    if (!a || !b) return false;
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return short.length >= 3 && long.startsWith(short);
  }

  function expectedDepositor(user: ShopUser, chargeName?: string | null) {
    const base = (chargeName?.trim() || user.name || "").trim();
    if (!base) return "";
    if (settings.depositSuffixPhrase && !base.endsWith(settings.depositSuffixPhrase)) {
      return normDepositorName(`${base}${settings.depositSuffixPhrase}`);
    }
    return normDepositorName(base);
  }

  const ambiguous = {
    ok: false as const,
    error: "같은 금액·입금자명의 충전 신청이 여러 건이라 자동 승인하지 않았어요. 관리자가 직접 확인해 주세요.",
  };

  // 버튼자판기: amount + depositor_name 완전 일치
  if (input.exactName && parsedName) {
    const exact = pending.filter(
      (c) => c.depositorName && namesMatch(c.depositorName, parsedName),
    );
    if (exact.length > 1) return ambiguous;
    if (exact[0]) {
      return confirmPointCharge(exact[0].id, input.shopId, parsedName, input.amount, {
        resultLabel: "자동 승인됨",
      });
    }
  }

  /** 알림 원문에 이름이 들어 있는지 — 짧은 이름은 은행명 · 문구에 우연히 걸리므로 제외 */
  function textContains(name: string) {
    const needle = name.toUpperCase().replace(/\s/g, "");
    return needle.length >= 2 && text.includes(needle);
  }

  const byReference = pending.filter((c) => c.reference && c.reference.length >= 4 && text.includes(c.reference.toUpperCase()));
  const candidates = byReference.length
    ? byReference
    : pending.filter((c) => {
        const user = store.users.find((u) => u.id === c.userId);
        if (!user) return false;
        const expected = expectedDepositor(user, c.depositorName);

        if (parsedName) {
          if (expected && namesMatch(expected, parsedName)) return true;
          if (c.depositorName && namesMatch(c.depositorName, parsedName)) return true;
          if (c.depositorName) {
            const base = normDepositorName(c.depositorName.replace(settings.depositSuffixPhrase || "", ""));
            if (base && namesMatch(base, parsedName)) return true;
          }
          return false;
        }

        // 보낸 분 이름을 못 읽은 알림만 원문 포함 여부로 맞춘다
        if (expected && textContains(expected)) return true;
        if (!c.depositorName && user.name && textContains(normDepositorName(user.name))) return true;
        return false;
      });

  if (candidates.length > 1) return ambiguous;
  const match = candidates[0];

  if (!match) {
    return {
      ok: false,
      error: parsedName
        ? `「${parsedName}」 / ${input.amount.toLocaleString()}원과 맞는 충전 신청이 없어요.`
        : "입금자명·금액이 충전 신청과 맞지 않아요.",
    };
  }

  const depositorLabel = parsedName ?? match.depositorName ?? match.reference;
  return confirmPointCharge(match.id, input.shopId, depositorLabel, input.amount, {
    resultLabel: "자동 승인됨",
  });
}

/** 1인 구매 한도 — 발급 대기 · 입금 대기 주문도 수량만큼 센다 */
function purchaseLimitError(store: DbStore, product: Product, userId: string, quantity: number) {
  const limit = product.purchaseLimitPerUser;
  if (!limit || limit <= 0) return null;
  const counted = new Set(["dispensed", "paid", "awaiting_fulfillment", "locked", "pending"]);
  const bought = store.orders.reduce(
    (n, o) =>
      o.shopId === product.shopId && o.userId === userId && o.productId === product.id && counted.has(o.status)
        ? n + (o.quantity || 1)
        : n,
    0,
  );
  return bought + quantity > limit ? `이 상품은 1인 ${limit}개까지 구매할 수 있어요.` : null;
}

/** 외부(MFA MARKET)에서 코드를 받기 전에 실패할 구매를 미리 거른다 */
export function purchasePrecheck(
  shopId: string,
  userId: string,
  productId: string,
  quantity: number,
  unitPriceOverride?: number,
): string | null {
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return "로그인 필요";
  if (user.banned) return user.banReason?.trim() || "이용이 제한된 계정이에요.";
  const settings = getShopSettings(shopId);
  if (settings.maintenanceMode) return settings.maintenanceMessage || "점검 중이에요.";
  const product = store.products.find((p) => p.id === productId && p.shopId === shopId && p.active);
  if (!product) return "상품 없음";
  const limitError = purchaseLimitError(store, product, userId, quantity);
  if (limitError) return limitError;
  const event = listEvents(shopId).find((e) => e.productId === productId) ?? null;
  const unitPrice =
    unitPriceOverride != null
      ? Math.max(0, Math.floor(unitPriceOverride))
      : calcProductPrice(product, resolveUserTier(shopId, user), event).finalPrice;
  if (user.points < unitPrice * quantity) return "포인트 부족";
  return null;
}

export function purchaseWithPoints(
  shopId: string,
  userId: string,
  productId: string,
  opts?: {
    quantity?: number;
    suppressDiscordNotify?: boolean;
    /** MFA MARKET 등 외부에서 미리 발급받은 코드. 재고 대신 이 값을 지급한다 */
    external?: ExternalDelivery;
    /** 떠돌이 상인 Deal 등 특가 단가 (등급·이벤트 할인 대신 적용) */
    unitPriceOverride?: number;
  },
): { ok: true; order: Order; orders: Order[] } | { ok: false; error: string } {
  const quantity = Math.max(1, Math.floor(opts?.quantity ?? 1));
  if (quantity > 20) return { ok: false, error: "한 번에 20개까지 구매할 수 있어요." };
  const external = opts?.external;
  const store = getStore();
  const user = store.users.find((u) => u.id === userId && u.shopId === shopId);
  if (!user) return { ok: false, error: "로그인 필요" };
  if (user.banned) {
    return { ok: false, error: user.banReason?.trim() || "이용이 제한된 계정이에요." };
  }

  const settings = getShopSettings(shopId);
  if (settings.maintenanceMode) {
    return { ok: false, error: settings.maintenanceMessage || "점검 중이에요." };
  }

  const product = store.products.find((p) => p.id === productId && p.shopId === shopId && p.active);
  if (!product) return { ok: false, error: "상품 없음" };

  const limitError = purchaseLimitError(store, product, userId, quantity);
  if (limitError) return { ok: false, error: limitError };

  const event = listEvents(shopId).find((e) => e.productId === productId);
  const tier = resolveUserTier(shopId, user);
  const unitPrice =
    opts?.unitPriceOverride != null
      ? Math.max(0, Math.floor(opts.unitPriceOverride))
      : calcProductPrice(product, tier, event ?? null).finalPrice;
  const totalPrice = unitPrice * quantity;

  if (user.points < totalPrice) return { ok: false, error: "포인트 부족" };

  if (external && external.codes.length !== quantity) {
    return { ok: false, error: "발급된 코드 수가 수량과 맞지 않아요." };
  }

  const isManual = product.fulfillment === "manual" && !external;

  let available: InventoryItem[] = [];
  if (!external && !isManual) {
    releaseExpiredLocks(store);
    available = store.inventories.filter(
      (i) => i.productId === product.id && i.shopId === shopId && i.status === "available",
    );
    if (available.length < quantity) {
      return {
        ok: false,
        error: available.length === 0 ? "품절" : `재고 부족 (남은 ${available.length}개)`,
      };
    }
  }

  const orders: Order[] = [];
  const nowIso = new Date().toISOString();
  for (let n = 0; n < quantity; n++) {
    const item = external || isManual ? null : available[n]!;
    const orderId = randomUUID();
    user.points -= unitPrice;
    if (item) {
      item.status = "sold";
      item.orderId = orderId;
    }

    const order: Order = {
      id: orderId,
      shopId,
      orderUuid: `VNX-${Date.now().toString(36).toUpperCase()}${n > 0 ? `-${n}` : ""}`,
      productId: product.id,
      buyerEmail: user.email,
      userId: user.id,
      paymentMethod: "points",
      status: isManual ? "awaiting_fulfillment" : "dispensed",
      amount: unitPrice,
      quantity: 1,
      dispensedCode: isManual ? null : external ? external.codes[n]! : item!.codeValue,
      depositorName: null,
      accessToken: null,
      createdAt: nowIso,
      paidAt: nowIso,
    };
    store.orders.unshift(order);
    orders.push(order);
    pushLog(user.email, "order.points", { orderId: order.id, price: unitPrice }, shopId);
  }
  rewardReferral(store, shopId, user, totalPrice, orders[0]!.orderUuid);
  if (external && product.mfaProduct) {
    product.mfaStock = Math.max(0, external.stockLeft);
    product.mfaStockAt = nowIso;
    setMfaStockCache(product.id, external.stockLeft);
  }
  persist(store);

  const shop = store.shops.find((s) => s.id === shopId);
  const first = orders[0]!;
  const amountLabel = `${totalPrice.toLocaleString()}P`;
  const buyerMention = user.discordId ? `<@${user.discordId}>` : user.discordUsername || user.name || user.email;
  const totalSold = store.orders.reduce(
    (n, o) =>
      o.shopId === shopId && o.productId === product.id && (o.status === "dispensed" || o.status === "awaiting_fulfillment" || o.status === "paid")
        ? n + (o.quantity || 1)
        : n,
    0,
  );

  scheduleDiscordBackground(
    import("@/lib/discord/logs").then(({ postPurchaseLog }) =>
      postPurchaseLog(shopId, {
        buyerMention,
        productName: product.name,
        quantity,
        totalSold,
      }),
    ),
  );

  scheduleDiscordBackground(
    import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shopId)),
  );
  scheduleDiscordBackground(
    import("@/lib/discord/spend-roles").then(({ grantSpendRolesForUser }) =>
      grantSpendRolesForUser(shopId, user.id),
    ),
  );
  scheduleDiscordBackground(
    import("@/lib/discord/does-leaderboard").then(({ pushDoesLeaderboard }) => pushDoesLeaderboard(shopId)),
  );

  if (!opts?.suppressDiscordNotify && user.discordId) {
    const codes = isManual
      ? (product.manualNotice || "관리자가 확인 후 수동으로 지급합니다.")
      : orders.map((o) => o.dispensedCode).filter(Boolean).join("\n");
    const shopSlug = shop?.slug ?? "";
    scheduleDiscordBackground(import("@/lib/discord/dm").then(async ({ sendDiscordDm, purchaseSuccessDm, addGuildMemberRole }) => {
      const { button, ButtonStyle, cid } = await import("@/lib/discord/components");
      await sendDiscordDm(
        user.discordId!,
        purchaseSuccessDm(
          {
            shopName: shop?.name ?? "상점",
            productName: product.name,
            amountLabel: quantity > 1 ? `${amountLabel} (${quantity}개)` : amountLabel,
            orderUuid: first.orderUuid,
            codePreview: codes || null,
          },
          [
            ...(external?.links ?? []).slice(0, 4).map((l) =>
              button({ label: l.label, url: l.url, style: ButtonStyle.LINK }),
            ),
            ...(shopSlug ? [button({ customId: cid(shopSlug, "rev_write", productId), label: "후기 작성" })] : []),
          ],
        ),
        shopId,
      );
      if (product.discordRoleId && settings.discordGuildId) {
        await addGuildMemberRole(
          settings.discordGuildId,
          user.discordId!,
          product.discordRoleId,
          shopId,
        );
      }
    }));
  }

  return { ok: true, order: first, orders };
}

export function fulfillManualOrder(
  shopId: string,
  orderId: string,
  deliveryText: string,
): { ok: true; order: Order } | { ok: false; error: string } {
  const store = getStore();
  const order = store.orders.find((o) => o.id === orderId && o.shopId === shopId);
  if (!order) return { ok: false, error: "주문을 찾을 수 없어요." };
  if (order.status !== "awaiting_fulfillment") {
    return { ok: false, error: "지급 대기 주문이 아니에요." };
  }
  const text = deliveryText.trim();
  if (!text) return { ok: false, error: "지급 내용을 입력해 주세요." };
  order.status = "dispensed";
  order.dispensedCode = text.slice(0, 2000);
  order.paidAt = order.paidAt || new Date().toISOString();
  persist(store);

  const shop = store.shops.find((s) => s.id === shopId);
  const user = order.userId
    ? store.users.find((u) => u.id === order.userId && u.shopId === shopId)
    : null;
  const product = store.products.find((p) => p.id === order.productId);
  if (user?.discordId) {
    scheduleDiscordBackground(import("@/lib/discord/dm").then(async ({ sendDiscordDm }) => {
      await sendDiscordDm(
        user.discordId!,
        {
          content: `**${shop?.name ?? "상점"}** 수동지급이 완료됐어요.\n상품: ${product?.name ?? "상품"}\n\`\`\`\n${text.slice(0, 900)}\n\`\`\``,
        },
        shopId,
      );
    }));
  }
  return { ok: true, order };
}

export function userLifetimeSpend(shopId: string, userId: string) {
  return getStore()
    .orders.filter(
      (o) =>
        o.shopId === shopId &&
        o.userId === userId &&
        (o.status === "dispensed" || o.status === "paid" || o.status === "awaiting_fulfillment"),
    )
    .reduce((sum, o) => sum + o.amount, 0);
}

export function listPurchaseLeaderboard(
  shopId: string,
  period: "week" | "month" | "year",
) {
  const now = Date.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
  } else if (period === "month") {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }
  const from = start.getTime();
  const totals = new Map<string, { userId: string; name: string; amount: number; count: number }>();
  const store = getStore();
  for (const order of store.orders) {
    if (order.shopId !== shopId || !order.userId) continue;
    if (
      order.status !== "dispensed" &&
      order.status !== "paid" &&
      order.status !== "awaiting_fulfillment"
    ) {
      continue;
    }
    const t = new Date(order.paidAt || order.createdAt).getTime();
    if (!Number.isFinite(t) || t < from) continue;
    const user = store.users.find((u) => u.id === order.userId);
    const row = totals.get(order.userId) ?? {
      userId: order.userId,
      name: user?.name || user?.discordUsername || "이용자",
      amount: 0,
      count: 0,
    };
    row.amount += order.amount;
    row.count += 1;
    totals.set(order.userId, row);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

export function purchaseCartWithPoints(
  shopId: string,
  userId: string,
  items: { productId: string; quantity: number }[],
):
  | { ok: true; orders: Order[]; total: number }
  | { ok: false; error: string } {
  const normalized = items
    .map((i) => ({ productId: i.productId, quantity: Math.max(1, Math.floor(i.quantity)) }))
    .filter((i) => i.productId);
  if (!normalized.length) return { ok: false, error: "장바구니가 비어 있어요" };

  const orders: Order[] = [];
  let total = 0;
  for (const item of normalized) {
    const result = purchaseWithPoints(shopId, userId, item.productId, {
      quantity: item.quantity,
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          orders.length > 0
            ? `${orders.length}개 구매 후 실패: ${result.error}`
            : result.error,
      };
    }
    orders.push(...result.orders);
    total += result.orders.reduce((sum, o) => sum + o.amount, 0);
  }
  return { ok: true, orders, total };
}

export function listUserOrders(shopId: string, userId: string) {
  const store = getStore();
  return store.orders
    .filter((o) => o.shopId === shopId && o.userId === userId)
    .map((o) => ({
      ...o,
      productName: store.products.find((p) => p.id === o.productId)?.name ?? "상품",
    }));
}

export function listUserCharges(shopId: string, userId: string) {
  expireShopPendingCharges(shopId);
  return getStore()
    .charges.filter((c) => c.shopId === shopId && c.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function expireBannerAds(shopId?: string) {
  const store = getStore();
  const now = Date.now();
  for (const ad of store.bannerAds) {
    if (shopId && ad.shopId !== shopId) continue;
    if (ad.status === "active" && ad.endsAt && new Date(ad.endsAt).getTime() <= now) {
      ad.status = "expired";
    }
  }
}

export function listActiveBannerAds(shopId: string): ShopBannerAd[] {
  expireBannerAds(shopId);
  const now = Date.now();
  return getStore()
    .bannerAds.filter(
      (a) =>
        a.shopId === shopId &&
        a.status === "active" &&
        (!a.endsAt || new Date(a.endsAt).getTime() > now),
    )
    .sort((a, b) => (b.startsAt ?? b.createdAt).localeCompare(a.startsAt ?? a.createdAt));
}

export function listBannerAdsAdmin(shopId: string): ShopBannerAd[] {
  expireBannerAds(shopId);
  return getStore()
    .bannerAds.filter((a) => a.shopId === shopId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listUserBannerAds(shopId: string, userId: string): ShopBannerAd[] {
  expireBannerAds(shopId);
  return getStore()
    .bannerAds.filter((a) => a.shopId === shopId && a.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function purchaseBannerAd(input: {
  shopId: string;
  userId: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  period: BannerAdPeriod;
}): { ok: true; ad: ShopBannerAd } | { ok: false; error: string } {
  const store = getStore();
  const settings = getShopSettings(input.shopId);
  if (!settings.bannerAdsEnabled) return { ok: false, error: "배너 광고가 비활성화되어 있어요." };

  const user = store.users.find((u) => u.id === input.userId && u.shopId === input.shopId);
  if (!user) return { ok: false, error: "로그인 필요" };

  const title = input.title.trim().slice(0, 80);
  const body = input.body.trim().slice(0, 280);
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };

  const amount =
    input.period === "week" ? settings.bannerWeeklyPrice : settings.bannerMonthlyPrice;
  if (amount < 0) return { ok: false, error: "가격 설정이 올바르지 않아요." };
  if (user.points < amount) return { ok: false, error: "포인트가 부족해요." };

  const pendingCount = store.bannerAds.filter(
    (a) => a.shopId === input.shopId && a.userId === input.userId && a.status === "pending",
  ).length;
  if (pendingCount >= 3) return { ok: false, error: "대기 중인 광고 신청이 너무 많아요." };

  user.points -= amount;
  const ad: ShopBannerAd = {
    id: `ban_${randomUUID().slice(0, 10)}`,
    shopId: input.shopId,
    userId: input.userId,
    title,
    body,
    imageUrl: input.imageUrl?.trim() || null,
    linkUrl: input.linkUrl?.trim() || null,
    period: input.period,
    amount,
    status: "pending",
    startsAt: null,
    endsAt: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    rejectReason: null,
  };
  store.bannerAds.unshift(ad);
  pushLog(user.email, "banner.purchase", { adId: ad.id, period: ad.period, amount }, input.shopId);
  persist(store);

  if (settings.bannerAutoApprove) {
    const reviewed = reviewBannerAd(input.shopId, ad.id, "approve");
    if (reviewed.ok) return { ok: true, ad: reviewed.ad };
  }
  return { ok: true, ad };
}

export function reviewBannerAd(
  shopId: string,
  adId: string,
  decision: "approve" | "reject",
  rejectReason?: string,
): { ok: true; ad: ShopBannerAd } | { ok: false; error: string } {
  const store = getStore();
  const ad = store.bannerAds.find((a) => a.id === adId && a.shopId === shopId);
  if (!ad) return { ok: false, error: "광고 신청을 찾을 수 없어요." };
  if (ad.status !== "pending") return { ok: false, error: "이미 처리된 신청이에요." };

  const now = Date.now();
  ad.reviewedAt = new Date(now).toISOString();

  if (decision === "reject") {
    ad.status = "rejected";
    ad.rejectReason = rejectReason?.trim().slice(0, 200) || null;
    const user = store.users.find((u) => u.id === ad.userId && u.shopId === shopId);
    if (user) user.points += ad.amount;
    pushLog("admin", "banner.reject", { adId, amount: ad.amount }, shopId);
    persist(store);
    return { ok: true, ad };
  }

  const days = ad.period === "week" ? 7 : 30;
  ad.status = "active";
  ad.startsAt = new Date(now).toISOString();
  ad.endsAt = new Date(now + days * DAY_MS).toISOString();
  ad.rejectReason = null;
  pushLog("admin", "banner.approve", { adId, endsAt: ad.endsAt }, shopId);
  persist(store);
  return { ok: true, ad };
}

export function takeDownBannerAd(
  shopId: string,
  adId: string,
): { ok: true; ad: ShopBannerAd } | { ok: false; error: string } {
  const store = getStore();
  const ad = store.bannerAds.find((a) => a.id === adId && a.shopId === shopId);
  if (!ad) return { ok: false, error: "배너를 찾을 수 없어요." };
  if (ad.status !== "active") return { ok: false, error: "노출 중인 배너만 내릴 수 있어요." };

  ad.status = "expired";
  ad.endsAt = new Date().toISOString();
  pushLog("admin", "banner.takedown", { adId }, shopId);
  persist(store);
  return { ok: true, ad };
}

/** 상점 단위 백업 스냅샷 (민감 토큰 제외) */
export function exportShopBackup(shopId: string) {
  const store = getStore();
  const shop = store.shops.find((s) => s.id === shopId);
  if (!shop) return null;
  const settings = { ...getShopSettings(shopId) };
  // strip secrets from export download safety (owner can still restore full via KV admin)
  const safeSettings = {
    ...settings,
    pushbulletAccessToken: settings.pushbulletAccessToken ? "[REDACTED]" : null,
    culturelandPassword: settings.culturelandPassword ? "[REDACTED]" : null,
    nowpaymentsApiKey: settings.nowpaymentsApiKey ? "[REDACTED]" : null,
    nowpaymentsIpnSecret: settings.nowpaymentsIpnSecret ? "[REDACTED]" : null,
    discordBotToken: settings.discordBotToken ? "[REDACTED]" : null,
    discordPublicKey: settings.discordPublicKey ? "[REDACTED]" : null,
  };
  return {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    shop: {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      plan: shop.plan,
      tagline: shop.tagline,
    },
    settings: safeSettings,
    products: store.products.filter((p) => p.shopId === shopId),
    // Never export plaintext product codes in backups
    inventories: store.inventories
      .filter((i) => i.shopId === shopId)
      .map((i) => ({
        ...i,
        codeValue: i.status === "available" ? "[REDACTED]" : "[REDACTED]",
      })),
    categories: store.categories.filter((c) => c.shopId === shopId),
    tiers: store.tiers.filter((t) => t.shopId === shopId),
    coupons: store.coupons.filter((c) => c.shopId === shopId),
    notices: store.notices.filter((n) => n.shopId === shopId),
    events: store.events.filter((e) => e.shopId === shopId),
  };
}

/** 백업에서 상품·카테고리·공지·이벤트·등급·쿠폰 복원 (설정 비밀값은 유지) */
export function importShopBackup(
  shopId: string,
  payload: {
    products?: Product[];
    categories?: ShopCategory[];
    notices?: Notice[];
    events?: ShopEvent[];
    tiers?: ShopTier[];
    coupons?: ShopCoupon[];
    inventories?: InventoryItem[];
  },
): { ok: true; restored: Record<string, number> } | { ok: false; error: string } {
  const store = getStore();
  if (!store.shops.some((s) => s.id === shopId)) return { ok: false, error: "상점 없음" };

  const restored: Record<string, number> = {};
  const remapId = (id: string) => `${id}_r${randomUUID().slice(0, 4)}`;

  if (Array.isArray(payload.categories)) {
    let n = 0;
    for (const c of payload.categories) {
      if (store.categories.some((x) => x.shopId === shopId && x.name === c.name)) continue;
      store.categories.push({
        ...c,
        id: remapId(c.id),
        shopId,
        createdAt: new Date().toISOString(),
      });
      n += 1;
    }
    restored.categories = n;
  }

  if (Array.isArray(payload.products)) {
    let n = 0;
    const idMap = new Map<string, string>();
    for (const p of payload.products) {
      let slug = p.slug;
      if (store.products.some((x) => x.shopId === shopId && x.slug === slug)) {
        slug = `${slug}-${randomUUID().slice(0, 4)}`;
      }
      const newId = remapId(p.id);
      idMap.set(p.id, newId);
      store.products.unshift({
        ...p,
        id: newId,
        shopId,
        slug,
        purchaseLimitPerUser: p.purchaseLimitPerUser ?? null,
        tags: p.tags ?? [],
        discordRoleId: p.discordRoleId ?? null,
        createdAt: new Date().toISOString(),
      });
      n += 1;
    }
    if (Array.isArray(payload.inventories)) {
      let inv = 0;
      for (const i of payload.inventories) {
        const productId = idMap.get(i.productId);
        if (!productId) continue;
        store.inventories.push({
          ...i,
          id: remapId(i.id),
          shopId,
          productId,
          status: "available",
          orderId: null,
          lockedUntil: null,
          createdAt: new Date().toISOString(),
        });
        inv += 1;
      }
      restored.inventories = inv;
    }
    restored.products = n;
  }

  if (Array.isArray(payload.notices)) {
    let n = 0;
    for (const notice of payload.notices) {
      store.notices.unshift({
        ...notice,
        id: remapId(notice.id),
        shopId,
        createdAt: new Date().toISOString(),
      });
      n += 1;
    }
    restored.notices = n;
  }

  if (Array.isArray(payload.events)) {
    let n = 0;
    for (const ev of payload.events) {
      store.events.unshift({
        ...ev,
        id: remapId(ev.id),
        shopId,
        productId: null,
      });
      n += 1;
    }
    restored.events = n;
  }

  if (Array.isArray(payload.tiers)) {
    let n = 0;
    for (const t of payload.tiers) {
      if (store.tiers.some((x) => x.shopId === shopId && x.name === t.name)) continue;
      store.tiers.push({ ...t, id: remapId(t.id), shopId });
      n += 1;
    }
    restored.tiers = n;
  }

  if (Array.isArray(payload.coupons)) {
    let n = 0;
    for (const c of payload.coupons) {
      if (store.coupons.some((x) => x.shopId === shopId && x.code === c.code)) continue;
      store.coupons.push({ ...c, id: remapId(c.id), shopId });
      n += 1;
    }
    restored.coupons = n;
  }

  pushLog("admin", "backup.import", restored, shopId);
  persist(store);
  return { ok: true, restored };
}

/** 읽기 전용 접근 — 수정 후에는 반드시 persistAsync() */
export function getStoreForRead(): DbStore {
  return getStore();
}

export { bindStoreAdmin } from "@/lib/store-admin";
export * from "@/lib/store-admin";

import { registerStoreBinder } from "@/lib/store-bind";
import { bindStoreAdmin } from "@/lib/store-admin";
import { bindStoreExt } from "@/lib/store-ext";
export * from "@/lib/store-ext";

registerStoreBinder(() => {
  bindStoreAdmin({ getStore, persist, pushLog, confirmPointCharge });
  bindStoreExt({
    getStore,
    persist: (s) => persist(s as DbStore),
    pushLog,
    availableCount: (store, productId) => availableCount(store as DbStore, productId),
  });
});
