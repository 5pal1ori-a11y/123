import Link from "next/link";
import { Check, Shield, Sparkles, Store, Zap } from "lucide-react";
import { PlatformHeader } from "@/components/layout/platform-header";
import { FadeIn } from "@/components/platform/fade-in";
import { LicensePurchase } from "@/components/platform/license-purchase";
import { QuartzShell } from "@/components/ui/quartz-shell";

export const metadata = {
  title: "라이선스 구매",
  description: "DOES Standard License — 계좌이체로 라이선스를 구매하고 나만의 디지털 상점을 여세요.",
};

const INCLUDED = [
  "FREE · 카테고리 5 · 제품 20",
  "LITE · 서브도메인 · 쿠폰",
  "PRO · 계좌 자동충전 · 회원등급",
  "PRO MAX · 서브관리자 · 문의 기능",
  "관리자 대시보드 · 재고 · 충전 관리",
  "계좌이체 결제 · 상품 자동 발급",
];

const STEPS = [
  { n: "01", title: "라이선스 구매", body: "이메일을 입력한 뒤 계좌이체로 결제해요." },
  { n: "02", title: "입금 확인", body: "관리자 승인이 끝나면 라이선스 키가 발급돼요." },
  { n: "03", title: "상점 등록", body: "Discord로 로그인해 소유 서버를 고르고 상점을 열어요." },
];

export default function PurchasePage() {
  return (
    <QuartzShell>
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader />

        <main className="flex-1 pt-16">
          <section className="border-b border-white/10 py-10 md:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-10">
              <FadeIn className="mx-auto max-w-2xl text-center">
                <span className="landing-glass-blur landing-shimmer mb-4 inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-300 md:mb-6">
                  월 구독 라이선스
                </span>
                <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                  라이선스 <span className="text-gradient">구매</span>
                </h1>
                <p className="mt-3 text-base text-neutral-400 md:mt-4 md:text-lg">
                  FREE 무료 · LITE ₩4,900 · PRO ₩9,900 · PRO MAX ₩14,900 / 월
                </p>
              </FadeIn>
            </div>
          </section>

          <section className="py-10 md:py-20">
            <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-5 md:gap-12 md:px-10">
              <FadeIn className="md:col-span-3">
                <LicensePurchase />
                <p className="mt-6 text-center text-xs text-neutral-500">
                  FREE로 시작하려면{" "}
                  <Link href="/activate" className="text-neutral-300 underline-offset-2 hover:underline">
                    상점 등록
                  </Link>
                  에서 라이선스 키 없이 등록하세요.
                </p>
              </FadeIn>

              <div className="space-y-6 md:col-span-2">
                <FadeIn delay={80}>
                  <div className="glass-thick landing-shadow p-6">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                      <Sparkles className="size-5 text-white/80" />
                      포함 사항
                    </h2>
                    <ul className="mt-4 space-y-2.5">
                      {INCLUDED.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-neutral-400">
                          <Check className="mt-0.5 size-4 shrink-0 text-white/70" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeIn>

                <FadeIn delay={120}>
                  <div className="glass-thick landing-shadow p-6">
                    <h2 className="text-lg font-bold">진행 순서</h2>
                    <ol className="mt-4 space-y-4">
                      {STEPS.map((step) => (
                        <li key={step.n} className="flex gap-3">
                          <span className="font-mono text-xs text-neutral-500">{step.n}</span>
                          <div>
                            <p className="text-sm font-semibold">{step.title}</p>
                            <p className="mt-0.5 text-xs text-neutral-500">{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </FadeIn>

                <FadeIn delay={160}>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: Store, label: "전용 상점" },
                      { icon: Shield, label: "계좌이체" },
                      { icon: Zap, label: "즉시 발급" },
                    ].map(({ icon: Icon, label }) => (
                      <div
                        key={label}
                        className="glass flex flex-col items-center gap-2 p-4 text-center"
                      >
                        <Icon className="size-5 text-neutral-400" />
                        <span className="text-[11px] text-neutral-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>

          <section className="border-t border-white/10 py-12">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-4 text-center text-sm text-neutral-500 sm:flex-row sm:px-6 md:px-10">
              <span>이미 라이선스 키가 있으신가요?</span>
              <Link href="/activate" className="landing-btn-outline px-5 py-2 text-xs">
                상점 등록하기
              </Link>
              <Link href="/" className="transition hover:text-white">
                메인으로
              </Link>
            </div>
          </section>
        </main>
      </div>
    </QuartzShell>
  );
}
