"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Box } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { IslandView } from "@/lib/island/world";
import { IslandWorld } from "./island-world";

const SEEN_KEY = "does-island-intro";

export function IslandIntro({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [open, setOpen] = useState(false);
  const [island, setIsland] = useState<IslandView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("island");
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* 시크릿 모드 등 */
    }
    if (!target && seen) return;
    if (window.location.pathname.startsWith("/admin")) return;
    setOpen(true);
    void (async () => {
      try {
        const qs = target ? `?u=${encodeURIComponent(target)}` : "";
        const res = await fetch(`/api/island${qs}`, { credentials: "include", headers: shopHeaders(shopSlug), cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { island?: IslandView };
          if (data.island) setIsland(data.island);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [shopSlug]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* noop */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("island")) {
      url.searchParams.delete("island");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.pointerLockElement) close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="isl-intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {loaded ? (
            <IslandWorld shopSlug={shopSlug} island={island} editable={Boolean(island?.mine)} onPortal={close} onIslandChange={setIsland}>
              <div className="isl-intro-brand">
                <span className="isl-intro-logo">
                  <Box />
                </span>
                <span>
                  <b>{shopName}</b>
                  <small>{island ? `${island.owner.name}의 섬 · Lv.${island.level}` : "스카이블럭에 오신 걸 환영해요"}</small>
                </span>
              </div>
              <button type="button" className="isl-intro-enter" onClick={close}>
                상점 입장
                <ArrowRight />
              </button>
              <p className="isl-intro-tip">동쪽 워프 정자의 빛나는 발판을 밟아도 이동해요</p>
            </IslandWorld>
          ) : (
            <div className="isl-loading">
              <span className="isl-intro-logo">
                <Box />
              </span>
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
