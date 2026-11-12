import { notFound } from "next/navigation";
import { PlatformHeader } from "@/components/layout/platform-header";
import { NoticeDetailView } from "@/components/platform/notice-detail-view";
import { QuartzShell } from "@/components/ui/quartz-shell";
import { initStoreKvOnly } from "@/lib/store-init";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await initStoreKvOnly();
  const { id } = await params;
  const { getPlatformNotice } = await import("@/lib/store");
  const notice = getPlatformNotice(id);
  if (!notice) return { title: "공지사항" };
  return {
    title: notice.title,
    description: notice.body.slice(0, 120),
  };
}

export default async function PlatformNoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await initStoreKvOnly();
  const { getPlatformNotice, listPlatformNotices } = await import("@/lib/store");
  const { id } = await params;
  const notice = getPlatformNotice(id);
  if (!notice) notFound();

  const all = listPlatformNotices();
  const currentIndex = all.findIndex((n) => n.id === id);
  const prev = currentIndex > 0 ? all[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < all.length - 1 ? all[currentIndex + 1] : null;

  return (
    <QuartzShell>
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader />
        <main className="flex-1 px-4 pb-16 pt-20 md:px-6 md:pt-24">
          <NoticeDetailView notice={notice} prev={prev} next={next} />
        </main>
      </div>
    </QuartzShell>
  );
}
