"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

type Pending = {
  title: string;
  body: string;
  confirmLabel?: string;
};

export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((title: string, body: string, confirmLabel = "삭제") => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPending({ title, body, confirmLabel });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const dialog: ReactNode = (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/72 backdrop-blur-md"
            aria-label="닫기"
            onClick={() => close(false)}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="confirm-title"
            className="glass-thick relative z-10 w-full max-w-sm p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.38, ease: EASE }}
          >
            <h3 id="confirm-title" className="text-lg font-semibold text-white">
              {pending.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">{pending.body}</p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="admin-btn-outline flex-1 py-2.5 text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className="flex-1 rounded-full border border-red-400/40 bg-red-500/15 py-2.5 text-sm font-semibold text-red-300 transition duration-300 hover:bg-red-500/25"
              >
                {pending.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { confirm, dialog };
}

export { EASE };
