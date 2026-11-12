"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { shopHeaders } from "@/lib/shop-client";
import { useShopUser } from "@/components/shop/user-context";

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
  // 로그인/로그아웃이 바뀌면 다시 접속해서 회원 표시를 갱신한다
  const { user } = useShopUser();
  const uid = user?.id ?? "";

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    // 로그인한 회원이면 서명 토큰을 받아 붙인다 → 관리자 회원목록에 접속중/마지막 접속 표시
    const fetchToken = async (): Promise<string | null> => {
      try {
        const res = await fetch("/api/presence/token", {
          credentials: "include",
          headers: shopHeaders(room, false),
          cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { token?: string | null };
        return data.token ?? null;
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (stopped) return;
      const token = await fetchToken();
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const qs = new URLSearchParams({ room, v: visitorId() });
      if (token) qs.set("t", token);
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
        reconnect = setTimeout(() => void connect(), Math.min(30_000, 1500 * 2 ** retry));
      };
    };

    void connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      clearTimeout(reconnect);
      ws?.close();
    };
  }, [room, uid]);

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
