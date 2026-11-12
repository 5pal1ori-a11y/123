"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Coins, Gift, Home, MoreHorizontal, Package, Settings } from "lucide-react";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { cn } from "@/lib/utils";
import { isLandingPath } from "@/lib/guest-mode";

const PRIMARY = [
  { href: "/dashboard", tab: null as string | null, icon: Home, label: "홈" },
  { href: "/dashboard", tab: "products", icon: Package, label: "쇼핑" },
  { href: "/dashboard", tab: "charge", icon: Coins, label: "충전" },
];

const MORE = [
  { href: "/notices", tab: null as string | null, icon: Bell, label: "공지" },
  { href: "/events", tab: null, icon: Gift, label: "이벤트" },
  { href: "/dashboard", tab: "account", icon: Settings, label: "설정" },
];

export function ShopShell({
  shopName,
  logoUrl,
  children,
}: {
  shopName: string;
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  const base = useShopBase();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const isAdmin = pathname?.includes("/admin");
  const isDashboard = pathname?.includes("/dashboard");
  const isProductDetail = pathname?.includes("/product/");
  const isCheckout = pathname?.includes("/checkout");
  const dashboardPath = shopPath(base, "/dashboard");
  const [moreOpen, setMoreOpen] = useState(false);

  function navHref(item: (typeof PRIMARY)[number]) {
    if (item.tab) return `${dashboardPath}?tab=${item.tab}`;
    return shopPath(base, item.href);
  }

  function isActive(item: (typeof PRIMARY)[number]) {
    if (item.href === "/notices" || item.href === "/events") {
      return pathname?.startsWith(shopPath(base, item.href));
    }
    if (pathname !== dashboardPath) return false;
    if (item.tab === null) return !currentTab || currentTab === "main";
    if (item.tab === "products" && currentTab === "purchase") return true;
    return currentTab === item.tab;
  }

  const moreActive = MORE.some(isActive);

  if (pathname && (/\/(main|wild|mine)$/.test(pathname) || isLandingPath(pathname))) return <>{children}</>;
  if (isAdmin || isDashboard || isProductDetail || isCheckout) {
    return <div className="h-dvh max-h-dvh overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col text-text">
      <header className="shop-chrome-header admin-topbar sticky top-0 z-40 border-b border-white/10 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href={dashboardPath} className="flex min-w-0 items-center gap-2 font-bold tracking-tight">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-7 shrink-0 rounded-lg object-cover" />
            ) : (
              <VendixLogo size={28} />
            )}
            <span className="truncate">{shopName}</span>
          </Link>
          <span className="ios-pill shrink-0 text-[11px] text-neutral-400">DOES</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-mobile-nav">{children}</main>

      {moreOpen && (
        <button
          type="button"
          aria-label="닫기"
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto w-full max-w-lg px-3">
          <div className="glass-thick overflow-hidden p-2">
            {MORE.map((item) => {
              const href = navHref(item);
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
                    active ? "bg-white/10 font-semibold text-[var(--vx-text)]" : "text-neutral-400",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="mobile-tabbar admin-topbar fixed inset-x-0 bottom-0 z-40 border-t border-white/10 backdrop-blur-xl">
        <div className="mx-auto grid max-w-lg grid-cols-4 px-1 pt-1.5">
          {PRIMARY.map((item) => {
            const href = navHref(item);
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium",
                  active ? "text-[var(--ad-accent,#f4f4f5)]" : "text-neutral-500",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium",
                  moreOpen || moreActive ? "text-[var(--ad-accent,#f4f4f5)]" : "text-neutral-500",
            )}
          >
            <MoreHorizontal className="size-5" strokeWidth={moreOpen || moreActive ? 2.5 : 2} />
            더보기
          </button>
        </div>
      </nav>
    </div>
  );
}
