"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Bot,
  Bug,
  ChevronsUpDown,
  ClipboardList,
  Gift,
  ImageIcon,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Package,
  RefreshCw,
  ScrollText,
  Search,
  Star,
  Store,
  Ticket,
  UserCog,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { AdminBillingHub } from "@/components/admin/admin-billing-hub";
import { AdminOverview } from "@/components/admin/admin-overview";
import { AdminProductsPanel } from "@/components/admin/admin-products-panel";
import { StoreSettingsPanel } from "@/components/admin/store-settings-panel";
import { FadeIn } from "@/components/platform/fade-in";
import {
  LANDING_DEMO_CATEGORIES,
  LANDING_DEMO_PENDING,
  LANDING_DEMO_PRODUCTS,
  LANDING_DEMO_SETTINGS,
  LANDING_DEMO_SHOP,
  LANDING_DEMO_STATS,
} from "@/components/platform/landing-admin-demo-data";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { cn } from "@/lib/utils";

type DemoTab =
  | "main"
  | "orders"
  | "store"
  | "billing"
  | "bot"
  | "products"
  | "events"
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

type MockVariant = "overview" | "orders" | "products" | "workflow";

type LandingDashSectionProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  variant: MockVariant;
};

const NAV: { id: DemoTab; label: string; icon: typeof Store }[] = [
  { id: "main", label: "개요", icon: LayoutDashboard },
  { id: "orders", label: "주문", icon: ClipboardList },
  { id: "products", label: "상품", icon: Package },
  { id: "billing", label: "결제 · 충전", icon: Wallet },
  { id: "users", label: "고객", icon: Users },
  { id: "inquiries", label: "문의", icon: MessageSquare },
  { id: "tiers", label: "고객 등급", icon: Layers },
  { id: "reviews", label: "후기", icon: Star },
  { id: "coupons", label: "쿠폰", icon: Ticket },
  { id: "events", label: "이벤트", icon: Gift },
  { id: "banners", label: "배너 광고", icon: ImageIcon },
  { id: "bot", label: "봇 연결", icon: Bot },
  { id: "store", label: "스토어", icon: Store },
  { id: "automation", label: "자동화", icon: Zap },
  { id: "notifications", label: "알림", icon: Bell },
  { id: "notices", label: "공지", icon: Megaphone },
  { id: "bugs", label: "버그제보", icon: Bug },
  { id: "staff", label: "스태프", icon: UserCog },
  { id: "logs", label: "활동 로그", icon: ScrollText },
];

const NAV_GROUPS: { label: string; ids: DemoTab[] }[] = [
  { label: "판매", ids: ["main", "orders", "products", "billing"] },
  { label: "고객", ids: ["users", "inquiries", "tiers", "reviews"] },
  { label: "성장", ids: ["coupons", "events"] },
  { label: "마케팅", ids: ["banners"] },
  { label: "채널 & 스토어", ids: ["bot", "store"] },
  { label: "운영", ids: ["automation", "notifications", "notices", "bugs"] },
  { label: "권한 & 기록", ids: ["staff", "logs"] },
];

const NAV_BY_ID = Object.fromEntries(NAV.map((item) => [item.id, item])) as Record<
  DemoTab,
  (typeof NAV)[number]
>;

const INITIAL_TAB: Record<MockVariant, DemoTab> = {
  overview: "main",
  orders: "billing",
  products: "products",
  workflow: "store",
};

const TITLE: Record<DemoTab, string> = Object.fromEntries(
  NAV.map((n) => [n.id, n.label]),
) as Record<DemoTab, string>;

const INTERACTIVE_TABS = new Set<DemoTab>(["main", "store", "billing", "products"]);

const noop = () => {};
const noopAsync = async () => {};
const noopFalse = async () => false;

function DemoPlaceholder({ label }: { label: string }) {
  return (
    <div className="admin-bento flex min-h-[220px] flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="max-w-xs text-[13px] text-neutral-500">
        랜딩 데모에서는 이 메뉴의 미리보기를 준비 중이에요. 왼쪽에서 대시보드·충전·제품·스토어를 눌러
        보세요.
      </p>
    </div>
  );
}

