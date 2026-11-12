"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Pickaxe } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { useShopUser } from "@/components/shop/user-context";
import { cn, formatKRW } from "@/lib/utils";
import { crackUrl, diamondUrl, pickaxeUrl, textureUrl, totemUrl } from "@/components/world/pixel-art";
import { NextBoxCountdown, type GiftState } from "./random-box-gift";

type Phase = "ready" | "mining" | "broken" | "totem" | "result";

const MINE_MS = 1500;
const CUBE = 148;

const TOTEM_COLORS = ["#7cfc6a", "#c8f45a", "#f7e14a", "#3fd65a", "#fff59d", "#a3e635"];
const TOTEM_PARTICLES = Array.from({ length: 56 }, (_, i) => {
  const a = (i / 56) * Math.PI * 2 + ((i * 7) % 5) * 0.11;
  const d = 140 + ((i * 53) % 220);
  return {
    x: Math.cos(a) * d,
    y: Math.sin(a) * d * 0.8 - 40,
    c: TOTEM_COLORS[i % TOTEM_COLORS.length],
    s: 6 + (i % 4) * 2,
    delay: 0.15 + ((i * 13) % 20) * 0.045,
  };
});

const CHIPS = Array.from({ length: 16 }, (_, i) => ({
  bx: (i % 4) * 33.3,
  by: Math.floor(i / 4) * 33.3,
  x: ((i % 4) - 1.5) * 46 + ((i * 17) % 13) - 6,
  y: -60 - ((i * 29) % 60),
  r: ((i * 71) % 360) - 180,
}));

export function useCountUp(target: number, active: boolean, reduce: boolean | null) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduce || target <= 0) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduce]);
  return v;
}

let audioCtx: AudioContext | null = null;
export function blip(kind: "dig" | "break" | "totem") {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    if (kind === "totem") {
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.55);
      });
      return;
    }
    const len = kind === "break" ? 0.22 : 0.06;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "break" ? 1800 : 900;
    const g = ctx.createGain();
    g.gain.value = kind === "break" ? 0.35 : 0.18;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(now);
  } catch {
    /* 소리는 없어도 된다 */
  }
}

function OreCube({ progress, shaking, gone }: { progress: number; shaking: boolean; gone: boolean }) {
  const ore = textureUrl("diamond_ore");
  const stage = progress > 0 ? Math.min(9, Math.floor(progress * 10)) : -1;
  const crack = stage >= 0 ? crackUrl(stage) : null;
  const bg = crack ? `url(${crack}), url(${ore})` : `url(${ore})`;
  const face = (transform: string, shade: number) => (
    <div
      className="absolute inset-0"
      style={{
        transform,
        backgroundImage: bg,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        boxShadow: `inset 0 0 0 ${CUBE}px rgba(0,0,0,${shade})`,
        backfaceVisibility: "hidden",
      }}
    />
  );
  return (
    <div style={{ perspective: 900 }} className="relative" aria-hidden>
      <motion.div
        animate={gone ? { scale: 0, opacity: 0 } : shaking ? { x: [0, -2, 2, -1, 0], y: [0, 1, -1, 0] } : { y: [0, -6, 0] }}
        transition={
          gone
            ? { duration: 0.12 }
            : shaking
              ? { duration: 0.18, repeat: Infinity }
              : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ width: CUBE, height: CUBE, transformStyle: "preserve-3d" }}
      >
        <div
          className="relative size-full"
          style={{ transformStyle: "preserve-3d", transform: "rotateX(-24deg) rotateY(-38deg)" }}
        >
          {face(`translateZ(${CUBE / 2}px)`, 0.18)}
          {face(`rotateY(90deg) translateZ(${CUBE / 2}px)`, 0.36)}
          {face(`rotateX(90deg) translateZ(${CUBE / 2}px)`, 0)}
        </div>
      </motion.div>
    </div>
  );
}

