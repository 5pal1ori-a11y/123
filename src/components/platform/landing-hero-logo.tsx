"use client";

import { motion, useReducedMotion } from "framer-motion";
import { VX_EASE } from "@/lib/motion";

export function LandingHeroLogo() {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/does-mark.png"
          alt=""
          className="h-[min(62vmin,420px)] w-[min(62vmin,420px)] object-contain opacity-[0.22] sm:h-[min(88vmin,820px)] sm:w-[min(88vmin,820px)] sm:opacity-[0.28]"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <div className="relative h-[min(58vmin,380px)] w-[min(58vmin,380px)] sm:h-[min(92vmin,860px)] sm:w-[min(92vmin,860px)]">
        <motion.div
          className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22)_0%,transparent_65%)]"
          initial={{ opacity: 0, scale: 0.65 }}
          animate={{ opacity: [0, 1, 0.45], scale: 1 }}
          transition={{ duration: 2, ease: VX_EASE }}
        />

        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.82, rotate: -12, filter: "blur(18px)" }}
          animate={{ opacity: 0.26, scale: 1, rotate: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.6, ease: VX_EASE }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/does-mark.png" alt="" className="h-full w-full object-contain" />
        </motion.div>

        <motion.div
          className="absolute inset-0"
          style={{
            WebkitMaskImage: "url(/does-mark.png)",
            maskImage: "url(/does-mark.png)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            backgroundImage:
              "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.75) 50%, transparent 65%)",
            backgroundSize: "250% 100%",
          }}
          initial={{ backgroundPositionX: "120%", opacity: 0 }}
          animate={{ backgroundPositionX: "-120%", opacity: [0, 0.7, 0] }}
          transition={{ duration: 1.8, delay: 0.6, ease: VX_EASE }}
        />
      </div>
    </div>
  );
}
