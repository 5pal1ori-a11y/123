"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";
import type { BoardData } from "@/lib/board";

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

export function BoardClient() {
  const [d, setD] = useState<BoardData | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let last = "";
    const load = () =>
      fetch("/api/board", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: BoardData) => {
          const top = j.tape[0] ? `${j.tape[0].at}${j.tape[0].product}` : "";
          if (last && top && top !== last) setFlash(top);
          last = top;
          setD(j);
        })
        .catch(() => null);
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  if (!d) return <div className="flex min-h-screen items-center justify-center gap-2 bg-[#05070d] text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> 전광판 켜는 중…</div>;
  const maxH = Math.max(1, ...d.hourly);
  const nowH = new Date(Date.now() + 9 * 3_600_000).getUTCHours();
  const ticker = d.movers.length ? [...d.movers, ...d.movers] : [];

  return (
    <div className="min-h-screen bg-[#05070d] font-mono text-slate-100">
      {ticker.length ? (
        <div className="overflow-hidden border-b border-emerald-500/20 bg-black py-2">
          <div className="flex w-max animate-[board-marquee_40s_linear_infinite] gap-8 whitespace-nowrap text-sm">
            {ticker.map((m, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-slate-300">{m.label}</span>
                <span className="font-bold">{won(m.price)}</span>
                <span className={m.changePct > 0 ? "text-rose-400" : m.changePct < 0 ? "text-sky-400" : "text-slate-500"}>{m.changePct > 0 ? "▲" : m.changePct < 0 ? "▼" : "−"} {Math.abs(m.changePct).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.35em] text-emerald-400"><span className="size-2 animate-pulse rounded-full bg-emerald-400" /> LIVE · DOES EXCHANGE</p>
            <h1 className="mt-1 font-sans text-3xl font-black tracking-tight">DOES 거래소 전광판</h1>
          </div>
          <p className="text-xs text-slate-500">{new Date(d.at).toLocaleTimeString("ko-KR")} 기준 · 15초마다 갱신</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["오늘 거래액", won(d.today.volume), d.today.vsYesterdayPct === null ? "어제 같은 시간 기록 없음" : `어제 같은 시간 대비 ${d.today.vsYesterdayPct >= 0 ? "+" : ""}${d.today.vsYesterdayPct}%`, d.today.vsYesterdayPct !== null && d.today.vsYesterdayPct < 0 ? "text-sky-400" : "text-rose-400"],
            ["오늘 체결", `${d.today.trades.toLocaleString("ko-KR")}건`, `구매자 ${d.today.buyers}명`, "text-slate-400"],
            ["판매 중 매물", `${d.listings.toLocaleString("ko-KR")}개`, "지금 바로 살 수 있는 계정", "text-slate-400"],
            ["누적 체결", `${d.allTime.trades.toLocaleString("ko-KR")}건`, "DOES 전체 거래", "text-slate-400"],
          ].map(([l, v, sub, c]) => (
            <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-slate-400">{l}</p>
              <p className="mt-1 text-2xl font-black text-white">{v}</p>
              <p className={`mt-0.5 text-[11px] ${c}`}>{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Activity className="size-4 text-emerald-400" /> 실시간 체결</p>
            <div className="space-y-1">
              {d.tape.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">아직 체결이 없어요</p> : null}
              {d.tape.map((t, i) => {
                const isNew = flash && i === 0;
                return (
                  <div key={`${t.at}${i}`} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isNew ? "bg-emerald-500/25" : i % 2 ? "bg-white/[0.02]" : ""}`}>
                    <span className="truncate font-sans text-slate-200">{t.product}</span>
                    <span className="font-bold text-rose-300">{won(t.price)}</span>
                    <span className="w-24 text-right text-xs text-slate-500">{t.buyer} · {ago(t.at)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-sm font-bold">오늘 시간대별 거래액</p>
              <div className="flex h-32 items-end gap-[3px]">
                {d.hourly.map((v, h) => (
                  <div key={h} className="flex h-full flex-1 flex-col items-center justify-end" title={`${h}시 ${won(v)}`}>
                    <div className={`w-full rounded-t ${h === nowH ? "bg-emerald-400" : h > nowH ? "bg-white/5" : "bg-emerald-500/50"}`} style={{ height: `${Math.max(2, (v / maxH) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-2 text-sm font-bold">시세 등락 (전날 대비)</p>
              <div className="space-y-1.5">
                {d.movers.length === 0 ? <p className="text-xs text-slate-500">시세 데이터가 쌓이는 중이에요</p> : null}
                {d.movers.map((m) => (
                  <div key={m.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-sans text-slate-300">{m.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{won(m.price)}</span>
                      <span className={`flex w-16 items-center justify-end gap-0.5 text-xs font-bold ${m.changePct > 0 ? "text-rose-400" : m.changePct < 0 ? "text-sky-400" : "text-slate-500"}`}>
                        {m.changePct > 0 ? <ArrowUpRight className="size-3" /> : m.changePct < 0 ? <ArrowDownRight className="size-3" /> : null}
                        {Math.abs(m.changePct).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 font-sans text-sm">
          <Link href="/dashboard?tab=products" className="rounded-xl bg-emerald-500 px-4 py-2 font-bold text-white">지금 매물 보기</Link>
          <Link href="/dashboard?tab=market" className="rounded-xl bg-white/10 px-4 py-2 font-bold">계정 차트</Link>
          <Link href="/mc" className="rounded-xl bg-white/10 px-4 py-2 font-bold">닉네임 조회</Link>
        </div>
      </div>
    </div>
  );
}
