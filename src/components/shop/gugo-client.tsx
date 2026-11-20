"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Sparkles, Wallet } from "lucide-react";

type Req = {
  id: string;
  wish: string;
  budget: number;
  deposit: number;
  deadline: string;
  status: "open" | "accepted" | "offered" | "fulfilled" | "refunded" | "cancelled" | "expired";
  createdAt: string;
  finalPrice: number | null;
  rest: number | null;
  offerNote: string | null;
  delivery: string | null;
  closedReason: string | null;
  payBy: string | null;
};
type Rules = { depositPercent: number; minBudget: number; maxBudget: number; deadlines: number[] };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const field = { borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" };

const STATUS: Record<Req["status"], [string, string]> = {
  open: ["접수됨", "text-amber-500"],
  accepted: ["구하는 중", "text-sky-500"],
  offered: ["구했어요 · 잔금 결제", "text-emerald-500"],
  fulfilled: ["완료", "text-emerald-500"],
  refunded: ["환불됨", "text-slate-400"],
  cancelled: ["취소됨", "text-slate-400"],
  expired: ["만료", "text-slate-400"],
};

export function GugoClient() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [wish, setWish] = useState("");
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/gugo", { credentials: "include" });
    if (r.status === 401) return setMsg({ ok: false, t: "먼저 로그인해 주세요." });
    const j = (await r.json().catch(() => null)) as { requests?: Req[]; rules?: Rules; points?: number } | null;
    if (j?.requests) setReqs(j.requests);
    if (j?.rules) setRules(j.rules);
    if (typeof j?.points === "number") setPoints(j.points);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const b = Number(budget.replace(/[^\d]/g, "")) || 0;
  const deposit = rules ? Math.ceil((b * rules.depositPercent) / 100 / 100) * 100 : 0;

  const submit = async () => {
    setMsg(null);
    setBusy("new");
    try {
      const r = await fetch("/api/gugo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish: wish.trim(), budget: b, deadlineDays: days }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; balance?: number } | null;
      if (!r.ok || !j?.ok) return setMsg({ ok: false, t: j?.error || "신청하지 못했어요." });
      setWish("");
      setBudget("");
      if (typeof j.balance === "number") setPoints(j.balance);
      setMsg({ ok: true, t: `접수됐어요! 선금 ${won(deposit)}이 빠졌어요.` });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "cancel" | "pay") => {
    setMsg(null);
    setBusy(id);
    try {
      const r = await fetch(`/api/gugo/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) return setMsg({ ok: false, t: j?.error || "처리하지 못했어요." });
      setMsg({ ok: true, t: action === "cancel" ? "취소하고 선금을 돌려드렸어요." : "결제 완료! 아래에서 계정 정보를 확인하세요." });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-1 py-2">
      <div className="glass relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <Sparkles className="size-4" /> 구해드림
            </div>
            <h2 className="mt-1 text-xl font-bold" style={text}>원하는 계정, 구해 드려요</h2>
            <p className="mt-1 text-xs leading-relaxed" style={muted}>
              선금 {rules?.depositPercent ?? 30}%로 주문 · 구해 오면 남은 금액만 결제
              <br />기한 안에 못 구하면 선금 자동 환불 · 수락 전엔 언제든 취소
            </p>
          </div>
          {points !== null && (
            <div className="flex flex-col items-end rounded-2xl bg-amber-500/10 px-4 py-2.5 ring-1 ring-amber-400/25">
              <span className="flex items-center gap-1 text-[11px] text-amber-500/80"><Wallet className="size-3" /> 보유</span>
              <span className="text-lg font-extrabold text-amber-500">{points.toLocaleString("ko-KR")}P</span>
            </div>
          )}
        </div>
      </div>

      <div className="glass space-y-3 p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium" style={muted}>원하는 계정 조건</span>
          <textarea
            value={wish}
            onChange={(e) => setWish(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="예) 15주년 망토, 베드워즈 1000성 이상, MVP+"
            className="w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none focus:border-amber-400/50"
            style={field}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium" style={muted}>예산</span>
          <div className="relative">
            <input
              inputMode="numeric"
              value={b ? b.toLocaleString("ko-KR") : ""}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="150,000"
              className="w-full rounded-2xl border bg-transparent px-4 py-3 pr-10 text-lg font-bold outline-none focus:border-amber-400/50"
              style={field}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm" style={muted}>원</span>
          </div>
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium" style={muted}>기한</span>
          <div className="grid grid-cols-3 gap-2">
            {(rules?.deadlines ?? [3, 7, 14]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-2xl border py-2.5 text-sm font-semibold transition ${days === d ? "border-amber-400/60 bg-amber-500/10 text-amber-500" : "hover:bg-white/[0.04]"}`}
                style={days === d ? undefined : field}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-amber-500/[0.07] px-4 py-3 text-sm">
          <span style={muted}>지금 낼 선금</span>
          <span className="font-extrabold text-amber-500">{won(deposit)}</span>
        </div>
        <button
          onClick={submit}
          disabled={busy === "new" || wish.trim().length < 4 || !b}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 font-bold text-white shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:opacity-50"
        >
          {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : null} 선금 내고 신청하기
        </button>
        {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}
      </div>

      {reqs.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내 구해드림</p>
          {reqs.map((r) => (
            <div key={r.id} className="glass space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold" style={text}>{r.wish}</p>
                <span className={`shrink-0 text-xs font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              </div>
              <p className="flex items-center gap-1.5 text-xs" style={muted}>
                <Clock className="size-3" /> 예산 {won(r.budget)} · 선금 {won(r.deposit)} · 기한 {new Date(r.deadline).toLocaleDateString("ko-KR")}
              </p>
              {r.status === "offered" && r.finalPrice !== null && (
                <div className="space-y-2 rounded-2xl bg-emerald-500/[0.07] p-3 text-sm">
                  <p style={text}>
                    최종가 <b>{won(r.finalPrice)}</b> · 잔금 <b className="text-emerald-500">{won(r.rest ?? 0)}</b>
                  </p>
                  {r.offerNote ? <p className="text-xs" style={muted}>“{r.offerNote}”</p> : null}
                  {r.payBy ? <p className="text-xs" style={muted}>{new Date(r.payBy).toLocaleString("ko-KR")}까지 결제해야 해요</p> : null}
                  <button
                    onClick={() => act(r.id, "pay")}
                    disabled={busy === r.id}
                    className="w-full rounded-xl bg-emerald-500 py-2.5 font-bold text-white disabled:opacity-50"
                  >
                    잔금 결제하고 받기
                  </button>
                </div>
              )}
              {r.status === "fulfilled" && r.delivery && (
                <div className="rounded-2xl bg-emerald-500/[0.07] p-3">
                  <p className="mb-1 flex items-center gap-1 text-xs font-bold text-emerald-500"><CheckCircle2 className="size-3.5" /> 계정 정보</p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs" style={text}>{r.delivery}</pre>
                </div>
              )}
              {r.status === "open" && (
                <button onClick={() => act(r.id, "cancel")} disabled={busy === r.id} className="text-xs underline" style={muted}>
                  취소하고 선금 환불
                </button>
              )}
              {r.closedReason && !["fulfilled"].includes(r.status) ? <p className="text-xs" style={muted}>{r.closedReason}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
