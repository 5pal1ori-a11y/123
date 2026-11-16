"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Gem, KeyRound, Loader2, Sparkles } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { PREMIUM_DAYS, PREMIUM_PLANS, type PremiumPlan, type PremiumPlanId } from "@/lib/premium-plans";

type Me = {
  plan: PremiumPlanId | null;
  planName: string | null;
  expiresAt: string | null;
  points: number;
  discordLinked: boolean;
} | null;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 쇼핑 › 프리미엄 플랜 — BASIC PASS · DOES PASS+ (포인트 구독 또는 라이선스 키) */
export function UserPremiumTab({
  shopSlug,
  loggedIn,
  onPointsChanged,
  onGoCharge,
}: {
  shopSlug: string;
  loggedIn: boolean;
  onPointsChanged?: () => void;
  onGoCharge?: () => void;
}) {
  const [me, setMe] = useState<Me>(null);
  const [confirm, setConfirm] = useState<PremiumPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/premium", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { me?: Me } | null;
    setMe(data?.me ?? null);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/premium", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; plan?: string; premium?: { expiresAt: string } };
      if (!res.ok) throw new Error(data.error || "처리하지 못했어요");
      setMsg({ ok: true, text: `${data.plan} 이(가) 적용됐어요 · ${data.premium ? fmtDate(data.premium.expiresAt) : ""} 까지` });
      setConfirm(null);
      setKey("");
      await load();
      onPointsChanged?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "처리하지 못했어요" });
    } finally {
      setBusy(false);
    }
  }

  const plans = [PREMIUM_PLANS.basic, PREMIUM_PLANS.plus];

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight">DOES PLAN</h2>
        <p className="mt-1 text-sm opacity-70">당신에게 맞는 특별한 혜택을 만나보세요.</p>
      </section>

      {me?.plan ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent px-4 py-3">
          <Sparkles className="size-5 shrink-0 text-amber-400" />
          <p className="text-sm">
            <b>{me.planName}</b> 이용 중 · <b>{me.expiresAt ? fmtDate(me.expiresAt) : ""}</b> 까지
            {!me.discordLinked ? <span className="opacity-70"> · 디스코드를 연동하면 전용 역할을 받아요</span> : null}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const dark = p.id === "plus";
          const Icon = dark ? Gem : Crown;
          const current = me?.plan === p.id;
          return (
            <article
              key={p.id}
              className={`flex flex-col rounded-[22px] border p-6 transition hover:-translate-y-0.5 ${
                dark
                  ? "border-[#1f1f1f] bg-[#0b0b0c] text-white shadow-[0_18px_50px_-20px_rgba(0,0,0,0.6)]"
                  : "border-[#e4e4e7] bg-[#f4f4f5] text-[#0b0b0c]"
              }`}
            >
              <Icon className={`size-7 ${dark ? "text-[#f5c542]" : "text-[#0b0b0c]"}`} strokeWidth={1.8} />
              <h3 className="mt-5 text-lg font-extrabold tracking-wide">{p.name}</h3>
              <p className={`mt-1.5 text-sm ${dark ? "text-white/60" : "text-black/55"}`}>{p.tagline}</p>
              <p className="mt-4 text-[26px] font-extrabold tabular-nums">₩{p.price.toLocaleString("ko-KR")}</p>
              <p className={`mt-1 text-sm ${dark ? "text-white/55" : "text-black/50"}`}>월 구독 · {PREMIUM_DAYS}일</p>
              <hr className={`my-5 ${dark ? "border-white/12" : "border-black/10"}`} />
              <ul className="grid flex-1 gap-3 text-[14px] font-semibold">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check className={`mt-0.5 size-4 shrink-0 ${dark ? "text-[#f5c542]" : ""}`} strokeWidth={3} />
                    {perk}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!loggedIn}
                onClick={() => setConfirm(p)}
                className={`mt-6 w-full rounded-xl py-3 text-[15px] font-bold transition disabled:opacity-40 ${
                  dark ? "bg-white text-black hover:bg-white/90" : "bg-[#0b0b0c] text-white hover:bg-black/85"
                }`}
              >
                {!loggedIn ? "로그인 후 구독" : current ? "기간 연장하기" : "구독하기"}
              </button>
            </article>
          );
        })}
      </div>

      <section className="rounded-2xl border border-current/10 p-5" style={{ borderColor: "rgba(127,127,127,0.25)" }}>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5" />
          <h3 className="font-bold">라이선스 키 등록</h3>
        </div>
        <p className="mt-1 text-sm opacity-70">
          계좌이체로 구매하셨다면 받은 라이선스 키를 넣어 주세요. 키 한 개당 {PREMIUM_DAYS}일이 적용되고, 같은 플랜은 남은 기간에 이어서 늘어나요.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) void post({ action: "redeem", key: key.trim() });
          }}
        >
          <input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            disabled={!loggedIn}
            className="toss-admin-field min-w-0 flex-1 font-mono tracking-widest"
            maxLength={24}
          />
          <button type="submit" disabled={!loggedIn || busy || !key.trim()} className="toss-admin-primary shrink-0 px-5 disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "등록"}
          </button>
        </form>
        {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</p> : null}
      </section>

      {confirm ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="admin-bento w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold">{confirm.name} 구독</h3>
            <p className="mt-2 text-sm text-neutral-400">
              보유 포인트로 바로 결제하고 {PREMIUM_DAYS}일 동안 혜택을 받아요. 라이선스 키는 자동으로 발급 · 적용돼요.
            </p>
            <div className="mt-4 grid gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <div className="flex justify-between">
                <span>결제 포인트</span>
                <b>{confirm.price.toLocaleString("ko-KR")}P</b>
              </div>
              <div className="flex justify-between">
                <span>보유 포인트</span>
                <span>{(me?.points ?? 0).toLocaleString("ko-KR")}P</span>
              </div>
            </div>
            {(me?.points ?? 0) < confirm.price ? (
              <button type="button" className="toss-admin-primary mt-4 w-full py-3" onClick={() => onGoCharge?.()}>
                포인트 충전하러 가기 (계좌이체)
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="toss-admin-primary mt-4 inline-flex w-full items-center justify-center gap-2 py-3"
                onClick={() => void post({ action: "buy", plan: confirm.id })}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {confirm.price.toLocaleString("ko-KR")}P 로 구독하기
              </button>
            )}
            {msg && !msg.ok ? <p className="mt-2 text-sm text-red-400">{msg.text}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
