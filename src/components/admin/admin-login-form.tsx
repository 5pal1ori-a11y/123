"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Shield } from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";

const EASE = [0.22, 1, 0.36, 1] as const;

function DiscordMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

/** 아이디/비밀번호 로그인을 허용하는 상점 (나머지는 Discord 전용) */
const PASSWORD_LOGIN_SHOPS = new Set(["mfa"]);

export function AdminLoginForm({ shopSlug, shopName }: { shopSlug: string; shopName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const passwordLogin = PASSWORD_LOGIN_SHOPS.has(shopSlug);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-orel-shop": shopSlug },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "로그인에 실패했어요.");
        setBusy(false);
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("네트워크 오류가 발생했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discord = params.get("discord");
    const msg = params.get("msg");
    if (discord === "denied") setError("Discord 로그인이 취소됐어요.");
    else if (discord === "state" || discord === "code" || discord === "claim") {
      setError("로그인 세션이 만료됐어요. 다시 시도해 주세요.");
    } else if (discord === "unlink") {
      setError(msg || "상점에 Discord 서버가 연동되지 않았어요.");
    } else if (discord === "forbidden") {
      setError(msg || "이 상점에 연동된 Discord 계정으로 로그인해 주세요.");
    } else if (discord === "shop") {
      setError(msg || "상점을 찾을 수 없어요.");
    } else if (discord === "error") {
      setError(msg || "Discord 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
    if (discord) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Always go through apex guild picker (registered → panel, unregistered → license).
  const startHref = `/api/auth/admin/discord/start?shop=${encodeURIComponent(shopSlug)}`;

  return (
    <div
      className="auth-stage auth-stage--admin relative min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain"
      data-theme="dark"
    >
      <div className="auth-stage__glow auth-stage__glow--admin" aria-hidden />
      <div className="auth-stage__grain" aria-hidden />
      <div className="auth-stage__grid" aria-hidden />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-5xl lg:grid-cols-2">
        <motion.aside
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="hidden flex-col justify-end px-12 py-16 lg:flex"
        >
          <VendixLogo size={56} className="mb-6" />
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">Shop Admin</p>
          <h1 className="mt-3 max-w-sm text-4xl font-semibold tracking-tight text-white">
            {shopName}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/50">
            Discord로 로그인한 뒤 서버를 선택하세요. 등록된 서버는 패널로, 새 서버는 라이선스로
            등록합니다.
          </p>
        </motion.aside>

        <div className="flex items-center justify-center px-4 py-16 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            className="glass-thick landing-shadow w-full max-w-md p-8"
          >
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <VendixLogo size={40} />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">Shop Admin</p>
                <p className="font-semibold">{shopName}</p>
              </div>
            </div>

            <div className="mb-6 flex items-center gap-2 text-neutral-400">
              <Shield className="size-4" />
              <span className="text-sm">관리자 로그인</span>
            </div>

            <div className="space-y-4">
              {passwordLogin ? (
                <>
                  <form onSubmit={submitPassword} className="space-y-3">
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
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      로그인
                    </button>
                  </form>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                    <span className="h-px flex-1 bg-white/10" />
                    또는
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                </>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  window.location.href = startHref;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <DiscordMark />}
                Discord로 서버 선택
              </button>
              <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                로그인 후 등록된 서버는 바로 패널로 이동하고, 미등록 서버는 라이선스 입력으로
                상점을 만듭니다.
              </p>
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
