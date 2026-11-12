/** Shared motion tokens — framer-motion + CSS */
export const VX_EASE = [0.22, 1, 0.36, 1] as const;

export const vxTransition = {
  duration: 0.34,
  ease: VX_EASE,
} as const;

export const vxTransitionMobile = {
  duration: 0.22,
  ease: VX_EASE,
} as const;

export const vxTransitionFast = {
  duration: 0.24,
  ease: VX_EASE,
} as const;

export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
} as const;

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
} as const;

export const slideFromRight = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
} as const;

export const staggerContainer = {
  initial: "initial",
  animate: "animate",
  variants: {
    animate: {
      transition: { staggerChildren: 0.07, delayChildren: 0.05 },
    },
  },
} as const;

export const staggerItem = {
  variants: {
    initial: { opacity: 0, y: 14 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: VX_EASE },
    },
  },
} as const;

export const collapseVariants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
} as const;
