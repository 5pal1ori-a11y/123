import Link from "next/link";
import { PlatformHeader } from "@/components/layout/platform-header";
import { QuartzShell } from "@/components/ui/quartz-shell";

export function LegalPageShell({
  title,
  updatedAt,
  brandOnly = false,
  children,
}: {
  title: string;
  updatedAt: string;
  brandOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <QuartzShell>
      {brandOnly ? <style>{"[data-beta-notice]{display:none}"}</style> : null}
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader brandOnly={brandOnly} />
        <main className="flex-1 px-4 pb-16 pt-20 md:px-6 md:pt-24">
          <article className="mx-auto max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              DOES Legal
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">최종 업데이트: {updatedAt}</p>
            <div className="prose-legal mt-10 space-y-8 text-[15px] leading-7 text-neutral-300">
              {children}
            </div>
            {brandOnly ? null : (
              <p className="mt-12 border-t border-white/10 pt-6 text-sm text-neutral-500">
                <Link href="/" className="hover:text-neutral-300">
                  홈
                </Link>
                {" · "}
                <Link href="/terms" className="hover:text-neutral-300">
                  이용약관
                </Link>
                {" · "}
                <Link href="/privacy" className="hover:text-neutral-300">
                  개인정보 처리방침
                </Link>
              </p>
            )}
          </article>
        </main>
      </div>
    </QuartzShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
