import { notFound } from "next/navigation";
import { getShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { ClientRedirect } from "@/components/ui/client-redirect";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ params }: { params: Promise<{ shop: string }> }) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const { shop: slug } = await params;
  if (!getShopBySlug(slug)) notFound();
  return <ClientRedirect href="/dashboard?tab=products" />;
}
