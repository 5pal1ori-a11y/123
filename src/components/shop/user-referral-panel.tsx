"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, UserPlus, Users } from "lucide-react";
import { PanelField, PanelPrimaryBtn } from "@/components/admin/admin-panel-ui";
import { shopHeaders } from "@/lib/shop-client";
import { REFERRAL_STASH_KEY } from "@/lib/referral";
import { formatKRW } from "@/lib/utils";

type Summary = {
  code: string | null;
  ratePercent: number;
  referredBy: { name: string; code: string | null } | null;
  invitedCount: number;
  earned: number;
};

export function UserReferralPanel({ shopSlug, onApplied }: { shopSlug: string; onApplied?: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/referral", { headers: shopHeaders(shopSlug), credentials: "include" });
      if (res.ok) setSummary((await res.json()) as Summary);
    })();
    try {
      const stashed = localStorage.getItem(REFERRAL_STASH_KEY);
      if (stashed) setInput(stashed);
    } catch {
      /* storage blocked */
    }
  }, [shopSlug]);

  const link =
    summary?.code && typeof window !== "undefined"
      ? `${window.location.origin}/dashboard?tab=account&ref=${summary.code}`
      : "";

  async function copy(kind: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        referrerName?: string;
        summary?: Summary;
      };
      if (!res.ok) throw new Error(data.error ?? "등록하지 못했어요");
      if (data.summary) setSummary(data.summary);
      setMsg({ ok: true, text: `${data.referrerName ?? "추천인"}님을 추천인으로 등록했어요.` });
      try {
        localStorage.removeItem(REFERRAL_STASH_KEY);
      } catch {
        /* storage blocked */
      }
      onApplied?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "등록하지 못했어요" });
    } finally {
      setBusy(false);
    }
  }

  if (!summary) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <Users className="size-4 text-neutral-500" /> 내 추천인 코드
        </p>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-center">
          <p className="font-mono text-3xl font-bold tracking-[0.25em] text-white">{summary.code}</p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            이 코드를 등록한 친구가 상품을 살 때마다 산 금액의 {summary.ratePercent}%가 내 포인트로 들어와요.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => summary.code && void copy("code", summary.code)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-neutral-200"
            >
              {copied === "code" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              코드 복사
            </button>
            {link ? (
              <button
                type="button"
                onClick={() => void copy("link", link)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-neutral-200"
              >
                {copied === "link" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                초대 링크 복사
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] text-neutral-500">내 코드로 가입한 친구</p>
            <p className="mt-0.5 font-semibold text-white">{summary.invitedCount}명</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] text-neutral-500">받은 추천 보상</p>
            <p className="mt-0.5 font-semibold text-emerald-300">{formatKRW(summary.earned)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-white/10 pt-6">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <UserPlus className="size-4 text-neutral-500" /> 추천인 등록
        </p>
        {summary.referredBy ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-neutral-300">
            <strong className="text-white">{summary.referredBy.name}</strong>님을 추천인으로 등록했어요
            {summary.referredBy.code ? ` (${summary.referredBy.code})` : ""}.
          </p>
        ) : (
          <form onSubmit={apply} className="space-y-3">
            <PanelField label="친구에게 받은 추천인 코드" hint="한 번 등록하면 바꿀 수 없어요">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 12))}
                placeholder="예) 7KQ2MZ"
                className="toss-admin-field font-mono tracking-widest"
              />
            </PanelField>
            <PanelPrimaryBtn type="submit" disabled={busy || !input.trim()} className="w-full sm:w-auto sm:min-w-[140px]">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "추천인 등록"}
            </PanelPrimaryBtn>
          </form>
        )}
        {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
