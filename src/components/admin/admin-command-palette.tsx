"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { vxTransitionFast } from "@/lib/motion";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  onSelect: () => void;
};

export function AdminCommandPalette({
  items,
  open: openProp,
  onOpenChange,
}: {
  items: CommandItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 24);
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(query) ||
          (i.hint ?? "").toLowerCase().includes(query) ||
          (i.group ?? "").toLowerCase().includes(query),
      )
      .slice(0, 24);
  }, [items, q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const run = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      item.onSelect();
    },
    [setOpen],
  );

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="명령 팔레트 닫기"
            className="fixed inset-0 z-[80] bg-[rgba(10,10,10,0.32)] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="빠른 이동"
            className="fixed left-1/2 top-[18%] z-[90] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--ad-border,rgba(255,255,255,0.1))] bg-[var(--ad-sheet,#0e0e14)] shadow-[0_24px_70px_-20px_rgba(10,10,10,0.35)]"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={vxTransitionFast}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Search className="size-4 text-neutral-300" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && filtered[active]) {
                    e.preventDefault();
                    run(filtered[active]);
                  }
                }}
                placeholder="메뉴·기능 검색… (Ctrl/⌘ K)"
                className="w-full !border-0 !bg-transparent !p-0 text-sm text-white !shadow-none outline-none placeholder:text-neutral-500"
                aria-autocomplete="list"
                aria-controls="cmdk-list"
              />
              <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-neutral-500 sm:inline">
                Esc
              </kbd>
            </div>
            <ul id="cmdk-list" role="listbox" className="max-h-[320px] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-neutral-500">결과 없음</li>
              ) : (
                filtered.map((item, idx) => (
                  <li key={item.id} role="option" aria-selected={idx === active}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        idx === active ? "bg-neutral-500/15 text-white" : "text-neutral-300 hover:bg-white/5"
                      }`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => run(item)}
                    >
                      <span>
                        <span className="font-medium">{item.label}</span>
                        {item.hint ? (
                          <span className="mt-0.5 block text-[11px] text-neutral-500">{item.hint}</span>
                        ) : null}
                      </span>
                      {item.group ? (
                        <span className="text-[10px] text-neutral-600">{item.group}</span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
