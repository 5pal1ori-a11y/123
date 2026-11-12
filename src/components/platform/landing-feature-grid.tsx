"use client";

import {
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  Package,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FadeIn } from "@/components/platform/fade-in";

type Feature = {
  Icon: LucideIcon;
  title: string;
  desc: string;
  span: string;
  highlight?: string;
  motion: "a" | "b" | "c";
};

const FEATURES: Feature[] = [
  {
    Icon: KeyRound,
    title: "자동 상품 발급",
    desc: "입금 확인 후 구매자에게 상품을 바로 전달해요.",
    span: "col-span-full lg:col-span-2",
    highlight: "즉시",
    motion: "a",
  },
  {
    Icon: CreditCard,
    title: "계좌이체 결제",
    desc: "별도 PG 없이 계좌이체로 결제하고, 확인만 하면 돼요.",
    span: "col-span-full sm:col-span-3 lg:col-span-2",
    motion: "b",
  },
  {
    Icon: Package,
    title: "재고 관리",
    desc: "제품 재고를 한 번에 등록하고 품절을 관리해요.",
    span: "col-span-full sm:col-span-3 lg:col-span-2",
    motion: "c",
  },
  {
    Icon: ShieldCheck,
    title: "안전한 운영",
    desc: "세션 기반 접근과 주문 토큰으로 데이터를 보호해요.",
    span: "col-span-full lg:col-span-3",
    motion: "a",
  },
  {
    Icon: LayoutDashboard,
    title: "관리자 대시보드",
    desc: "주문, 재고, 설정을 한 화면에서 깔끔하게 다뤄요.",
    span: "col-span-full lg:col-span-3",
    motion: "b",
  },
  {
    Icon: Globe,
    title: "전용 서브도메인",
    desc: "your-shop 주소로 나만의 상점을 열 수 있어요.",
    span: "col-span-full",
    motion: "c",
  },
];

export function LandingFeatureGrid() {
  return (
    <div className="grid grid-cols-6 gap-5">
      {FEATURES.map(({ Icon, title, desc, span, highlight, motion }, i) => (
        <FadeIn key={title} delay={i * 70} className={span}>
          <div className="quartz-card landing-shadow group h-full overflow-hidden p-6 transition-transform duration-500 hover:scale-[1.03] quartz-lift">
            {highlight ? (
              <div className="relative mx-auto mb-6 flex h-24 w-full max-w-[14rem] items-center justify-center">
                <span className="text-5xl font-semibold tracking-tight">{highlight}</span>
              </div>
            ) : (
              <div
                className={`landing-icon-chip mb-4 inline-flex landing-icon-float-${motion} group-hover:scale-105 transition-transform`}
              >
                <Icon className="size-5" strokeWidth={1.75} />
              </div>
            )}
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{desc}</p>
          </div>
        </FadeIn>
      ))}
    </div>
  );
}
