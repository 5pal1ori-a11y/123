"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, LineChart } from "lucide-react";

type SeriesPoint = { date: string; avg: number | null; soldAvg: number | null; count: number };
type Group = {
  id: string;
  label: string;
  kind: "all" | "cape" | "category";
  today: { avg: number; min: number; count: number; soldAvg: number | null; sold: number };
  series: SeriesPoint[];
  forecast: { tomorrow: number | null; changePct: number | null; trend: "up" | "down" | "flat" | "unknown"; basis: number };
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };

function TrendBadge({ f }: { f: Group["forecast"] }) {
  if (f.trend === "unknown") return <span className="text-xs" style={muted}>데이터 쌓는 중</span>;
  const up = f.trend === "up";
  const down = f.trend === "down";
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cls = up ? "text-rose-500" : down ? "text-sky-500" : "text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${cls}`}>
      <Icon className="size-3.5" />
      {f.changePct !== null ? `${f.changePct > 0 ? "+" : ""}${f.changePct}%` : ""}
    </span>
  );
}

/** 선 그래프 — 평균 판매가(선) · 실제 판매가(점) · 내일 예상(점선) */
function Chart({ g }: { g: Group }) {
  const W = 640;
  const H = 240;
  const P = { l: 56, r: 16, t: 16, b: 28 };
  const pts = g.series.filter((p) => p.avg && p.avg > 0);
  const tomorrow = g.forecast.tomorrow;
  const values = [...pts.map((p) => p.avg!), ...pts.map((p) => p.soldAvg ?? 0).filter((v) => v > 0), ...(tomorrow ? [tomorrow] : [])];
  if (!values.length) return <p className="py-10 text-center text-sm" style={muted}>아직 시세 데이터가 없어요.</p>;
  const lo = Math.min(...values) * 0.95;
  const hi = Math.max(...values) * 1.05 || 1;
  const n = pts.length + (tomorrow ? 1 : 0);
  const x = (i: number) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg!).toFixed(1)}`).join(" ");
  const area = pts.length > 1 ? `${line} L${x(pts.length - 1).toFixed(1)},${H - P.b} L${x(0).toFixed(1)},${H - P.b} Z` : "";
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id="mkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.08" />
          <text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.5">
            {Math.round(t / 1000).toLocaleString("ko-KR")}천
          </text>
        </g>
      ))}
      {area ? <path d={area} fill="url(#mkFill)" /> : null}
      <path d={line} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) =>
        p.soldAvg ? <circle key={`s${i}`} cx={x(i)} cy={y(p.soldAvg)} r="3.5" fill="#f59e0b" /> : null,
      )}
      {pts.length ? <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1]!.avg!)} r="4.5" fill="#10b981" /> : null}
      {tomorrow && pts.length ? (
        <>
          <line x1={x(pts.length - 1)} y1={y(pts[pts.length - 1]!.avg!)} x2={x(pts.length)} y2={y(tomorrow)} stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 5" />
          <circle cx={x(pts.length)} cy={y(tomorrow)} r="4.5" fill="none" stroke="#a78bfa" strokeWidth="2" />
        </>
      ) : null}
      {pts.length ? (
        <>
          <text x={x(0)} y={H - 8} fontSize="11" fill="currentColor" fillOpacity="0.5">{pts[0]!.date.slice(5)}</text>
          <text x={x(pts.length - 1)} y={H - 8} textAnchor={tomorrow ? "middle" : "end"} fontSize="11" fill="currentColor" fillOpacity="0.5">
            {pts[pts.length - 1]!.date.slice(5)}
          </text>
          {tomorrow ? <text x={x(pts.length)} y={H - 8} textAnchor="end" fontSize="11" fill="#a78bfa">내일</text> : null}
        </>
      ) : null}
    </svg>
  );
}

export function MarketChartClient() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sel, setSel] = useState("all");
  const [filter, setFilter] = useState<"all" | "cape" | "category">("all");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/market?days=60", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { groups?: Group[]; updatedAt?: string | null; error?: string }) => {
        if (!j.groups) throw new Error(j.error || "시세를 불러오지 못했어요.");
        setGroups(j.groups);
        setUpdatedAt(j.updatedAt ?? null);
        if (!j.groups.some((g) => g.id === "all") && j.groups[0]) setSel(j.groups[0].id);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const current = useMemo(() => groups?.find((g) => g.id === sel) ?? null, [groups, sel]);
  const list = useMemo(() => (groups ?? []).filter((g) => filter === "all" || g.kind === filter || g.kind === "all"), [groups, filter]);

  if (err) return <div className="glass p-6 text-center text-sm text-rose-500">{err}</div>;
  if (!groups) {
    return (
      <div className="flex items-center justify-center gap-2 py-16" style={muted}>
        <Loader2 className="size-4 animate-spin" /> 시세 불러오는 중…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2">
      {current ? (
        <div className="glass p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500">
                <LineChart className="size-4" /> 계정 차트
              </div>
              <h2 className="mt-1 text-xl font-bold" style={text}>{current.label}</h2>
              <p className="mt-0.5 text-xs" style={muted}>
                판매 중 {current.today.count}개 · 최근 24시간 판매 {current.today.sold}건
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={muted}>오늘 평균가</p>
              <p className="text-2xl font-extrabold" style={text}>{won(current.today.avg)}</p>
              <p className="mt-0.5 text-xs" style={muted}>
                내일 예상 {current.forecast.tomorrow ? won(current.forecast.tomorrow) : "—"} <TrendBadge f={current.forecast} />
              </p>
            </div>
          </div>
          <div className="mt-4" style={muted}>
            <Chart g={current} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[11px]" style={muted}>
            <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-emerald-500" /> 평균 판매가</span>
            <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-full bg-amber-500" /> 실제 팔린 값</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t-2 border-dashed border-violet-400" /> 내일 예상</span>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        {([
          ["all", "전체"],
          ["category", "계정 종류"],
          ["cape", "망토"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === k ? "bg-emerald-500 text-white" : "bg-white/5 hover:bg-white/10"}`}
            style={filter === k ? undefined : muted}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="glass divide-y overflow-hidden" style={{ borderColor: "var(--ad-border, #222)" }}>
        {list.map((g) => (
          <button
            key={g.id}
            onClick={() => setSel(g.id)}
            className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] ${sel === g.id ? "bg-emerald-500/[0.06]" : ""}`}
            style={{ borderColor: "var(--ad-border, #222)" }}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={text}>{g.label}</p>
              <p className="text-[11px]" style={muted}>판매 중 {g.today.count} · 최저 {g.today.min ? won(g.today.min) : "—"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold" style={text}>{won(g.today.avg)}</p>
              <TrendBadge f={g.forecast} />
            </div>
          </button>
        ))}
      </div>

      <p className="px-1 text-center text-[11px]" style={muted}>
        판매 중인 상품 가격 · 실제 판매 기록으로 매일 계산해요{updatedAt ? ` · ${new Date(updatedAt).toLocaleString("ko-KR")} 갱신` : ""}. 내일 예상은 최근 흐름으로 계산한 참고용 추정치예요.
      </p>
    </div>
  );
}
