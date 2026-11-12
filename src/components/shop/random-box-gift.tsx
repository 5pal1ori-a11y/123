"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clock, Gift, Loader2, Sparkles } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { useShopUser } from "@/components/shop/user-context";
import { cn, formatKRW } from "@/lib/utils";

export type RandomBoxHistory = {
  today: string;
  streak: number;
  bestStreak: number;
  totalDays: number;
  totalAmount: number;
  monthDays: number;
  monthAmount: number;
  bestAmount: number;
  days: { dayKey: string; amount: number; jackpot: boolean }[];
};

export type GiftState = {
  claimed: boolean;
  amount: number | null;
  jackpot: boolean;
  balance: number;
  already: boolean;
  dayKey: string | null;
  draws?: { name: string; amount: number; jackpot: boolean; createdAt: string }[];
  stats?: { opened: number; jackpots: number; top: number };
  history?: RandomBoxHistory;
};

const SPARKS = [
  { l: 12, t: 22, d: 0 },
  { l: 82, t: 18, d: 1.2 },
  { l: 22, t: 70, d: 2.1 },
  { l: 74, t: 64, d: 0.6 },
  { l: 48, t: 10, d: 1.7 },
  { l: 90, t: 44, d: 2.6 },
  { l: 6, t: 48, d: 3.1 },
  { l: 60, t: 82, d: 0.9 },
];

const CONFETTI_COLORS = ["#f6e2a2", "#e4c36a", "#ffffff", "#f87171", "#fda4af", "#fcd34d"];
const CONFETTI = Array.from({ length: 26 }, (_, i) => {
  const angle = (i / 26) * Math.PI * 2 + (i % 3) * 0.2;
  const dist = 90 + ((i * 37) % 70);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.7 - 70,
    r: ((i * 53) % 360) - 180,
    c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w: 5 + (i % 3) * 2,
    delay: (i % 6) * 0.025,
  };
});

type Phase = "idle" | "shake" | "open" | "result";

const MOTES = [
  { x: -42, y: -78, s: 0.7, d: 0.86, delay: 0.02 },
  { x: 38, y: -92, s: 0.9, d: 1.05, delay: 0.06 },
  { x: -18, y: -110, s: 0.55, d: 0.94, delay: 0.1 },
  { x: 22, y: -64, s: 0.8, d: 0.78, delay: 0.04 },
  { x: -56, y: -48, s: 0.45, d: 1.12, delay: 0.14 },
  { x: 54, y: -70, s: 0.6, d: 0.98, delay: 0.08 },
  { x: 8, y: -124, s: 0.5, d: 1.18, delay: 0.16 },
  { x: -28, y: -88, s: 0.35, d: 0.82, delay: 0.12 },
  { x: 46, y: -108, s: 0.4, d: 1.08, delay: 0.18 },
  { x: -8, y: -56, s: 0.65, d: 0.72, delay: 0 },
  { x: 16, y: -96, s: 0.3, d: 1.22, delay: 0.2 },
  { x: -48, y: -102, s: 0.5, d: 0.9, delay: 0.11 },
];