function DemoBillingPanel({ onMessage }: { onMessage: (msg: string) => void }) {
  const [accountForm, setAccountForm] = useState({
    bankName: "카카오뱅크",
    bankAccount: "3333-01-1234567",
    bankHolder: "DOES",
    minChargeAmount: "1000",
    depositSuffixPhrase: "DOES",
  });
  const [pushbulletToken, setPushbulletToken] = useState("");
  const [autoChargeEnabled, setAutoChargeEnabled] = useState(true);
  const [paymentApiForm, setPaymentApiForm] = useState({
    cultureGiftEnabled: false,
    culturelandId: "",
    culturelandPassword: "",
    nowpaymentsEnabled: false,
    nowpaymentsApiKey: "",
    nowpaymentsIpnSecret: "",
    nowpaymentsPayCurrency: "usdttrc20",
  });
  const [licenseKey, setLicenseKey] = useState("");

  return (
    <AdminBillingHub
      shopSlug={LANDING_DEMO_SHOP.slug}
      shopPlan={LANDING_DEMO_SHOP.plan}
      shopName={LANDING_DEMO_SHOP.name}
      subLabel="이용 중"
      pending={LANDING_DEMO_PENDING}
      userEmail={(id) => (id === "u1" ? "mina@example.com" : "leo@example.com")}
      pointRevenue={1_240_000}
      accountForm={accountForm}
      onAccountChange={setAccountForm}
      onSaveAccount={(e) => {
        e.preventDefault();
        onMessage("데모에서는 저장되지 않아요.");
      }}
      pushbulletToken={pushbulletToken}
      autoChargeEnabled={autoChargeEnabled}
      onPushbulletTokenChange={setPushbulletToken}
      onAutoChargeEnabledChange={setAutoChargeEnabled}
      onSavePushbullet={() => onMessage("데모에서는 저장되지 않아요.")}
      paymentApiForm={paymentApiForm}
      onPaymentApiChange={setPaymentApiForm}
      onSavePaymentApis={(e) => {
        e.preventDefault();
        onMessage("데모에서는 저장되지 않아요.");
      }}
      settings={LANDING_DEMO_SETTINGS}
      onSaveSecurity={async () => {
        onMessage("데모에서는 저장되지 않아요.");
        return false;
      }}
      licenseKey={licenseKey}
      onLicenseKeyChange={setLicenseKey}
      onExtendLicense={(e) => {
        e.preventDefault();
        onMessage("데모에서는 저장되지 않아요.");
      }}
      saving={false}
      busyId={null}
      onApprove={() => onMessage("데모에서는 승인되지 않아요.")}
      onReject={() => onMessage("데모에서는 거절되지 않아요.")}
      initialFilter="pending"
    />
  );
}

function DemoPanelBody({
  tab,
  onMessage,
  onOpenTab,
}: {
  tab: DemoTab;
  onMessage: (msg: string) => void;
  onOpenTab: (tab: DemoTab) => void;
}) {
  if (tab === "main") {
    return (
      <AdminOverview
        stats={LANDING_DEMO_STATS}
        pendingCharges={LANDING_DEMO_PENDING}
        openInquiryCount={2}
        unreadNotifCount={1}
        onOpenProducts={() => onOpenTab("products")}
        onOpenCharges={() => onOpenTab("billing")}
        onOpenOrders={() => onOpenTab("orders")}
        onOpenInquiries={() => onOpenTab("inquiries")}
        onOpenNotifications={() => onOpenTab("notifications")}
      />
    );
  }

  if (tab === "billing") {
    return <DemoBillingPanel onMessage={onMessage} />;
  }

  if (tab === "products") {
    return (
      <AdminProductsPanel
        shopSlug={LANDING_DEMO_SHOP.slug}
        shopPlan={LANDING_DEMO_SHOP.plan}
        products={LANDING_DEMO_PRODUCTS}
        categories={LANDING_DEMO_CATEGORIES}
        availableStock={LANDING_DEMO_PRODUCTS.reduce((s, p) => s + p.availableCount, 0)}
        lowStockCount={LANDING_DEMO_PRODUCTS.filter((p) => p.stockStatus === "low_stock").length}
        onReload={noopAsync}
        onMessage={onMessage}
        onDeleteProduct={() => onMessage("데모에서는 삭제되지 않아요.")}
        onDeleteCategory={() => onMessage("데모에서는 삭제되지 않아요.")}
        onCreateCategory={async () => {
          onMessage("데모에서는 저장되지 않아요.");
          return false;
        }}
        demoMode
      />
    );
  }

  if (tab === "store") {
    return (
      <StoreSettingsPanel
        shop={LANDING_DEMO_SHOP}
        settings={LANDING_DEMO_SETTINGS}
        saving={false}
        licenseKey=""
        onLicenseKeyChange={noop}
        onExtendLicense={(e) => {
          e.preventDefault();
          onMessage("데모에서는 저장되지 않아요.");
        }}
        onSave={async () => {
          onMessage("데모에서는 저장되지 않아요.");
          return false;
        }}
      />
    );
  }

  return <DemoPlaceholder label={TITLE[tab]} />;
}

