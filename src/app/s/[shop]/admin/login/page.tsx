import { notFound } from "next/navigation";
import { findShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const shop = findShopBySlug(slug);
  if (!shop) notFound();

  return <AdminLoginForm shopSlug={slug} shopName={shop.name} />;
}
