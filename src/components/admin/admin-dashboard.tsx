"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Bot,
  Bug,
  Box,
  ChevronsUpDown,
  ChevronLeft,
  ClipboardList,
  Gift,
  HelpCircle,
  ImageIcon,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  MessagesSquare,
  Package,
  Gem,
  Shirt,
  PanelLeftClose,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Star,
  Store,
  Ticket,
  UserCog,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AdminOverview } from "./admin-overview";
import { AdminBillingHub } from "./admin-billing-hub";
import { AdminProductsPanel } from "./admin-products-panel";
import { MfaInventoryPanel } from "./mfa-inventory-panel";

/** MFA 상점은 상품을 MFA MARKET 재고(계정 + 가격)로만 관리한다 */
const MFA_SHOP_SLUG = "mfa";
import { AdminEventsPanel } from "./admin-events-panel";
import { AdminCouponsPanel } from "./admin-coupons-panel";
import { AdminOrdersPanel } from "./admin-orders-panel";
import { AdminInquiriesPanel } from "./admin-inquiries-panel";
import { AdminCommandPalette, type CommandItem } from "./admin-command-palette";
import { AdminDashboardSkeleton } from "@/components/ui/skeleton";
import { staffCan } from "@/lib/staff-perms";
import { AdminLogsPanel } from "./admin-logs-panel";
import { AdminWorldPanel } from "./admin-world-panel";
import { AdminWorldChatPanel } from "./admin-world-chat-panel";
import { AdminAutomationPanel } from "./admin-automation-panel";
import { AdminBannersPanel } from "./admin-banners-panel";
import { AdminNotificationsPanel, AdminStaffPanel } from "./admin-staff-panel";
import { AdminTiersPanel } from "./admin-tiers-panel";
import { AdminUsersPanel } from "./admin-users-panel";
import { AdminMcProductsPanel } from "./admin-mc-products-panel";
import { AdminCapeProductsPanel } from "./admin-cape-products-panel";
import { AdminNoticesPanel } from "./admin-notices-panel";
import { AdminReviewsPanel } from "./admin-reviews-panel";
import { AdminBugsPanel } from "./admin-bugs-panel";
import { DiscordBotPanel } from "./discord-bot-panel";
import { MfaDiscordPanel } from "./mfa-discord-panel";
import { SupportChatWidget } from "./support-chat-widget";
import { StoreSettingsPanel } from "./store-settings-panel";
import {
  AdminToastViewport,
  inferToastKind,
  type AdminToastState,
} from "./admin-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { formatPlanLabel, planMeetsMinimum } from "@/lib/plans";
import type {
  AdminNotification,
  BugReport,
  LicensePlan,
  Notice,
  PaymentMethod,
  PointCharge,
  ProductWithStock,
  ShopCategory,
  ShopCoupon,
  ShopEvent,
  ShopInquiry,
  ShopBannerAd,
  ShopReview,
  ShopSettings,
  ShopTier,
  ShopUser,
  StaffPermission,
  SubscriptionStatus,
} from "@/lib/types";
import { resolveAutoChargeBankName } from "@/lib/auto-charge-banks";
import { vxTransition } from "@/lib/motion";
import { SessionIdleGuard } from "@/components/session-idle-guard";

type Tab =
  | "main"
  | "orders"
  | "store"
  | "billing"
  | "bot"
  | "products"
  | "mcProducts"
  | "capeProducts"
  | "events"
  | "world"
  | "chat"
  | "coupons"
  | "tiers"
  | "users"
  | "inquiries"
  | "notices"
  | "reviews"
  | "bugs"
  | "banners"
  | "automation"
  | "notifications"
  | "staff"
  | "logs";

type AdminShop = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  adminUsername: string;
  plan: LicensePlan;
  expiresAt: string;
  graceUntil: string;
  subscription: SubscriptionStatus;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  deviceKey: string | null;
};

type AdminStats = {
  dailyRevenue: number;
  yesterdayRevenue: number;
  dailyOrderCount: number;
  dailyAvgAmount: number;
  monthlyRevenue: number;
  monthlyChart: { day: number; revenue: number }[];
  dailySeries: { date: string; revenue: number; orders: number }[];
  hourlySeries: { hour: number; count: number }[];
  hourlyRate: number;
  salesGoal: number;
  topProduct: { name: string; sales: number } | null;
  pointRevenue: number;
  userCount: number;
  available: number;
  inventoryPct: number;
  lowStockCount: number;
  recentOrders: {
    id: string;
    productName: string;
    buyerEmail: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paidAt: string;
  }[];
};

type AdminPayload = {
  shop: AdminShop;
  settings: ShopSettings;
  stats: AdminStats;
  products: ProductWithStock[];
  categories: ShopCategory[];
  tiers: ShopTier[];
  coupons: ShopCoupon[];
  reviews: ShopReview[];
  bugReports: BugReport[];
  users: Omit<ShopUser, "passwordHash">[];
  notices: Notice[];
  events: ShopEvent[];
  pendingCharges: PointCharge[];
  recentCharges?: PointCharge[];
  inquiries: ShopInquiry[];
  bannerAds?: ShopBannerAd[];
  notifications?: AdminNotification[];
  licenseRenewal?: {
    level: "info" | "warning" | "danger";
    title: string;
    body: string;
    daysLeft: number;
  } | null;
  isOwnerAdmin?: boolean;
  /** null = owner (full). [] = legacy full staff. otherwise restricted */
  staffPermissions?: StaffPermission[] | null;
};

