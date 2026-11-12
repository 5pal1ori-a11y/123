import Link from "next/link";
import { Server } from "lucide-react";
import { FadeIn } from "@/components/platform/fade-in";

export function LandingCtaBand() {
  return (
    <section id="cta" className="py-16 md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 md:px-10">
        <FadeIn>
          <div className="landing-cta-invert rounded-3xl px-8 py-16 text-center shadow-sm sm:px-16 sm:py-20">
            <h2 className="text-balance text-3xl font-semibold sm:text-4xl">
              지금 바로 시작해 보세요
            </h2>
            <p className="mt-4 text-neutral-600">
              라이선스 키가 있으면 몇 분 안에 상점을 열 수 있어요.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/activate"
                className="vx-btn-press inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                상점 등록
                <Server className="size-4" />
              </Link>
              <Link
                href="#faq"
                className="vx-btn-press inline-flex items-center justify-center rounded-full border border-neutral-300 bg-transparent px-6 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-100"
              >
                FAQ 보기
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
