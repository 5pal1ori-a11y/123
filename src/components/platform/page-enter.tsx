"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { fadeUp, vxTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

type PageEnterProps = HTMLMotionProps<"div">;

export function PageEnter({ className, children, ...props }: PageEnterProps) {
  return (
    <motion.div
      className={cn(className)}
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={vxTransition}
      {...props}
    >
      {children}
    </motion.div>
  );
}
