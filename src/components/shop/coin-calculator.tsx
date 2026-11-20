"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, Loader2, RefreshCw, ArrowDownUp } from "lucide-react";

const COIN_OPTIONS: { key: string; label: string }[] = [
  { key: "btc", label: "비트코인 BTC" },
  { key: "eth", label: "이더리움 ETH" },
  { key: "usdt", label: "테더 USDT" },
  { key: "usdc", label: "USDC" },
  { key: "ltc", label: "라이트코인 LTC" },
  { key: "bch", label: "비트코인캐시 BCH" },
  { key: "xrp", label: "리플 XRP" },
  { key: "doge", label: "도지코인 DOGE" },
  { key: "ada", label: "카르다노 ADA" },
];

type Rate = {
  coin: string;
  name: string;
  network: string;
  decimals: number;
  rate: number;
  source: string;
  feePercent: number;
  vipTier: number;
  min: number;
  max: number;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const floorTo = (n: number, d: number) => Math.floor(n * 10 ** d) / 10 ** d;

export function CoinCalculator() {
  const [coin, setCoin] = useState("usdt");
  const [rate, setRate] = useState<Rate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [krw, setKrw] = useState("50000");
  const [dir, setDir] = useState<"krw2coin" | "coin2krw">("krw2coin");
  const [coinAmt, setCoinAmt] = useState("");
  const reqId = useRef(0);

  const loadRate = useCallback(async (c: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/coin-rate?coin=${encodeURIComponent(c)}`, { credentials: "include" });
      const data = (await res.json().catch(() => null)) as (Rate & { error?: string }) | null;
      if (id !== reqId.current) return;
      if (!res.ok || !data || data.error || typeof data.rate !== "number") {
        setError(data?.error || "시세를 불러오지 못했어요.");
        setRate(null);
        return;
      }
      setRate(data);
    } catch {
      if (id === reqId.current) setError("네트워크 오류예요.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRate(coin);
  }, [coin, loadRate]);

  // 계산
  const feeMul = rate ? 1 + rate.feePercent / 100 : 1;
  let outCoin = 0;
  let outKrw = 0;
  if (rate) {
    if (dir === "krw2coin") {
      const k = Number(krw.replace(/[,\s]/g, "")) || 0;
      outCoin = floorTo(k / (rate.rate * feeMul), rate.decimals);
      outKrw = k;
    } else {
      const ca = Number(coinAmt.replace(/[,\s]/g, "")) || 0;
      outKrw = Math.ceil(ca * rate.rate * feeMul);
      outCoin = ca;
    }
  }
  const belowMin = rate ? outKrw > 0 && outKrw < rate.min : false;
  const aboveMax = rate ? outKrw > rate.max : false;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
          <Calculator className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-white">코인 계산기</h1>
        <p className="text-sm text-slate-400">실시간 시세와 수수료를 반영해 받을 수량을 계산해요.</p>
      </div>

      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        {/* 코인 선택 */}
        <div className="flex flex-wrap gap-2">
          {COIN_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setCoin(o.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                coin === o.key ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* 시세 표시 */}
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.02] px-4 py-3 text-sm">
          <span className="text-slate-400">현재 시세</span>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-slate-400" />
          ) : rate ? (
            <span className="font-semibold text-white">
              1 {rate.coin.toUpperCase()} = {won(rate.rate)}{" "}
              <span className="text-xs font-normal text-slate-500">({rate.source})</span>
            </span>
          ) : (
            <span className="text-rose-400">—</span>
          )}
        </div>

        {/* 입력 */}
        <div className="space-y-2">
          {dir === "krw2coin" ? (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">사용할 포인트 (원)</span>
              <input
                inputMode="numeric"
                value={krw}
                onChange={(e) => setKrw(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-lg font-semibold text-white outline-none focus:border-indigo-400/50"
                placeholder="50000"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">받을 코인 수량</span>
              <input
                inputMode="decimal"
                value={coinAmt}
                onChange={(e) => setCoinAmt(e.target.value.replace(/[^\d.]/g, ""))}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-lg font-semibold text-white outline-none focus:border-indigo-400/50"
                placeholder="0.5"
              />
            </label>
          )}

          <button
            onClick={() => setDir((d) => (d === "krw2coin" ? "coin2krw" : "krw2coin"))}
            className="mx-auto flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
          >
            <ArrowDownUp className="size-3.5" /> {dir === "krw2coin" ? "코인 수량으로 입력" : "금액으로 입력"}
          </button>
        </div>

        {/* 결과 */}
        <div className="rounded-2xl bg-indigo-500/10 p-4 ring-1 ring-indigo-400/20">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-indigo-300/80">{dir === "krw2coin" ? "받을 수량" : "필요 포인트"}</span>
            <span className="text-2xl font-bold text-white">
              {dir === "krw2coin"
                ? rate
                  ? `${outCoin.toLocaleString("en-US", { maximumFractionDigits: rate.decimals })} ${rate.coin.toUpperCase()}`
                  : "—"
                : won(outKrw)}
            </span>
          </div>
        </div>

        {/* 수수료 안내 */}
        {rate && (
          <div className="space-y-1 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>대행 수수료</span>
              <span className="text-slate-300">
                {rate.feePercent}%{rate.vipTier > 0 ? ` · VIP ${rate.vipTier}등급 할인 적용` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span>한도</span>
              <span className="text-slate-300">
                {won(rate.min)} ~ {won(rate.max)}
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        {belowMin && <p className="text-center text-xs text-amber-300">최소 금액은 {won(rate!.min)}이에요.</p>}
        {aboveMax && <p className="text-center text-xs text-amber-300">한 번에 최대 {won(rate!.max)}까지 가능해요.</p>}

        <button
          onClick={() => loadRate(coin)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white/5 py-2.5 text-sm text-slate-300 transition hover:bg-white/10"
        >
          <RefreshCw className="size-3.5" /> 시세 새로고침
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-slate-600">
        실제 구매는 디스코드 코인대행 패널에서 진행돼요. 로그인하면 내 VIP 등급 수수료로 계산돼요.
      </p>
    </div>
  );
}