export function RandomBoxGift({
  shopSlug,
  compact = false,
  showFeed = false,
  hideHeader = false,
  onClaimed,
  onStatus,
}: {
  shopSlug: string;
  compact?: boolean;
  showFeed?: boolean;
  hideHeader?: boolean;
  onClaimed?: (points: number) => void;
  onStatus?: (status: GiftState) => void;
}) {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const { refresh } = useShopUser();
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<GiftState | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gift/random-box", {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
      });
      const data = (await res.json().catch(() => ({}))) as GiftState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      setStatus(data);
      onStatusRef.current?.(data);
      if (data.claimed) setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openBox() {
    if (busy || phase === "shake" || phase === "open") return;
    if (status?.claimed) {
      setPhase("result");
      return;
    }
    setBusy(true);
    setError(null);
    setPhase("shake");
    try {
      const res = await fetch("/api/gift/random-box", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
      });
      const data = (await res.json().catch(() => ({}))) as GiftState & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "상자를 열 수 없어요.");
      await sleep(reduce ? 180 : 920);
      setStatus(data);
      setPhase("open");
      await sleep(reduce ? 220 : 1480);
      setPhase("result");
      onStatusRef.current?.(data);
      void refresh();
      if (!data.already) onClaimed?.(data.balance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상자를 열 수 없어요.");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  const amount = status?.amount ?? 0;
  const jackpot = Boolean(status?.jackpot);
  const opened = phase === "open" || phase === "result";
  const display = useCountUp(amount, opened && amount > 0, reduce);

  const canOpen = !loading && !status?.claimed && phase === "idle";

  return (
    <section
      className={cn(
        "rbx-card relative isolate overflow-hidden rounded-[2rem]",
        canOpen && "is-ready",
        compact ? "p-5 sm:p-6" : "p-6 sm:p-8",
      )}
    >
      <style>{SCENE_CSS}</style>
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      {!reduce
        ? SPARKS.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="rbx-spark"
              style={{ left: `${s.l}%`, top: `${s.t}%`, animationDelay: `${s.d}s` }}
            />
          ))
        : null}

      {!hideHeader ? (
        <div className="relative flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <Gift className="size-6 text-amber-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/60">Daily gift</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">오늘의 랜덤박스</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
              매일 한 번, 0원~3,000원. 1,200원 이상은 잭팟이에요.
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "relative mx-auto grid place-items-center",
          hideHeader ? "h-[300px]" : compact ? "mt-5 h-[280px]" : "mt-8 h-[340px]",
        )}
      >
        {opened && !reduce ? (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[46%] z-10">
            {CONFETTI.map((c, i) => (
              <motion.span
                key={i}
                className="absolute block rounded-[2px]"
                style={{ width: c.w, height: c.w * 1.8, background: c.c }}
                initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.4 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  x: c.x,
                  y: [0, c.y, c.y + 80],
                  rotate: c.r * 3,
                  scale: 1,
                }}
                transition={{ duration: 1.6, delay: 0.3 + c.delay, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>
        ) : null}
        {loading ? (
          <Loader2 className="size-7 animate-spin text-amber-200/70" />
        ) : (
          <button
            type="button"
            onClick={() => void openBox()}
            disabled={busy || phase === "shake" || phase === "open"}
            className="rbx-hit group relative h-full w-full max-w-[320px] cursor-pointer bg-transparent"
            aria-label="상자 확인하기"
          >
            <BoxScene
              phase={phase}
              opened={opened}
              jackpot={jackpot}
              amount={display}
              reduce={Boolean(reduce)}
            />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === "result" && status?.claimed ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative mt-1 text-center"
          >
            {jackpot ? (
              <p className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-amber-200">
                <Sparkles className="size-3.5" />
                JACKPOT
              </p>
            ) : null}
            <p
              className={cn(
                "text-[2.15rem] font-semibold tracking-tight",
                jackpot
                  ? "bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-transparent"
                  : "text-white",
              )}
            >
              {formatKRW(amount)}
            </p>
            <p className="mt-1.5 text-sm text-neutral-400">
              {status.already
                ? "오늘은 이미 열어본 상자예요."
                : `포인트가 들어왔어요. 잔액 ${formatKRW(status.balance)}`}
            </p>
            <NextBoxCountdown />
          </motion.div>
        ) : (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-1 flex flex-col items-center gap-2 text-center"
          >
            {canOpen ? (
              <button type="button" onClick={() => void openBox()} className="rbx-cta">
                <Gift className="size-4" />
                상자 열기
              </button>
            ) : null}
            <p className="text-sm text-neutral-500">
              {busy
                ? phase === "shake"
                  ? "상자가 흔들리고 있어요…"
                  : "뚜껑이 열리고 있어요…"
                : "상자를 눌러 오늘 포인트를 확인하세요"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}

      {showFeed ? <TodayDrawFeed status={status} /> : null}
    </section>
  );
}

function msUntilKstMidnight() {
  const KST = 9 * 3_600_000;
  const now = Date.now();
  const next = Math.floor((now + KST) / 86_400_000 + 1) * 86_400_000 - KST;
  return next - now;
}

export function NextBoxCountdown({ className }: { className?: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    setMs(msUntilKstMidnight());
    const id = window.setInterval(() => setMs(msUntilKstMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (ms === null) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <p
      className={cn(
        "mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-300",
        className,
      )}
    >
      <Clock className="size-3.5 text-amber-200/80" />
      다음 상자까지
      <span className="font-mono font-semibold tabular-nums text-white">
        {hh}:{mm}:{ss}
      </span>
    </p>
  );
}

export function TodayDrawFeed({ status }: { status: GiftState | null }) {
  const draws = status?.draws ?? [];
  const stats = status?.stats;
  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <div className="mb-3 flex flex-wrap gap-2">
        <StatChip label="오늘 오픈" value={`${stats?.opened ?? 0}회`} />
        <StatChip label="잭팟" value={`${stats?.jackpots ?? 0}건`} gold />
        <StatChip label="최고" value={stats?.top ? formatKRW(stats.top) : "-"} gold={Boolean(stats?.top && stats.top >= 1200)} />
      </div>
      {draws.length === 0 ? (
        <p className="text-center text-xs text-neutral-500">아직 오늘 연 사람이 없어요. 첫 상자를 열어보세요.</p>
      ) : (
        <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {draws.map((d, i) => (
            <li
              key={`${d.createdAt}-${i}`}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-1.5 text-xs",
                d.jackpot ? "bg-amber-400/10 text-amber-100" : "bg-white/[0.03] text-neutral-300",
              )}
            >
              <span className="truncate font-medium">
                {d.jackpot ? "잭팟 · " : ""}
                {d.name}
              </span>
              <span className={cn("shrink-0 font-semibold", d.jackpot ? "text-amber-200" : "text-white")}>
                {formatKRW(d.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatChip({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        gold ? "border-amber-300/25 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.03] text-neutral-300",
      )}
    >
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function BoxScene({
  phase,
  opened,
  jackpot,
  amount,
  reduce,
}: {
  phase: Phase;
  opened: boolean;
  jackpot: boolean;
  amount: number;
  reduce: boolean;
}) {
  const motes = useMemo(() => (jackpot ? MOTES : MOTES.slice(0, 8)), [jackpot]);

  return (
    <div className={cn("rbx-stage", phase === "shake" && "is-shake", opened && "is-open", jackpot && "is-jackpot")}>
      <div className="rbx-glow" />
      {opened ? <div className="rbx-rays" /> : null}
      <div className="rbx-floor" />

      <motion.div
        className="rbx-world"
        animate={
          reduce
            ? { rotateX: 18, rotateY: -16 }
            : phase === "idle"
              ? { rotateX: [16, 20, 16], rotateY: [-18, -12, -18], y: [0, -7, 0] }
              : phase === "shake"
                ? { rotateX: 18, rotateY: [-22, 10, -16, 8, -14], y: [0, -10, 2, -6, 0], scale: [1, 1.04, 0.98, 1.02, 1] }
                : { rotateX: 22, rotateY: -10, y: -4 }
        }
        transition={
          phase === "idle"
            ? { duration: 5.6, repeat: Infinity, ease: "easeInOut" }
            : phase === "shake"
              ? { duration: 0.9, ease: [0.36, 0.07, 0.19, 0.97] }
              : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
        }
      >
        <div className="rbx-lid">
          <i className="f top" />
          <i className="f front" />
          <i className="f back" />
          <i className="f left" />
          <i className="f right" />
          <span className="rbx-bow">
            <em className="l" />
            <em className="r" />
            <em className="k" />
          </span>
          <span className="rbx-ribbon h" />
        </div>

        <div className="rbx-body">
          <i className="f front" />
          <i className="f back" />
          <i className="f left" />
          <i className="f right" />
          <i className="f bottom" />
          <span className="rbx-ribbon v" />
          <span className="rbx-ribbon h" />
          <div className="rbx-inner">
            <span className="rbx-light" />
            {opened && amount > 0 ? (
              <motion.strong
                className="rbx-prize"
                initial={{ opacity: 0, y: 18, scale: 0.82, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: -8, scale: 1, filter: "blur(0px)" }}
                transition={{ delay: 0.28, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                {formatKRW(amount)}
              </motion.strong>
            ) : null}
          </div>
        </div>
      </motion.div>

      {opened
        ? motes.map((m, i) => (
            <motion.span
              key={i}
              className="rbx-mote"
              initial={{ opacity: 0, x: 0, y: 12, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0], x: m.x, y: m.y, scale: [0.2, m.s, 0.15] }}
              transition={{ duration: m.d, delay: 0.22 + m.delay, ease: [0.16, 1, 0.3, 1] }}
            />
          ))
        : null}
    </div>
  );
}

function useCountUp(value: number, active: boolean, reduce: boolean | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduce) {
      setN(value);
      return;
    }
    const start = performance.now();
    const dur = 860;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, reduce]);
  return n;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const SCENE_CSS = `
.rbx-hit { -webkit-tap-highlight-color: transparent; }
.rbx-card {
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(212,175,90,0.18), transparent 55%),
    linear-gradient(180deg, rgba(20,15,12,0.94), rgba(8,7,7,0.97));
  box-shadow: 0 30px 80px -30px rgba(212,175,90,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
}
.rbx-card::before {
  content: "";
  position: absolute; inset: 0; z-index: -1;
  border-radius: inherit; padding: 1px;
  background: conic-gradient(from var(--rbx-a, 0deg), rgba(255,255,255,0.08), rgba(246,226,162,0.55), rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 60%, rgba(228,195,106,0.4), rgba(255,255,255,0.08));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: rbx-border 6s linear infinite;
  pointer-events: none;
}
.rbx-card.is-ready::before { animation-duration: 3s; }
@property --rbx-a { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
@keyframes rbx-border { to { --rbx-a: 360deg; } }
.rbx-spark {
  position: absolute; width: 4px; height: 4px; border-radius: 50%;
  background: #f6e2a2; box-shadow: 0 0 10px 2px rgba(246,226,162,0.6);
  opacity: 0; pointer-events: none;
  animation: rbx-twinkle 3.6s ease-in-out infinite;
}
@keyframes rbx-twinkle {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.4); }
  45% { opacity: 0.9; transform: translateY(-8px) scale(1); }
}
.rbx-cta {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; gap: 0.4rem;
  height: 2.6rem; padding: 0 1.4rem; border-radius: 999px;
  font-size: 14px; font-weight: 700; letter-spacing: -0.02em; color: #2a1c05;
  background: linear-gradient(180deg, #fbe7a8, #e4c36a 55%, #c79a3c);
  box-shadow: 0 10px 30px -8px rgba(228,195,106,0.65), inset 0 1px 0 rgba(255,255,255,0.6);
  transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease;
}
.rbx-cta:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 16px 40px -10px rgba(228,195,106,0.8), inset 0 1px 0 rgba(255,255,255,0.6); }
.rbx-cta:active { transform: scale(0.97); }
.rbx-cta::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 40%; left: -60%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.65), transparent);
  animation: rbx-shine 2.6s ease-in-out infinite;
}
@keyframes rbx-shine { 0% { left: -60%; } 55%, 100% { left: 130%; } }
.rbx-stage {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 980px;
  perspective-origin: 50% 42%;
}
.rbx-world {
  position: absolute;
  left: 50%;
  top: 54%;
  width: 148px;
  height: 108px;
  margin-left: -74px;
  margin-top: -54px;
  transform-style: preserve-3d;
}
.rbx-body, .rbx-lid {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}
.rbx-lid {
  top: -30px;
  height: 30px;
  transform-origin: 50% 100%;
  transition: transform 1.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.is-open .rbx-lid { transform: translateZ(2px) rotateX(-126deg); }
.rbx-body .f, .rbx-lid .f {
  position: absolute;
  display: block;
  backface-visibility: hidden;
}
.rbx-body .front, .rbx-body .back,
.rbx-lid .front, .rbx-lid .back {
  width: 148px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.16), transparent 28%),
    linear-gradient(90deg, rgba(0,0,0,0.18), transparent 18%, transparent 82%, rgba(0,0,0,0.28)),
    linear-gradient(135deg, #6b1d2a 0%, #8f2436 42%, #4a121c 100%);
}
.rbx-body .front, .rbx-body .back { height: 108px; }
.rbx-lid .front, .rbx-lid .back { height: 30px; }
.rbx-body .left, .rbx-body .right,
.rbx-lid .left, .rbx-lid .right {
  width: 112px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.1), transparent 40%),
    linear-gradient(90deg, #3c0e16, #6a1b28 55%, #2a090f);
}
.rbx-body .left, .rbx-body .right { height: 108px; }
.rbx-lid .left, .rbx-lid .right { height: 30px; }
.rbx-body .front { transform: translateZ(56px); }
.rbx-body .back { transform: rotateY(180deg) translateZ(56px); }
.rbx-body .left { left: 18px; transform: rotateY(-90deg) translateZ(74px); }
.rbx-body .right { left: 18px; transform: rotateY(90deg) translateZ(74px); }
.rbx-body .bottom {
  width: 148px; height: 112px;
  background: linear-gradient(180deg, #2a0a10, #140508);
  transform: rotateX(-90deg) translateZ(56px);
}
.rbx-lid .top {
  width: 148px; height: 112px;
  background:
    radial-gradient(circle at 36% 30%, rgba(255,236,179,0.22), transparent 36%),
    linear-gradient(135deg, #a02d42 0%, #7a1f31 48%, #4e121e 100%);
  transform: rotateX(90deg) translateZ(56px);
  box-shadow: inset 0 0 24px rgba(0,0,0,0.28);
}
.rbx-lid .front { transform: translateZ(56px); }
.rbx-lid .back { transform: rotateY(180deg) translateZ(56px); }
.rbx-lid .left { left: 18px; transform: rotateY(-90deg) translateZ(74px); }
.rbx-lid .right { left: 18px; transform: rotateY(90deg) translateZ(74px); }
.rbx-ribbon {
  position: absolute;
  background: linear-gradient(180deg, #f6e2a2, #c9a24a 48%, #8a6b24);
  box-shadow: 0 0 12px rgba(212,175,90,0.28);
  pointer-events: none;
}
.rbx-body .rbx-ribbon.v {
  left: 50%; top: 0; width: 18px; height: 108px; margin-left: -9px;
  transform: translateZ(57px);
}
.rbx-body .rbx-ribbon.h {
  left: 0; top: 44px; width: 148px; height: 16px;
  transform: translateZ(57px);
  background: linear-gradient(90deg, #8a6b24, #f0d78a 50%, #8a6b24);
}
.rbx-lid .rbx-ribbon.h {
  left: 0; top: 7px; width: 148px; height: 16px;
  transform: translateZ(57px);
  background: linear-gradient(90deg, #8a6b24, #f0d78a 50%, #8a6b24);
}
.rbx-bow {
  position: absolute; left: 50%; top: -10px; width: 64px; height: 36px; margin-left: -32px;
  transform: translateZ(58px) rotateX(8deg);
  transform-style: preserve-3d;
}
.rbx-bow .l, .rbx-bow .r {
  position: absolute; top: 6px; width: 30px; height: 22px; border-radius: 50% 50% 46% 46%;
  background: radial-gradient(circle at 30% 30%, #fff6d2, #e4c36a 42%, #9a7428);
  box-shadow: inset 0 -4px 8px rgba(80,50,0,0.35);
}
.rbx-bow .l { left: 0; transform: rotate(-18deg); }
.rbx-bow .r { right: 0; transform: rotate(18deg); }
.rbx-bow .k {
  position: absolute; left: 50%; top: 10px; width: 16px; height: 16px; margin-left: -8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff3c4, #d4af5a 55%, #7a5a1c);
  box-shadow: 0 4px 10px rgba(0,0,0,0.35);
}
.rbx-inner {
  position: absolute; inset: 8px 10px 0;
  transform: translateZ(8px);
  overflow: visible;
  pointer-events: none;
}
.rbx-light {
  position: absolute; left: 50%; top: 8px; width: 90px; height: 90px; margin-left: -45px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,224,140,0.0), transparent 70%);
  filter: blur(8px);
  opacity: 0;
  transition: opacity 0.6s ease, background 0.6s ease;
}
.is-open .rbx-light {
  opacity: 1;
  background: radial-gradient(circle, rgba(255,228,160,0.95), rgba(255,180,70,0.18) 46%, transparent 72%);
}
.is-jackpot .rbx-light {
  background: radial-gradient(circle, rgba(255,240,190,1), rgba(255,196,70,0.45) 42%, transparent 74%);
}
.rbx-prize {
  position: absolute; left: 0; right: 0; top: -6px;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #fff8e7;
  text-shadow: 0 8px 24px rgba(255,200,80,0.45), 0 1px 0 rgba(0,0,0,0.5);
}
.rbx-glow {
  position: absolute; left: 50%; top: 42%; width: 220px; height: 160px; margin-left: -110px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212,175,90,0.16), transparent 68%);
  filter: blur(18px);
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 0.5s ease, transform 0.8s ease;
}
.is-open .rbx-glow { opacity: 1; transform: scale(1.2); }
.is-jackpot.is-open .rbx-glow {
  background: radial-gradient(circle, rgba(255,214,110,0.38), transparent 70%);
}
.rbx-rays {
  position: absolute; left: 50%; top: 36%; width: 260px; height: 260px; margin-left: -130px; margin-top: -130px;
  background: conic-gradient(from 80deg, transparent, rgba(255,214,120,0.16), transparent 18%, transparent 50%, rgba(255,214,120,0.12), transparent 68%);
  mask-image: radial-gradient(circle, black 18%, transparent 62%);
  animation: rbx-spin 12s linear infinite;
  pointer-events: none;
  opacity: 0.85;
}
.rbx-floor {
  position: absolute; left: 50%; bottom: 18%; width: 180px; height: 28px; margin-left: -90px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.55), transparent 70%);
  filter: blur(6px);
  pointer-events: none;
}
.rbx-mote {
  position: absolute; left: 50%; top: 48%; width: 7px; height: 7px; margin-left: -3px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff8d6, #e8c15a 55%, #9a731c);
  box-shadow: 0 0 10px rgba(232,193,90,0.8);
  pointer-events: none;
}
@keyframes rbx-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .rbx-lid { transition-duration: 0.2s; }
  .rbx-rays, .rbx-card::before, .rbx-cta::after, .rbx-spark { animation: none; }
}
`;
