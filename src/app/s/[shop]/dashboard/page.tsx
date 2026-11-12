import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { findShopBySlug, getShopSettings, initStore, listEvents, listProducts } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { getShopBank } from "@/lib/bank";
import { refreshMfaStockIfStale } from "@/lib/mfa";
import { UserDashboard } from "@/components/shop/user-dashboard";

export const dynamic = "force-dynamic";

function DashboardFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="size-8 animate-spin text-tint" />
    </div>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ shop: string }> }) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const { shop: slug } = await params;
  const shop = findShopBySlug(slug);
  if (!shop) notFound();

  await refreshMfaStockIfStale(shop.id);
  const settings = getShopSettings(shop.id);

  return (
    <Suspense fallback={<DashboardFallback />}>
      <UserDashboard
        shopSlug={slug}
        shopName={shop.name}
        welcomeMessage={settings.welcomeMessage}
        bank={getShopBank(shop)}
        minChargeAmount={settings.minChargeAmount}
        depositSuffixPhrase={settings.depositSuffixPhrase}
        cultureGiftEnabled={settings.cultureGiftEnabled}
        nowpaymentsEnabled={settings.nowpaymentsEnabled}
        products={listProducts(shop.id)}
        events={listEvents(shop.id)}
      />
    </Suspense>
  );
}