const NAV: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "main", label: "개요", icon: LayoutDashboard },
  { id: "orders", label: "주문", icon: ClipboardList },
  { id: "products", label: "상품", icon: Package },
  { id: "mcProducts", label: "마크 상품", icon: Gem },
  { id: "capeProducts", label: "망토 상품", icon: Shirt },
  { id: "billing", label: "결제 · 충전", icon: Wallet },
  { id: "users", label: "고객", icon: Users },
  { id: "inquiries", label: "문의", icon: MessageSquare },
  { id: "tiers", label: "고객 등급", icon: Layers },
  { id: "reviews", label: "후기", icon: Star },
  { id: "coupons", label: "쿠폰", icon: Ticket },
  { id: "events", label: "이벤트", icon: Gift },
  { id: "world", label: "마크 월드", icon: Box },
  { id: "chat", label: "월드 채팅", icon: MessagesSquare },
  { id: "banners", label: "배너 광고", icon: ImageIcon },
  { id: "bot", label: "디스코드", icon: Bot },
  { id: "store", label: "스토어", icon: Store },
  { id: "automation", label: "자동화", icon: Zap },
  { id: "notifications", label: "알림", icon: Bell },
  { id: "notices", label: "공지", icon: Megaphone },
  { id: "bugs", label: "버그제보", icon: Bug },
  { id: "staff", label: "스태프", icon: UserCog },
  { id: "logs", label: "활동 로그", icon: ScrollText },
];

const NAV_GROUPS: { label: string; ids: Tab[] }[] = [
  { label: "판매", ids: ["main", "orders", "products", "mcProducts", "capeProducts", "billing"] },
  { label: "고객", ids: ["users", "inquiries", "tiers", "reviews"] },
  { label: "성장", ids: ["coupons", "events", "world", "chat"] },
  { label: "마케팅", ids: ["banners"] },
  { label: "채널 & 스토어", ids: ["bot", "store"] },
  { label: "운영", ids: ["automation", "notifications", "notices", "bugs"] },
  { label: "권한 & 기록", ids: ["staff", "logs"] },
];

const NAV_BY_ID = Object.fromEntries(NAV.map((item) => [item.id, item])) as Record<
  Tab,
  (typeof NAV)[number]
>;

/** Tab → required staff permission. Owner always sees all. null = any admin. */
const TAB_PERM: Partial<Record<Tab, StaffPermission | "owner">> = {
  orders: "orders",
  products: "products",
  mcProducts: "products",
  capeProducts: "products",
  billing: "billing",
  users: "users",
  inquiries: "inquiries",
  tiers: "users",
  reviews: "users",
  coupons: "settings",
  events: "settings",
  banners: "settings",
  bot: "bot",
  store: "settings",
  automation: "settings",
  notifications: "settings",
  notices: "settings",
  bugs: "settings",
  staff: "owner",
  world: "owner",
  chat: "logs",
  logs: "logs",
};

async function postAction(shopSlug: string, body: Record<string, unknown>) {
  const res = await fetch("/api/admin", {
    method: "POST",
    credentials: "include",
    headers: shopHeaders(shopSlug),
    body: JSON.stringify(body),
  });
  return res;
}

