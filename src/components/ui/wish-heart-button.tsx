"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";

const BURST = [
  { x: -14, y: -16 },
  { x: 12, y: -18 },
  { x: -18, y: 4 },
  { x: 16, y: 6 },
  { x: 0, y: -22 },
  { x: -8, y: 14 },
];

export function WishHeartButton({
  active,
  onToggle,
  className = "",
  size = "md",
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const [burstKey, setBurstKey] = useState(0);
  const icon = size === "sm" ? "size-4" : "size-5";
  const pad = size === "sm" ? "p-2.5" : "size-10";

  return (
    <button
      type="button"
      onClick={() => {
        if (!active) setBurstKey((k) => k + 1);
        onToggle();
      }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 transition ${pad} ${
        active ? "text-red-400" : "text-neutral-400 hover:text-neutral-200"
      } ${className}`}
      aria-label={active ? "찜 해제" : "찜하기"}
      aria-pressed={active}
    >
      <motion.span
        key={active ? "on" : "off"}
        initial={active ? { scale: 0.55 } : { scale: 1 }}
        animate={
          active
            ? { scale: [0.55, 1.35, 1], rotate: [0, -12, 8, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.42, ease: [0.22, 1.4, 0.36, 1] }}
        className="inline-flex"
      >
        <Heart className={icon} fill={active ? "currentColor" : "none"} />
      </motion.span>

      <AnimatePresence>
        {burstKey > 0 ? (
          <span key={burstKey} className="pointer-events-none absolute inset-0" aria-hidden>
            {BURST.map((p, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400"
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: i * 0.02 }}
              />
            ))}
          </span>
        ) : null}
      </AnimatePresence>
    </button>
  );
}
