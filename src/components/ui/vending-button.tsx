"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
};

export function VendingButton({
  children,
  className,
  disabled,
  type = "button",
  onClick,
}: Props) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      className={cn(
        "w-full border border-pearl/45 bg-transparent px-5 py-3.5",
        "text-[11px] font-medium uppercase tracking-[0.22em] text-pearl",
        "transition hover:bg-pearl hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-35",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
