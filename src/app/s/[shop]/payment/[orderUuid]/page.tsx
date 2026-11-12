import { notFound } from "next/navigation";
import { getOrderByUuid, getProductById, getShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { getShopBank } from "@/lib/bank";
import { OrderTransferClient } from "@/components/payment/order-transfer-client";
import { ClientRedirect } from "@/components/ui/client-redirect";

export const dynamic = "force-dynamic";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ shop: string; orderUuid: string }>;
}) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const { shop: shopSlug, orderUuid } = await params;
  const shop = getShopBySlug(shopSlug);
  if (!shop) notFound();

  const order = getOrderByUuid(shop.id, orderUuid);
  if (!order) notFound();

  if (order.status === "dispensed") {
    return <ClientRedirect href={`/receipt/${orderUuid}`} />;
  }

  if (order.status !== "locked" && order.status !== "pending") {
    notFound();
  }

  const product = getProductById(order.productId);
  const bank = getShopBank(shop);

  return (
    <OrderTransferClient
      order={order}
      product={product}
      bank={bank}
      shopSlug={shop.slug}
    />
  );
}
