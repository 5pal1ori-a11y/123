import { ShopRouteChrome } from "@/components/shop/shop-route-chrome";

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  return <ShopRouteChrome slug={slug}>{children}</ShopRouteChrome>;
}
