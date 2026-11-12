"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, MessageCircle, Send, ShieldOff, Sparkles, X } from "lucide-react";
import type { ShopInquiry, ShopInquiryMessage } from "@/lib/types";
import { shopHeaders } from "@/lib/shop-client";
import { vxTransition } from "@/lib/motion";

export function ShopInquiryChatWidget({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [open, setOpen] = useState(false);
  const [inquiry, setInquiry] = useState<ShopInquiry | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inquiries/chat", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { inquiry: ShopInquiry | null };
      setInquiry(json.inquiry);
    } catch {
      /* ignore poll errors */
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("does-open-inquiry", onOpen);
    return () => window.removeEventListener("does-open-inquiry", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [inquiry?.messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/inquiries/chat", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as { error?: string; inquiry?: ShopInquiry };
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setBody("");
      if (json.inquiry) setInquiry(json.inquiry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSending(false);
    }
  }

  const messages: ShopInquiryMessage[] = inquiry?.messages ?? [];
  const adminOn = Boolean(inquiry && !inquiry.aiEnabled);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="shop-inquiry-fab"
        aria-label="문의하기"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.25 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
      >
        <span className="shop-inquiry-fab-ring" aria-hidden />
        <MessageCircle className="size-5" />
        <span className="hidden sm:inline">문의</span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="닫기"
              className="support-chat-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="support-chat-panel shop-inquiry-panel"
              initial={{ opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={vxTransition}
              role="dialog"
              aria-label="문의 채팅"
            >
              <header className="support-chat-header">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-sky-400/20">
                    {adminOn ? <ShieldOff className="size-5 text-amber-300" /> : <Sparkles className="size-5 text-violet-200" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{shopName} 문의</p>
                    <p className="text-[11px] text-neutral-500">
                      {adminOn ? "관리자가 연결됨 · AI 안내 꺼짐" : "AI가 먼저 답하고, 관리자가 오면 AI가 꺼져요"}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="support-chat-close">
                  <X className="size-4" />
                </button>
              </header>

              <div ref={listRef} className="support-chat-messages">
                {loading && !inquiry ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-neutral-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="support-chat-empty">
                    <Bot className="mx-auto size-9 text-violet-300" />
                    <p className="mt-3 text-sm font-medium text-neutral-200">무엇이든 물어보세요</p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                      상품·충전·인증을 검색해서 AI가 먼저 안내합니다. 관리자가 채팅에 들어오면 AI는 바로 꺼집니다.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`support-chat-bubble ${
                        m.from === "user"
                          ? "support-chat-bubble--mine"
                          : m.from === "admin"
                            ? "support-chat-bubble--human"
                            : "support-chat-bubble--admin"
                      }`}
                    >
                      {m.from !== "user" ? (
                        <p className="mb-1 text-[10px] font-medium text-neutral-400">
                          {m.from === "admin" ? "관리자" : "안내 AI"}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                      <time className="mt-1 block text-[10px] text-neutral-500">
                        {new Date(m.createdAt).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </motion.div>
                  ))
                )}
              </div>

              <form onSubmit={(e) => void send(e)} className="support-chat-compose">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={adminOn ? "관리자에게 메시지를 보내세요" : "문의 내용을 입력하세요"}
                  rows={2}
                  className="support-chat-input"
                />
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
                <button type="submit" disabled={sending || !body.trim()} className="support-chat-send">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  보내기
                </button>
              </form>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
