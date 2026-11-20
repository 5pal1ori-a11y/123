"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Coins, Crown, Loader2, Lock, Ticket } from "lucide-react";

type Cell = { t: "points" | "ticket"; n: number; label: string; state: "locked" | "ready" | "claimed" | "nopass" };
type Data = {
  loggedIn: boolean;
  season: { name: string; daysLeft: number; end: string };
  tiers: { level: number; free: Cell; pass: Cell }[];
  rules: { attendance: number; per500won: number; review: number; reviewMax: number };
  price: number;
  boost: number;
  maxLevel: number;
  xpPerLevel: number;
  points?: number;
  level?: number;
  inLevel?: number;
  pass?: boolean;
  claimable?: number;
  xp?: { total: number; attendance: number; purchase: number; review: number; attendanceDays: number; spent: number; reviews: number; boost: number };
};

const P = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };

function RewardCell({ c, gold }: { c: Cell; gold: boolean }) {
  const ready = c.state === "ready";
  const dim = c.state === "locked" || c.state === "nopass";
  const Icon = c.t === "ticket" ? Ticket : Coins;
  return (
    <div
      className={`relative flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition ${ready ? (gold ? "border-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.45)]" : "border-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.4)]") : gold ? "border-amber-400/25" : "border-white/10"}`}
      style={{ background: gold ? "linear-gradient(160deg, rgba(251,191,36,0.14), rgba(127,127,127,0.04))" : "var(--mf-surface-2, rgba(127,127,127,0.08))", opacity: c.state === "claimed" ? 0.5 : dim ? 0.6 : 1 }}
    >
      <Icon className={`size-7 ${dim ? "text-slate-400" : c.t === "ticket" ? "text-violet-400" : gold ? "text-amber-400" : "text-sky-400"}`} />
      <p className="mt-1 text-xs font-extrabold" style={text}>{c.label}</p>
      {c.state === "claimed" ? <Check className="absolute right-1.5 top-1.5 size-4 rounded-full bg-emerald-500 p-0.5 text-white" /> : null}
      {c.state === "nopass" ? <Lock className="absolute right-1.5 top-1.5 size-3.5 text-amber-400" /> : null}
      {ready ? <span className={`absolute -bottom-2 rounded-full px-2 text-[10px] font-black text-slate-900 ${gold ? "bg-amber-400" : "bg-sky-400"}`}>받기</span> : null}
    </div>
  );
}

