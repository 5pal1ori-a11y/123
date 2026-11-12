"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Coins,
  Home,
  LayoutGrid,
  Loader2,
  Link2,
  LogOut,
  Moon,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  TreePine,
  Trophy,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { vxTransitionMobile } from "@/lib/motion";
import { useShopUser } from "./user-context";
import { ChargePageClient } from "./charge-page-client";
import {
  ShopProductsTab,
  type ProductSection,
  type ProductSort,
  type ShopListingSummary,
} from "./shop-products-tab";
import { ShopCartBar, addToCart } from "./shop-cart";
import { UserHomeTab } from "./user-home-tab";
import { UserHistoryTab } from "./user-history-tab";
import { UserAccountTab } from "./user-account-tab";
import { UserLeaderboardTab } from "./user-leaderboard-tab";
import { UserAttendanceTab } from "./user-attendance-tab";
import { UserReviewsTab } from "./user-reviews-tab";
import { UserIslandTab } from "./island/user-island-tab";
import { ShopInquiryChatWidget } from "./shop-inquiry-chat-widget";
import { UserAuthPanel } from "./user-auth-panel";
import { LoginRequiredNotice } from "./login-required-notice";
import { VendixLogo } from "@/components/ui/vendix-logo";
import type { UserCharge, UserOrder, UserTab } from "./user-dashboard-types";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { BankInfo } from "@/lib/bank";
import type { ProductWithStock, ShopEvent, ShopTier, StockStatus } from "@/lib/types";
import { calcProductPrice } from "@/lib/pricing";

const THEME_KEY = "does-dash-theme";
const themeListeners = new Set<() => void>();

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readDarkTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

function saveDarkTheme(dark: boolean) {
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* private mode */
  }
  themeListeners.forEach((listener) => listener());
}

const NAV: { id: UserTab; label: string; icon: typeof Home }[] = [
  { id: "main", label: "홈", icon: Home },
  { id: "products", label: "쇼핑", icon: Package },
  { id: "charge", label: "충전", icon: Coins },
  { id: "attendance", label: "출석", icon: CalendarCheck },
  { id: "reviews", label: "후기", icon: Star },
  { id: "island", label: "내 섬", icon: TreePine },
  { id: "history", label: "내역", icon: Receipt },
  { id: "leaderboard", label: "랭킹", icon: Trophy },
  { id: "account", label: "계정", icon: Settings },
];

const TABS = NAV.map((n) => n.id);

/** 로그인해야 열 수 있는 탭 — 게스트는 홈·쇼핑·후기·랭킹만 */
const LOGIN_TABS = new Set<UserTab>(["charge", "attendance", "island", "history", "account"]);

/** 로그인 전 화면에 쓰는 자리표시 사용자 */
const GUEST_VIEWER = {
  name: "게스트",
  email: "로그인하면 구매할 수 있어요",
  points: 0,
  totalCharged: 0,
};

const META: Record<UserTab, { title: string; sub: string }> = {
  main: { title: "홈", sub: "오늘도 좋은 하루 보내세요" },
  products: { title: "쇼핑", sub: "포인트로 바로 구매하고 즉시 받아보세요" },
  charge: { title: "포인트 충전", sub: "계좌 · 문화상품권 · 코인으로 간편하게" },
  attendance: { title: "출석체크", sub: "매일 한 번, 랜덤 포인트 상자를 열어보세요" },
  reviews: { title: "후기내역", sub: "디스코드에 남겨진 후기를 실시간으로 모아봤어요" },
  island: { title: "내 섬", sub: "활동으로 블록을 모아 나만의 스카이블럭 섬을 꾸며보세요" },
  history: { title: "이용 내역", sub: "구매와 충전 기록을 한눈에" },
  leaderboard: { title: "랭킹", sub: "이번 기간 충전 TOP 유저" },
  account: { title: "계정", sub: "프로필 · 보안 · 추천인" },
};

function normalizeTab(value: string | null): UserTab {
  if (value === "purchase") return "products";
  if (value !== null && TABS.includes(value as UserTab)) return value as UserTab;
  return "main";
}

async function postUser(shopSlug: string, body: Record<string, unknown>) {
  return fetch("/api/user", {
    method: "POST",
    credentials: "include",
    headers: shopHeaders(shopSlug),
    body: JSON.stringify(body),
  });
}

