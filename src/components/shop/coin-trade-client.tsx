"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, CheckCircle2, ExternalLink, Wallet, ArrowRight, Sparkles } from "lucide-react";

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

const STATUS: Record<string, { ko: string; dot: string; text: string }> = {
  pending: { ko: "승인 대기", dot: "#f59e0b", text: "text-amber-500" },
  sending: { ko: "송금 중", dot: "#38bdf8", text: "text-sky-500" },
  sent: { ko: "송금 완료", dot: "#22c55e", text: "text-emerald-500" },
  failed: { ko: "실패·환불", dot: "#ef4444", text: "text-rose-500" },
  rejected: { ko: "거절·환불", dot: "#ef4444", text: "text-rose-500" },
  expired: { ko: "만료", dot: "#94a3b8", text: "text-slate-400" },
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
      if (res.status === 401) return setMsg("먼저 로그인해 주세요.");
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
        return setNeedVerify(true);
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

  const selected = COIN_OPTIONS.find((o) => o.key === coin);

  return (
    <div className="mx-auto w-full max-w-lg px-1 py-2">
      {/* 헤더 */}
      <div className="glass relative mb-4 overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500">
              <Sparkles className="size-4" /> 코인대행
            </div>
            <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--ad-text, #fff)" }}>
              포인트로 코인 받기
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ad-muted, #94a3b8)" }}>
              실시간 시세 · VIP 수수료 할인
            </p>
          </div>
          {points !== null && (
            <div className="flex flex-col items-end rounded-2xl bg-emerald-500/10 px-4 py-2.5 ring-1 ring-emerald-400/25">
              <span className="flex items-center gap-1 text-[11px] text-emerald-500/80">
                <Wallet className="size-3" /> 보유
              </span>
              <span className="text-lg font-extrabold text-emerald-500">{points.toLocaleString("ko-KR")}P</span>
            </div>
          )}
        </div>
      </div>

      {needVerify && (
        <div className="glass mb-4 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 flex-none items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <ShieldAlert className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--ad-text, #fff)" }}>
                최초 1회 본인인증이 필요해요
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ad-muted, #94a3b8)" }}>
                안전한 거래를 위해 신분증 인증을 먼저 진행해 주세요.
              </p>
              <a href="/verify-identity" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400">
                본인인증 하러 가기 <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="glass mb-4 flex flex-col items-center gap-2 p-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="size-8" />
          </div>
          <p className="text-base font-bold" style={{ color: "var(--ad-text, #fff)" }}>
            주문이 접수됐어요
          </p>
          <p className="text-sm" style={{ color: "var(--ad-muted, #94a3b8)" }}>
            관리자 확인 후 송금하고 알려 드릴게요.
          </p>
        </div>
      )}

      {/* 입력 폼 */}
      {phase !== "quoted" && phase !== "confirming" && (
        <div className="glass space-y-5 p-5">
          <div>
            <p className="mb-2.5 text-xs font-medium" style={{ color: "var(--ad-muted, #94a3b8)" }}>
              받을 코인
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {COIN_OPTIONS.map((o) => {
                const on = coin === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => setCoin(o.key)}
                    className={`group flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition ${
                      on ? "border-emerald-400/50 bg-emerald-500/10 ring-1 ring-emerald-400/30" : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                    style={on ? undefined : { borderColor: "var(--ad-border, #222)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coinIcon(o.key)} alt="" className={`size-7 transition ${on ? "scale-110" : "opacity-80 group-hover:opacity-100"}`} loading="lazy" />
                    <span className={`text-[11px] font-medium ${on ? "text-emerald-500" : ""}`} style={on ? undefined : { color: "var(--ad-muted, #94a3b8)" }}>
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ad-muted, #94a3b8)" }}>
                사용할 포인트
              </span>
              <div className="relative">
                <input
                  inputMode="numeric"
                  value={krw ? Number(krw).toLocaleString("ko-KR") : ""}
                  onChange={(e) => setKrw(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="50,000"
                  className="w-full rounded-2xl border bg-transparent px-4 py-3.5 pr-10 text-lg font-bold outline-none transition focus:border-emerald-400/50"
                  style={{ borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" }}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "var(--ad-muted, #94a3b8)" }}>
                  P
                </span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--ad-muted, #94a3b8)" }}>
                받을 {selected?.label} 지갑 주소
              </span>
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value.trim())}
                placeholder="코인을 받을 지갑 주소"
                className="w-full rounded-2xl border bg-transparent px-4 py-3.5 font-mono text-sm outline-none transition focus:border-emerald-400/50"
                style={{ borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" }}
              />
            </label>
          </div>

          <button
            onClick={getQuote}
            disabled={phase === "quoting"}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {phase === "quoting" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 견적 계산 중…
              </>
            ) : (
              <>
                견적 보기 <ArrowRight className="size-4" />
              </>
            )}
          </button>
          {msg && <p className="text-center text-sm font-medium text-rose-500">{msg}</p>}
          <p className="flex items-center justify-center gap-1 text-center text-[11px]" style={{ color: "var(--ad-muted, #94a3b8)" }}>
            주소·네트워크를 꼭 확인하세요. 잘못 보낸 코인은 되돌릴 수 없어요.
          </p>
        </div>
      )}

      {/* 견적 카드 */}
      {(phase === "quoted" || phase === "confirming") && quote && (
        <div className="glass overflow-hidden">
          <div className="relative bg-gradient-to-br from-emerald-500/15 to-teal-500/5 p-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coinIcon(quote.coin)} alt="" className="mx-auto mb-2 size-12 drop-shadow" />
            <p className="text-xs" style={{ color: "var(--ad-muted, #94a3b8)" }}>
              받을 수량
            </p>
            <p className="mt-1 text-3xl font-extrabold" style={{ color: "var(--ad-text, #fff)" }}>
              {quote.coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })}
              <span className="ml-1.5 text-lg text-emerald-500">{quote.coin.toUpperCase()}</span>
            </p>
          </div>
          <div className="space-y-2.5 p-5 text-sm">
            {[
              ["사용 포인트", `${quote.krw.toLocaleString("ko-KR")}P`],
              ["시세", `1 ${quote.coin.toUpperCase()} = ${won(quote.rate)} (${quote.rateSource})`],
              ["수수료", `${quote.feePercent}%`],
              ["네트워크", quote.network],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <span style={{ color: "var(--ad-muted, #94a3b8)" }}>{k}</span>
                <span className="text-right font-medium" style={{ color: "var(--ad-text, #fff)" }}>
                  {v}
                </span>
              </div>
            ))}
            <div className="flex items-start justify-between gap-4 border-t pt-2.5" style={{ borderColor: "var(--ad-border, #222)" }}>
              <span style={{ color: "var(--ad-muted, #94a3b8)" }}>받는 주소</span>
              <span className="break-all text-right font-mono text-xs" style={{ color: "var(--ad-text, #fff)" }}>
                {quote.address}
              </span>
            </div>
          </div>
          <div className="flex gap-2 p-5 pt-0">
            <button
              onClick={() => {
                setPhase("form");
                setQuote(null);
              }}
              disabled={phase === "confirming"}
              className="flex-1 rounded-2xl border py-3.5 text-sm font-semibold transition hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: "var(--ad-border, #222)", color: "var(--ad-muted, #94a3b8)" }}
            >
              취소
            </button>
            <button
              onClick={confirm}
              disabled={phase === "confirming"}
              className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            >
              {phase === "confirming" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> 처리 중…
                </>
              ) : (
                <>확정 · 포인트 결제</>
              )}
            </button>
          </div>
          {msg && <p className="px-5 pb-4 text-center text-sm font-medium text-rose-500">{msg}</p>}
        </div>
      )}

      {/* 내 주문 */}
      {orders.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 px-1 text-xs font-semibold" style={{ color: "var(--ad-muted, #94a3b8)" }}>
            내 주문
          </p>
          <div className="space-y-2">
            {orders.map((o) => {
              const st = STATUS[o.status] ?? STATUS.pending;
              return (
                <div key={o.id} className="glass flex items-center justify-between gap-3 p-3.5">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coinIcon(o.coin)} alt="" className="size-8" loading="lazy" />
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--ad-text, #fff)" }}>
                        {o.coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {o.coin.toUpperCase()}
                      </div>
                      <div className="text-xs" style={{ color: "var(--ad-muted, #94a3b8)" }}>
                        {o.krw.toLocaleString("ko-KR")}P
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${st.text}`}>
                      <span className="size-1.5 rounded-full" style={{ background: st.dot }} />
                      {st.ko}
                    </span>
                    {o.explorer && (
                      <a href={o.explorer} target="_blank" rel="noreferrer" className="text-emerald-500">
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
