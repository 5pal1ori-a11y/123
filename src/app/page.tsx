import { PlatformHeader } from "@/components/layout/platform-header";
import { FaqAccordion } from "@/components/platform/faq-accordion";
import { FadeIn } from "@/components/platform/fade-in";
import { LandingConceptFigs } from "@/components/platform/landing-concept-figs";
import { LandingCtaBand } from "@/components/platform/landing-cta-band";
import { LandingDashSection } from "@/components/platform/landing-dash-mock";
import { LandingHero } from "@/components/platform/landing-hero";
import { LandingPricingCards } from "@/components/platform/landing-pricing-cards";
import { LandingProductSuite } from "@/components/platform/landing-product-suite";
import { QuartzShell } from "@/components/ui/quartz-shell";
import { getRootDomain } from "@/lib/domain";
import Link from "next/link";

export default function PlatformHomePage() {
  const root = getRootDomain();
  const domainLabel = root === "localhost" ? "localhost" : root;

  return (
    <QuartzShell>
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader />

        <main className="flex-1 pt-16">
          <LandingHero domainLabel={domainLabel} />

          <LandingConceptFigs />

          <LandingProductSuite />

          <LandingDashSection
            id="features"
            eyebrow="운영 콘솔"
            title={
              <>
                주문·입금·발송을
                <br />
                한 화면에서
              </>
            }
            description="실제 상점 관리자 대시보드 UI예요. 탭·차트 기간·메뉴를 눌러 보며 미리 체험해 보세요."
            variant="overview"
          />

          <LandingDashSection
            id="demo"
            eyebrow="계좌 · 충전"
            title={
              <>
                입금 대기를
                <br />
                콘솔에서 처리
              </>
            }
            description="실제 관리자 패널의 계좌·충전 화면이에요. 대기 충전 승인부터 자동충전 설정까지 그대로입니다."
            variant="orders"
          />

          <LandingDashSection
            id="solutions"
            eyebrow="제품관리"
            title={
              <>
                상품·재고를
                <br />
                한곳에서
              </>
            }
            description="실제 제품관리 패널 UI입니다. 웹스토어와 Discord 패널이 같은 재고를 공유해요."
            variant="products"
          />

          <LandingDashSection
            id="workflow"
            eyebrow="스토어설정"
            title={
              <>
                상점만 열면
                <br />
                바로 운영
              </>
            }
            description="스토어 설정 화면 그대로예요. 이름·환영 메시지·유지보수까지 웹 패널에서 이어갑니다."
            variant="workflow"
          />

          <section id="pricing" className="py-16 md:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-10">
              <FadeIn className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-extrabold md:text-4xl">가격 플랜</h2>
                <p className="mt-3 text-text-secondary">
                  FREE 무료 · LITE ₩4,900 · PRO ₩9,900 · PRO MAX ₩14,900 / 월
                </p>
              </FadeIn>
              <FadeIn className="mx-auto mt-12 max-w-6xl">
                <LandingPricingCards />
              </FadeIn>
            </div>
          </section>

          <section id="faq" className="py-16 md:py-24">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 md:px-10">
              <FadeIn className="text-center">
                <h2 className="text-3xl font-extrabold">자주 묻는 질문</h2>
                <p className="mt-3 text-text-secondary">자주 묻는 내용을 모아 두었어요.</p>
              </FadeIn>
              <FaqAccordion />
            </div>
          </section>

          <LandingCtaBand />
        </main>

        <footer className="border-t border-white/10 py-12 text-center text-sm text-neutral-500">
          <p>© {new Date().getFullYear()} DOES. All rights reserved.</p>
          <p className="mt-2">
            <Link href="/activate" className="hover:text-neutral-300">
              상점 등록
            </Link>
            {" · "}
            <Link href="/notices" className="hover:text-neutral-300">
              공지사항
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
        </footer>
      </div>
    </QuartzShell>
  );
}
