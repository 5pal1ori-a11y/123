import { notFound } from "next/navigation";
import { getShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { ClientRedirect } from "@/components/ui/client-redirect";

export const dynamic = "force-dynamic";

/** APK는 관리자 계좌관리에서만 제공. 유저용 /download 는 대시보드로 보냄. */
export default async function DownloadPage({ params }: { params: Promise<{ shop: string }> }) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }

  const { shop: slug } = await params;
  if (!getShopBySlug(slug)) notFound();
  return <ClientRedirect href="/dashboard" />;
}
