"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";

export type AdminToastKind = "success" | "error";

export type AdminToastState = {
  msg: string;
  kind: AdminToastKind;
} | null;

export function inferToastKind(msg: string): AdminToastKind {
  return /실패|오류|에러|못|error|fail|denied|invalid/i.test(msg) ? "error" : "success";
}

export function AdminToastViewport({
  toast,
  onDismiss,
}: {
  toast: AdminToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex flex-col items-end gap-2 sm:right-6 sm:top-5">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={`${toast.kind}-${toast.msg}`}
            initial={{ opacity: 0, y: -16, x: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="pointer-events-auto flex max-w-[min(92vw,380px)] items-start gap-3 rounded-2xl border border-[#27272a] bg-[#0a0a0a] px-4 py-3 text-[#fafafa] shadow-[0_18px_44px_-12px_rgba(10,10,10,0.45)]"
          >
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[#ffffff] ${
                toast.kind === "success" ? "bg-[#16a34a]" : "bg-[#dc2626]"
              }`}
            >
              {toast.kind === "success" ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <p className="flex-1 text-[13px] leading-snug">{toast.msg}</p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-0.5 shrink-0 opacity-50 transition hover:opacity-100"
              aria-label="닫기"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
