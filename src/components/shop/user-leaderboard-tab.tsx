"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Crown, Gift, Loader2, Medal, Sparkles, Trophy } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Period = "week" | "month" | "year";
type Row = { rank: number; name: string; amount: number; count: number };

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "주별" },
  { id: "month", label: "달별" },
  { id: "year", label: "년도별" },
];

function podiumClass(rank: number, mine?: boolean) {
  if (mine) return "border-sky-400/40 bg-sky-500/10";
  if (rank === 1) return "border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-transparent";
  if (rank === 2) return "border-slate-300/35 bg-gradient-to-r from-slate-200/15 via-white/5 to-transparent";
  if (rank === 3) return "border-orange-500/35 bg-gradient-to-r from-orange-500/20 via-amber-700/10 to-transparent";
  return "border-white/8 bg-white/[0.02]";
}

function RankMark({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="size-5 text-amber-300" />;
  if (rank === 2) return <Medal className="size-5 text-slate-200" />;
  if (rank === 3) return <Medal className="size-5 text-orange-400" />;
  return <span className="w-5 text-center text-xs font-semibold text-neutral-500">{rank}</span>;
}

export function UserLeaderboardTab({
  shopSlug,
  onOpenAttendance,
}: {
  shopSlug: string;
  onOpenAttendance?: () => void;
}) {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<Period>("month");
  const [rows, setRows] = useState<Row[]>([]);
  const [mine, setMine] = useState<Row | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/leaderboard?period=${period}`, {
          credentials: "include",
          headers: shopHeaders(shopSlug),
        });
        const data = (await res.json().catch(() => ({}))) as {
          rows?: Row[];
          mine?: Row | null;
          total?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
        if (!cancelled) {
          setRows(data.rows ?? []);
          setMine(data.mine ?? null);
          setTotal(data.total ?? data.rows?.length ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopSlug, period]);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] via-transparent to-white/[0.02] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Trophy className="size-6 text-amber-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">랭킹</p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-white">구매 리더보드</h3>
            <p className="mt-1.5 text-sm text-neutral-400">기간별 누적 구매금액 순위입니다.</p>
          </div>
        </div>
        <div className="mt-4 inline-flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                period === p.id ? "text-black" : "text-neutral-400 hover:text-white",
              )}
            >
              {period === p.id ? (
                <motion.span
                  layoutId="lb-period-pill"
                  className="absolute inset-0 rounded-full bg-white shadow-[0_6px_20px_-6px_rgba(255,255,255,0.6)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="relative">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {onOpenAttendance ? (
        <motion.button
          type="button"
          onClick={onOpenAttendance}
          className="mf-dark group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border border-amber-300/20 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(251,191,36,0.18),transparent_55%),linear-gradient(180deg,rgba(24,18,12,0.9),rgba(10,9,8,0.95))] px-5 py-4 text-left"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.99 }}
        >
          <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 shadow-[0_10px_30px_-8px_rgba(251,191,36,0.7)]">
            <Gift className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">오늘의 출석체크</span>
            <span className="mt-0.5 block text-xs text-neutral-400">
              다이아몬드 캐고 최대 3,000원 받기 · 연속 출석 기록
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-amber-200 transition group-hover:translate-x-1" />
        </motion.button>
      ) : null}

      {mine ? (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3">
          <Sparkles className="size-4 shrink-0 text-sky-200" />
          <p className="min-w-0 flex-1 text-sm text-sky-50">
            이번 {PERIODS.find((p) => p.id === period)?.label} 당신은{" "}
            <span className="font-bold">{mine.rank}등</span>
            {total > 0 ? <span className="text-sky-200/70"> / {total}명</span> : null}
          </p>
          <p className="shrink-0 text-sm font-bold text-white">{formatKRW(mine.amount)}</p>
        </div>
      ) : !loading ? (
        <p className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-neutral-500">
          이번 기간 구매 기록이 없으면 순위에 안 올라요.
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-neutral-500" />
        </div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-400">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">아직 순위 데이터가 없어요</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, i) => {
            const isMine = mine?.rank === row.rank && mine.name === row.name;
            return (
              <motion.li
                key={`${period}-${row.rank}-${row.name}`}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(0.4, i * 0.035) }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3",
                  podiumClass(row.rank, isMine),
                  row.rank <= 3 && !isMine && "shadow-[0_0_24px_rgba(251,191,36,0.08)]",
                )}
              >
                <RankMark rank={row.rank} />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-semibold",
                      row.rank === 1 ? "text-amber-100" : row.rank <= 3 ? "text-white" : "text-neutral-200",
                    )}
                  >
                    {row.rank <= 3 ? `${row.rank}등 · ${row.name}` : row.name}
                    {isMine ? " · 나" : ""}
                  </p>
                  <p className="text-[11px] text-neutral-500">{row.count}건 구매</p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-sm font-bold",
                    row.rank === 1 ? "text-amber-200" : "text-white",
                  )}
                >
                  {formatKRW(row.amount)}
                </p>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
