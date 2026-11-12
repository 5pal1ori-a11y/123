"use client";

import { useEffect, useRef, useState } from "react";
import { turnstileSiteKey } from "@/lib/verify-bot/turnstile-public";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: string;
          action?: string;
        },
      ) => string;
    };
  }
}

export function VerifyTurnstileGate({
  guildId,
  state,
}: {
  guildId: string;
  state: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const sitekey = turnstileSiteKey();

  useEffect(() => {
    if (!sitekey || !ref.current) return;
    const existing = document.querySelector('script[data-turnstile="1"]');
    const boot = () => {
      if (!ref.current || !window.turnstile) return;
      window.turnstile.render(ref.current, {
        sitekey,
        action: "verify_oauth",
        theme: "dark",
        callback: (token) => {
          const dest = new URL("/api/verify-bot/oauth/start", window.location.origin);
          dest.searchParams.set("guild", guildId);
          dest.searchParams.set("state", state);
          dest.searchParams.set("cf-turnstile-response", token);
          window.location.href = dest.toString();
        },
        "expired-callback": () => setErr("캡차가 만료됐어요. 다시 시도해 주세요."),
      });
    };
    if (existing) {
      boot();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.dataset.turnstile = "1";
    s.onload = () => boot();
    document.head.appendChild(s);
  }, [guildId, sitekey, state]);

  if (!sitekey) {
    return (
      <p className="text-sm text-rose-300">
        Turnstile 사이트키가 없습니다. `NEXT_PUBLIC_TURNSTILE_SITE_KEY`를 설정하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-white/60">봇 방지를 위해 아래 체크를 완료해 주세요.</p>
      <div ref={ref} className="flex justify-center" />
      {err ? <p className="text-sm text-rose-300">{err}</p> : null}
    </div>
  );
}
