"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, Check, Coins, Crown, Flame, Gift, Sparkles, Trophy } from "lucide-react";
import { cn, formatKRW } from "@/lib/utils";
import { DiamondMine } from "./diamond-mine";
import { TodayDrawFeed, type GiftState, type RandomBoxHistory } from "./random-box-gift";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MILESTONES = [3, 7, 14, 30];

const ease = [0.16, 1, 0.3, 1] as const;

function shiftDay(dayKey: string, days: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

export function UserAttendanceTab({
  shopSlug,
  onClaimed,
}: {
  shopSlug: string;
  onClaimed?: (points: number) => void;
}) {
  const [status, setStatus] = useState<GiftState | null>(null);
  const reduce = useReducedMotion();
  const history = status?.history;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <AttendanceHero history={history} claimed={Boolean(status?.claimed)} />

      <div className="grid gap-5 lg:grid-cols-12">
        <motion.div
          className="lg:col-span-5"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.08 }}
        >
          <DiamondMine shopSlug={shopSlug} onStatus={setStatus} onClaimed={onClaimed} />
        </motion.div>

        <div className="space-y-5 lg:col-span-7">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.14 }}
          >
            <WeekStrip history={history} />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.2 }}
          >
            <MonthCalendar history={history} />
          </motion.div>
        </div>
      </div>

      <motion.section
        className="att-card p-5 sm:p-6"
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.26 }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-200" />
          <h3 className="text-[15px] font-semibold tracking-tight text-white">오늘 다른 사람들은</h3>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            실시간
          </span>
        </div>
        <TodayDrawFeed status={status} />
      </motion.section>
    </div>
  );
}