export function UserDashboard({
  shopSlug,
  shopName,
  welcomeMessage,
  bank,
  minChargeAmount,
  depositSuffixPhrase,
  cultureGiftEnabled,
  nowpaymentsEnabled,
  products,
  events,
}: {
  shopSlug: string;
  shopName: string;
  welcomeMessage: string;
  bank: BankInfo;
  minChargeAmount: number;
  depositSuffixPhrase: string;
  cultureGiftEnabled?: boolean;
  nowpaymentsEnabled?: boolean;
  products: ProductWithStock[];
  events: ShopEvent[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading, logout, refresh } = useShopUser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<UserTab>(() => normalizeTab(searchParams.get("tab")));
  const [tier, setTier] = useState<ShopTier | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [charges, setCharges] = useState<UserCharge[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [attendedToday, setAttendedToday] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [productSort, setProductSort] = useState<ProductSort>("default");
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [liveStock, setLiveStock] = useState<Record<string, { count: number; status: StockStatus }>>({});
  const [salesCounts, setSalesCounts] = useState<Record<string, number>>({});
  const [shopSummary, setShopSummary] = useState<ShopListingSummary | null>(null);
  const [productSection, setProductSection] = useState<ProductSection>("general");
  const [loginHistory, setLoginHistory] = useState<
    { id: string; ip: string; deviceLabel: string; createdAt: string }[]
  >([]);
  const [sessions, setSessions] = useState<
    { id: string; deviceLabel: string; ip: string; createdAt: string; lastActiveAt: string; current: boolean }[]
  >([]);
  const [monthlyReport, setMonthlyReport] = useState<
    { month: string; chargeTotal: number; chargeCount: number; purchaseTotal: number; purchaseCount: number }[]
  >([]);
  const [buyBusyId, setBuyBusyId] = useState<string | null>(null);
  const [purchaseCode, setPurchaseCode] = useState<string | null>(null);
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [copiedPurchase, setCopiedPurchase] = useState(false);
  const [cartTick, setCartTick] = useState(0);
  const [restockNotes, setRestockNotes] = useState<
    { id: string; title: string; body: string; productId: string | null }[]
  >([]);

  const activeEvents = useMemo(() => {
    const now = Date.now();
    return events.filter(
      (ev) => ev.active && new Date(ev.endsAt).getTime() >= now && ev.productId,
    );
  }, [events]);

  const eventByProduct = useMemo(() => {
    const map = new Map<string, ShopEvent>();
    for (const ev of activeEvents) {
      if (ev.productId) map.set(ev.productId, ev);
    }
    return map;
  }, [activeEvents]);

  const sectionProducts = useMemo(
    () =>
      products.filter((p) =>
        productSection === "mc_account" ? p.productKind === "mc_account" : p.productKind !== "mc_account",
      ),
    [products, productSection],
  );

  const sectionCounts = useMemo(() => {
    const mc = products.filter((p) => p.productKind === "mc_account").length;
    return { general: products.length - mc, mc_account: mc };
  }, [products]);

  const productCategories = useMemo(() => {
    const set = new Set(sectionProducts.map((p) => p.category).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [sectionProducts]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    let list = sectionProducts.filter((p) => {
      if (productCategory !== "all" && p.category !== productCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      );
    });

    if (productSort === "price_asc" || productSort === "price_desc") {
      list = [...list].sort((a, b) => {
        const pa = calcProductPrice(a, tier, eventByProduct.get(a.id) ?? null).finalPrice;
        const pb = calcProductPrice(b, tier, eventByProduct.get(b.id) ?? null).finalPrice;
        return productSort === "price_asc" ? pa - pb : pb - pa;
      });
    } else if (productSort === "popular") {
      list = [...list].sort((a, b) => (salesCounts[b.id] ?? 0) - (salesCounts[a.id] ?? 0));
    }
    return list;
  }, [sectionProducts, productQuery, productCategory, productSort, tier, eventByProduct, salesCounts]);

  const recentOrders = useMemo(() => orders.slice(0, 3), [orders]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const res = await fetch("/api/user", {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tier: ShopTier | null;
          orders?: UserOrder[];
          charges?: UserCharge[];
          wishlist?: string[];
          notifications?: { id: string; title: string; body: string; productId: string | null }[];
          monthlyReport?: typeof monthlyReport;
          loginHistory?: typeof loginHistory;
          sessions?: typeof sessions;
        };
        setTier(data.tier ?? null);
        setOrders(data.orders ?? []);
        setCharges(data.charges ?? []);
        setWishlistIds(new Set(data.wishlist ?? []));
        setRestockNotes(data.notifications ?? []);
        setMonthlyReport(data.monthlyReport ?? []);
        setLoginHistory(data.loginHistory ?? []);
        setSessions(data.sessions ?? []);
      }
    } finally {
      setProfileLoading(false);
    }
  }, [shopSlug, user]);

  useEffect(() => {
    setTab(normalizeTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (!user || searchParams.get("tab") !== "inquiry") return;
    window.dispatchEvent(new CustomEvent("does-open-inquiry"));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [user, searchParams, pathname, router]);

  useEffect(() => {
    if (user) void loadProfile();
  }, [user, loadProfile]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/gift/random-box", { credentials: "include", headers: shopHeaders(shopSlug, false) })
      .then((res) => (res.ok ? (res.json() as Promise<{ claimed?: boolean }>) : null))
      .then((data) => {
        if (!cancelled && data) setAttendedToday(Boolean(data.claimed));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, shopSlug]);

  /* MFA 상점은 디스코드를 연동해야 구매할 수 있다 */
  const needDiscord = shopSlug.toLowerCase() === "mfa" && Boolean(user) && !user?.discordId;
  const discordLinkHref = `/api/auth/user/discord/start?shop=${encodeURIComponent(shopSlug)}&next=${encodeURIComponent("/dashboard")}&link=1`;
  const [discordGate, setDiscordGate] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const isGuest = !user;
  const viewer = user ?? GUEST_VIEWER;
  const requireLogin = useCallback(() => {
    setMenuOpen(false);
    setSheetOpen(false);
    setLoginOpen(true);
  }, []);

  useEffect(() => {
    if (!needDiscord) return;
    try {
      if (sessionStorage.getItem("does-discord-gate") === "1") return;
      sessionStorage.setItem("does-discord-gate", "1");
    } catch {
      /* 저장소를 못 쓰면 매번 보여준다 */
    }
    setDiscordGate(true);
  }, [needDiscord]);

  useEffect(() => {
    const result = searchParams.get("discord");
    if (result !== "linked" && result !== "merged" && result !== "link_error") return;
    if (result === "linked") setMsg("디스코드 연동 완료! 이제 상품을 구매할 수 있어요.");
    else if (result === "merged") setMsg("예전 디스코드 계정과 합쳐졌어요. 포인트와 구매 내역이 그대로 이어져요.");
    else setMsg(`디스코드 연동 실패: ${searchParams.get("msg") || "다시 시도해 주세요."}`);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("discord");
    params.delete("msg");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    void refresh();
  }, [searchParams, pathname, router, refresh]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.setAttribute("data-admin-theme", "dark");
    root.classList.add("mfa-light");
    return () => root.classList.remove("mfa-light");
  }, []);

  const darkTheme = useSyncExternalStore(subscribeTheme, readDarkTheme, () => false);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("mfa-dark", darkTheme);
    return () => root.classList.remove("mfa-dark");
  }, [darkTheme]);
  const themeLabel = darkTheme ? "라이트 모드" : "다크 모드";
  const ThemeIcon = darkTheme ? Sun : Moon;

  useEffect(() => {
    if (user) setNickname(user.name);
  }, [user]);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3600);
    return () => window.clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    if (tab !== "products") return;
    const poll = async () => {
      const res = await fetch("/api/products/stock", { headers: shopHeaders(shopSlug, false) });
      if (!res.ok) return;
      const data = (await res.json()) as {
        products?: { id: string; count: number; status: StockStatus; sales: number }[];
        summary?: ShopListingSummary;
      };
      if (data.summary) setShopSummary(data.summary);
      if (!data.products) return;
      const stock: typeof liveStock = {};
      const sales: Record<string, number> = {};
      for (const p of data.products) {
        stock[p.id] = { count: p.count, status: p.status };
        sales[p.id] = p.sales;
      }
      setLiveStock(stock);
      setSalesCounts(sales);
    };
    void poll();
    const timer = setInterval(poll, 8000);
    return () => clearInterval(timer);
  }, [user, tab, shopSlug]);

  async function toggleWishlist(productId: string) {
    if (!user) {
      requireLogin();
      return;
    }
    const res = await fetch("/api/wishlist", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({ productId }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { wishlisted: boolean };
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (data.wishlisted) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  async function revokeSession(sessionId: string) {
    await postUser(shopSlug, { action: "revoke-session", sessionId });
    setSessions((s) => s.filter((x) => x.id !== sessionId));
  }

  async function revokeOtherSessions() {
    await postUser(shopSlug, { action: "revoke-other-sessions" });
    setSessions((s) => s.filter((x) => x.current));
  }

  function switchTab(next: UserTab) {
    if (!user && LOGIN_TABS.has(next)) {
      requireLogin();
      return;
    }
    setTab(next);
    setMsg(null);
    setSheetOpen(false);
    setMenuOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "main") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function handleLogout() {
    setMenuOpen(false);
    setSheetOpen(false);
    await logout();
    setTier(null);
    setOrders([]);
    setCharges([]);
    setTab("main");
    setMsg(null);
  }

  async function buyProduct(productId: string) {
    if (!user) {
      requireLogin();
      return;
    }
    if (needDiscord) {
      setDiscordGate(true);
      return;
    }
    setBuyBusyId(productId);
    setPurchaseError(null);
    setPurchaseCode(null);
    setPurchasePending(false);
    setCopiedPurchase(false);
    try {
      const res = await fetch("/api/purchase/points", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data?.code === "discord_link_required") setDiscordGate(true);
      if (!res.ok) throw new Error(data.error);
      const order = data.order as { status?: string; dispensedCode?: string | null };
      if (order?.status === "awaiting_fulfillment") {
        setPurchasePending(true);
        setPurchaseCode(order.dispensedCode || "관리자가 확인 후 수동으로 지급합니다.");
      } else {
        setPurchaseCode(order?.dispensedCode ?? null);
      }
      await refresh();
      await loadProfile();
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : "구매 실패");
    } finally {
      setBuyBusyId(null);
    }
  }

  async function copyPurchaseCode() {
    if (!purchaseCode) return;
    try {
      await navigator.clipboard.writeText(purchaseCode);
      setCopiedPurchase(true);
      setTimeout(() => setCopiedPurchase(false), 1600);
    } catch {
      /* ignore */
    }
  }

  async function saveNickname(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await postUser(shopSlug, { action: "update-profile", name: nickname });
    const data = await res.json();
    setMsg(res.ok ? "저장했어요." : (data.error ?? "변경 실패"));
    setSaving(false);
    if (res.ok) await refresh();
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await postUser(shopSlug, {
      action: "change-email",
      newEmail,
      password: emailPassword,
    });
    const data = await res.json();
    setMsg(res.ok ? "이메일을 변경했어요." : (data.error ?? "변경 실패"));
    setSaving(false);
    if (res.ok) {
      setNewEmail("");
      setEmailPassword("");
      await refresh();
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await postUser(shopSlug, {
      action: "change-password",
      currentPassword,
      newPassword,
    });
    const data = await res.json();
    setMsg(res.ok ? "비밀번호를 변경했어요." : (data.error ?? "변경 실패"));
    setSaving(false);
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  async function copyCode(orderId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(orderId);
      window.setTimeout(() => setCopiedId((cur) => (cur === orderId ? null : cur)), 1800);
    } catch {
      setMsg("복사에 실패했어요");
    }
  }

  const reduceMotion = useReducedMotion();
  const tabTransition = reduceMotion ? { duration: 0 } : vxTransitionMobile;

  function trackPointer(e: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || e.pointerType !== "mouse") return;
    rootRef.current?.style.setProperty("--mx", `${e.clientX}px`);
    rootRef.current?.style.setProperty("--my", `${e.clientY}px`);
  }

  const meta = META[tab];
  const TabIcon = NAV.find((n) => n.id === tab)?.icon ?? Home;
  const initial = (viewer.name || viewer.email).slice(0, 1).toUpperCase();
  const msgIsError = msg ? /실패|오류|없|못/.test(msg) : false;
  const dockSide: { id: UserTab; label: string; icon: typeof Home }[][] = [
    [
      { id: "main", label: "홈", icon: Home },
      { id: "products", label: "쇼핑", icon: Package },
    ],
    [{ id: "attendance", label: "출석", icon: CalendarCheck }],
  ];

  return (
    <div ref={rootRef} className="udash udx mfa-light" onPointerMove={trackPointer}>
      <div className="mf-bg" aria-hidden>
        <span className="mf-bg-grid" />
        <span className="mf-bg-orb is-a" />
        <span className="mf-bg-orb is-b" />
        <span className="mf-bg-noise" />
        <span className="mf-bg-spot" />
      </div>

      <aside className="udx-side" aria-label="마이페이지 메뉴">
        <button type="button" className="udx-side-brand" onClick={() => switchTab("main")}>
          <span className="udx-side-logo">
            <VendixLogo size={30} priority />
          </span>
          <span className="min-w-0">
            <b>DOES</b>
            <small>{shopName}</small>
          </span>
        </button>

        <button type="button" className="udx-side-wallet" onClick={() => switchTab("charge")}>
          <span className="min-w-0">
            <small>보유 포인트</small>
            <b className="tabular-nums">{formatKRW(viewer.points)}</b>
          </span>
          <span className="udx-side-wallet-cta">
            충전
            <ChevronRight className="size-3.5" />
          </span>
        </button>

        <nav className="udx-side-nav" aria-label="마이페이지">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`udx-side-item ${active ? "is-on" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <motion.span
                    layoutId="udx-side-pill"
                    className="udx-side-pill"
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                  />
                ) : null}
                <Icon className="relative size-[18px]" />
                <span className="relative">{item.label}</span>
                {item.id === "attendance" && !active && !attendedToday ? <i className="udx-side-dot" aria-hidden /> : null}
              </button>
            );
          })}
        </nav>

        <div className="udx-side-foot">
          <div className="flex items-center justify-between gap-2">
            <span className="mf-secure">
              <span className="mf-pulse" />
              보안 연결
            </span>
            <button
              type="button"
              className="udx-theme"
              onClick={() => saveDarkTheme(!darkTheme)}
              aria-label={themeLabel}
              title={themeLabel}
            >
              <ThemeIcon />
            </button>
          </div>
          <button type="button" className="udx-side-me" onClick={() => switchTab("account")}>
            <span className="udx-avatar">{initial}</span>
            <span className="min-w-0">
              <b>{viewer.name}</b>
              <small>{viewer.email}</small>
            </span>
            <Settings className="ml-auto size-4 shrink-0 opacity-50" />
          </button>
          <button
            type="button"
            className="udx-side-logout"
            onClick={() => (isGuest ? requireLogin() : void handleLogout())}
          >
            <LogOut className="size-4" />
            {isGuest ? "로그인" : "로그아웃"}
          </button>
        </div>
      </aside>

      <header className="udx-bar">
        <div className="udx-bar-inner">
          <button type="button" className="mf-logo" onClick={() => switchTab("main")}>
            <span className="mf-logo-mark">
              <VendixLogo size={34} priority />
            </span>
            <span className="mf-logo-word">DOES</span>
          </button>

          <span className="udx-bar-title">
            <TabIcon className="size-[18px]" />
            {meta.title}
          </span>

          <div className="udx-bar-right">
            <span className="mf-secure">
              <span className="mf-pulse" />
              보안 연결
            </span>
            <Link href="/verify" className="udx-round" aria-label="서버 인증" title="서버 인증">
              <ShieldCheck className="size-[18px]" />
            </Link>
            <button
              type="button"
              className="udx-round"
              onClick={() => saveDarkTheme(!darkTheme)}
              aria-label={themeLabel}
              title={themeLabel}
            >
              <ThemeIcon className="size-[18px]" />
            </button>
            <motion.button
              type="button"
              className="udx-coin"
              onClick={() => switchTab("charge")}
              whileTap={{ scale: 0.96 }}
            >
              <span className="udx-coin-icon">
                <Coins className="size-3.5" />
              </span>
              <span className="tabular-nums">{formatKRW(viewer.points)}</span>
            </motion.button>
            <div className="relative">
              <button
                type="button"
                className="udx-avatar"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="내 계정"
                aria-expanded={menuOpen}
              >
                {initial}
              </button>
              <AnimatePresence>
                {menuOpen ? (
                  <>
                    <button
                      type="button"
                      className="udx-menu-scrim"
                      aria-label="닫기"
                      onClick={() => setMenuOpen(false)}
                    />
                    <motion.div
                      className="udx-menu"
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 480, damping: 34 }}
                    >
                      <div className="udx-menu-me">
                        <span className="udx-avatar is-lg">{initial}</span>
                        <span className="min-w-0">
                          <b>{viewer.name}</b>
                          <small>{viewer.email}</small>
                        </span>
                      </div>
                      <button type="button" onClick={() => switchTab("account")}>
                        <Settings className="size-4" />
                        계정 설정
                        <ChevronRight className="ml-auto size-4 opacity-50" />
                      </button>
                      <button type="button" onClick={() => switchTab("history")}>
                        <Receipt className="size-4" />
                        이용 내역
                        <ChevronRight className="ml-auto size-4 opacity-50" />
                      </button>
                      <Link href="/verify">
                        <ShieldCheck className="size-4" />
                        서버 인증
                        <ChevronRight className="ml-auto size-4 opacity-50" />
                      </Link>
                      <button
                        type="button"
                        className={isGuest ? undefined : "is-danger"}
                        onClick={() => (isGuest ? requireLogin() : void handleLogout())}
                      >
                        <LogOut className="size-4" />
                        {isGuest ? "로그인" : "로그아웃"}
                      </button>
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="udx-main">
        {needDiscord ? (
          <div className="udx-discord-gate" role="alert">
            <span className="udx-discord-gate-icon">
              <Link2 className="size-5" />
            </span>
            <div className="min-w-0">
              <b>디스코드 연동이 필요해요</b>
              <p>상품을 구매하려면 디스코드 계정을 연동해 주세요. 예전에 디스코드로 쓰던 계정이면 포인트와 내역이 합쳐져요.</p>
            </div>
            <a href={discordLinkHref} className="udx-discord-btn">
              디스코드 연동하기
            </a>
          </div>
        ) : null}

        {tab !== "main" ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={tab}
              className="udx-hero"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.span
                className="udx-hero-icon"
                initial={reduceMotion ? false : { scale: 0.4, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 }}
              >
                <TabIcon className="size-6" />
              </motion.span>
              <div className="min-w-0">
                <h1>{meta.title}</h1>
                <span className="mf-product-chip">
                  <BadgeCheck />
                  {shopName}
                </span>
                <p className="udx-sub">{meta.sub}</p>
              </div>
            </motion.section>
          </AnimatePresence>
        ) : null}

        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-sky-300/80" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className={tab === "main" ? undefined : "ud-tab"}
              initial={reduceMotion ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, filter: "blur(6px)" }}
              transition={tabTransition}
            >
              {tab === "main" && (
                <UserHomeTab
                  userName={viewer.name}
                  shopName={shopName}
                  welcomeMessage={welcomeMessage}
                  points={viewer.points}
                  totalCharged={viewer.totalCharged}
                  tier={tier}
                  tierLoading={profileLoading}
                  recentOrders={recentOrders}
                  ordersLoading={profileLoading}
                  activeEvents={activeEvents}
                  products={products}
                  restockNotes={restockNotes}
                  shopSlug={shopSlug}
                  onPointsChange={(pts) => {
                    void refresh();
                    setMsg(`포인트 ${pts.toLocaleString()}P`);
                  }}
                  onSwitchTab={switchTab}
                />
              )}

              {tab === "products" && (
                <>
                  <ShopProductsTab
                    products={products}
                    eventByProduct={eventByProduct}
                    filteredProducts={filteredProducts}
                    productQuery={productQuery}
                    productCategory={productCategory}
                    productSort={productSort}
                    productCategories={productCategories}
                    productSection={productSection}
                    sectionCounts={sectionCounts}
                    onSectionChange={(v) => {
                      setProductSection(v);
                      setProductCategory("all");
                    }}
                    shopName={shopName}
                    salesCounts={salesCounts}
                    shopSummary={shopSummary}
                    liveStock={liveStock}
                    wishlistIds={wishlistIds}
                    tier={tier}
                    onQueryChange={setProductQuery}
                    onCategoryChange={setProductCategory}
                    onSortChange={setProductSort}
                    onToggleWishlist={(id) => void toggleWishlist(id)}
                    userPoints={viewer.points}
                    buyBusyId={buyBusyId}
                    purchaseCode={purchaseCode}
                    purchasePending={purchasePending}
                    purchaseError={purchaseError}
                    copiedPurchase={copiedPurchase}
                    onBuy={(id) => void buyProduct(id)}
                    onCopyCode={() => void copyPurchaseCode()}
                    onAddToCart={(id) => {
                      if (!user) {
                        requireLogin();
                        return;
                      }
                      addToCart(shopSlug, id);
                      setCartTick((n) => n + 1);
                      setMsg("장바구니에 담았어요");
                    }}
                  />
                  {user ? (
                  <ShopCartBar
                    key={cartTick}
                    shopSlug={shopSlug}
                    products={products}
                    eventByProduct={eventByProduct}
                    tier={tier}
                    userPoints={viewer.points}
                    onPurchased={(codes) => {
                      if (codes.length === 0) {
                        setPurchasePending(true);
                        setPurchaseCode("관리자가 확인 후 수동으로 지급합니다.");
                        setMsg("지급대기로 접수됐어요");
                      } else {
                        setPurchasePending(false);
                        setPurchaseCode(codes.join("\n"));
                        setMsg(`${codes.length}개 구매 완료`);
                      }
                      void refresh();
                      void loadProfile();
                    }}
                  />
                  ) : null}
                </>
              )}

              {isGuest && LOGIN_TABS.has(tab) ? (
                <div className="admin-bento mx-auto max-w-md p-6">
                  <LoginRequiredNotice className="mb-5" />
                  <UserAuthPanel shopSlug={shopSlug} hideGuest />
                </div>
              ) : null}

              {user && tab === "charge" && (
                <div className="user-mypage-charge w-full">
                  <ChargePageClient
                    shopSlug={shopSlug}
                    bank={bank}
                    minChargeAmount={minChargeAmount}
                    depositSuffixPhrase={depositSuffixPhrase}
                    cultureGiftEnabled={cultureGiftEnabled}
                    nowpaymentsEnabled={nowpaymentsEnabled}
                    embedded
                  />
                </div>
              )}

              {user && tab === "history" && (
                <UserHistoryTab
                  shopSlug={shopSlug}
                  onReviewed={() => void loadProfile()}
                  loading={profileLoading}
                  orders={orders}
                  charges={charges}
                  monthlyReport={monthlyReport}
                  copiedId={copiedId}
                  onCopyCode={(id, code) => void copyCode(id, code)}
                />
              )}

              {user && tab === "account" && (
                <UserAccountTab
                  shopSlug={shopSlug}
                  user={user}
                  tier={tier}
                  saving={saving}
                  nickname={nickname}
                  newEmail={newEmail}
                  emailPassword={emailPassword}
                  currentPassword={currentPassword}
                  newPassword={newPassword}
                  loginHistory={loginHistory}
                  sessions={sessions}
                  onNicknameChange={setNickname}
                  onNewEmailChange={setNewEmail}
                  onEmailPasswordChange={setEmailPassword}
                  onCurrentPasswordChange={setCurrentPassword}
                  onNewPasswordChange={setNewPassword}
                  onSaveNickname={(e) => void saveNickname(e)}
                  onChangeEmail={(e) => void changeEmail(e)}
                  onChangePassword={(e) => void changePassword(e)}
                  onDiscordRefresh={() => void refresh()}
                  onRevokeSession={(id) => void revokeSession(id)}
                  onRevokeOtherSessions={() => void revokeOtherSessions()}
                />
              )}

              {tab === "leaderboard" && (
                <UserLeaderboardTab
                  shopSlug={shopSlug}
                  onOpenAttendance={() => switchTab("attendance")}
                />
              )}

              {user && tab === "attendance" && (
                <UserAttendanceTab
                  shopSlug={shopSlug}
                  onClaimed={(pts) => {
                    setAttendedToday(true);
                    setMsg(`포인트 ${pts.toLocaleString()}P`);
                  }}
                />
              )}

              {tab === "reviews" && <UserReviewsTab shopSlug={shopSlug} />}

              {user && tab === "island" && <UserIslandTab shopSlug={shopSlug} userName={user.name || user.email} />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <footer className="mf-footer">
        <span>DOES</span>
        <span className="mf-muted">{shopName} · 안전한 자동 결제</span>
      </footer>

      <AnimatePresence>
        {discordGate && needDiscord ? (
          <motion.div
            className="udx-gate-back"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setDiscordGate(false)}
          >
            <motion.div
              className="udx-gate-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="udx-gate-title"
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <button type="button" className="udx-gate-x" onClick={() => setDiscordGate(false)} aria-label="닫기">
                <X className="size-4" />
              </button>
              <span className="udx-gate-icon">
                <Link2 className="size-7" />
              </span>
              <h2 id="udx-gate-title">디스코드를 연동해 주세요</h2>
              <p>
                DOES 상점은 디스코드 연동 후에 상품을 구매할 수 있어요.
                <br />
                예전에 디스코드로 로그인하던 계정이면 포인트와 구매 내역이 지금 계정으로 합쳐져요.
              </p>
              <a href={discordLinkHref} className="udx-discord-btn is-lg">
                디스코드 연동하기
              </a>
              <button type="button" className="udx-gate-later" onClick={() => setDiscordGate(false)}>
                나중에 할게요
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {loginOpen && isGuest ? (
          <motion.div
            className="udx-gate-back"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setLoginOpen(false)}
          >
            <motion.div
              className="udx-gate-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="udx-login-title"
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <button type="button" className="udx-gate-x" onClick={() => setLoginOpen(false)} aria-label="닫기">
                <X className="size-4" />
              </button>
              <h2 id="udx-login-title" className="sr-only">로그인이 필요합니다</h2>
              <LoginRequiredNotice className="w-full" />
              <div className="mt-4 w-full text-left">
                <UserAuthPanel shopSlug={shopSlug} hideGuest />
              </div>
              <button type="button" className="udx-gate-later" onClick={() => setLoginOpen(false)}>
                계속 둘러보기
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {msg ? (
          <motion.div
            key={msg}
            role="status"
            className={`udx-toast ${msgIsError ? "is-error" : ""}`}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 460, damping: 30 }}
          >
            {msgIsError ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {msg}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <nav className="udx-dock" aria-label="바로가기">
        {dockSide[0].map((item) => (
          <DockButton key={item.id} item={item} active={tab === item.id} onClick={() => switchTab(item.id)} />
        ))}
        <motion.button
          type="button"
          className={`udx-dock-main ${tab === "charge" ? "is-on" : ""}`}
          onClick={() => switchTab("charge")}
          whileTap={{ scale: 0.92 }}
          aria-label="충전"
        >
          <Coins className="size-6" />
        </motion.button>
        {dockSide[1].map((item) => (
          <DockButton key={item.id} item={item} active={tab === item.id} onClick={() => switchTab(item.id)} />
        ))}
        <DockButton
          item={{ id: "main", label: "메뉴", icon: LayoutGrid }}
          active={sheetOpen}
          onClick={() => setSheetOpen(true)}
        />
      </nav>

      <AnimatePresence>
        {sheetOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="메뉴 닫기"
              className="udx-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              className="udx-sheet"
              role="dialog"
              aria-label="전체 메뉴"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 600) setSheetOpen(false);
              }}
            >
              <span className="udx-sheet-grip" />
              <div className="udx-sheet-me">
                <span className="udx-avatar is-lg">{initial}</span>
                <span className="min-w-0 flex-1">
                  <b>{viewer.name}</b>
                  <small>{viewer.email}</small>
                </span>
                <button type="button" className="udx-round" onClick={() => setSheetOpen(false)} aria-label="닫기">
                  <X className="size-4" />
                </button>
              </div>
              <button type="button" className="udx-sheet-wallet" onClick={() => switchTab("charge")}>
                <span>
                  <small>보유 포인트</small>
                  <b className="tabular-nums">{formatKRW(viewer.points)}</b>
                </span>
                <span className="udx-sheet-wallet-cta">
                  <Coins className="size-4" />
                  충전
                </span>
              </button>
              <div className="udx-sheet-grid">
                {NAV.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      className={tab === item.id ? "is-on" : ""}
                      onClick={() => switchTab(item.id)}
                      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 + i * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <span>
                        <Icon className="size-5" />
                      </span>
                      {item.label}
                    </motion.button>
                  );
                })}
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + NAV.length * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link href="/verify">
                    <span>
                      <ShieldCheck className="size-5" />
                    </span>
                    인증
                  </Link>
                </motion.div>
              </div>
              <button
                type="button"
                className="udx-sheet-logout"
                onClick={() => (isGuest ? requireLogin() : void handleLogout())}
              >
                <LogOut className="size-4" />
                {isGuest ? "로그인" : "로그아웃"}
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <ShopInquiryChatWidget shopSlug={shopSlug} shopName={shopName} />
    </div>
  );
}

function DockButton({
  item,
  active,
  onClick,
}: {
  item: { id: UserTab; label: string; icon: typeof Home };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button type="button" className={`udx-dock-btn ${active ? "is-on" : ""}`} onClick={onClick}>
      {active ? (
        <motion.span
          layoutId="udx-dock-pill"
          className="udx-dock-pill"
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        />
      ) : null}
      <Icon className="relative size-[19px]" />
      <span className="relative">{item.label}</span>
    </button>
  );
}

export type { UserOrder, UserCharge, UserTab } from "./user-dashboard-types";