export function TotemOverlay({ jackpot, onDone }: { jackpot: boolean; onDone: () => void }) {
  const totem = totemUrl();
  useEffect(() => {
    blip("totem");
    const id = window.setTimeout(onDone, 2100);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[120] grid place-items-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.35, 0] }}
        transition={{ duration: 2 }}
        style={{
          background: jackpot
            ? "radial-gradient(circle at 50% 50%, rgba(250,204,21,0.55), rgba(34,197,94,0.25) 40%, transparent 70%)"
            : "radial-gradient(circle at 50% 50%, rgba(163,230,53,0.45), rgba(34,197,94,0.18) 40%, transparent 70%)",
        }}
      />
      {TOTEM_PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ width: p.s, height: p.s, background: p.c, boxShadow: `0 0 8px ${p.c}` }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], x: [0, p.x * 0.6, p.x], y: [0, p.y * 0.6, p.y + 90], scale: [0.6, 1.2, 0.4] }}
          transition={{ duration: 1.5, delay: p.delay, ease: "easeOut" }}
        />
      ))}
      <motion.img
        src={totem}
        alt=""
        className="relative"
        style={{ width: 160, height: 160, imageRendering: "pixelated", filter: "drop-shadow(0 0 24px rgba(250,230,90,0.7))" }}
        initial={{ scale: 0.15, opacity: 0, y: 160, rotateY: 0, rotateZ: 0 }}
        animate={{
          scale: [0.15, 2.6, 2.25, 2.4, 0.3],
          opacity: [0, 1, 1, 1, 0],
          y: [160, -10, 4, -6, -120],
          rotateY: [0, 28, -22, 12, 0],
          rotateZ: [0, -10, 8, -4, 0],
        }}
        transition={{ duration: 1.9, times: [0, 0.22, 0.45, 0.7, 1], ease: "easeOut" }}
      />
    </motion.div>
  );
}