function AttendanceHero({ history, claimed }: { history?: RandomBoxHistory; claimed: boolean }) {
  const reduce = useReducedMotion();
  const streak = history?.streak ?? 0;
  const next = MILESTONES.find((m) => m > streak) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= streak) ?? 0;
  const progress = next ? (streak - prev) / (next - prev) : 1;

  const stats = [
    { icon: CalendarCheck, label: "이번 달 출석", value: `${history?.monthDays ?? 0}일` },
    { icon: Coins, label: "이번 달 받은 포인트", value: formatKRW(history?.monthAmount ?? 0) },
    { icon: Trophy, label: "최고 연속", value: `${history?.bestStreak ?? 0}일` },
    { icon: Crown, label: "최고 당첨", value: history?.bestAmount ? formatKRW(history.bestAmount) : "-" },
  ];

  return (
    <motion.section
      className="att-hero relative overflow-hidden rounded-[2rem] p-6 sm:p-8"
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease }}
    >
      <div aria-hidden className="att-hero-orb att-hero-orb-a" />
      <div aria-hidden className="att-hero-orb att-hero-orb-b" />

      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-amber-200">
            <Gift className="size-3.5" />
            DAILY CHECK-IN
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
            {claimed ? "오늘 출석 완료!" : "오늘도 출석하고 다이아 캐세요"}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
            매일 한 번 다이아몬드 원석을 캐서 0원~3,000원을 받아요. 하루라도 빠지면 연속 기록이 초기화돼요.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="att-flame relative grid size-20 place-items-center rounded-3xl">
            <motion.div
              animate={reduce || streak === 0 ? undefined : { scale: [1, 1.08, 1], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Flame className={cn("size-9", streak > 0 ? "text-orange-300" : "text-neutral-600")} />
            </motion.div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">연속 출석</p>
            <p className="mt-0.5 text-4xl font-semibold tabular-nums tracking-tight text-white">
              {streak}
              <span className="ml-1 text-base font-medium text-neutral-400">일</span>
            </p>
            <div className="mt-2 w-40">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(progress * 100)}%` }}
                  transition={{ duration: 1.1, ease, delay: 0.3 }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500">
                {next ? `${next}일 배지까지 ${next - streak}일` : "모든 배지 달성!"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-sm"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease, delay: 0.15 + i * 0.06 }}
            >
              <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <Icon className="size-3.5 text-amber-200/80" />
                {s.label}
              </p>
              <p className="mt-1 truncate text-lg font-semibold tabular-nums tracking-tight text-white">{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {MILESTONES.map((m) => {
          const got = (history?.bestStreak ?? 0) >= m;
          return (
            <span
              key={m}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                got
                  ? "border-amber-300/35 bg-amber-300/15 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
                  : "border-white/10 bg-white/[0.03] text-neutral-500",
              )}
            >
              {got ? <Check className="size-3" /> : <Flame className="size-3" />}
              {m}일 연속
            </span>
          );
        })}
      </div>
    </motion.section>
  );
}

function WeekStrip({ history }: { history?: RandomBoxHistory }) {
  const reduce = useReducedMotion();
  const today = history?.today ?? null;
  const map = useMemo(() => new Map((history?.days ?? []).map((d) => [d.dayKey, d])), [history]);
  const days = useMemo(() => {
    if (!today) return [];
    return Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  }, [today]);

  return (
    <section className="att-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-tight text-white">최근 7일</h3>
        <span className="text-xs text-neutral-500">{days.filter((d) => map.has(d)).length} / 7일 출석</span>
      </div>
      <div className="relative mt-5 grid grid-cols-7 gap-2">
        <div className="pointer-events-none absolute left-[7%] right-[7%] top-[22px] h-px bg-white/10" />
        {days.map((d, i) => {
          const hit = map.get(d);
          const isToday = d === today;
          const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
          return (
            <div key={d} className="relative flex flex-col items-center gap-2">
              <motion.div
                className={cn(
                  "relative grid size-11 place-items-center rounded-2xl border text-sm font-semibold",
                  hit
                    ? hit.jackpot
                      ? "border-amber-300/50 bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 shadow-[0_8px_24px_-6px_rgba(251,191,36,0.6)]"
                      : "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                    : isToday
                      ? "att-today border-amber-200/40 bg-amber-200/5 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-neutral-600",
                )}
                initial={reduce ? false : { opacity: 0, scale: 0.6, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.1 + i * 0.05 }}
              >
                {hit ? <Check className="size-4" strokeWidth={3} /> : <span>{Number(d.slice(8))}</span>}
              </motion.div>
              <span className={cn("text-[11px]", isToday ? "font-semibold text-amber-200" : "text-neutral-500")}>
                {isToday ? "오늘" : WEEKDAYS[wd]}
              </span>
              <span className="h-3 text-[10px] tabular-nums text-neutral-500">
                {hit ? `${hit.amount.toLocaleString()}원` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MonthCalendar({ history }: { history?: RandomBoxHistory }) {
  const reduce = useReducedMotion();
  const today = history?.today ?? null;
  const map = useMemo(() => new Map((history?.days ?? []).map((d) => [d.dayKey, d])), [history]);

  const cells = useMemo(() => {
    if (!today) return [];
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = first.getUTCDay();
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) {
      out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (out.length % 7) out.push(null);
    return out;
  }, [today]);

  const label = today ? `${Number(today.slice(0, 4))}년 ${Number(today.slice(5, 7))}월` : "";

  return (
    <section className="att-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-tight text-white">{label} 출석부</h3>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-400" /> 출석
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-300" /> 잭팟
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={cn(
              "pb-1 text-[11px] font-medium",
              i === 0 ? "text-rose-300/70" : i === 6 ? "text-sky-300/70" : "text-neutral-500",
            )}
          >
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const hit = map.get(d);
          const isToday = d === today;
          const future = today ? d > today : false;
          return (
            <motion.div
              key={d}
              title={hit ? `${d} · ${formatKRW(hit.amount)}` : d}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-xs transition-colors",
                hit
                  ? hit.jackpot
                    ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                    : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                  : isToday
                    ? "att-today border-amber-200/40 text-white"
                    : future
                      ? "border-transparent text-neutral-700"
                      : "border-white/[0.06] bg-white/[0.02] text-neutral-500",
              )}
              initial={reduce ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease, delay: Math.min(0.5, i * 0.012) }}
            >
              <span className="font-semibold tabular-nums">{Number(d.slice(8))}</span>
              {hit ? (
                <span
                  className={cn(
                    "mt-0.5 hidden text-[9px] tabular-nums sm:block",
                    hit.jackpot ? "text-amber-200" : "text-emerald-300/80",
                  )}
                >
                  {hit.amount.toLocaleString()}
                </span>
              ) : null}
              {hit ? (
                <span
                  className={cn(
                    "absolute right-1 top-1 size-1.5 rounded-full",
                    hit.jackpot ? "bg-amber-300" : "bg-emerald-400",
                  )}
                />
              ) : null}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
