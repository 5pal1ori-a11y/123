"use client";

import { useCallback, useEffect, useRef } from "react";
import { SESSION_IDLE_MINUTES } from "@/lib/session-config";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "pointerdown"] as const;
const DEFAULT_IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;
const PING_DEBOUNCE_MS = 4 * 60 * 1000;

export function SessionIdleGuard({
  enabled = true,
  idleMs = DEFAULT_IDLE_MS,
  onIdle,
  onPing,
}: {
  enabled?: boolean;
  idleMs?: number;
  onIdle: () => void;
  /** 활동 시 세션 연장용 (debounced) */
  onPing?: () => void;
}) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPing = useRef(0);
  const onIdleRef = useRef(onIdle);
  const onPingRef = useRef(onPing);

  onIdleRef.current = onIdle;
  onPingRef.current = onPing;

  const resetIdleTimer = useCallback(() => {
    if (!enabled) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      onIdleRef.current();
    }, idleMs);

    const ping = onPingRef.current;
    if (ping) {
      const now = Date.now();
      if (now - lastPing.current >= PING_DEBOUNCE_MS) {
        lastPing.current = now;
        ping();
      }
    }
  }, [enabled, idleMs]);

  useEffect(() => {
    if (!enabled) return;

    resetIdleTimer();

    const onVis = () => {
      if (document.visibilityState === "visible") resetIdleTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetIdleTimer);
      }
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, resetIdleTimer]);

  return null;
}
