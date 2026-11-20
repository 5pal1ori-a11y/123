"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, ShieldAlert, CheckCircle2, ExternalLink } from "lucide-react";

const COIN_OPTIONS = [
  { key: "btc", label: "비트코인" },
  { key: "eth", label: "이더리움" },
  { key: "usdt", label: "테더" },
  { key: "usdc", label: "USDC" },
  { key: "sol", label: "솔라나" },
  { key: "xrp", label: "리플" },
  { key: "trx", label: "트론" },
  { key: "doge", label: "도지코인" },
  { key: "ltc", label: "라이트코인" },
  { key: "bch", label: "비트코인캐시" },
  { key: "ada", label: "카르다노" },
];
const coinIcon = (k: string) => `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${k}.svg`;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const STATUS_KO: Record<string, string> = {
  pending: "승인 대기",
  sending: "송금 중",
  sent: "송금 완료",
  failed: "실패·환불",
  rejected: "거절·환불",
  expired: "만료",
};

type Quote = {
  id: string;
  coin: string;
  coinAmount: number;
  krw: number;
  rate: number;
  rateSource: string;
  feePercent: number;
  address: string;
  network: string;
  balance: number;
};
type Order = { id: string; coin: string; coinAmount: number; krw: number; status: string; txid: string | null; explorer: string | null; createdAt: string };

