"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { vxTransition } from "@/lib/motion";

const SLIDES = [
  {
    id: "hosting",
    title: "전 세계 어디서나, 빠르고 안정적으로",
    desc: "Cloudflare 글로벌 CDN 위에서 운영됩니다. 거리와 상관없이, 항상 같은 속도로.",
  },
  {
    id: "ddos",
    title: "DDoS는 탐지부터 자동으로",
    desc: "비정상 트래픽을 실시간으로 분석해 공격을 차단합니다. 서비스는 멈추지 않아요.",
  },
  {
    id: "security",
    title: "데이터는 암호화로 보호",
    desc: "DB와 핵심 파일은 AES-256으로 저장합니다. 저장 단계부터 보안을 챙겼어요.",
  },
] as const;

const SLIDE_COUNT = SLIDES.length;
const HEADER_OFFSET = 64;
const WHEEL_LOCK_MS = 420;

function getSectionMetrics(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const viewport = window.innerHeight;
  const maxScroll = Math.max(node.offsetHeight - viewport, 1);

  return { rect, maxScroll, sectionTop: window.scrollY + rect.top };
}

function isSectionActive(rect: DOMRect) {
  return rect.top <= HEADER_OFFSET + 8 && rect.bottom >= window.innerHeight * 0.55;
}

export function LandingPinnedStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const wheelLockRef = useRef(false);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
    const node = sectionRef.current;
    if (!node) return;

    const { sectionTop, maxScroll } = getSectionMetrics(node);
    const clamped = Math.min(Math.max(index, 0), SLIDE_COUNT - 1);
    const ratio = SLIDE_COUNT <= 1 ? 0 : clamped / (SLIDE_COUNT - 1);
    const target = sectionTop + ratio * maxScroll;

    setDirection(clamped > activeIndexRef.current ? 1 : clamped < activeIndexRef.current ? -1 : 0);
    activeIndexRef.current = clamped;
    setActiveIndex(clamped);
    window.scrollTo({ top: target, behavior });
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    function syncFromScroll() {
      if (wheelLockRef.current) return;
      const { rect, maxScroll, sectionTop } = getSectionMetrics(node!);
      if (!isSectionActive(rect)) return;

      const scrolled = Math.min(Math.max(window.scrollY - sectionTop, 0), maxScroll);
      const ratio = SLIDE_COUNT <= 1 ? 0 : scrolled / maxScroll;
      const nearest = Math.min(SLIDE_COUNT - 1, Math.max(0, Math.round(ratio * (SLIDE_COUNT - 1))));

      if (nearest !== activeIndexRef.current) {
        setDirection(nearest > activeIndexRef.current ? 1 : -1);
        activeIndexRef.current = nearest;
        setActiveIndex(nearest);
      }
    }

    window.addEventListener("scroll", syncFromScroll, { passive: true });
    window.addEventListener("resize", syncFromScroll, { passive: true });
    syncFromScroll();

    return () => {
      window.removeEventListener("scroll", syncFromScroll);
      window.removeEventListener("resize", syncFromScroll);
    };
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    function onWheel(e: WheelEvent) {
      if (wheelLockRef.current) {
        e.preventDefault();
        return;
      }

      const { rect } = getSectionMetrics(node!);
      if (!isSectionActive(rect)) return;

      const delta = e.deltaY;
      if (Math.abs(delta) < 6) return;

      const current = activeIndexRef.current;
      const down = delta > 0;

      if (down && current >= SLIDE_COUNT - 1) return;
      if (!down && current <= 0) return;

      e.preventDefault();
      wheelLockRef.current = true;

      scrollToIndex(down ? current + 1 : current - 1, "auto");

      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, WHEEL_LOCK_MS);
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [scrollToIndex]);

  const activeSlide = SLIDES[activeIndex];

  return (
    <section
      id="intro"
      ref={sectionRef}
      className="snap-story relative"
      style={{ height: `${SLIDE_COUNT * 100}dvh` }}
      aria-label="인프라 · 보안"
    >
      <div
        className="sticky overflow-hidden"
        style={{
          top: HEADER_OFFSET,
          height: `calc(100dvh - ${HEADER_OFFSET}px)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:42px_42px]"
        />

        <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.article
              key={activeSlide.id}
              custom={direction}
              initial={{ opacity: 0, y: direction >= 0 ? 28 : -28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction >= 0 ? -20 : 20 }}
              transition={vxTransition}
              className="absolute inset-0 flex items-center justify-center px-6 text-center"
            >
              <div className="mx-auto w-full max-w-3xl">
                <h2 className="text-balance text-3xl font-semibold leading-tight sm:text-5xl">
                  <span className="text-gradient">{activeSlide.title}</span>
                </h2>
                <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-neutral-400 sm:text-lg">
                  {activeSlide.desc}
                </p>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`${i + 1}번째: ${slide.title}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className={`scroll-story-dot ${i === activeIndex ? "is-active" : ""}`}
              onClick={() => scrollToIndex(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
