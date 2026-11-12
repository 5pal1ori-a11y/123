"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ScrollText } from "lucide-react";
import { TicketRichContent } from "@/components/ticket/ticket-rich-content";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";

type Msg = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
  bot: boolean;
  attachments: { filename: string; url: string }[];
};

type Transcript = {
  topicName: string;
  openerName: string;
  openerNameSlug: string;
  index: number;
  closedAt: string;
  createdAt: string;
  closedBy: string | null;
  messages: Msg[];
};

function initials(name: string) {
  const s = name.trim();
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

export function TicketTranscriptClient({
  guildId,
  usernameSlug,
  index,
}: {
  guildId: string;
  usernameSlug: string;
  index: number;
}) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      username: usernameSlug,
      index: String(index),
    });
    const t =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("t") ||
          new URLSearchParams(window.location.search).get("token")
        : null;
    if (t) q.set("t", t);
    const res = await fetch(`/api/ticket/${guildId}?${q}`);
    const data = await res.json().catch(() => ({}));
    if (data.needLogin || data.needToken) {
      setNeedLogin(true);
      setTranscript(null);
      setLoading(false);
      if (data.needToken && !t) {
        setErr(
          "유효한 트랜스크립트 링크(토큰)가 필요해요. Discord 로그의 링크를 사용하거나 웹패널에 로그인하세요.",
        );
      }
      return;
    }
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "불러오기 실패");
      setLoading(false);
      return;
    }
    setNeedLogin(false);
    setTranscript(data.transcript);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, usernameSlug, index]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/ticket/${guildId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(typeof data.error === "string" ? data.error : "로그인 실패");
      return;
    }
    setPassword("");
    await load();
  }

  if (loading) {
    return (
      <div className="admin-shell flex min-h-dvh items-center justify-center" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <Loader2 className="size-6 animate-spin text-sky-300/80" />
          <p className="text-xs tracking-[0.18em] text-[var(--ad-muted)]">LOADING</p>
        </motion.div>
      </div>
    );
  }

  if (needLogin) {
    return (
      <div className="admin-shell flex min-h-dvh items-center justify-center px-4" data-theme="dark">
        <form onSubmit={login} className="admin-bento w-full max-w-sm space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200">
              <ScrollText className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/70">
                Transcript
              </p>
              <h1 className="text-lg font-bold text-[var(--ad-text)]">열람 로그인</h1>
            </div>
          </div>
          <p className="text-sm text-[var(--ad-muted)]">웹패널 비밀번호가 필요합니다.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--ad-border)] bg-black/30 px-3 py-2.5 text-sm text-[var(--ad-text)] outline-none focus:border-sky-400/40"
          />
          {err ? <p className="text-sm text-rose-400">{err}</p> : null}
          <button
            type="submit"
            className="vx-btn-press w-full rounded-xl bg-sky-400 py-2.5 text-sm font-semibold text-[#061018]"
          >
            로그인
          </button>
        </form>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="admin-shell flex min-h-dvh flex-col items-center justify-center gap-3 px-4" data-theme="dark">
        <p className="text-sm text-[var(--ad-muted)]">{err || "트랜스크립트가 없어요."}</p>
      </div>
    );
  }

  return (
    <div className="admin-shell relative min-h-dvh overflow-x-hidden" data-theme="dark">
      <motion.div
        className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-sky-500/10 blur-3xl"
        animate={{ y: [0, 40, 0], opacity: [0.25, 0.4, 0.25] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <header className="relative border-b border-[var(--ad-border)] bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/70">
              Transcript
            </p>
            <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-[var(--ad-text)]">
              {transcript.topicName} · {transcript.openerName}{" "}
              <span className="font-mono text-base text-[var(--ad-muted)]">#{transcript.index}</span>
            </h1>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ad-muted)]">
              생성 {new Date(transcript.createdAt).toLocaleString("ko-KR")}
              {" · "}
              종료 {new Date(transcript.closedAt).toLocaleString("ko-KR")}
              {transcript.closedBy ? ` · ${transcript.closedBy}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <motion.div
          className="admin-bento space-y-1 overflow-hidden p-2 sm:p-3"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {transcript.messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--ad-muted)]">메시지가 없습니다.</p>
          ) : (
            transcript.messages.map((m, i) => (
              <motion.div
                key={m.id}
                variants={fadeUp}
                transition={{ delay: Math.min(i, 20) * 0.02, ease: verifyEase }}
                className={`flex gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-white/[0.03] ${
                  m.bot ? "bg-sky-400/[0.04]" : ""
                }`}
              >
                {m.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.authorAvatarUrl}
                    alt=""
                    className="mt-0.5 size-10 shrink-0 rounded-full ring-1 ring-white/10"
                  />
                ) : (
                  <span
                    className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      m.bot ? "bg-sky-400/20 text-sky-100" : "bg-white/10 text-[var(--ad-text)]"
                    }`}
                  >
                    {initials(m.authorName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm leading-none">
                    <span className="font-semibold text-[var(--ad-text)]">{m.authorName}</span>
                    {m.bot ? (
                      <span className="rounded bg-sky-400/25 px-1.5 py-0.5 text-[10px] font-bold text-sky-100">
                        BOT
                      </span>
                    ) : null}
                    <span className="text-[11px] text-[var(--ad-muted)]">
                      {new Date(m.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </p>
                  <div className="mt-2">
                    <TicketRichContent content={m.content} />
                  </div>
                  {m.attachments?.map((a) => (
                    <a
                      key={a.url}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex text-sm text-sky-300 hover:underline"
                    >
                      {a.filename}
                    </a>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      </main>
    </div>
  );
}
