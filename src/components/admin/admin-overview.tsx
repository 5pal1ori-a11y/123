"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bell,
  ClipboardList,
  Crown,
  MessageSquare,
  Package,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { PaymentMethod, PointCharge } from "@/lib/types";
import { formatKRW, formatTimeAgo } from "@/lib/utils";

export type AdminOverviewStats = {
  dailyRevenue: number;
  yesterdayRevenue: number;
  dailyOrderCount: number;
  dailyAvgAmount: number;
  monthlyRevenue: number;
  available: number;
  inventoryPct: number;
  lowStockCount: number;
  hourlyRate: number;
  hourlySeries: { hour: number; count: number }[];
  dailySeries: { date: string; revenue: number; orders: number }[];
  salesGoal: number;
  topProduct: { name: string; sales: number } | null;
  userCount?: number;
  pointRevenue?: number;
  recentOrders: {
    id: string;
    productName: string;
    buyerEmail: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paidAt: string;
  }[];
};

const PAY: Record<PaymentMethod, string> = {
  points: "포인트",
  transfer: "계좌이체",
  card: "카드",
  demo: "데모",
  crypto: "크립토",
};

const ease = [0.16, 1, 0.3, 1] as const;

type Jump = {
  id: string;
  label: string;
  hint: string;
  count: number;
  icon: typeof Wallet;
  onClick: () => void;
};

