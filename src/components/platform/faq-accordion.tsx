"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bug, ChevronDown, Gift, Lock, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { staggerContainer, staggerItem, vxTransition, vxTransitionFast } from "@/lib/motion";

type FaqItem = {
  q: string;
  a: string;
  Icon: LucideIcon;
};

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: "무료 상점은 어떻게 열 수 있나요?",
    a: "Discord로 로그인한 뒤, 본인이 소유자인 서버를 골라 상점을 열 수 있어요. 라이선스는 FREE 또는 발급받은 키를 입력하면 됩니다.",
    Icon: Gift,
  },
  {
    q: "오류가 있어요!",
    a: "마이페이지 하단에서 버그를 신고해 주세요. 확인 후 빠르게 수정할게요.",
    Icon: Bug,
  },
  {
    q: "결제는 어떤 방식이 있나요?",
    a: "오직 계좌이체예요. 입금이 확인되면 상품을 바로 받을 수 있어요.",
    Icon: Wallet,
  },
  {
    q: "비밀번호를 잃어버렸어요",
    a: "비밀번호 찾기는 추후 EmailJS를 통해 개편할 예정이에요.",
    Icon: Lock,
  },
];

export function FaqAccordion({ items = FAQ_ITEMS }: { items?: readonly FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <motion.div
      className="mt-10 space-y-3"
      {...staggerContainer}
      initial="initial"
      animate="animate"
    >
      {items.map((item, i) => {
        const FaqIcon = item.Icon;
        const isOpen = openIndex === i;

        return (
          <motion.div key={item.q} {...staggerItem}>
            <div className="quartz-card overflow-hidden p-0">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 p-5 text-left font-semibold transition-colors hover:text-white"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : i)}
              >
                <span className="landing-icon-chip landing-icon-chip-sm shrink-0">
                  <FaqIcon className="size-3.5" strokeWidth={1.75} />
                </span>
                {item.q}
                <motion.span
                  className="ml-auto flex shrink-0 items-center text-neutral-500"
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={vxTransitionFast}
                >
                  <ChevronDown className="size-4" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={vxTransition}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 pl-[3.25rem] text-text-secondary">{item.a}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
