"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Gem, MessageSquarePlus } from "lucide-react";

type Data = {
  loggedIn: boolean;
  hasDiscord?: boolean;
  tiers: { id: string; name: string; min: number; perks: string[] }[];
  spent?: number;
  tier?: { id: string; name: string; perks: string[] } | null;
  next?: { name: string; min: number; remaining: number } | null;
  channelId?: string | null;
  requests?: { id: string; text: string; createdAt: string; status: string }[];
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const TIER_STYLE: Record<string, string> = { silver: "from-slate-200 to-slate-400 text-slate-900", gold: "from-amber-200 to-amber-500 text-amber-950", black: "from-zinc-700 to-black text-amber-300" };

/** 프리미엄 플랜 탭 위 — 내 VIP 등급 · 다음 등급까지 · 전용 채널 · 맞춤 요청 */
export function VipCard() {
  const [d, setD] = useState<Data | null>(null);
  const [req, setReq] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/vip", { credentials: "include", cache: "no-store" }).catch(() => null);
    if (r?.ok) setD((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!d || !d.loggedIn) return null;

  const post = async (body: Record<string, unknown>, ok: (j: { channelId?: string }) => string) => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/vip", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; channelId?: string } | null;
    setMsg(r?.ok && j?.ok ? { ok: true, t: ok(j) } : { ok: false, t: j?.error || "처리하지 못했어요." });
    setBusy(false);
    await load();
  };

  const gold = d.tier && d.tier.id !== "silver";
  const cur = d.tiers.find((t) => t.id === d.tier?.id);
  const pct = d.next ? Math.min(100, Math.round((((d.spent ?? 0) - (cur?.min ?? 0)) / (d.next.min - (cur?.min ?? 0))) * 100)) : 100;

  return (
    <div className="glass mx-auto mb-4 w-full max-w-3xl space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 rounded-xl bg-gradient-to-br px-3 py-1.5 text-sm font-black ${d.tier ? TIER_STYLE[d.tier.id] : "from-slate-500/30 to-slate-500/10"}`} style={d.tier ? {} : muted}>
            <Gem className="size-4" /> {d.tier?.name ?? "VIP 아님"}
          </span>
          <span className="text-sm" style={muted}>누적 구매 <b style={text}>{won(d.spent ?? 0)}</b></span>
        </div>
        {d.next ? <span className="text-xs" style={muted}>{d.next.name}까지 {won(d.next.remaining)}</span> : <span className="text-xs font-bold text-amber-500">최고 등급</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(127,127,127,0.18)" }}>
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {d.tiers.map((t) => (
          <div key={t.id} className={`rounded-xl p-3 text-xs ${d.tier?.id === t.id ? "ring-2 ring-amber-400" : ""}`} style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.08))" }}>
            <p className="font-black" style={text}>{t.name}</p>
            <p className="mb-1" style={muted}>누적 {won(t.min)} 이상</p>
            {t.perks.map((p) => <p key={p} style={muted}>· {p}</p>)}
          </div>
        ))}
      </div>
      {gold ? (
        <div className="space-y-2 rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)" }}>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !d.hasDiscord} onClick={() => post({ action: "channel" }, () => "전용 채널이 준비됐어요. 디스코드에서 확인해 주세요.")} className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              <Crown className="size-3.5" /> {d.channelId ? "전용 채널 다시 열기" : "디스코드 전용 채널 열기"}
            </button>
            {!d.hasDiscord ? <span className="text-xs" style={muted}>디스코드로 로그인하면 전용 채널을 열 수 있어요</span> : null}
          </div>
          <textarea value={req} onChange={(e) => setReq(e.target.value)} rows={2} maxLength={800} placeholder="맞춤 계정 요청 — 원하는 망토 · 조건을 적어 주세요" className="w-full rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "rgba(127,127,127,0.3)", background: "transparent", ...text }} />
          <div className="flex gap-2">
            <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" placeholder="예산 (원 · 선택)" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "rgba(127,127,127,0.3)", background: "transparent", ...text }} />
            <button disabled={busy || req.trim().length < 5} onClick={() => post({ action: "request", text: req, budget: Number(budget.replace(/[^\d]/g, "")) || undefined }, () => { setReq(""); setBudget(""); return "맞춤 요청을 보냈어요. 매니저가 연락드려요."; })} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
              <MessageSquarePlus className="size-3.5" /> 요청 보내기
            </button>
          </div>
        </div>
      ) : null}
      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}
    </div>
  );
}