export function AdminOverview({
  stats,
  pendingCharges,
  openInquiryCount = 0,
  unreadNotifCount = 0,
  onOpenProducts,
  onOpenCharges,
  onOpenOrders,
  onOpenInquiries,
  onOpenNotifications,
}: {
  stats: AdminOverviewStats;
  pendingCharges: PointCharge[];
  openInquiryCount?: number;
  unreadNotifCount?: number;
  onOpenProducts: () => void;
  onOpenCharges: () => void;
  onOpenOrders?: () => void;
  onOpenInquiries?: () => void;
  onOpenNotifications?: () => void;
}) {
  const reduce = useReducedMotion();
  const delta =
    stats.yesterdayRevenue <= 0
      ? stats.dailyRevenue > 0
        ? 100
        : 0
      : ((stats.dailyRevenue - stats.yesterdayRevenue) / stats.yesterdayRevenue) * 100;
  const up = delta >= 0;

  const week = stats.dailySeries.slice(-7);
  const weekTotal = week.reduce((s, d) => s + d.revenue, 0);
  const weekOrders = week.reduce((s, d) => s + d.orders, 0);

  const hourMax = Math.max(...stats.hourlySeries.map((h) => h.count), 1);
  const peakHour = useMemo(() => {
    let best = stats.hourlySeries[0];
    for (const h of stats.hourlySeries) if (h.count > (best?.count ?? 0)) best = h;
    return best;
  }, [stats.hourlySeries]);

  const pendingSum = pendingCharges.reduce((s, c) => s + c.amount, 0);
  const attention = pendingCharges.length + openInquiryCount + stats.lowStockCount + unreadNotifCount;
  const goalPct = stats.salesGoal > 0 ? Math.min(1, stats.monthlyRevenue / stats.salesGoal) : 0;

  const jumps: Jump[] = [
    {
      id: "charges",
      label: "대기 충전",
      hint: pendingCharges.length ? formatKRW(pendingSum) : "없음",
      count: pendingCharges.length,
      icon: Wallet,
      onClick: onOpenCharges,
    },
    {
      id: "inquiries",
      label: "미답 문의",
      hint: openInquiryCount ? "답변 대기" : "모두 처리됨",
      count: openInquiryCount,
      icon: MessageSquare,
      onClick: onOpenInquiries ?? onOpenOrders ?? onOpenCharges,
    },
    {
      id: "stock",
      label: "재고 부족",
      hint: stats.lowStockCount ? "5개 이하 상품" : "안정적",
      count: stats.lowStockCount,
      icon: Package,
      onClick: onOpenProducts,
    },
    {
      id: "notifs",
      label: "알림",
      hint: unreadNotifCount ? "읽지 않음" : "깨끗해요",
      count: unreadNotifCount,
      icon: Bell,
      onClick: onOpenNotifications ?? onOpenOrders ?? onOpenCharges,
    },
  ];

  const kpis = [
    { icon: Receipt, label: "오늘 거래", value: stats.dailyOrderCount, fmt: (n: number) => `${n.toLocaleString()}건` },
    { icon: Activity, label: "평균 단가", value: stats.dailyAvgAmount, fmt: formatKRW },
    { icon: TrendingUp, label: "이달 누적", value: stats.monthlyRevenue, fmt: formatKRW },
    { icon: Users, label: "회원", value: stats.userCount ?? 0, fmt: (n: number) => `${n.toLocaleString()}명` },
  ];

  const enter = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 16 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease, delay: 0.05 * i },
  });

  return (
    <div className="adm-ov space-y-4">
      {/* Hero */}
      <motion.section className="adm-hero relative overflow-hidden" {...enter(0)}>
        <div aria-hidden className="adm-hero-aurora" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="adm-eyebrow">
              <span className="adm-live-dot" />
              {greeting()} · 오늘 총매출
            </p>
            <p className="mt-4 text-[2.6rem] font-semibold leading-none tracking-[-0.055em] text-white tabular-nums sm:text-[3.4rem]">
              <CountUp value={stats.dailyRevenue} format={formatKRW} />
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  up ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                }`}
              >
                {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {up ? "+" : ""}
                {delta.toFixed(1)}%
              </span>
              <span className="text-xs text-zinc-500">어제 {formatKRW(stats.yesterdayRevenue)}</span>
              <span className="text-xs text-zinc-600">·</span>
              <span className="text-xs text-zinc-500">최근 1시간 {stats.hourlyRate}건</span>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[11px] font-medium text-zinc-500">최근 7일 매출</p>
              <p className="text-sm font-semibold tabular-nums text-zinc-200">
                {formatKRW(weekTotal)}
                <span className="ml-1.5 text-[11px] font-normal text-zinc-500">{weekOrders}건</span>
              </p>
            </div>
            <AreaChart data={week} reduce={Boolean(reduce)} />
          </div>
        </div>
      </motion.section>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={k.label} className="adm-tile p-4 sm:p-5" {...enter(1 + i)}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-zinc-500">{k.label}</span>
                <span className="adm-tile-icon">
                  <Icon className="size-3.5" />
                </span>
              </div>
              <p className="mt-3 truncate text-xl font-semibold tracking-tight tabular-nums text-white sm:text-2xl">
                <CountUp value={k.value} format={k.fmt} />
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Queue */}
      <motion.section className="adm-tile p-2" {...enter(5)}>
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <h3 className="text-[13px] font-semibold text-zinc-200">처리 대기</h3>
          <span className={`text-[11px] ${attention ? "text-amber-300" : "text-zinc-500"}`}>
            {attention ? `${attention}건 확인 필요` : "지금은 조용해요"}
          </span>
        </div>
        <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
          {jumps.map((j) => {
            const Icon = j.icon;
            const hot = j.count > 0;
            return (
              <button
                key={j.id}
                type="button"
                onClick={j.onClick}
                className={`adm-queue group ${hot ? "is-hot" : ""}`}
              >
                <span className="adm-queue-icon">
                  <Icon className="size-4" />
                  {hot ? <span className="adm-queue-ping" /> : null}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
                    {j.label}
                    {hot ? <span className="adm-count">{j.count}</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{j.hint}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-zinc-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
              </button>
            );
          })}
        </div>
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Hourly */}
        <motion.section className="adm-tile p-5 sm:p-6 lg:col-span-8" {...enter(6)}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-white">오늘 판매 리듬</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                최근 12시간 · 피크 {peakHour && peakHour.count > 0 ? `${peakHour.hour}시 ${peakHour.count}건` : "—"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex h-36 items-end gap-1.5 sm:gap-2">
            {stats.hourlySeries.map((h, i) => {
              const tall = h.count / hourMax;
              const isPeak = peakHour && h.count > 0 && h.hour === peakHour.hour && h.count === peakHour.count;
              return (
                <div key={`${h.hour}-${i}`} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
                  <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black opacity-0 transition group-hover:opacity-100">
                    {h.count}건
                  </span>
                  <motion.div
                    className={`w-full rounded-md ${isPeak ? "adm-bar-peak" : "adm-bar"}`}
                    initial={reduce ? false : { height: "4%" }}
                    animate={{ height: `${Math.max(4, tall * 100)}%` }}
                    transition={{ duration: 0.8, ease, delay: 0.2 + i * 0.03 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
            <span>{stats.hourlySeries[0]?.hour ?? 0}시</span>
            <span>지금</span>
          </div>
        </motion.section>

        {/* Rings */}
        <motion.section className="adm-tile flex flex-col gap-5 p-5 sm:p-6 lg:col-span-4" {...enter(7)}>
          <RingRow
            icon={Target}
            label="이달 목표"
            pct={goalPct}
            main={stats.salesGoal > 0 ? `${Math.round(goalPct * 100)}%` : "미설정"}
            sub={stats.salesGoal > 0 ? `${formatKRW(stats.monthlyRevenue)} / ${formatKRW(stats.salesGoal)}` : "스토어 설정에서 목표를 정할 수 있어요"}
            color="url(#adm-ring-a)"
            reduce={Boolean(reduce)}
          />
          <div className="h-px bg-white/[0.06]" />
          <RingRow
            icon={Package}
            label="재고 건강도"
            pct={Math.min(1, stats.inventoryPct / 100)}
            main={`${stats.inventoryPct}%`}
            sub={`가용 ${stats.available.toLocaleString()}개${stats.lowStockCount ? ` · 부족 ${stats.lowStockCount}` : ""}`}
            color="url(#adm-ring-b)"
            reduce={Boolean(reduce)}
          />
          <div className="mt-auto flex items-center gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300/15 text-amber-200">
              <Crown className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-zinc-500">베스트셀러</span>
              <span className="block truncate text-sm font-semibold text-zinc-100">
                {stats.topProduct?.name ?? "아직 없음"}
              </span>
            </span>
            {stats.topProduct ? (
              <span className="shrink-0 text-xs font-semibold text-amber-200">{stats.topProduct.sales}건</span>
            ) : null}
          </div>
          <svg width="0" height="0" className="absolute">
            <defs>
              <linearGradient id="adm-ring-a" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0a0a0a" />
                <stop offset="100%" stopColor="#52525b" />
              </linearGradient>
              <linearGradient id="adm-ring-b" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#16a34a" />
                <stop offset="100%" stopColor="#4ade80" />
              </linearGradient>
            </defs>
          </svg>
        </motion.section>
      </div>

      {/* Ledger */}
      <motion.section className="adm-tile p-5 sm:p-6" {...enter(8)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-white">라이브 원장</h3>
            <span className="adm-live-dot" />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-zinc-500 sm:inline">
              누적 충전 {formatKRW(stats.pointRevenue ?? 0)}
            </span>
            <button
              type="button"
              onClick={onOpenOrders}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.06]"
            >
              전체 주문 <ArrowUpRight className="size-3.5" />
            </button>
          </div>
        </div>
        {stats.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <ClipboardList className="size-6 text-zinc-600" />
            아직 결제된 주문이 없어요
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {stats.recentOrders.slice(0, 8).map((o, i) => (
              <motion.li
                key={o.id}
                className="flex items-center gap-3 py-2.5"
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease, delay: 0.35 + i * 0.04 }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[12px] font-semibold text-zinc-300">
                  {(o.buyerEmail || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">{o.productName}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {o.buyerEmail.split("@")[0]} · {formatTimeAgo(o.paidAt)}
                  </span>
                </span>
                <span className="hidden rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-zinc-400 sm:inline">
                  {PAY[o.paymentMethod] ?? o.paymentMethod}
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                  {formatKRW(o.amount)}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }).format(new Date()),
  );
  if (h < 6) return "늦은 밤이에요";
  if (h < 12) return "좋은 아침이에요";
  if (h < 18) return "좋은 오후예요";
  return "좋은 저녁이에요";
}

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setN(value);
      return;
    }
    const from = 0;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(from + (value - from) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{format(n)}</>;
}

function AreaChart({ data, reduce }: { data: { date: string; revenue: number }[]; reduce: boolean }) {
  const W = 320;
  const H = 96;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const pts = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * W : W / 2;
    const y = H - 8 - (d.revenue / max) * (H - 20);
    return [x, y] as const;
  });
  if (pts.length === 0) return <div className="h-24" />;
  const line = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="adm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="adm-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#52525b" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
        </defs>
        <motion.path
          d={area}
          fill="url(#adm-area)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="url(#adm-line)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.3, ease, delay: 0.2 }}
        />
        <motion.circle
          cx={last[0]}
          cy={last[1]}
          r={4}
          fill="#0a0a0a"
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.4, type: "spring", stiffness: 400, damping: 18 }}
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        {data.map((d) => (
          <span key={d.date}>{d.date.slice(8)}</span>
        ))}
      </div>
    </div>
  );
}

function RingRow({
  icon: Icon,
  label,
  pct,
  main,
  sub,
  color,
  reduce,
}: {
  icon: typeof Target;
  label: string;
  pct: number;
  main: string;
  sub: string;
  color: string;
  reduce: boolean;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(10,10,10,0.07)" strokeWidth="6" />
          <motion.circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={reduce ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.2, ease, delay: 0.3 }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-zinc-400">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="text-xl font-semibold tracking-tight tabular-nums text-white">{main}</p>
        <p className="truncate text-[11px] text-zinc-500">{sub}</p>
      </div>
    </div>
  );
}
