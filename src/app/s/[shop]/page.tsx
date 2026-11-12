import { notFound } from "next/navigation";
import { findShopBySlug, initStore, MFA_SHOP_SLUG } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { ClientRedirect } from "@/components/ui/client-redirect";
import { ShopLanding } from "@/components/landing/shop-landing";

export const dynamic = "force-dynamic";

export default async function ShopHomePage({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const { shop: slug } = await params;
  const shop = findShopBySlug(slug);
  if (!shop) notFound();

  if (shop.slug !== MFA_SHOP_SLUG) return <ClientRedirect href="/dashboard" />;
  return <ShopLanding shopName={shop.name} />;
}
