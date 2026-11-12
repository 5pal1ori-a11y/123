import { notFound } from "next/navigation";
import { getShopBySlug } from "@/lib/store";
import { OrderLookup } from "@/components/orders/order-lookup";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  const shop = getShopBySlug(slug);
  if (!shop) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="mb-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-smoke">Orders</p>
        <h1 className="mt-3 font-display text-3xl text-pearl">Retrieve purchases</h1>
      </div>
      <OrderLookup shopSlug={shop.slug} />
    </div>
  );
}
