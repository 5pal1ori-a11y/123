import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByUuid, getProductById, getShopBySlug, verifyOrderAccess } from "@/lib/store";
import { ReceiptTicket } from "@/components/receipt/receipt-ticket";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop: string; orderUuid: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { shop: shopSlug, orderUuid } = await params;
  const { t: token } = await searchParams;
  const shop = getShopBySlug(shopSlug);
  if (!shop) notFound();
  const order = getOrderByUuid(shop.id, orderUuid);
  if (!order || order.status !== "dispensed") notFound();
  if (!verifyOrderAccess(order, token)) notFound();

  const product = getProductById(order.productId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="mb-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-smoke">Dispensed</p>
        <h1 className="mt-3 font-display text-4xl text-pearl">Your code is ready</h1>
      </div>
      <ReceiptTicket order={order} product={product} />
      <div className="mt-10 flex justify-center gap-6 text-sm text-stone">
        <Link href="/" className="hover:text-pearl">
          Continue
        </Link>
        <Link href="/orders" className="hover:text-pearl">
          Orders
        </Link>
      </div>
    </div>
  );
}
