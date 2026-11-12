import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import {
  findShopBySlug,
  getShopSettings,
  getShopSubscriptionStatus,
  initStore,
  MFA_SHOP_SLUG,
} from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { ShopBaseProvider } from "@/lib/shop-nav";
import { ShopShell } from "@/components/shop/shop-shell";
import { ShopBackgroundMusic } from "@/components/shop/shop-background-music";
import { ShopUserProvider } from "@/components/shop/user-context";
import { ShopAuthGate } from "@/components/shop/shop-auth-gate";
import { ShopMaintenanceBanner } from "@/components/shop/shop-maintenance-banner";
import { ShopAccessBlocked } from "@/components/shop/shop-access-blocked";
import { QuartzShell } from "@/components/ui/quartz-shell";
import { CheckTheme } from "@/components/shop/check-theme";
import { LivePresenceBadge } from "@/components/shop/live-presence-badge";
import { TraderPopup } from "@/components/shop/trader-popup";
import { slugFromHost } from "@/lib/domain";

function ShellFallback({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export async function ensureShopStore() {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }
}

export async function shopSlugFromRequest() {
  const hdrs = await headers();
  return hdrs.get("x-orel-shop") ?? slugFromHost(hdrs.get("host") ?? "");
}

export async function ShopRouteChrome({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  await ensureShopStore();

  const shop = findShopBySlug(slug);
  if (!shop) notFound();

  const hdrs = await headers();
  const isShopAdmin = hdrs.get("x-vendix-route") === "shop-admin";
  const theme = shop.slug === MFA_SHOP_SLUG ? <CheckTheme /> : null;
  const shellTheme = "dark";

  if (isShopAdmin) {
    return (
      <QuartzShell tone="admin" theme={shellTheme}>
        {theme}
        <ShopBaseProvider shopSlug={shop.slug}>
          <div className="admin-shell relative min-h-dvh" data-theme={shellTheme}>
            {children}
          </div>
          <LivePresenceBadge room={shop.slug} />
        </ShopBaseProvider>
      </QuartzShell>
    );
  }

  const subscription = getShopSubscriptionStatus(shop);
  const settings = getShopSettings(shop.id);

  if (settings.koreaOnlyAccess || settings.blockVpnProxy) {
    const reqHeaders = new Headers();
    hdrs.forEach((v, k) => reqHeaders.set(k, v));
    const accessReq = new Request("https://vendix.local/access-check", { headers: reqHeaders });
    const access = await evaluateShopVisitorAccess(accessReq, settings);
    if (!access.ok) {
      return <ShopAccessBlocked message={access.error} />;
    }
  }

  return (
    <QuartzShell tone="admin" theme={shellTheme}>
      {theme}
      <ShopBaseProvider shopSlug={shop.slug}>
        <ShopUserProvider shopSlug={shop.slug}>
          <ShopAuthGate
            shopSlug={shop.slug}
            shopName={shop.name}
            subscription={subscription}
            plan={shop.plan}
            expiresAt={shop.expiresAt}
            graceUntil={shop.graceUntil}
          >
            <ShopBackgroundMusic url={settings.backgroundMusicUrl} enabled={settings.backgroundMusicEnabled} />
            {settings.maintenanceMode ? (
              <ShopMaintenanceBanner message={settings.maintenanceMessage} />
            ) : null}
            <Suspense fallback={<ShellFallback>{children}</ShellFallback>}>
              <ShopShell shopName={shop.name} logoUrl={shop.logoUrl}>
                {children}
              </ShopShell>
            </Suspense>
          </ShopAuthGate>
          <TraderPopup shopSlug={shop.slug} />
          <LivePresenceBadge room={shop.slug} />
        </ShopUserProvider>
      </ShopBaseProvider>
    </QuartzShell>
  );
}
