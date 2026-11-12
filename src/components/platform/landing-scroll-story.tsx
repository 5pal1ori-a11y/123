"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Globe, KeyRound, Layers, Zap } from "lucide-react";

type StoryStep = {
  id: string;
  step: string;
  title: string;
  body: string;
  Icon: LucideIcon;
};

const STEPS: StoryStep[] = [
  {
    id: "speed",
    step: "01",
    title: "3분이면 개설",
    body: "라이선스 키 한 장으로 상점 등록까지. 복잡한 설치 없이 브라우저에서 바로 시작해요.",
    Icon: Zap,
  },
  {
    id: "issue",
    step: "02",
    title: "상품 자동 발급",
    body: "계좌이체 입금이 확인되면 상품을 구매자에게 바로 전달해요.",
    Icon: KeyRound,
  },
  {
    id: "stock",
    step: "03",
    title: "재고 한곳에서",
    body: "상품 재고를 한 화면에서 관리하고, 품절 걱정 없이 판매해요.",
    Icon: Layers,
  },
  {
    id: "domain",
    step: "04",
    title: "나만의 주소",
    body: "상점 등록과 동시에 전용 서브도메인이 열려요. your-shop 주소로 바로 접속할 수 있어요.",
    Icon: Globe,
  },
];

type LandingScrollStoryProps = {
  domainLabel: string;
};

export function LandingScrollStory({ domainLabel }: LandingScrollStoryProps) {
  const [active, setActive] = useState(0);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const nodes = panelRefs.current.filter(Boolean) as HTMLDivElement[];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible.length) return;
        const index = nodes.indexOf(visible[0].target as HTMLDivElement);
        if (index >= 0) setActive(index);
      },
      { root: null, rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const current = STEPS[active];

  return (
    <section id="intro" className="py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-14 md:px-10">
        <div className="md:sticky md:top-28 md:self-start">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-neutral-500">
            Scroll · {current.step}
          </p>

          <div className="scroll-story-copy mt-4 min-h-[9.5rem] md:min-h-[11rem]">
            <h2
              key={current.id}
              className="scroll-story-line text-3xl font-extrabold leading-tight md:text-4xl lg:text-5xl"
            >
              {current.title}
            </h2>
            <p key={`${current.id}-body`} className="scroll-story-line mt-4 max-w-md leading-relaxed text-text-secondary">
              {current.id === "domain"
                ? current.body.replace("your-shop", `your-shop.${domainLabel}`)
                : current.body}
            </p>
          </div>

          <div className="mt-8 flex items-center gap-2">
            {STEPS.map((step, i) => (
              <button
                key={step.id}
                type="button"
                aria-label={`${step.title}로 이동`}
                className={`scroll-story-dot ${i === active ? "is-active" : ""}`}
                onClick={() => panelRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })}
              />
            ))}
          </div>

          <p className="mt-8 hidden text-sm text-neutral-500 md:block">
            스크롤하면 핵심 기능이 순서대로 바뀌어요.
          </p>
        </div>

        <div className="relative space-y-6 md:space-y-10">
          {STEPS.map((step, i) => {
            const Icon = step.Icon;
            const isActive = i === active;
            return (
              <div
                key={step.id}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
                className="scroll-story-panel min-h-[52vh] md:min-h-[68vh] flex items-center"
              >
                <div
                  className={`quartz-card landing-shadow w-full p-8 transition-all duration-500 md:p-10 ${
                    isActive ? "scroll-story-panel-active quartz-lift" : "opacity-55 scale-[0.98]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={`landing-icon-chip inline-flex landing-icon-float-${(["a", "b", "c", "a"] as const)[i]}`}
                    >
                      <Icon className="size-5" strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-xs text-accent">{step.step}</span>
                  </div>
                  <h3 className="mt-6 text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                    {step.id === "domain"
                      ? step.body.replace("your-shop", `your-shop.${domainLabel}`)
                      : step.body}
                  </p>
                  {step.id === "domain" && (
                    <p className="mt-6 font-mono text-xs text-neutral-500">
                      https://your-shop.{domainLabel}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
