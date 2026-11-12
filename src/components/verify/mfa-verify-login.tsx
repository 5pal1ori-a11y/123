"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Loader2, Server, ShieldCheck } from "lucide-react";

type Guild = { id: string; name: string; iconUrl: string | null };

export function MfaVerifyLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [needsGuild, setNeedsGuild] = useState(false);
  const [guildId, setGuildId] = useState("");
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verify/mfa-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          username: username.trim(),
          password,
          guildId: guildId.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        needsGuild?: boolean;
        guildId?: string;
        inviteUrl?: string | null;
        guilds?: Guild[];
      };
      if (!res.ok) {
        setError(data.error || "로그인에 실패했어요.");
        setBusy(false);
        return;
      }
      if (data.inviteUrl) setInviteUrl(data.inviteUrl);
      if (data.guilds?.length) setGuilds(data.guilds);
      if (data.needsGuild) {
        setNeedsGuild(true);
        setBusy(false);
        return;
      }
      const prefix = window.location.pathname.startsWith("/verify") ? "/verify" : "";
      window.location.href = `${prefix}/${data.guildId}`;
    } catch {
      setError("네트워크 오류가 발생했어요.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-stage relative min-h-dvh overflow-hidden" data-theme="dark">
      <div className="auth-stage__glow" aria-hidden />
      <div className="auth-stage__grain" aria-hidden />
      <div className="auth-stage__grid" aria-hidden />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-5xl lg:grid-cols-2">
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden flex-col justify-end px-12 py-16 lg:flex"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">DOES</p>
          <h1 className="mt-3 max-w-sm text-4xl font-semibold tracking-tight text-white">인증 · 자판기</h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">
            인증봇과 자판기가 한 봇·한 웹에서 동작합니다. 서버 인증과 복구키는 여기서, 쇼핑은 상점 대시보드에서 이어집니다.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex text-sm font-medium text-violet-200 underline-offset-4 hover:underline">
            자판기 상점으로 이동
          </Link>
        </motion.aside>

        <div className="flex items-center justify-center px-4 py-16 sm:px-8">
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-thick landing-shadow w-full max-w-md space-y-4 p-8"
          >
            <div className="mb-2 flex items-center gap-2 text-neutral-300">
              <ShieldCheck className="size-4" />
              <span className="text-sm font-medium">관리자 로그인</span>
            </div>

            <input
              type="text"
              autoComplete="username"
              placeholder="아이디"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/30"
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/30"
              required
            />

            {needsGuild ? (
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-neutral-300">인증에 쓸 서버를 고르세요.</p>
                {inviteUrl ? (
                  <a
                    href={inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center text-sm font-semibold text-sky-300 underline underline-offset-2"
                  >
                    봇 초대하기
                  </a>
                ) : null}
                {guilds.length ? (
                  <div className="grid max-h-56 gap-2 overflow-y-auto">
                    {guilds.map((g) => {
                      const on = guildId === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGuildId(g.id)}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
                            on ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03]"
                          }`}
                        >
                          {g.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={g.iconUrl} alt="" className="size-8 rounded-lg" />
                          ) : (
                            <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                              <Server className="size-3.5" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{g.name}</span>
                          {on ? <Check className="size-4 text-emerald-300" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-amber-300">봇이 들어간 서버가 없어요. 초대한 뒤 다시 로그인해 주세요.</p>
                )}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || (needsGuild && !guildId)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {needsGuild ? "이 서버로 시작" : "로그인"}
            </button>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </motion.form>
        </div>
      </div>
    </div>
  );
}
