import { notFound } from "next/navigation";
import { findShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { getAdminSession, getUserSession } from "@/lib/session-server";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const dynamic = "force-dynamic";

export default async function AdminPage({
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

  const adminSession = await getAdminSession(slug);
  const userSession = await getUserSession(slug);
  const subAdmin = Boolean(userSession?.user.isSubAdmin);

  if (!adminSession && !subAdmin) {
    return <AdminLoginForm shopSlug={slug} shopName={shop.name} />;
  }

  return <AdminDashboard shopSlug={shop.slug} />;
}
