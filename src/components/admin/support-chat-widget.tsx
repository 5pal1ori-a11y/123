"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import type { PlatformSupportMessage } from "@/lib/types";
import { shopHeaders } from "@/lib/shop-client";
import { vxTransition, vxTransitionFast } from "@/lib/motion";

type SupportChatWidgetProps = {
  shopSlug: string;
  shopName: string;
};

export function SupportChatWidget({ shopSlug, shopName }: SupportChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PlatformSupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/support", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
      });
      if (res.ok) {
        const json = (await res.json()) as { messages: PlatformSupportMessage[] };
        setMessages(json.messages ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("vendix-open-support", onOpen);
    return () => window.removeEventListener("vendix-open-support", onOpen);
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/support", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "전송 실패");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="support-chat-fab"
        aria-label="DOES 고객센터"
      >
        <MessageCircle className="size-5" />
        <span className="hidden sm:inline">문의하기</span>
      </button>

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
              className="support-chat-panel"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={vxTransition}
              role="dialog"
              aria-label="DOES 고객센터"
            >
              <header className="support-chat-header">
                <div>
                  <p className="text-sm font-semibold text-white">DOES 고객센터</p>
                  <p className="text-[11px] text-neutral-500">{shopName} · 서버 관리자에게 문의</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="support-chat-close">
                  <X className="size-4" />
                </button>
              </header>

              <div ref={listRef} className="support-chat-messages">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-neutral-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="support-chat-empty">
                    <MessageCircle className="mx-auto size-8 text-neutral-600" />
                    <p className="mt-3 text-sm font-medium text-neutral-300">도움이 필요하신가요?</p>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                      DOES 안내 AI가 문의 흐름을 읽고 맞춤 답변을 먼저 드리고, 필요하면 서버 관리자가 이어서 도와드려요.
                    </p>
                  </div>
                ) : (
                  messages
                    .slice()
                    .reverse()
                    .map((m) => (
                      <div key={m.id} className="space-y-2">
                        <div className="support-chat-bubble support-chat-bubble--mine">
                          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                          <time className="mt-1 block text-[10px] text-neutral-500">
                            {new Date(m.createdAt).toLocaleString("ko-KR")}
                          </time>
                        </div>
                        {m.aiReply ? (
                          <div className="support-chat-bubble support-chat-bubble--admin">
                            <p className="mb-1 text-[10px] font-medium text-neutral-300">DOES 안내 AI</p>
                            <p className="whitespace-pre-wrap text-sm">{m.aiReply}</p>
                            {m.aiRepliedAt ? (
                              <time className="mt-1 block text-[10px] text-neutral-500">
                                {new Date(m.aiRepliedAt).toLocaleString("ko-KR")}
                              </time>
                            ) : null}
                          </div>
                        ) : null}
                        {m.reply ? (
                          <div className="support-chat-bubble support-chat-bubble--admin">
                            <p className="mb-1 text-[10px] font-medium text-accent">DOES 관리자</p>
                            <p className="whitespace-pre-wrap text-sm">{m.reply}</p>
                            {m.repliedAt ? (
                              <time className="mt-1 block text-[10px] text-neutral-500">
                                {new Date(m.repliedAt).toLocaleString("ko-KR")}
                              </time>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-center text-[10px] text-neutral-600">
                            {m.aiReply
                              ? "AI가 1차 답변했어요. 필요하면 관리자가 이어서 답변합니다."
                              : "답변 대기 중"}
                          </p>
                        )}
                      </div>
                    ))
                )}
              </div>

              <form onSubmit={(e) => void send(e)} className="support-chat-compose">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="문의 내용을 입력하세요"
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
