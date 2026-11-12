"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  Coins,
  Copy,
  Gift,
  Loader2,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { BankTransferPanel } from "@/components/payment/bank-transfer-panel";
import { ChargeOrb, ChargeStepRail, ChargeStudioShell } from "@/components/shop/charge-studio";
import { useShopUser } from "@/components/shop/user-context";
import { UserAuthPanel } from "@/components/shop/user-auth-panel";
import { useVendixCaptcha, VendixCaptcha } from "@/components/ui/vendix-captcha";
import { shopHeaders } from "@/lib/shop-client";
import { CHARGE_METHOD_LABELS } from "@/lib/auto-charge-sources";
import { normDepositorName } from "@/lib/deposit-parse";
import { cn, formatKRW } from "@/lib/utils";
import type { BankInfo } from "@/lib/bank";
import type { ChargeMethod } from "@/lib/types";

type PendingCharge = {
  id: string;
  amount: number;
  reference: string;
  method: ChargeMethod;
  depositorName?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

type CryptoPayment = {
  payAddress: string;
  payAmount: number;
  payCurrency: string;
};

const ALL_METHODS: { id: ChargeMethod; icon: typeof Wallet }[] = [
  { id: "bank", icon: Wallet },
  { id: "culture_gift", icon: Gift },
  { id: "coin", icon: Coins },
];

const PRESETS = [5000, 10000, 30000, 50000, 100000];

export function ChargePageClient({
  shopSlug,
  bank,
  minChargeAmount,
  depositSuffixPhrase,
  cultureGiftEnabled = false,
  nowpaymentsEnabled = false,
  embedded = false,
}: {
  shopSlug: string;
  bank: BankInfo;
  minChargeAmount: number;
  depositSuffixPhrase: string;
  cultureGiftEnabled?: boolean;
  nowpaymentsEnabled?: boolean;
  embedded?: boolean;
}) {
  const { user, loading, refresh } = useShopUser();
  const captcha = useVendixCaptcha();
  const methods = useMemo(
    () =>
      ALL_METHODS.filter((m) => {
        if (m.id === "bank") return true;
        if (m.id === "culture_gift") return cultureGiftEnabled;
        if (m.id === "coin") return nowpaymentsEnabled;
        return false;
      }),
    [cultureGiftEnabled, nowpaymentsEnabled],
  );
  const [method, setMethod] = useState<ChargeMethod>("bank");
  const [amount, setAmount] = useState(Math.max(10000, minChargeAmount));
  const [pending, setPending] = useState<PendingCharge | null>(null);
  const [giftPin, setGiftPin] = useState("");
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chargeFailed, setChargeFailed] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [depositor, setDepositor] = useState("");
  const savedDepositor = user?.bankDepositorName?.trim() || "";

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const res = await fetch("/api/charges", { headers: shopHeaders(shopSlug) });
      if (!res.ok) return;
      const data = (await res.json()) as {
        charges: {
          id: string;
          amount: number;
          reference: string;
          method: ChargeMethod;
          status: string;
          depositorName?: string | null;
        }[];
      };
      const active = data.charges.find((c) => c.status === "pending");
      if (active) {
        setPending({
          id: active.id,
          amount: active.amount,
          reference: active.reference,
          method: active.method,
          depositorName: active.depositorName,
        });
        setMethod(active.method);
        if (active.method === "bank") setWaiting(true);
        if (active.method === "coin") {
          const payRes = await fetch("/api/charges/crypto", {
            method: "POST",
            headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
            body: JSON.stringify({ chargeId: active.id }),
          });
          const payData = (await payRes.json().catch(() => ({}))) as { payment?: CryptoPayment | null };
          if (payRes.ok && payData.payment) setCryptoPayment(payData.payment);
        }
      }
    })();
  }, [user, shopSlug]);

  useEffect(() => {
    if (!methods.some((m) => m.id === method)) {
      setMethod(methods[0]?.id ?? "bank");
    }
  }, [methods, method]);

  useEffect(() => {
    if (!pending || !waiting) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/charges", { headers: shopHeaders(shopSlug) });
      if (!res.ok) return;
      const data = (await res.json()) as { charges: { id: string; status: string; failReason?: string }[] };
      const current = data.charges.find((c) => c.id === pending.id);
      if (current?.status === "completed") {
        await refresh();
        setPending(null);
        setWaiting(false);
        setCryptoPayment(null);
        setDone(true);
        setChargeFailed(null);
      } else if (current?.status === "failed" || current?.status === "expired") {
        setChargeFailed(current.failReason ?? "충전이 거절되거나 시간이 초과됐어요.");
        setPending(null);
        setWaiting(false);
        setCryptoPayment(null);
      } else if (current?.status === "cancelled") {
        setPending(null);
        setWaiting(false);
        setCryptoPayment(null);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pending, waiting, shopSlug, refresh]);

  const step = done ? 3 : pending ? (waiting || method === "culture_gift" ? 3 : 2) : 1;

  const stepLabels = useMemo(() => {
    if (method === "bank") {
      return [
        { id: "1", label: "금액 신청" },
        { id: "2", label: "계좌 입금" },
        { id: "3", label: "승인·충전" },
      ];
    }
    if (method === "culture_gift") {
      return [
        { id: "1", label: "금액 신청" },
        { id: "2", label: "PIN 입력" },
        { id: "3", label: "즉시 충전" },
      ];
    }
    return [
      { id: "1", label: "금액 신청" },
      { id: "2", label: "코인 결제" },
      { id: "3", label: "자동 충전" },
    ];
  }, [method]);

  const depositorDisplay =
    pending?.depositorName?.trim() ||
    (depositSuffixPhrase
      ? `${normDepositorName(savedDepositor)}${depositSuffixPhrase}`
      : normDepositorName(savedDepositor));

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-emerald-400/80" />
      </div>
    );
  }

  if (!user) {
    if (embedded) return null;
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Coins className="size-6" /> 포인트 충전
        </h1>
        <UserAuthPanel shopSlug={shopSlug} />
      </div>
    );
  }

  async function createCharge(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDone(false);
    setChargeFailed(null);
    setCryptoPayment(null);
    if (!captcha.solved || !captcha.token) {
      setError("보안 확인을 먼저 완료해 주세요.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/charges", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method,
          captchaToken: captcha.token,
          ...(method === "bank" ? { depositorName: depositor.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (/보안|CAPCHA|캡챠/i.test(data.error ?? "")) await captcha.refresh();
        throw new Error(data.error);
      }
      const charge = {
        id: data.charge.id,
        amount: data.charge.amount,
        reference: data.charge.reference,
        method,
        depositorName: data.charge.depositorName ?? null,
      };
      setPending(charge);
      if (method === "bank") {
        setWaiting(true);
        if (depositor.trim() && depositor.trim() !== savedDepositor) void refresh();
      }

      if (method === "coin") {
        const payRes = await fetch("/api/charges/crypto", {
          method: "POST",
          headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
          body: JSON.stringify({ chargeId: charge.id }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.error);
        if (payData.payment) setCryptoPayment(payData.payment);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSubmitting(false);
    }
  }

  async function redeemGiftPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch("/api/charges/culture-gift", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId: pending.id, pin: giftPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
      setPending(null);
      setGiftPin("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "상품권 처리 실패");
    } finally {
      setRedeeming(false);
    }
  }

  async function copyAddress(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function cancelCharge() {
    if (!pending || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/charges", {
        method: "DELETE",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId: pending.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "취소 실패");
      setPending(null);
      setWaiting(false);
      setCryptoPayment(null);
      setGiftPin("");
      setDone(false);
      setChargeFailed(null);
      void captcha.refresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ChargeStudioShell embedded={embedded}>
      <div className="charge-studio-header">
        <div>
          {!embedded && <h1 className="charge-studio-title">포인트 충전</h1>}
          {embedded && (
            <p className="charge-studio-title inline-flex items-center gap-2 text-lg">
              <Coins className="size-5" />
              충전 스튜디오
            </p>
          )}
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
            프리셋 선택 · 보안 확인 · 즉시 입금 대기까지 한 화면에서
          </p>
        </div>
        <span className="charge-studio-badge">
          <Sparkles className="size-3" />
          Premium
        </span>
      </div>

      <ChargeStepRail steps={stepLabels} current={step} />

      {methods.length > 1 && !pending && !done && (
        <div className="charge-method-deck">
          {methods.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMethod(id);
                setPending(null);
                setDone(false);
                setError(null);
              }}
              className={cn("charge-method-card", method === id && "is-on")}
            >
              <span className="charge-method-icon">
                <Icon className="size-4" />
              </span>
              {CHARGE_METHOD_LABELS[id]}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {chargeFailed ? (
          <motion.div
            key="fail"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="charge-fail-banner"
          >
            <p>충전 실패</p>
            <p>{chargeFailed}</p>
            <button
              type="button"
              className="charge-cta mt-4 max-w-xs mx-auto !py-2.5 !text-sm"
              onClick={() => {
                setChargeFailed(null);
                void captcha.refresh();
              }}
            >
              다시 충전하기
            </button>
          </motion.div>
        ) : null}

        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="charge-success-scene"
          >
            <ChargeOrb active={false} amountLabel="완료" subLabel="charged" size="xl" />
            <h3>충전이 완료됐어요</h3>
            <p>현재 잔액 {formatKRW(user.points)}</p>
            <button type="button" className="charge-cta mt-6 max-w-xs" onClick={() => setDone(false)}>
              추가 충전
            </button>
          </motion.div>
        ) : null}

        {pending && !done && method === "bank" ? (
          <motion.div key="bank-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="charge-waiting-scene">
              <div className="charge-scan-line" aria-hidden />
              <ChargeOrb
                active={waiting}
                amountLabel={formatKRW(pending.amount)}
                subLabel={waiting ? "확인중" : "입금대기"}
                size="xl"
              />
              <p className="charge-waiting-title flex items-center justify-center gap-2">
                <Zap className="size-4 text-emerald-400" />
                {waiting ? "입금 확인 · 자동충전 대기 중" : "아래 계좌로 입금해 주세요"}
              </p>
              <p className="charge-waiting-desc">
                입금자명 <strong>{depositorDisplay}</strong>
                {" · "}
                금액 <strong>{formatKRW(pending.amount)}</strong>
              </p>
            </div>
            <div className="charge-panel-inset">
              <BankTransferPanel
                amount={pending.amount}
                reference={pending.reference}
                bank={bank}
                expectedDepositorName={depositorDisplay}
                depositSuffixPhrase={depositSuffixPhrase || undefined}
                submitLabel="입금 완료 — 승인 대기"
                variant="charge"
                onConfirm={async () => setWaiting(true)}
                depositorLabel="입금자명"
              />
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">
              {waiting ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin text-emerald-400" />
                  입금 확인 · 승인 대기 중…
                </span>
              ) : (
                "입금 후 자동 또는 관리자 승인으로 포인트가 충전돼요. 신청 후 10분이 지나면 만료됩니다."
              )}
            </p>
            <ChargeCancelButton cancelling={cancelling} onCancel={cancelCharge} error={cancelError} />
          </motion.div>
        ) : null}

        {pending && !done && method === "culture_gift" ? (
          <motion.form
            key="gift"
            onSubmit={redeemGiftPin}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <ChargeOrb active amountLabel={formatKRW(pending.amount)} subLabel="상품권" size="lg" className="mb-2" />
            <p className="text-center text-sm font-semibold text-emerald-100">문화상품권 PIN 입력</p>
            <div className="charge-input-wrap">
              <input
                value={giftPin}
                onChange={(e) => setGiftPin(e.target.value)}
                placeholder="3110-0123-4567-8901"
                className="font-mono !text-base"
                required
              />
            </div>
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <button type="submit" disabled={redeeming} className="charge-cta">
              {redeeming ? "처리 중…" : "상품권으로 충전"}
            </button>
            <ChargeCancelButton cancelling={cancelling} onCancel={cancelCharge} error={cancelError} />
          </motion.form>
        ) : null}

        {pending && !done && method === "coin" ? (
          <motion.div key="coin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <ChargeOrb active={waiting} amountLabel={formatKRW(pending.amount)} subLabel="crypto" size="lg" />
            <div className="charge-panel-inset p-5 space-y-3">
              <p className="font-semibold text-emerald-100">NOWPayments 코인 결제</p>
              {cryptoPayment ? (
                <>
                  <p className="text-sm text-neutral-400">
                    아래 주소로 <strong className="text-white">{cryptoPayment.payAmount}</strong>{" "}
                    {cryptoPayment.payCurrency.toUpperCase()} ({formatKRW(pending.amount)} 상당) 입금
                  </p>
                  <code className="block break-all rounded-xl bg-black/40 px-3 py-2 font-mono text-xs text-emerald-100">
                    {cryptoPayment.payAddress}
                  </code>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
                    onClick={() => void copyAddress(cryptoPayment.payAddress)}
                  >
                    {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    {copied ? "복사됨" : "주소 복사"}
                  </button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-neutral-400">
                  <Loader2 className="size-4 animate-spin" /> 결제 주소 생성 중…
                </p>
              )}
              <button type="button" className="charge-cta" onClick={() => setWaiting(true)}>
                입금 완료 — 대기
              </button>
            </div>
            <ChargeCancelButton cancelling={cancelling} onCancel={cancelCharge} error={cancelError} />
          </motion.div>
        ) : null}

        {!pending && !done && !chargeFailed ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="charge-layout"
          >
            <form onSubmit={createCharge} className="charge-layout-main">
              <p className="charge-section-label">
                <Coins className="size-3.5" />
                충전 금액 선택
              </p>
              <div className="charge-amount-grid">
                {PRESETS.map((v, i) => (
                  <motion.button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.35 }}
                    whileTap={{ scale: 0.96 }}
                    className={cn("charge-amount-tile", amount === v && "is-on")}
                  >
                    {amount === v ? <Check className="charge-amount-check size-3.5" /> : null}
                    {formatKRW(v)}
                  </motion.button>
                ))}
              </div>

              <div className="charge-input-wrap">
                <Wallet className="charge-input-icon size-5" />
                <input
                  type="number"
                  min={minChargeAmount}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  aria-label="충전 금액"
                />
                <p className="charge-input-hint">최소 {formatKRW(minChargeAmount)}부터 충전할 수 있어요</p>
              </div>

              {method === "bank" ? (
                <>
                  <p className="charge-section-label">
                    <BadgeCheck className="size-3.5" />
                    입금자명
                    <span className="ml-1 font-normal normal-case tracking-normal text-amber-300/90">
                      실제 본인 이름으로 입금해주세요. 만약 별명으로 입금할시 서비스 이용이 제한될수있습니다
                    </span>
                  </p>
                  <div className="charge-input-wrap">
                    <Banknote className="charge-input-icon size-5" />
                    <input
                      type="text"
                      value={depositor}
                      onChange={(e) => setDepositor(e.target.value.slice(0, 20))}
                      placeholder="예: 홍길동"
                      required
                      aria-label="입금자명"
                    />
                    <p className="charge-input-hint">
                      은행 앱에서 보낼 때 찍히는 보내는 분 이름과 똑같이 적어 주세요. 다르면 자동충전이 안 돼요.
                    </p>
                  </div>
                </>
              ) : null}

              <p className="charge-section-label">
                <ShieldCheck className="size-3.5" />
                보안 확인
              </p>
              <VendixCaptcha
                solved={captcha.solved}
                solving={captcha.solving}
                loading={captcha.loading}
                error={captcha.error}
                onSolve={() => void captcha.solve()}
              />
              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
              <button type="submit" disabled={submitting} className="charge-cta mt-4">
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> 생성 중…
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Zap className="size-4" />
                    {formatKRW(amount || 0)} {CHARGE_METHOD_LABELS[method]} 충전 신청
                  </span>
                )}
              </button>
            </form>

            <aside className="charge-layout-side">
              <div className="charge-hero-row">
                <ChargeOrb active amountLabel={formatKRW(user.points)} subLabel="balance" size="lg" />
                <div className="charge-balance-meta">
                  <h2>내 포인트</h2>
                  <p>{formatKRW(user.points)}</p>
                  <span>누적 충전 {formatKRW(user.totalCharged)}</span>
                  {amount > 0 ? (
                    <span className="charge-after">
                      <ArrowRight className="size-3.5" />
                      충전 후 {formatKRW(user.points + amount)}
                    </span>
                  ) : null}
                </div>
              </div>
              <ul className="charge-guide">
                {[
                  { icon: Banknote, title: "금액 선택", desc: "프리셋이나 직접 입력" },
                  { icon: Timer, title: "10분 안에 입금", desc: "신청 후 10분이 지나면 만료돼요" },
                  { icon: BadgeCheck, title: "자동 충전", desc: "입금이 확인되면 바로 포인트 지급" },
                ].map((g, i) => {
                  const Icon = g.icon;
                  return (
                    <motion.li
                      key={g.title}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
                    >
                      <span>
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <b>{g.title}</b>
                        <p>{g.desc}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
              <CouponRedeemCard shopSlug={shopSlug} onRedeemed={() => void refresh()} />
            </aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ChargeStudioShell>
  );
}

function CouponRedeemCard({ shopSlug, onRedeemed }: { shopSlug: string; onRedeemed: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/coupon/redeem", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { amount?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "쿠폰을 사용하지 못했어요");
      setResult({ ok: true, text: `${formatKRW(data.amount ?? 0)}이 잔액에 들어왔어요` });
      setCode("");
      onRedeemed();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "쿠폰을 사용하지 못했어요" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="charge-section-label !mt-0">
        <Gift className="size-3.5" />
        자판기 쿠폰 사용
      </p>
      <p className="mb-3 text-xs text-neutral-500">월드 점프맵 완주 쿠폰 번호를 넣으면 잔액으로 바로 들어와요.</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="DS-XXXX-XXXX-XXXX-XXXX"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-emerald-400/50"
          aria-label="쿠폰 번호"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "사용"}
        </button>
      </div>
      {result ? (
        <p className={cn("mt-2 text-xs", result.ok ? "text-emerald-400" : "text-red-400")}>{result.text}</p>
      ) : null}
    </form>
  );
}

function ChargeCancelButton({
  onCancel,
  cancelling,
  error,
}: {
  onCancel: () => void;
  cancelling: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void onCancel()}
        disabled={cancelling}
        className="charge-cancel-btn"
      >
        {cancelling ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            취소 중…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <X className="size-3.5" />
            충전 요청 취소
          </span>
        )}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
