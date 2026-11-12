"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Shield } from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { cn } from "@/lib/utils";

export function VendixCaptcha({
  solved,
  solving,
  loading,
  error,
  disabled,
  onSolve,
}: {
  solved: boolean;
  solving: boolean;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onSolve: () => void;
}) {
  const busy = Boolean(disabled || loading || solving);
  const canClick = !busy && !solved;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!canClick}
        onClick={onSolve}
        aria-pressed={solved}
        aria-busy={solving || loading}
        className={cn(
          "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition duration-300",
          error
            ? "border-red/40 bg-red/5"
            : solved
              ? "border-white/25 bg-white/[0.08]"
              : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]",
          canClick && "cursor-pointer active:scale-[0.99]",
          !canClick && !solved && "opacity-70",
        )}
      >
        <span
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-lg border transition",
            solved
              ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
              : "border-white/15 bg-black/30 text-white/50 group-hover:border-white/30",
          )}
          aria-hidden
        >
          {loading || solving ? (
            <Loader2 className="size-4 animate-spin text-white/70" />
          ) : solved ? (
            <Check className="size-4" strokeWidth={2.75} />
          ) : (
            <span className="size-3 rounded-[3px] border border-white/35" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tracking-tight text-white">
            {solved ? "확인 완료" : solving ? "확인 중…" : "로봇이 아닙니다"}
          </span>
          <span className="mt-0.5 block text-[11px] text-neutral-500">
            {solved ? "이제 로그인·가입을 진행할 수 있어요" : "한 번만 눌러 주세요"}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-center gap-0.5 opacity-90">
          <VendixLogo size={28} />
          <span className="flex items-center gap-1 text-[9px] font-semibold tracking-[0.14em] text-neutral-400">
            <Shield className="size-2.5" />
            CAPCHA
          </span>
        </span>
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}

export function useVendixCaptcha() {
  const [challenge, setChallenge] = useState("");
  const [passToken, setPassToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPassToken("");
    setError(null);
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      if (!res.ok) throw new Error("보안 확인을 불러오지 못했어요.");
      const data = (await res.json()) as { token?: string };
      if (!data.token) throw new Error("보안 확인을 불러오지 못했어요.");
      setChallenge(data.token);
    } catch {
      setChallenge("");
      setError("보안 확인을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const solve = useCallback(async () => {
    if (solving || passToken) return;
    if (!challenge) {
      setError("보안 확인을 준비 중이에요. 잠시 후 다시 눌러 주세요.");
      await refresh();
      return;
    }
    setSolving(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 550));
      const res = await fetch("/api/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: challenge }),
      });
      const data = (await res.json()) as { passToken?: string; error?: string };
      if (!res.ok || !data.passToken) {
        throw new Error(data.error ?? "확인에 실패했어요.");
      }
      setPassToken(data.passToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "확인에 실패했어요.");
      await refresh();
    } finally {
      setSolving(false);
    }
  }, [challenge, solving, passToken, refresh]);

  return {
    token: passToken,
    loading,
    solving,
    solved: Boolean(passToken),
    error,
    solve,
    refresh,
  };
}