export function AdminDashboard({ shopSlug }: { shopSlug: string }) {
  const base = useShopBase();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("main");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [liveStats, setLiveStats] = useState<AdminStats | null>(null);
  const [statsPolledAt, setStatsPolledAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<AdminToastState>(null);
  const [saving, setSaving] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const { confirm, dialog } = useConfirm();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [chargeBusyId, setChargeBusyId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [accountForm, setAccountForm] = useState({
    bankName: "",
    bankAccount: "",
    bankHolder: "",
    minChargeAmount: "",
    depositSuffixPhrase: "",
  });
  const [paymentApiForm, setPaymentApiForm] = useState({
    cultureGiftEnabled: false,
    culturelandId: "",
    culturelandPassword: "",
    nowpaymentsEnabled: false,
    nowpaymentsApiKey: "",
    nowpaymentsIpnSecret: "",
    nowpaymentsPayCurrency: "usdttrc20",
  });
  const [pushbulletToken, setPushbulletToken] = useState("");
  /** True when a token is already stored (API returns masked •••• value). */
  const [pushbulletSaved, setPushbulletSaved] = useState(false);
  const [pushbulletHint, setPushbulletHint] = useState<string | null>(null);
  const [pushbulletWrongKind, setPushbulletWrongKind] = useState(false);
  const [autoChargeEnabled, setAutoChargeEnabled] = useState(false);

  const userMap = useMemo(() => {
    const m = new Map<string, Omit<ShopUser, "passwordHash">>();
    data?.users.forEach((u) => m.set(u.id, u));
    return m;
  }, [data?.users]);

  const pushToast = useCallback((message: string | null, kind?: "success" | "error") => {
    if (!message) {
      setToast(null);
      return;
    }
    setToast({ msg: message, kind: kind ?? inferToastKind(message) });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin", {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setLoading(false);
          router.replace(shopPath(base, "/admin/login"));
          return;
        }
        let failMsg = "관리자 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) failMsg = json.error;
        } catch {
          /* ignore */
        }
        pushToast(failMsg, "error");
        return;
      }
      const json = (await res.json()) as AdminPayload;
      setData({ ...json, inquiries: json.inquiries ?? [], bannerAds: json.bannerAds ?? [] });
      setAccountForm({
        bankName: json.shop.bankName ?? "",
        bankAccount: json.shop.bankAccount ?? "",
        bankHolder: json.shop.bankHolder ?? "",
        minChargeAmount: String(json.settings.minChargeAmount ?? 0),
        depositSuffixPhrase: json.settings.depositSuffixPhrase ?? "",
      });
      setPaymentApiForm({
        cultureGiftEnabled: json.settings.cultureGiftEnabled ?? false,
        culturelandId: json.settings.culturelandId ?? "",
        culturelandPassword: json.settings.culturelandPassword ?? "",
        nowpaymentsEnabled: json.settings.nowpaymentsEnabled ?? false,
        nowpaymentsApiKey: json.settings.nowpaymentsApiKey ?? "",
        nowpaymentsIpnSecret: json.settings.nowpaymentsIpnSecret ?? "",
        nowpaymentsPayCurrency: json.settings.nowpaymentsPayCurrency ?? "usdttrc20",
      });
      // Never put masked •••• secrets into the input — that broke saves / confused auth UX.
      const settingsAny = json.settings as typeof json.settings & {
        pushbulletTokenHint?: string | null;
        pushbulletLooksLikeDeviceKey?: boolean;
      };
      const existingPb = settingsAny.pushbulletAccessToken ?? "";
      const alreadySaved = Boolean(existingPb && (existingPb.includes("•") || existingPb.length >= 8));
      setPushbulletSaved(alreadySaved);
      setPushbulletHint(settingsAny.pushbulletTokenHint ?? null);
      setPushbulletWrongKind(Boolean(settingsAny.pushbulletLooksLikeDeviceKey));
      setPushbulletToken("");
      setAutoChargeEnabled(json.settings.autoChargeEnabled ?? false);
    } catch {
      pushToast("관리자 데이터를 불러오지 못했습니다. 네트워크를 확인해 주세요.", "error");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, router, base, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const actorOpts = {
      isOwner: Boolean(data.isOwnerAdmin),
      isSubAdmin: !data.isOwnerAdmin,
      permissions: data.staffPermissions ?? [],
    };
    const need = TAB_PERM[tab];
    if (!need) return;
    if (need === "owner" && !data.isOwnerAdmin) setTab("main");
    else if (need !== "owner" && !staffCan(actorOpts, need)) setTab("main");
  }, [data, tab]);

  useEffect(() => {
    if (tab !== "main" || !data) return;
    const pollStats = async () => {
      const res = await fetch("/api/stats", {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { stats: AdminStats };
      setLiveStats(json.stats);
      setStatsPolledAt(Date.now());
    };
    void pollStats();
    const timer = setInterval(pollStats, 30_000);
    return () => clearInterval(timer);
  }, [tab, shopSlug, data]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.setAttribute("data-admin-theme", "dark");
    root.classList.add("mfa-light");
    return () => root.classList.remove("mfa-light");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    await fetch("/api/auth/admin/logout", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug, false),
    });
    router.push(shopPath(base, "/admin/login"));
  }

  const sessionPing = useCallback(() => {
    void fetch("/api/auth/admin/me", {
      credentials: "include",
      headers: shopHeaders(shopSlug, false),
    });
  }, [shopSlug]);

  async function runAction(body: Record<string, unknown>, successMsg: string) {
    setSaving(true);
    const res = await postAction(shopSlug, body);
    let failMsg = "실패";
    if (!res.ok) {
      try {
        const json = (await res.json()) as { error?: string };
        failMsg = json.error ?? "실패";
      } catch {
        /* ignore */
      }
    }
    if (!res.ok) {
      if (res.status === 401) {
        pushToast(failMsg || "로그인이 만료됐어요. 다시 로그인해 주세요.", "error");
        setSaving(false);
        router.replace(shopPath(base, "/admin/login"));
        return false;
      }
      pushToast(failMsg, "error");
    } else if (successMsg) pushToast(successMsg, "success");
    setSaving(false);
    if (res.ok) await load();
    return res.ok;
  }

  async function removeItem(
    title: string,
    body: string,
    action: Record<string, unknown>,
    successMsg: string,
  ) {
    const ok = await confirm(title, body);
    if (!ok) return;
    setData((prev) => {
      if (!prev) return prev;
      const kind = action.action;
      if (kind === "product-delete") {
        return { ...prev, products: prev.products.filter((p) => p.id !== action.productId) };
      }
      if (kind === "category-delete") {
        return { ...prev, categories: prev.categories.filter((c) => c.id !== action.categoryId) };
      }
      if (kind === "event-delete") {
        return { ...prev, events: prev.events.filter((e) => e.id !== action.eventId) };
      }
      if (kind === "coupon-delete") {
        return { ...prev, coupons: prev.coupons.filter((c) => c.id !== action.couponId) };
      }
      if (kind === "tier-delete") {
        return { ...prev, tiers: prev.tiers.filter((t) => t.id !== action.tierId) };
      }
      if (kind === "user-delete") {
        return { ...prev, users: prev.users.filter((u) => u.id !== action.userId) };
      }
      if (kind === "notice-delete") {
        return { ...prev, notices: prev.notices.filter((n) => n.id !== action.noticeId) };
      }
      if (kind === "review-delete") {
        return { ...prev, reviews: prev.reviews.filter((r) => r.id !== action.reviewId) };
      }
      return prev;
    });
    await runAction(action, successMsg);
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    const bankName = accountForm.bankName.trim() || resolveAutoChargeBankName("");
    await runAction(
      {
        action: "save-account",
        bankName,
        bankAccount: accountForm.bankAccount,
        bankHolder: accountForm.bankHolder,
        minChargeAmount: Number(accountForm.minChargeAmount),
        depositSuffixPhrase: accountForm.depositSuffixPhrase,
      },
      "계좌 설정 저장됨",
    );
  }

  async function savePushbullet() {
    const token = pushbulletToken.trim();
    if (token.includes("•")) {
      pushToast("마스킹된 값이 아니라 새 토큰을 붙여넣어 주세요.", "error");
      return;
    }
    if (/^vnd_/i.test(token)) {
      pushToast("vnd_ 로 시작하면 잘못된 값입니다. Pushbullet Access Token을 넣어 주세요.", "error");
      return;
    }
    const hasNew = token.length >= 8;
    if (!hasNew && !pushbulletSaved) {
      pushToast("푸시불릿 토큰을 입력해 주세요.", "error");
      return;
    }
    const pbOk = hasNew || (pushbulletSaved && !pushbulletWrongKind);
    const payload: Record<string, unknown> = {
      action: "save-account",
      pushbulletEnabled: autoChargeEnabled && pbOk,
      autoChargeEnabled,
    };
    if (hasNew) payload.pushbulletAccessToken = token;
    await runAction(
      payload,
      autoChargeEnabled ? "자동충전 설정 저장됨" : "자동충전 꺼짐 · 설정 저장됨",
    );
  }

  async function savePaymentApis(e: React.FormEvent) {
    e.preventDefault();
    await runAction(
      {
        action: "save-account",
        cultureGiftEnabled: paymentApiForm.cultureGiftEnabled,
        culturelandId: paymentApiForm.culturelandId.trim() || null,
        culturelandPassword: paymentApiForm.culturelandPassword.trim() || null,
        nowpaymentsEnabled: paymentApiForm.nowpaymentsEnabled,
        nowpaymentsApiKey: paymentApiForm.nowpaymentsApiKey.trim() || null,
        nowpaymentsIpnSecret: paymentApiForm.nowpaymentsIpnSecret.trim() || null,
        nowpaymentsPayCurrency: paymentApiForm.nowpaymentsPayCurrency.trim() || "usdttrc20",
      },
      "충전 API 설정 저장됨",
    );
  }

  async function patchCharge(chargeId: string, action: "approve" | "reject") {
    setChargeBusyId(chargeId);
    const res = await fetch("/api/charges", {
      method: "PATCH",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({ chargeId, action }),
    });
    pushToast(
      res.ok ? (action === "approve" ? "충전 승인됨" : "충전 거절됨") : "처리 실패",
      res.ok ? "success" : "error",
    );
    setChargeBusyId(null);
    if (res.ok) await load();
  }

  async function updateUser(
    userId: string,
    patch: {
      pointsDelta?: number;
      tierId?: string | null;
      isSubAdmin?: boolean;
      staffPermissions?: import("@/lib/types").StaffPermission[];
      banned?: boolean;
      banReason?: string | null;
    },
  ) {
    await runAction({ action: "user-update", userId, ...patch }, "유저 정보 업데이트됨");
  }

  if (loading) {
    return (
      <div className="admin-shell mfa-light" data-theme="dark">
        <AdminDashboardSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <motion.div
        className="admin-shell mfa-light flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
        data-theme="dark"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={vxTransition}
      >
        <p className="text-sm text-neutral-400">
          {toast?.msg ?? "관리자 데이터를 불러오지 못했습니다."}
        </p>
        <button type="button" onClick={() => void load()} className="admin-btn text-sm">
          다시 시도
        </button>
        <a href={shopPath(base, "/admin/login")} className="text-xs text-neutral-500 underline-offset-2 hover:underline">
          로그인으로 이동
        </a>
      </motion.div>
    );
  }

  const pageTitle = NAV.find((n) => n.id === tab)?.label ?? "Admin";
  const navBadges: Partial<Record<Tab, number>> = {
    billing: data.pendingCharges.length,
    inquiries: data.inquiries.filter((i) => i.status === "open").length,
    notifications: data.notifications?.filter((n) => !n.read).length ?? 0,
    bugs: data.bugReports.filter((b) => b.status === "open").length,
  };
  const actorOpts = {
    isOwner: Boolean(data.isOwnerAdmin),
    isSubAdmin: !data.isOwnerAdmin,
    permissions: data.staffPermissions ?? [],
  };
  const canSeeTab = (id: Tab) => {
    const need = TAB_PERM[id];
    if (!need) return true;
    if (need === "owner") return Boolean(data.isOwnerAdmin);
    return staffCan(actorOpts, need);
  };
  const visibleNav = NAV.filter((n) => canSeeTab(n.id));
  const commandItems: CommandItem[] = visibleNav.map((n) => ({
    id: n.id,
    label: n.label,
    group: NAV_GROUPS.find((g) => (g.ids as string[]).includes(n.id))?.label,
    hint: "메뉴로 이동",
    onSelect: () => {
      setTab(n.id);
      setNavOpen(false);
    },
  }));
  const subLabel =
    data.shop.subscription === "active"
      ? "이용 중"
      : data.shop.subscription === "grace"
        ? "유예 기간"
        : "만료";
  const availableStock = data.stats.available;
  const avgTierDiscount = data.tiers.length
    ? Math.round(
        data.tiers.reduce((sum, t) => sum + t.discountPercent, 0) / data.tiers.length,
      )
    : 0;
  const subAdminCount = data.users.filter((u) => u.isSubAdmin).length;
  const pointsSum = data.users.reduce((sum, u) => sum + u.points, 0);
  const pendingReviewCount = data.reviews.filter((r) => !r.approved).length;
  const approvedReviewCount = data.reviews.filter((r) => r.approved).length;
  const openBugCount = data.bugReports.filter((b) => b.status !== "resolved").length;

  async function refreshAll() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function runSearch(raw: string) {
    const q = raw.trim().toLowerCase();
    if (!q || !data) return;
    if (
      data.products.some(
        (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
      )
    ) {
      setTab("products");
      return;
    }
    if (
      data.users.some(
        (u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
      )
    ) {
      setTab("users");
    }
  }

  return (
    <div className="admin-shell mfa-light flex h-dvh max-h-dvh overflow-hidden" data-theme="dark">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-neutral-200 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        본문으로 건너뛰기
      </a>
      <AdminCommandPalette items={commandItems} />
      <AdminToastViewport toast={toast} onDismiss={() => setToast(null)} />
      <SessionIdleGuard onIdle={() => void logout()} onPing={sessionPing} />
      {navOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-50 flex max-w-[85vw] shrink-0 flex-col transition-[width,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:sticky lg:top-0 lg:h-dvh lg:max-h-dvh lg:max-w-none lg:translate-x-0 lg:self-start ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-64 lg:w-[72px]" : "w-[240px] lg:w-[240px]"}`}
      >
        <div className="flex h-full min-h-0 w-full flex-col">
          <header className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`adm-brand group flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[12px] px-2.5 text-left outline-none transition ${
                  collapsed ? "justify-center px-0" : ""
                }`}
                title={data.shop.name}
              >
                {data.shop.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.shop.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6 shrink-0 rounded-[7px] object-cover"
                  />
                ) : (
                  <VendixLogo size={24} className="shrink-0 rounded-[7px]" />
                )}
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.02em] text-white">
                      {data.shop.name}
                    </span>
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-neutral-400">
                      관리자
                    </span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-neutral-500 opacity-60" />
                  </>
                )}
              </button>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-[8px] text-neutral-400 lg:hidden"
                onClick={() => setNavOpen(false)}
                aria-label="닫기"
              >
                <X className="size-4" />
              </button>
            </div>

            {!collapsed && (
              <button
                type="button"
                onClick={() => searchRef.current?.focus()}
                className="flex h-[34px] w-full items-center gap-2 rounded-[8px] border border-white/10 bg-black/30 px-2.5 text-[13px] text-neutral-500 transition hover:bg-white/[0.04] hover:text-neutral-300"
              >
                <Search className="size-3.5 shrink-0 opacity-75" />
                <span className="min-w-0 flex-1 truncate text-left">이동…</span>
                <kbd className="shrink-0 rounded-[5px] bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-500">
                  ⌘K
                </kbd>
              </button>
            )}
          </header>

          <nav
            className="admin-sidebar-nav min-h-0 flex-1 space-y-px overflow-y-auto overscroll-contain px-2.5 pb-3 pt-1 [-webkit-overflow-scrolling:touch]"
            aria-label="메인 내비게이션"
          >
            {NAV_GROUPS.map((group, gi) => {
              const ids = group.ids.filter((id) => canSeeTab(id));
              if (ids.length === 0) return null;
              return (
              <div key={group.label}>
                {!collapsed && (
                  <span
                    className={`mb-1.5 block select-none px-2.5 text-[11.5px] font-semibold tracking-[0.02em] text-neutral-500 ${
                      gi === 0 ? "mt-2" : "mt-4"
                    }`}
                  >
                    {group.label}
                  </span>
                )}
                {collapsed && gi > 0 ? <div className="mx-1 my-2 h-px bg-white/10" /> : null}
                {ids.map((id) => {
                  const item = NAV_BY_ID[id];
                  const Icon = item.icon;
                  const active = tab === item.id;
                  const badge = navBadges[item.id] ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      onClick={() => {
                        setTab(item.id);
                        setToast(null);
                        setNavOpen(false);
                      }}
                      className={`adm-nav group relative mb-px flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px] font-medium tracking-[-0.012em] transition-colors ${
                        collapsed ? "justify-center px-0" : ""
                      } ${active ? "is-active" : "text-neutral-400 hover:text-neutral-100"}`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="adm-nav-pill"
                          className="adm-nav-pill absolute inset-0 rounded-[10px]"
                          transition={{ type: "spring", stiffness: 460, damping: 38 }}
                        />
                      ) : null}
                      <Icon
                        className={`relative size-4 shrink-0 transition duration-300 group-hover:scale-110 ${
                          active ? "text-white" : "opacity-[0.78]"
                        }`}
                      />
                      {!collapsed && (
                        <span className="relative min-w-0 flex-1 truncate text-left">{item.label}</span>
                      )}
                      {badge > 0 ? (
                        collapsed ? (
                          <span className="absolute right-2 top-1.5 size-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                        ) : (
                          <span className="adm-nav-badge relative">{badge > 99 ? "99+" : badge}</span>
                        )
                      ) : null}
                    </button>
                  );
                })}
              </div>
              );
            })}
            {shopSlug === MFA_SHOP_SLUG ? (
              <Link
                href="/verify"
                className={`admin-nav-item mb-px mt-1 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] font-medium text-violet-200 hover:bg-violet-500/15 ${
                  collapsed ? "justify-center px-0" : ""
                }`}
              >
                <ShieldCheck className="size-4 shrink-0" />
                {!collapsed && <span>인증 패널</span>}
              </Link>
            ) : null}
          </nav>

          <footer className="flex shrink-0 items-center gap-1.5 border-t border-white/10 p-2.5">
            <div
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-2 py-1.5 ${
                collapsed ? "justify-center px-0" : ""
              }`}
            >
              <div className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                {data.shop.name.slice(0, 1).toUpperCase()}
              </div>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                    운영 관리자
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-neutral-500">
                    {data.shop.slug}
                  </span>
                </span>
              )}
            </div>
            {!collapsed && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("vendix-open-support"))}
                className="grid size-9 shrink-0 place-items-center rounded-[8px] text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
                aria-label="도움말"
              >
                <HelpCircle className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={logout}
              className="grid size-9 shrink-0 place-items-center rounded-[8px] text-neutral-500 transition hover:bg-white/5 hover:text-red-400"
              aria-label="로그아웃"
            >
              <LogOut className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="hidden size-9 shrink-0 place-items-center rounded-[8px] text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200 lg:grid"
              aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            >
              {collapsed ? (
                <PanelLeftClose className="size-3.5 rotate-180" />
              ) : (
                <ChevronLeft className="size-3.5" />
              )}
            </button>
          </footer>
        </div>
      </aside>

      <main id="admin-main" className="admin-sheet flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" tabIndex={-1}>
        <div className="admin-sheet-inner flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="admin-topbar sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b px-4 sm:px-5">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => {
                // PC 에서는 사이드바를 접고 펴고, 모바일에서는 메뉴를 연다
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                  setCollapsed((v) => !v);
                } else {
                  setNavOpen(true);
                }
              }}
              aria-label="메뉴 열기"
            >
              <Menu className="size-5" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="hidden text-[13px] text-neutral-500 sm:inline">
                {NAV_GROUPS.find((g) => g.ids.includes(tab))?.label ?? "관리"}
              </span>
              <span className="hidden text-neutral-600 sm:inline">/</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.h1
                  key={pageTitle}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white"
                >
                  {pageTitle}
                </motion.h1>
              </AnimatePresence>
              <span className="adm-status ml-2 hidden md:inline-flex">
                <span className="adm-live-dot" />
                실시간
              </span>
            </div>
            <form
              className="relative min-w-0 max-w-[12rem] flex-1 sm:max-w-xs"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색"
                className="admin-search"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[5px] bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-500 sm:inline">
                ⌘K
              </span>
            </form>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="admin-icon-btn"
                onClick={() => void refreshAll()}
                aria-label="새로고침"
              >
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                className="admin-icon-btn"
                onClick={() => setTab("billing")}
                aria-label="알림"
              >
                <Bell className="size-4" />
                {data.pendingCharges.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold leading-4 text-white shadow-[0_0_10px_rgba(244,63,94,0.6)]">
                    {data.pendingCharges.length}
                  </span>
                )}
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-5 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              >
          {tab === "main" && (
            <div className="space-y-4">
              {(data.licenseRenewal || (data.notifications?.filter((n) => !n.read).length ?? 0) > 0) && (
                <div className="space-y-2">
                  {data.licenseRenewal ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        data.licenseRenewal.level === "danger"
                          ? "border-red-500/30 bg-red-500/10 text-red-200"
                          : data.licenseRenewal.level === "warning"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                            : "border-neutral-500/30 bg-neutral-500/10 text-neutral-100"
                      }`}
                    >
                      <p className="font-semibold">{data.licenseRenewal.title}</p>
                      <p className="mt-0.5 text-xs opacity-90">{data.licenseRenewal.body}</p>
                    </div>
                  ) : null}
                  {data.notifications
                    ?.filter((n) => !n.read)
                    .slice(0, 3)
                    .map((n) => (
                      <div
                        key={n.id}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/10 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-orange-100">{n.title}</p>
                          <p className="text-xs text-orange-200/80">{n.body}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-xs text-orange-300 hover:text-white"
                          onClick={() =>
                            void runAction({ action: "notification-read", notificationId: n.id }, "")
                          }
                        >
                          확인
                        </button>
                      </div>
                    ))}
                </div>
              )}
              {statsPolledAt ? (
                <p className="text-[11px] text-neutral-600">
                  운영 보드 · {new Date(statsPolledAt).toLocaleTimeString("ko-KR")} 갱신
                </p>
              ) : null}
              <AdminOverview
                stats={{
                  ...(liveStats ?? data.stats),
                  userCount: (liveStats ?? data.stats).userCount ?? data.stats.userCount,
                  pointRevenue: (liveStats ?? data.stats).pointRevenue ?? data.stats.pointRevenue,
                }}
                pendingCharges={data.pendingCharges}
                openInquiryCount={data.inquiries.filter((i) => i.status === "open").length}
                unreadNotifCount={data.notifications?.filter((n) => !n.read).length ?? 0}
                onOpenProducts={() => setTab("products")}
                onOpenCharges={() => setTab("billing")}
                onOpenOrders={() => setTab("orders")}
                onOpenInquiries={() => setTab("inquiries")}
                onOpenNotifications={() => setTab("notifications")}
              />
            </div>
          )}

          {tab === "store" && (
            <StoreSettingsPanel
              shop={data.shop}
              settings={data.settings}
              saving={saving}
              licenseKey={licenseKey}
              onLicenseKeyChange={setLicenseKey}
              onExtendLicense={async (e) => {
                e.preventDefault();
                const ok = await runAction(
                  { action: "extend-license", licenseKey: licenseKey.trim() },
                  "라이선스가 연장되었습니다.",
                );
                if (ok) setLicenseKey("");
              }}
              onSave={async (body) => runAction(body, "스토어 설정이 저장되었습니다.")}
            />
          )}

          {tab === "billing" && (
            <AdminBillingHub
              shopSlug={shopSlug}
              shopPlan={data.shop.plan}
              shopName={data.shop.name}
              subLabel={subLabel}
              pending={data.pendingCharges}
              recentCharges={data.recentCharges ?? []}
              userEmail={(id) => userMap.get(id)?.email ?? id}
              pointRevenue={data.stats.pointRevenue}
              accountForm={accountForm}
              onAccountChange={setAccountForm}
              onSaveAccount={saveAccount}
              pushbulletToken={pushbulletToken}
              autoChargeEnabled={autoChargeEnabled}
              pushbulletSaved={pushbulletSaved}
              pushbulletHint={pushbulletHint}
              pushbulletWrongKind={pushbulletWrongKind}
              onPushbulletTokenChange={setPushbulletToken}
              onAutoChargeEnabledChange={setAutoChargeEnabled}
              onSavePushbullet={savePushbullet}
              paymentApiForm={paymentApiForm}
              onPaymentApiChange={setPaymentApiForm}
              onSavePaymentApis={savePaymentApis}
              settings={data.settings}
              onSaveSecurity={async (body) => runAction(body, "보안 설정이 저장되었습니다.")}
              licenseKey={licenseKey}
              onLicenseKeyChange={setLicenseKey}
              onExtendLicense={async (e) => {
                e.preventDefault();
                const ok = await runAction(
                  { action: "extend-license", licenseKey: licenseKey.trim() },
                  "라이선스가 연장되었습니다.",
                );
                if (ok) setLicenseKey("");
              }}
              saving={saving}
              busyId={chargeBusyId}
              onApprove={(id) => void patchCharge(id, "approve")}
              onReject={(id) => void patchCharge(id, "reject")}
            />
          )}

          {tab === "orders" && <AdminOrdersPanel shopSlug={shopSlug} />}

          {tab === "bot" && shopSlug === MFA_SHOP_SLUG && (
            <MfaDiscordPanel shopSlug={shopSlug} />
          )}

          {tab === "bot" &&
            shopSlug !== MFA_SHOP_SLUG &&
            (planMeetsMinimum(data.shop.plan, "pro") ? (
              <DiscordBotPanel
                shopSlug={shopSlug}
                shopName={data.shop.name}
                shopPlan={data.shop.plan}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-semibold">봇 자판기</h3>
                <p className="mt-2 text-sm text-neutral-400">
                  DOES 메인 Discord 봇 자판기는{" "}
                  <strong className="text-neutral-200">PRO 이상</strong>에서 사용할 수 있어요.
                  자체 봇 토큰(개인봇)은{" "}
                  <strong className="text-neutral-200">PRO MAX</strong> 전용입니다.
                  <br />
                  현재 플랜: {formatPlanLabel(data.shop.plan)}
                </p>
              </div>
            ))}

          {tab === "products" && shopSlug === MFA_SHOP_SLUG && (
            <MfaInventoryPanel
              shopSlug={shopSlug}
              onMessage={(text, tone) => pushToast(text, tone === "err" ? "error" : "success")}
            />
          )}

          {tab === "products" && (
            <AdminProductsPanel
              shopSlug={shopSlug}
              shopPlan={data.shop.plan}
              products={data.products}
              categories={data.categories}
              availableStock={availableStock}
              lowStockCount={data.stats.lowStockCount}
              onReload={load}
              onMessage={pushToast}
              onDeleteProduct={(productId, name) =>
                void removeItem("상품 삭제", `${name}을(를) 삭제할까요?`, { action: "product-delete", productId }, "상품 삭제됨")
              }
              onDeleteCategory={(categoryId, name) =>
                void removeItem("카테고리 삭제", `${name} 카테고리를 삭제할까요?`, { action: "category-delete", categoryId }, "카테고리 삭제됨")
              }
              onCreateCategory={async (name) =>
                runAction({ action: "category-create", name }, "카테고리 추가됨")
              }
              onRenameCategory={async (categoryId, name) =>
                runAction({ action: "category-rename", categoryId, name }, "카테고리 이름을 바꿨어요")
              }
            />
          )}

          {tab === "mcProducts" && (
            <AdminMcProductsPanel
              shopSlug={shopSlug}
              products={data.products}
              categories={data.categories}
              onReload={load}
              onMessage={pushToast}
              onDeleteProduct={(productId, name) =>
                void removeItem("상품 삭제", `${name}을(를) 삭제할까요?`, { action: "product-delete", productId }, "상품 삭제됨")
              }
            />
          )}

          {tab === "capeProducts" && (
            <AdminCapeProductsPanel
              shopSlug={shopSlug}
              products={data.products}
              onReload={load}
              onMessage={pushToast}
            />
          )}

          {tab === "events" && (
            <AdminEventsPanel
              shopSlug={shopSlug}
              events={data.events}
              products={data.products}
              onReload={load}
              onMessage={pushToast}
              onDeleteEvent={(eventId, title) =>
                void removeItem(
                  "이벤트 삭제",
                  `${title} 이벤트를 삭제할까요?`,
                  { action: "event-delete", eventId },
                  "이벤트 삭제됨",
                )
              }
            />
          )}

          {tab === "coupons" && (
            <AdminCouponsPanel
              coupons={data.coupons}
              onDeleteCoupon={(couponId, code) =>
                void removeItem(
                  "쿠폰 삭제",
                  `${code} 쿠폰을 삭제할까요?`,
                  { action: "coupon-delete", couponId },
                  "쿠폰 삭제됨",
                )
              }
              onCreateCoupon={(body) =>
                runAction({ action: "coupon-create", ...body }, "쿠폰 생성됨")
              }
            />
          )}

          {tab === "inquiries" && (
            <AdminInquiriesPanel
              inquiries={data.inquiries ?? []}
              userLabel={(id) => userMap.get(id)?.email ?? userMap.get(id)?.name ?? id}
              onReply={async (inquiryId, reply) => {
                await runAction(
                  { action: "inquiry-reply", inquiryId, reply },
                  "답변을 등록했어요.",
                );
              }}
            />
          )}

          {tab === "banners" && (
            <AdminBannersPanel
              ads={data.bannerAds ?? []}
              settings={data.settings}
              userLabel={(id) => userMap.get(id)?.email ?? userMap.get(id)?.name ?? id}
              onSavePricing={async (body) => {
                await runAction({ action: "banner-settings", ...body }, "배너 요금 저장됨");
              }}
              onReview={async (adId, decision, rejectReason) => {
                await runAction(
                  { action: "banner-review", adId, decision, rejectReason },
                  decision === "approve" ? "배너 승인됨" : "배너 거절됨",
                );
              }}
              onTakeDown={async (adId) => {
                await runAction({ action: "banner-takedown", adId }, "배너를 내렸어요");
              }}
            />
          )}

          {tab === "automation" && (
            <AdminAutomationPanel
              settings={data.settings}
              onSave={async (patch) =>
                runAction({ action: "save-account", ...patch }, "자동화 설정 저장됨")
              }
              onOpenBilling={() => setTab("billing")}
              onOpenBanners={() => setTab("banners")}
            />
          )}

          {tab === "notifications" && (
            <AdminNotificationsPanel
              notifications={data.notifications ?? []}
              onOpenBilling={() => setTab("billing")}
            />
          )}

          {tab === "staff" && (
            <AdminStaffPanel users={data.users} onOpenUsers={() => setTab("users")} />
          )}

          {tab === "logs" && <AdminLogsPanel shopSlug={shopSlug} />}

          {tab === "world" && <AdminWorldPanel shopSlug={shopSlug} onMessage={pushToast} />}

          {tab === "chat" && <AdminWorldChatPanel shopSlug={shopSlug} />}

          {tab === "tiers" && (
            <AdminTiersPanel
              tiers={data.tiers}
              avgDiscount={avgTierDiscount}
              onSave={(body) => runAction({ action: "tier-create", ...body }, "등급 추가됨")}
              onUpdateRole={(tierId, discordRoleId) =>
                runAction({ action: "tier-update", tierId, discordRoleId }, "역할 저장됨")
              }
              onDelete={(tierId, name) =>
                void removeItem(
                  "등급 삭제",
                  `${name} 등급을 삭제할까요?`,
                  { action: "tier-delete", tierId },
                  "등급 삭제됨",
                )
              }
            />
          )}

          {tab === "users" && (
            <AdminUsersPanel
              shopSlug={shopSlug}
              users={data.users}
              tiers={data.tiers}
              subAdminCount={subAdminCount}
              pointsSum={pointsSum}
              onUpdate={updateUser}
              onDelete={(userId, email) =>
                void removeItem(
                  "유저 삭제",
                  `${email} 유저를 삭제할까요?`,
                  { action: "user-delete", userId },
                  "유저 삭제됨",
                )
              }
            />
          )}

          {tab === "notices" && (
            <AdminNoticesPanel
              shopSlug={shopSlug}
              notices={data.notices}
              onReload={load}
              onMessage={pushToast}
              onDelete={(noticeId, title) =>
                void removeItem(
                  "공지 삭제",
                  `${title} 공지를 삭제할까요?`,
                  { action: "notice-delete", noticeId },
                  "공지 삭제됨",
                )
              }
            />
          )}

          {tab === "reviews" && (
            <AdminReviewsPanel
              shopSlug={shopSlug}
              onMessage={pushToast}
              reviews={data.reviews}
              pendingCount={pendingReviewCount}
              approvedCount={approvedReviewCount}
              authorEmail={(id) => userMap.get(id)?.email ?? id}
              onSave={(reviewId, body) =>
                runAction({ action: "review-update", reviewId, body }, "후기 수정됨")
              }
              onToggleApprove={(r) =>
                runAction(
                  { action: "review-update", reviewId: r.id, approved: !r.approved },
                  r.approved ? "승인 취소됨" : "후기 승인됨",
                )
              }
              onDelete={(reviewId) =>
                void removeItem(
                  "후기 삭제",
                  "이 후기를 삭제할까요?",
                  { action: "review-delete", reviewId },
                  "후기 삭제됨",
                )
              }
            />
          )}

          {tab === "bugs" && (
            <AdminBugsPanel
              bugs={data.bugReports}
              openCount={openBugCount}
              onSubmit={(body) => runAction({ action: "bug-report", ...body }, "버그 제보 접수됨")}
              onResolve={(reportId) =>
                void runAction({ action: "bug-resolve", reportId }, "해결 처리됨")
              }
            />
          )}

            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>
      {dialog}
      <SupportChatWidget shopSlug={shopSlug} shopName={data.shop.name} />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
  saving,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-black/30 p-3">
      <div className="min-w-0 pr-2">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={onToggle}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-neutral-700"}`}
        aria-pressed={on}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${on ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  );
}
