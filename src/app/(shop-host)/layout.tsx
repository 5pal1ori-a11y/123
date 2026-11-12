import { notFound } from "next/navigation";
import { ShopRouteChrome, shopSlugFromRequest } from "@/components/shop/shop-route-chrome";

export default async function ShopHostLayout({ children }: { children: React.ReactNode }) {
  const slug = await shopSlugFromRequest();
  if (!slug) notFound();
  return <ShopRouteChrome slug={slug}>{children}</ShopRouteChrome>;
}
