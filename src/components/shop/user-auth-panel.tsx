"use client";

import { useEffect, useState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { setGuestMode } from "@/lib/guest-mode";
import { shopHeaders } from "@/lib/shop-client";
import { REFERRAL_STASH_KEY } from "@/lib/referral";

type Methods = { microsoft: boolean; discord: boolean };

const DISCORD_ERRORS: Record<string, string> = {
  denied: "Discord 로그인을 취소했어요.",
  disabled: "이 상점은 지금 Discord 로그인을 쓰지 않아요.",
  config: "Discord 로그인이 아직 설정되지 않았어요.",
  state: "로그인 시간이 지났어요. 다시 시도해 주세요.",
};

export function UserAuthPanel({ shopSlug }: { shopSlug: string }) {
  // 관리자가 켠 로그인 방법 중 서버 설정(OAuth 키)까지 된 것만 버튼을 보여준다
  const [methods, setMethods] = useState<Methods | null>(null);
  const [redirecting, setRedirecting] = useState<"microsoft" | "discord" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/user/methods", { headers: shopHeaders(shopSlug), credentials: "omit" });
        const data = (await res.json().catch(() => ({}))) as Partial<Methods>;
        setMethods({ microsoft: Boolean(data.microsoft), discord: Boolean(data.discord) });
      } catch {
        setMethods({ microsoft: false, discord: false });
      }
    })();

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim().toUpperCase();
    if (ref) {
      try {
        localStorage.setItem(REFERRAL_STASH_KEY, ref.slice(0, 12));
      } catch {
        /* storage blocked */
      }
    }
    const reason = params.get("discord");
    if (reason && reason !== "linked" && reason !== "merged") {
      setNotice(params.get("msg") || DISCORD_ERRORS[reason] || "Discord 로그인에 실패했어요. 다시 시도해 주세요.");
    }
  }, [shopSlug]);

  const returnPath = () => {
    const { pathname, search } = window.location;
    const path = pathname.startsWith("/") && pathname !== "/" ? pathname : "/dashboard";
    const params = new URLSearchParams(search);
    params.delete("discord");
    params.delete("msg");
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  function startLogin(kind: "microsoft" | "discord") {
    setRedirecting(kind);
    setGuestMode(shopSlug, false);
    window.location.href = `/api/auth/user/${kind}/start?shop=${encodeURIComponent(shopSlug)}&next=${encodeURIComponent(returnPath())}`;
  }

  function enterAsGuest() {
    setGuestMode(shopSlug, true);
    window.location.href = "/main";
  }

  const none = methods !== null && !methods.microsoft && !methods.discord;

  return (
    <div className="auth-panel space-y-4">
      {notice ? (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200">
          {notice}
        </p>
      ) : null}

      {methods === null ? (
        <div className="flex justify-center py-3">
          <Loader2 className="size-5 animate-spin text-neutral-500" />
        </div>
      ) : null}

      {methods?.microsoft ? (
        <>
          <button
            type="button"
            onClick={() => startLogin("microsoft")}
            disabled={redirecting !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#1b1b1b] transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {redirecting === "microsoft" ? <Loader2 className="size-4 animate-spin" /> : <MicrosoftMark />}
            Microsoft 계정으로 로그인
          </button>
          <p className="text-center text-[11px] leading-relaxed text-neutral-500">
            마인크래프트에 쓰는 Microsoft 계정으로 바로 로그인할 수 있어요.
          </p>
        </>
      ) : null}

      {methods?.discord ? (
        <button
          type="button"
          onClick={() => startLogin("discord")}
          disabled={redirecting !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
        >
          {redirecting === "discord" ? <Loader2 className="size-4 animate-spin" /> : <DiscordMark />}
          Discord로 로그인
        </button>
      ) : null}

      {none ? (
        <p className="text-center text-[11px] text-red-400">지금은 로그인할 수 있는 방법이 없어요. 관리자에게 문의해 주세요.</p>
      ) : null}

      <div className="flex items-center gap-3 text-[11px] text-neutral-600">
        <span className="h-px flex-1 bg-white/10" />
        또는
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <button
        type="button"
        onClick={enterAsGuest}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-neutral-200 transition hover:border-white/30 hover:bg-white/5"
      >
        <Compass className="size-4" />
        게스트로 둘러보기
      </button>
      <p className="text-center text-[11px] leading-relaxed text-neutral-500">
        게스트는 월드 구경만 할 수 있어요. 구매·충전·출석 보상은 로그인이 필요해요.
      </p>
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden className="shrink-0">
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

function DiscordMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0" fill="currentColor">
      <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.85a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.92 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
    </svg>
  );
}