export function DiamondMine({
  shopSlug,
  onStatus,
  onClaimed,
}: {
  shopSlug: string;
  onStatus?: (status: GiftState) => void;
  onClaimed?: (points: number) => void;
}) {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const { refresh } = useShopUser();
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<GiftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const progressRef = useRef(0);
  const claimRef = useRef<Promise<GiftState> | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gift/random-box", { credentials: "include", headers: shopHeaders(shopSlug, false) });
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

  const claim = useCallback(async () => {
    const res = await fetch("/api/gift/random-box", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug) });
    const data = (await res.json().catch(() => ({}))) as GiftState & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "다이아몬드를 캘 수 없어요.");
    return data;
  }, [shopSlug]);

  const finishBreak = useCallback(async () => {
    setHolding(false);
    setPhase("broken");
    blip("break");
    try {
      claimRef.current ??= claim();
      const [data] = await Promise.all([claimRef.current, new Promise((r) => setTimeout(r, reduce ? 150 : 900))]);
      setStatus(data);
      setPhase(reduce ? "result" : "totem");
      if (reduce) {
        onStatusRef.current?.(data);
        void refresh();
        if (!data.already) onClaimed?.(data.balance);
      }
    } catch (err) {
      claimRef.current = null;
      setError(err instanceof Error ? err.message : "다이아몬드를 캘 수 없어요.");
      progressRef.current = 0;
      setProgress(0);
      setPhase("mining");
    }
  }, [claim, onClaimed, reduce, refresh]);

  useEffect(() => {
    if (phase !== "mining" || !holding) return;
    let raf = 0;
    let last = performance.now();
    let lastDig = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      progressRef.current = Math.min(1, progressRef.current + dt / MINE_MS);
      setProgress(progressRef.current);
      if (now - lastDig > 230) {
        lastDig = now;
        blip("dig");
      }
      if (progressRef.current >= 1) {
        void finishBreak();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, holding, finishBreak]);

  const totemDone = useCallback(() => {
    setPhase("result");
    if (status) {
      onStatusRef.current?.(status);
      void refresh();
      if (!status.already) onClaimed?.(status.balance);
    }
  }, [status, refresh, onClaimed]);

  const amount = status?.amount ?? 0;
  const jackpot = Boolean(status?.jackpot);
  const display = useCountUp(amount, phase === "result", reduce);
  const pick = useMemo(() => (mounted ? pickaxeUrl() : ""), [mounted]);
  const diamond = useMemo(() => (mounted ? diamondUrl() : ""), [mounted]);
  const oreChip = useMemo(() => (mounted ? textureUrl("diamond_ore") : ""), [mounted]);

  const startHold = (e: React.PointerEvent) => {
    if (phase !== "mining") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setError(null);
    setHolding(true);
  };
  const stopHold = () => setHolding(false);

  return (
    <section className="dmine relative isolate overflow-hidden rounded-[2rem] p-6 sm:p-8">
      <div aria-hidden className="dmine-bg" />
      <div className="relative flex items-center justify-between">
        <p className="dmine-tag">
          <Pickaxe className="size-3.5" />
          DAILY MINING
        </p>
        <span className="text-[11px] text-[#9fb3c8]">0원 ~ 3,000원</span>
      </div>

      <div
        className={cn("relative mx-auto mt-4 grid h-[300px] place-items-center select-none", phase === "mining" && "cursor-crosshair")}
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onPointerLeave={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none" }}
      >
        {loading || !mounted ? (
          <Loader2 className="size-7 animate-spin text-[#4aedd9]" />
        ) : phase === "result" ? (
          <motion.div
            className="relative grid place-items-center"
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            <motion.img
              src={diamond}
              alt=""
              style={{ width: 120, height: 120, imageRendering: "pixelated" }}
              animate={reduce ? undefined : { y: [0, -10, 0], rotate: [0, 4, -4, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="dmine-shadow" />
          </motion.div>
        ) : (
          <div className="relative grid place-items-center">
            <OreCube progress={progress} shaking={holding} gone={phase !== "ready" && phase !== "mining"} />
            {phase === "broken" || phase === "totem"
              ? CHIPS.map((c, i) => (
                  <motion.span
                    key={i}
                    className="absolute block"
                    style={{
                      width: 16,
                      height: 16,
                      backgroundImage: `url(${oreChip})`,
                      backgroundSize: "400% 400%",
                      backgroundPosition: `${c.bx}% ${c.by}%`,
                      imageRendering: "pixelated",
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                    animate={{ x: c.x, y: [0, c.y, c.y + 160], opacity: [1, 1, 0], rotate: c.r }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                ))
              : null}
            {phase === "broken" ? (
              <motion.img
                src={diamond}
                alt=""
                className="absolute"
                style={{ width: 56, height: 56, imageRendering: "pixelated" }}
                initial={{ y: 0, scale: 0.3, opacity: 0 }}
                animate={{ y: [0, -50, 10], scale: 1, opacity: 1, rotate: [0, 180, 360] }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            ) : null}
            {phase === "mining" ? (
              <motion.img
                src={pick}
                alt=""
                className="pointer-events-none absolute"
                style={{ width: 84, height: 84, right: -64, top: -30, imageRendering: "pixelated", transformOrigin: "20% 85%" }}
                animate={holding ? { rotate: [0, -55, 0] } : { rotate: [0, -12, 0] }}
                transition={holding ? { duration: 0.23, repeat: Infinity } : { duration: 1.4, repeat: Infinity }}
              />
            ) : null}
            {phase === "mining" ? (
              <div className="dmine-bar" aria-hidden>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {phase === "result" && status?.claimed ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative text-center"
          >
            {jackpot ? <p className="dmine-jackpot">JACKPOT</p> : null}
            <p className={cn("dmine-amount", jackpot && "is-gold")}>{amount > 0 ? formatKRW(display) : "꽝!"}</p>
            <p className="mt-1.5 text-sm text-[#9fb3c8]">
              {status.already
                ? "오늘은 이미 다이아몬드를 캤어요."
                : amount > 0
                  ? `포인트가 들어왔어요. 잔액 ${formatKRW(status.balance)}`
                  : "이번엔 빈 원석이었어요. 출석은 기록됐어요!"}
            </p>
            <NextBoxCountdown className="!border-[#2b3a4d] !bg-[#0f1722]" />
          </motion.div>
        ) : (
          <motion.div key="hint" className="relative flex flex-col items-center gap-2 text-center" exit={{ opacity: 0 }}>
            {phase === "ready" && !loading ? (
              <button type="button" className="mc-btn" onClick={() => setPhase("mining")}>
                출석체크 하기
              </button>
            ) : null}
            <p className="text-sm text-[#9fb3c8]">
              {phase === "ready"
                ? "다이아몬드 원석을 캐서 오늘의 포인트를 받으세요"
                : phase === "mining"
                  ? holding
                    ? "캐는 중… 손을 떼지 마세요!"
                    : "원석을 꾹 누르고 있으면 캐져요 (PC: 마우스 왼쪽 길게)"
                  : "다이아몬드 획득!"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}

      <AnimatePresence>{phase === "totem" ? <TotemOverlay jackpot={jackpot} onDone={totemDone} /> : null}</AnimatePresence>
    </section>
  );
}
