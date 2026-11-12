"use client";

import { MessageSquare, Store, Zap } from "lucide-react";
import { FadeIn } from "@/components/platform/fade-in";

const CARDS = [
  {
    Icon: Store,
    title: "웹 · Discord 한 자판기",
    desc: "상품과 재고를 한곳에서 관리하면 웹스토어와 Discord 패널에 같이 반영돼요.",
  },
  {
    Icon: MessageSquare,
    title: "채널에서 사고, 콘솔에서 처리",
    desc: "입금 대기·재고 실패 같은 예외만 모아 보여 줘서, 손볼 건부터 처리하면 됩니다.",
  },
  {
    Icon: Zap,
    title: "입금 확인 → 상품 발송",
    desc: "자동 충전이 붙으면 확인부터 발송까지 이어지고, 운영자는 예외만 보면 돼요.",
  },
] as const;

export function LandingConceptFigs() {
  return (
    <section id="intro" className="bg-gray-50 py-16 dark:bg-transparent md:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight">
            판매에 필요한 <span className="text-gradient">흐름만</span>
          </h2>
          <p className="mt-4 text-text-secondary">
            상점 개설부터 주문·입금·발송까지, DOES가 디지털 자판기 운영을 이어 줍니다.
          </p>
        </FadeIn>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {CARDS.map((card, i) => (
            <FadeIn key={card.title} delay={i * 70}>
              <article className="quartz-card quartz-lift landing-shadow h-full p-6">
                <span className="landing-icon-chip">
                  <card.Icon className="size-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{card.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{card.desc}</p>
              </article>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
