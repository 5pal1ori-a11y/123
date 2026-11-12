"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { staggerContainer, staggerItem, vxTransition, vxTransitionFast } from "@/lib/motion";

const NAV = [
  { href: "/#suite", label: "제품" },
  { href: "/#features", label: "기능" },
  { href: "/#workflow", label: "시작" },
  { href: "/#pricing", label: "가격" },
  { href: "/#faq", label: "FAQ" },
];

export function PlatformHeader({ brandOnly = false }: { brandOnly?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      className="platform-header fixed inset-x-0 top-0 z-50 border-b border-white/10 backdrop-blur-xl backdrop-saturate-150"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={vxTransition}
      style={{
        backgroundColor: scrolled ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:h-16 md:px-10"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <Link
          href={brandOnly ? "/" : "/#hero"}
          className="flex min-w-0 items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <VendixLogo size={28} priority />
          <span className="truncate text-base font-extrabold tracking-tight md:text-lg">DOES</span>
        </Link>

        {brandOnly ? null : (
          <>
            <nav className="hidden items-center gap-8 text-sm text-neutral-400 md:flex" aria-label="주요 메뉴">
              {NAV.map((link) => (
                <Link key={link.href} href={link.href} className="nav-link transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link
                href="/notices"
                className="hidden text-sm text-neutral-400 transition hover:text-white sm:inline"
              >
                공지
              </Link>
              <Link
                href="/activate"
                className="landing-btn vx-btn-press px-3 py-1.5 text-[11px] sm:px-4 sm:py-2 sm:text-xs"
              >
                상점 등록
              </Link>
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-xl md:hidden"
                aria-expanded={open}
                aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
                onClick={() => setOpen((v) => !v)}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {open ? (
                    <motion.span
                      key="x"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={vxTransitionFast}
                    >
                      <X className="size-5" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={vxTransitionFast}
                    >
                      <Menu className="size-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {open && !brandOnly ? (
          <motion.div
            className="overflow-hidden border-t border-white/10 bg-black/90 backdrop-blur-xl md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={vxTransitionFast}
          >
            <motion.nav
              className="flex flex-col gap-1 px-4 pb-5 pt-3"
              {...staggerContainer}
              initial="initial"
              animate="animate"
            >
              {NAV.map((link) => (
                <motion.div key={link.href} {...staggerItem}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-sm text-neutral-200 hover:bg-white/5"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div {...staggerItem}>
                <Link
                  href="/notices"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 text-sm text-neutral-200 hover:bg-white/5"
                >
                  공지사항
                </Link>
              </motion.div>
              <motion.div {...staggerItem}>
                <Link
                  href="/activate"
                  onClick={() => setOpen(false)}
                  className="landing-btn vx-btn-press mt-3 w-full"
                >
                  상점 등록
                </Link>
              </motion.div>
            </motion.nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