export function CoinTradeClient() {
  const [coin, setCoin] = useState("usdt");
  const [krw, setKrw] = useState("");
  const [addr, setAddr] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<"form" | "quoting" | "quoted" | "confirming" | "done">("form");
  const [msg, setMsg] = useState("");
  const [needVerify, setNeedVerify] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [points, setPoints] = useState<number | null>(null);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch("/api/coin-trade/mine", { credentials: "include" });
      if (res.status === 401) {
        setMsg("먼저 로그인해 주세요.");
        return;
      }
      const data = (await res.json().catch(() => null)) as { orders?: Order[]; points?: number } | null;
      if (data) {
        setOrders(data.orders ?? []);
        setPoints(data.points ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const getQuote = async () => {
    setMsg("");
    setNeedVerify(false);
    const k = Number(krw.replace(/[^\d]/g, ""));
    if (!k) return setMsg("금액을 입력해 주세요.");
    if (!addr.trim()) return setMsg("받을 지갑 주소를 입력해 주세요.");
    setPhase("quoting");
    try {
      const res = await fetch("/api/coin-trade/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ coin, krw: k, address: addr.trim() }),
      });
      const data = (await res.json().catch(() => null)) as (Quote & { error?: string; needVerify?: boolean }) | null;
      if (res.status === 401) {
        setPhase("form");
        return setMsg("먼저 로그인해 주세요.");
      }
      if (data?.needVerify) {
        setPhase("form");
        setNeedVerify(true);
        return;
      }
      if (!res.ok || !data?.id) {
        setPhase("form");
        return setMsg(data?.error || "견적을 만들지 못했어요.");
      }
      setQuote(data);
      setPhase("quoted");
    } catch {
      setPhase("form");
      setMsg("네트워크 오류예요.");
    }
  };

  const confirm = async () => {
    if (!quote) return;
    setPhase("confirming");
    try {
      const res = await fetch("/api/coin-trade/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: quote.id }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; balance?: number; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setPhase("quoted");
        return setMsg(data?.error || "확정에 실패했어요.");
      }
      setPhase("done");
      setQuote(null);
      setKrw("");
      setAddr("");
      if (typeof data.balance === "number") setPoints(data.balance);
      await loadMine();
    } catch {
      setPhase("quoted");
      setMsg("네트워크 오류예요.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
          <Coins className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-white">코인대행</h1>
        <p className="text-sm text-slate-400">포인트로 코인을 사서 내 지갑으로 받아요.</p>
        {points !== null && <p className="text-sm font-semibold text-emerald-300">보유 {points.toLocaleString("ko-KR")}P</p>}
      </div>

      {needVerify && (
        <div className="mb-4 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-200 ring-1 ring-amber-400/30">
          <ShieldAlert className="mb-1 size-5" />
          코인대행은 최초 1회 본인인증이 필요해요.
          <a href="/verify-identity" className="mt-2 block rounded-xl bg-amber-500 px-4 py-2 text-center font-semibold text-white">
            본인인증 하러 가기
          </a>
        </div>
      )}

      {phase === "done" && (
        <div className="mb-4 rounded-2xl bg-emerald-500/10 p-5 text-center text-sm text-emerald-200 ring-1 ring-emerald-400/30">
          <CheckCircle2 className="mx-auto mb-2 size-6" />
          주문이 접수됐어요. 관리자 확인 후 송금하고 알려 드릴게요.
        </div>
      )}

      {phase !== "quoted" && phase !== "confirming" && (
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap gap-2">
            {COIN_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setCoin(o.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${coin === o.key ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coinIcon(o.key)} alt="" className="size-4" loading="lazy" />
                {o.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">사용할 포인트 (원)</span>
            <input inputMode="numeric" value={krw} onChange={(e) => setKrw(e.target.value.replace(/[^\d]/g, ""))} placeholder="50000" className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-lg font-semibold text-white outline-none focus:border-emerald-400/50" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">받을 지갑 주소</span>
            <input value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="코인 받을 주소" className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-sm text-white outline-none focus:border-emerald-400/50" />
          </label>
          <button onClick={getQuote} disabled={phase === "quoting"} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50">
            {phase === "quoting" ? <><Loader2 className="size-4 animate-spin" /> 견적 계산 중…</> : "견적 보기"}
          </button>
          {msg && <p className="text-center text-sm text-rose-300">{msg}</p>}
          <p className="text-center text-xs text-slate-500">주소를 잘못 적으면 되돌릴 수 없어요. 네트워크를 꼭 확인하세요.</p>
        </div>
      )}

      {(phase === "quoted" || phase === "confirming") && quote && (
        <div className="space-y-4 rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coinIcon(quote.coin)} alt="" className="size-7" />
            <span className="text-lg font-bold text-white">{quote.coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {quote.coin.toUpperCase()}</span>
          </div>
          <div className="space-y-1.5 text-sm text-slate-300">
            <div className="flex justify-between"><span className="text-slate-500">사용 포인트</span><span>{quote.krw.toLocaleString("ko-KR")}P</span></div>
            <div className="flex justify-between"><span className="text-slate-500">시세</span><span>1 {quote.coin.toUpperCase()} = {won(quote.rate)} ({quote.rateSource})</span></div>
            <div className="flex justify-between"><span className="text-slate-500">수수료</span><span>{quote.feePercent}%</span></div>
            <div className="flex justify-between"><span className="text-slate-500">네트워크</span><span>{quote.network}</span></div>
            <div className="flex justify-between gap-2"><span className="text-slate-500">받는 주소</span><span className="break-all text-right font-mono text-xs">{quote.address}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPhase("form"); setQuote(null); }} disabled={phase === "confirming"} className="flex-1 rounded-2xl bg-white/5 py-3 text-sm text-slate-300 transition hover:bg-white/10 disabled:opacity-50">취소</button>
            <button onClick={confirm} disabled={phase === "confirming"} className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50">
              {phase === "confirming" ? <><Loader2 className="size-4 animate-spin" /> 처리 중…</> : "확정하고 포인트 결제"}
            </button>
          </div>
          {msg && <p className="text-center text-sm text-rose-300">{msg}</p>}
          <p className="text-center text-xs text-slate-500">확정하면 포인트가 차감되고 관리자 승인 후 송금돼요.</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-slate-500">내 주문</p>
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coinIcon(o.coin)} alt="" className="size-5" loading="lazy" />
                  <div>
                    <div className="text-white">{o.coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {o.coin.toUpperCase()}</div>
                    <div className="text-xs text-slate-500">{o.krw.toLocaleString("ko-KR")}P · {STATUS_KO[o.status] ?? o.status}</div>
                  </div>
                </div>
                {o.explorer && (
                  <a href={o.explorer} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-300">
                    TX <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
