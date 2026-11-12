"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const VISITOR_KEY = "does-visitor-id";

function visitorId() {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return "";
  }
}

export function LivePresenceBadge({ room }: { room: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const qs = new URLSearchParams({ room, v: visitorId() });
      try {
        ws = new WebSocket(`${proto}//${location.host}/api/presence/ws?${qs}`);
      } catch {
        return;
      }
      ws.onopen = () => {
        retry = 0;
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string" || e.data === "pong") return;
        try {
          const data = JSON.parse(e.data) as { count?: number };
          if (typeof data.count === "number") setCount(Math.max(1, data.count));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (stopped) return;
        retry += 1;
        if (retry > 6) return;
        reconnect = setTimeout(connect, Math.min(30_000, 1500 * 2 ** retry));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      clearTimeout(reconnect);
      ws?.close();
    };
  }, [room]);

  return (
    <AnimatePresence>
      {count !== null ? (
        <motion.div
          className="live-badge"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <span className="live-badge-dot" aria-hidden />
          지금{" "}
          <motion.b key={count} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {count.toLocaleString()}
          </motion.b>
          명이 보는 중
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