export function SeasonPassClient() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const track = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/season-pass", { credentials: "include", cache: "no-store" }).catch(() => null);
    if (r?.ok) setD((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // 현재 레벨 근처로 스크롤
  useEffect(() => {
    if (!d || !track.current) return;
    const idx = Math.max(0, (d.level ?? 0) - 2);
    track.current.scrollTo({ left: idx * 104, behavior: "smooth" });
  }, [d?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: "buy" | "claim") => {
    if (action === "buy" && d && !window.confirm(`${P(d.price)}로 ${d.season.name} 패스를 살까요?`)) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/season-pass", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; points?: number; tickets?: number; count?: number } | null;
    if (r?.ok && j?.ok) {
      setMsg({ ok: true, t: action === "buy" ? `패스를 샀어요! 패스 보상이 열리고 XP가 +${(d?.boost ?? 0) * 100}% 올라요.` : `보상 ${j.count}개를 받았어요! ${j.points ? `+${P(j.points)}` : ""}${j.tickets ? ` · 렌탈 1일권 ${j.tickets}장` : ""}` });
    } else setMsg({ ok: false, t: j?.error || "처리하지 못했어요." });
    setBusy(false);
    await load();
  };

  if (!d) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin" style={muted} /></div>;
  const lv = d.level ?? 0;
  const pct = lv >= d.maxLevel ? 100 : d.inLevel ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2">
      <div className="glass overflow-hidden p-5" style={{ background: "radial-gradient(ellipse 70% 80% at 20% 0%, rgba(251,191,36,0.18), transparent 70%)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-amber-500">SEASON PASS</p>
            <h2 className="mt-0.5 text-2xl font-black" style={text}>DOES {d.season.name}</h2>
            <p className="text-xs" style={muted}>{d.season.daysLeft}일 남음 · {new Date(d.season.end).toLocaleDateString("ko-KR")} 종료</p>
          </div>
          {d.loggedIn ? (
            <div className="flex gap-2">
              <button disabled={busy || !d.claimable} onClick={() => act("claim")} className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {d.claimable ? `보상 받기 (${d.claimable})` : "받을 보상 없음"}
              </button>
              {d.pass ? (
                <span className="flex items-center gap-1 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 px-4 py-2.5 text-sm font-black text-amber-950"><Crown className="size-4" /> 패스 보유</span>
              ) : (
                <button disabled={busy} onClick={() => act("buy")} className="flex items-center gap-1 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 px-4 py-2.5 text-sm font-black text-amber-950 disabled:opacity-50">
                  <Crown className="size-4" /> 패스 구매 · {P(d.price)}
                </button>
              )}
            </div>
          ) : (
            <a href="/dashboard?tab=account" className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white">로그인하고 시작하기</a>
          )}
        </div>

        {d.loggedIn ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-amber-500">Lv.</span>
              <span className="text-4xl font-black" style={text}>{lv}</span>
              <span className="text-sm font-bold" style={muted}>/ {d.maxLevel}</span>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs font-semibold" style={muted}>
                <span>{lv >= d.maxLevel ? "최고 레벨!" : `다음 레벨까지 ${d.xpPerLevel - pct} XP`}</span>
                <span>누적 {(d.xp?.total ?? 0).toLocaleString("ko-KR")} XP</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full" style={{ background: "rgba(127,127,127,0.18)" }}>
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200" style={{ width: `${Math.max(3, pct)}%` }} />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}

      <div className="glass p-4">
        <div className="flex">
          <div className="flex w-12 shrink-0 flex-col text-xs font-black">
            <div className="flex h-24 items-center text-sky-500">일반</div>
            <div className="h-10" />
            <div className="flex h-24 items-center text-amber-500">패스</div>
          </div>
          <div ref={track} className="flex gap-2 overflow-x-auto pb-3 pt-1">
            {d.tiers.map((t) => {
              const reached = t.level <= lv;
              return (
                <div key={t.level} className="flex shrink-0 flex-col items-center">
                  <RewardCell c={t.free} gold={false} />
                  <div className="relative flex h-10 w-24 items-center justify-center">
                    <div className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 ${reached ? "bg-amber-400" : "bg-slate-500/25"}`} />
                    <span className={`relative flex size-8 items-center justify-center rounded-full text-xs font-black ${reached ? "bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950" : "bg-slate-700 text-slate-300"} ${t.level === lv + 1 ? "ring-2 ring-amber-400" : ""}`}>{t.level}</span>
                  </div>
                  <RewardCell c={t.pass} gold />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass p-4 text-sm">
          <p className="mb-2 font-bold" style={text}>경험치 얻는 법</p>
          <ul className="space-y-1 text-xs" style={muted}>
            <li>· 출석(무료 채굴) 하루 <b className="text-amber-500">{d.rules.attendance} XP</b>{d.xp ? ` — ${d.xp.attendanceDays}일 · ${d.xp.attendance} XP` : ""}</li>
            <li>· 구매 500원당 <b className="text-amber-500">{d.rules.per500won} XP</b>{d.xp ? ` — ${d.xp.spent.toLocaleString("ko-KR")}원 · ${d.xp.purchase} XP` : ""}</li>
            <li>· 후기 <b className="text-amber-500">{d.rules.review} XP</b> (시즌당 {d.rules.reviewMax}개){d.xp ? ` — ${d.xp.reviews}개 · ${d.xp.review} XP` : ""}</li>
            <li>· 패스 보유 시 모든 XP <b className="text-amber-500">+{d.boost * 100}%</b></li>
          </ul>
        </div>
        <div className="glass p-4 text-sm">
          <p className="mb-2 font-bold" style={text}>패스 혜택</p>
          <ul className="space-y-1 text-xs" style={muted}>
            <li>· 단계마다 패스 보상 추가 (포인트 · 렌탈 1일권)</li>
            <li>· 30단계 보상 <b className="text-amber-500">3,000P</b> · 10 · 20단계 <b className="text-violet-400">렌탈 1일권</b></li>
            <li>· 시즌 중간에 사도 지난 단계 보상까지 전부 받을 수 있어요</li>
            <li>· 디스코드에서 <b>/시즌패스</b>로도 볼 수 있어요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