function LandingAdminChrome({ initialTab }: { initialTab: DemoTab }) {
  const [tab, setTab] = useState<DemoTab>(initialTab);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="landing-admin-frame">
      <div className="relative w-full overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--ad-rail,#0a0b0f)] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)]">
        <div className="landing-admin-scale admin-shell absolute inset-0 flex" data-theme="dark">
          <aside className="admin-sidebar relative hidden w-[220px] shrink-0 flex-col md:flex">
            <header className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
              <button
                type="button"
                className="flex h-10 w-full min-w-0 items-center gap-2.5 rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 text-left"
              >
                <VendixLogo size={24} className="shrink-0 rounded-[7px]" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.02em] text-white">
                  {LANDING_DEMO_SHOP.name}
                </span>
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-neutral-400">
                  관리자
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-neutral-500 opacity-60" />
              </button>
              <div className="flex h-[34px] w-full items-center gap-2 rounded-[8px] border border-white/10 bg-black/30 px-2.5 text-[13px] text-neutral-500">
                <Search className="size-3.5 shrink-0 opacity-75" />
                <span className="min-w-0 flex-1 truncate text-left">이동…</span>
                <kbd className="shrink-0 rounded-[5px] bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px]">
                  ⌘K
                </kbd>
              </div>
            </header>

            <nav className="min-h-0 flex-1 space-y-px overflow-y-auto px-2.5 pb-3 pt-1" aria-label="데모 메뉴">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  <span
                    className={`mb-1.5 block select-none px-2.5 text-[11.5px] font-semibold tracking-[0.02em] text-neutral-500 ${
                      gi === 0 ? "mt-2" : "mt-4"
                    }`}
                  >
                    {group.label}
                  </span>
                  {group.ids.map((id) => {
                    const item = NAV_BY_ID[id];
                    const Icon = item.icon;
                    const on = item.id === tab;
                    const interactive = INTERACTIVE_TABS.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={cn(
                          "admin-nav-item mb-px flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] font-medium tracking-[-0.012em] transition",
                          on
                            ? "admin-nav-active"
                            : interactive
                              ? "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
                              : "text-neutral-600 hover:bg-white/[0.03] hover:text-neutral-400",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            on ? "text-[var(--ad-accent)] opacity-100" : "opacity-[0.78]",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <footer className="flex shrink-0 items-center gap-1.5 border-t border-white/10 p-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-2 py-1.5">
                <div className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                  D
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-white">
                    운영 관리자
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-neutral-500">
                    {LANDING_DEMO_SHOP.slug}
                  </span>
                </span>
              </div>
            </footer>
          </aside>

          <div className="admin-sheet relative flex min-w-0 flex-1 flex-col overflow-hidden p-0 md:p-2 md:pl-0">
            <div className="admin-sheet-inner flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-[12px]">
              <header className="admin-topbar flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto md:overflow-visible">
                  <p className="hidden truncate text-[15px] font-semibold tracking-[-0.02em] text-white md:block">
                    {TITLE[tab]}
                  </p>
                  <div className="flex gap-1 md:hidden">
                    {NAV.filter((n) => INTERACTIVE_TABS.has(n.id)).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={cn(
                          "shrink-0 rounded-[8px] px-2.5 py-1 text-[11px] font-medium transition",
                          item.id === tab
                            ? "bg-white text-black"
                            : "border border-white/10 text-neutral-400",
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-neutral-500">
                  <span className="hidden items-center gap-1.5 rounded-[8px] border border-white/10 px-2.5 py-1 text-[11px] sm:inline-flex">
                    <Search className="size-3" />
                    검색
                  </span>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    aria-label="새로고침"
                    onClick={() => setToast("데모 데이터를 유지해요.")}
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    aria-label="알림"
                    onClick={() => setToast("대기 충전 2건이 있어요.")}
                  >
                    <Bell className="size-3.5" />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 sm:p-4">
                <DemoPanelBody tab={tab} onMessage={setToast} onOpenTab={setTab} />
              </div>

              {toast ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
                  <div className="rounded-full border border-white/15 bg-black/85 px-4 py-2 text-[12.5px] font-medium text-white shadow-lg backdrop-blur">
                    {toast}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingDashSection({
  id,
  eyebrow,
  title,
  description,
  variant,
}: Omit<LandingDashSectionProps, "heightClass">) {
  return (
    <section id={id} className="py-14 md:py-20">
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <FadeIn>
            <p className="text-sm font-medium text-neutral-500">{eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-[2rem] md:leading-tight">
              {title}
            </h2>
          </FadeIn>
          <FadeIn delay={60}>
            <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-relaxed text-text-secondary">
              {description}
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={90} className="mt-12 md:mt-16">
          <LandingAdminChrome initialTab={INITIAL_TAB[variant]} />
        </FadeIn>
      </div>
    </section>
  );
}
