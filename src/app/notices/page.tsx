import { PlatformHeader } from "@/components/layout/platform-header";
import { NoticesList } from "@/components/platform/notices-list";
import { NoticesPageHeader } from "@/components/platform/notices-page-header";
import { QuartzShell } from "@/components/ui/quartz-shell";
import { initStoreKvOnly } from "@/lib/store-init";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "공지사항",
  description: "DOES 공지사항과 업데이트 소식",
};
export default async function PlatformNoticesPage() {
  await initStoreKvOnly();
  const { listPlatformNotices } = await import("@/lib/store");
  const notices = listPlatformNotices();

  return (
    <QuartzShell>
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader />
        <main className="flex-1 px-4 pb-16 pt-20 md:px-6 md:pt-24">
          <NoticesPageHeader />
          <div className="mx-auto max-w-3xl">
            <NoticesList notices={notices} />
          </div>
        </main>
      </div>
    </QuartzShell>
  );
}
