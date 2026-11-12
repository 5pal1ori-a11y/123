import { notFound } from "next/navigation";
import { getProductBySlug, getShopBySlug, listEvents } from "@/lib/store";
import { CheckoutClient } from "@/components/shop/checkout-client";
import { ensureShopStore } from "@/components/shop/shop-route-chrome";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ product?: string; qty?: string }>;
}) {
  await ensureShopStore();
  const { shop: shopSlug } = await params;
  const sp = await searchParams;
  const shop = getShopBySlug(shopSlug);
  if (!shop) notFound();

  const slug = sp.product?.trim();
  if (!slug) notFound();

  const product = getProductBySlug(shop.id, slug);
  if (!product) notFound();

  const qty = Math.max(1, Math.min(99, Number(sp.qty) || 1));
  const event = listEvents(shop.id).find((e) => e.productId === product.id && e.active);
  const eventDiscountPercent = event?.discountPercent ?? 0;

  return (
    <CheckoutClient
      product={product}
      shopSlug={shop.slug}
      quantity={qty}
      eventDiscountPercent={eventDiscountPercent}
    />
  );
}
