"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { PublicTraderDeal } from "@/lib/trader";
import { useShopUser } from "./user-context";

/** 떠돌이 상인 얼굴 (8×8 픽셀) */
const FACE = [
  "HHHHHHHH",
  "HSSSSSSH",
  "SBBBBBBS",
  "SWGSSGWS",
  "SSSNNSSS",
  "SSSNNSSS",
  "SSMNNMSS",
  "RRSSSSRR",
];
const COLORS: Record<string, string> = {
  H: "#2f5aa8",
  S: "#c9946c",
  B: "#4a2f1f",
  W: "#f4f4f4",
  G: "#2e8b3d",
  N: "#a8704c",
  M: "#7a4a30",
  R: "#2f5aa8",
};

export function TraderFace({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {FACE.flatMap((row, y) =>
        row.split("").map((c, x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[c]} />),
      )}
    </svg>
  );
}

function remainingText(ms: number) {
  if (ms <= 0) return "곧 사라집니다";
  const m = Math.floor(ms / 60_000);
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분 후 사라집니다`;
  if (m >= 1) return `${m}분 후 사라집니다`;
  return `${Math.ceil(ms / 1000)}초 후 사라집니다`;
}

type Phase = "hidden" | "open" | "mini";

export function TraderPopup({ shopSlug }: { shopSlug: string }) {
  const { refresh: refreshUser } = useShopUser();
  const [deal, setDeal] = useState<PublicTraderDeal | null>(null);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const skew = useRef(0);
  const appearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trader", { credentials: "include", headers: shopHeaders(shopSlug), cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { deal: PublicTraderDeal | null; now: string };
      skew.current = new Date(data.now).getTime() - Date.now();
      setDeal(data.deal);
    } catch {
      /* 다음 주기에 다시 */
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!deal) {
      setPhase("hidden");
      return;
    }
    let state: string | null = null;
    try {
      state = sessionStorage.getItem(`does-trader-${deal.id}`);
    } catch {
      /* noop */
    }
    if (state === "closed") {
      setPhase("mini");
      return;
    }
    if (phase !== "hidden") return;
    const delay = state === "seen" ? 1500 : 5000 + Math.random() * 15000;
    appearTimer.current = setTimeout(() => {
      setPhase("open");
      try {
        sessionStorage.setItem(`does-trader-${deal.id}`, "seen");
      } catch {
        /* noop */
      }
    }, delay);
    return () => {
      if (appearTimer.current) clearTimeout(appearTimer.current);
    };
    // phase 는 처음 등장 시점에만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id]);

  const left = deal ? new Date(deal.endsAt).getTime() - now : 0;
  useEffect(() => {
    if (deal && left <= 0) {
      setDeal(null);
      setPhase("hidden");
    }
  }, [deal, left]);

  const minimize = () => {
    setPhase("mini");
    setConfirm(false);
    setResult(null);
    if (deal) {
      try {
        sessionStorage.setItem(`does-trader-${deal.id}`, "closed");
      } catch {
        /* noop */
      }
    }
  };

  const buy = async () => {
    if (!deal) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/trader", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ dealId: deal.id }),
      });
      const data = (await res.json()) as { error?: string; reward?: string; deal?: PublicTraderDeal | null };
      if (res.status === 401) throw new Error("로그인 후 구매할 수 있어요");
      if (!res.ok) throw new Error(data.error || "구매에 실패했어요");
      setResult({ ok: true, msg: `거래 완료! 이용 내역에서 확인하세요${data.reward ? ` · 섬 장식 '${data.reward}' 획득` : ""}` });
      if (data.deal) setDeal(data.deal);
      void refreshUser();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : "구매에 실패했어요" });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (!deal) return null;
  const soldOut = deal.remaining <= 0;
  const off = Math.round((1 - deal.dealPrice / Math.max(1, deal.originalPrice)) * 100);

  return (
    <AnimatePresence>
      {phase === "open" ? (
        <motion.aside
          key="card"
          className="trd-card"
          role="dialog"
          aria-label="떠돌이 상인"
          initial={{ opacity: 0, y: 30, scale: 0.9, rotate: -2 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, y: 20, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
        >
          <button type="button" className="trd-close" onClick={minimize} aria-label="닫기">
            <X />
          </button>
          <div className="trd-head">
            <span className="trd-face">
              <TraderFace />
            </span>
            <div>
              <b>Wandering Trader가 나타났습니다!</b>
              <small className="tabular-nums">{remainingText(left)}</small>
            </div>
          </div>
          <div className="trd-deal">
            {deal.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deal.thumbnail} alt="" />
            ) : null}
            <div className="trd-deal-body">
              <span className="trd-label">오늘의 Deal · {off}% 할인</span>
              <p className="trd-name">{deal.productName}</p>
              <p className="trd-price">
                <s>{formatKRW(deal.originalPrice)}</s>
                <span>→</span>
                <b>{formatKRW(deal.dealPrice)}</b>
              </p>
              <p className="trd-stock">{soldOut ? "모두 팔렸어요" : `남은 수량 ${deal.remaining}`}</p>
            </div>
          </div>
          {result ? <p className={`trd-result ${result.ok ? "is-ok" : "is-err"}`}>{result.msg}</p> : null}
          {deal.bought ? (
            <button type="button" className="trd-buy" disabled>
              <Check /> 이미 거래했어요
            </button>
          ) : confirm ? (
            <div className="trd-confirm">
              <button type="button" className="trd-ghost" onClick={() => setConfirm(false)} disabled={busy}>
                취소
              </button>
              <button type="button" className="trd-buy" onClick={() => void buy()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                포인트로 {formatKRW(deal.dealPrice)} 결제
              </button>
            </div>
          ) : (
            <button type="button" className="trd-buy" onClick={() => setConfirm(true)} disabled={soldOut}>
              {soldOut ? "품절" : "거래하기"}
            </button>
          )}
        </motion.aside>
      ) : phase === "mini" ? (
        <motion.button
          key="mini"
          type="button"
          className="trd-mini"
          onClick={() => setPhase("open")}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          aria-label="떠돌이 상인 Deal 열기"
          title={remainingText(left)}
        >
          <TraderFace size={30} />
          <span className="trd-mini-badge">Deal</span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
