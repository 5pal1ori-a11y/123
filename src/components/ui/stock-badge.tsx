"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/types";

const labels: Record<StockStatus, string> = {
  in_stock: "재고 있음",
  low_stock: "품절 임박",
  sold_out: "품절",
};

const tones: Record<StockStatus, string> = {
  in_stock: "bg-green/15 text-green",
  low_stock: "bg-orange/15 text-orange",
  sold_out: "bg-fill text-label",
};

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={cn(
        "ios-pill text-[11px] font-medium",
        tones[status],
      )}
    >
      <motion.span
        className="size-1.5 rounded-full bg-current"
        animate={status !== "sold_out" ? { opacity: [1, 0.35, 1] } : undefined}
        transition={{ duration: 2.2, repeat: Infinity }}
      />
      {labels[status]}
    </span>
  );
}
