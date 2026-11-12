import { notFound } from "next/navigation";
import { getProductBySlug, getShopBySlug, listEvents } from "@/lib/store";
import { ProductDetailView } from "@/components/catalog/product-detail-view";
import { ensureShopStore } from "@/components/shop/shop-route-chrome";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ shop: string; slug: string }>;
}) {
  await ensureShopStore();
  const { shop: shopSlug, slug } = await params;
  const shop = getShopBySlug(shopSlug);
  if (!shop) notFound();
  const product = getProductBySlug(shop.id, slug);
  if (!product) notFound();

  const event = listEvents(shop.id).find((e) => e.productId === product.id && e.active);

  return (
    <ProductDetailView
      product={product}
      shopSlug={shop.slug}
      backHref="/dashboard?tab=products"
      eventDiscountPercent={event?.discountPercent ?? 0}
    />
  );
}
