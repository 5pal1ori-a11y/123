"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Copy, KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

type View = {
  id: string;
  title: string;
  description: string;
  price: number;
  sellerName: string;
  status: "open" | "paid" | "held" | "settling" | "done" | "refunded" | "cancelled" | "expired";
  expiresAt: string;
  paidAt: string | null;
  holdUntil: string | null;
  role: "seller" | "buyer" | "guest";
  payout?: number;
  feePercent?: number;
  buyerName?: string | null;
  disputeReason?: string | null;
  cred?: { email: string; password: string; extra?: string } | null;
};

const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<View["status"], [string, string]> = {
  open: ["결제 대기", "text-sky-500"],
  paid: ["구매자 보호 중", "text-amber-500"],
  held: ["신고 접수 · 관리자 확인 중", "text-rose-500"],
  settling: ["거래 완료 · 정산 중", "text-emerald-500"],
  done: ["거래 완료", "text-emerald-500"],
  refunded: ["환불됨", "text-slate-400"],
  cancelled: ["판매자가 취소함", "text-slate-400"],
  expired: ["기간 만료", "text-slate-400"],
};

export function SafeTradeView({ id }: { id: string }) {
  const [d, setD] = useState<{ trade?: View; loggedIn?: boolean; points?: number | null; holdHours?: number; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/safe-trade/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" }).catch(() => null);
    setD(r ? await r.json().catch(() => ({ error: "불러오지 못했어요." })) : { error: "불러오지 못했어요." });
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/safe-trade/${encodeURIComponent(id)}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setMsg(r?.ok && j?.ok ? { ok: true, t: ok } : { ok: false, t: j?.error || "처리하지 못했어요." });
    setBusy(false);
    await load();
  };

  if (!d) return <div className="flex min-h-[50vh] items-center justify-center gap-2" style={muted}><Loader2 className="size-4 animate-spin" /> 불러오는 중…</div>;
  if (!d.trade) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="size-12 text-rose-500" />
        <h1 className="text-xl font-bold" style={text}>{d.error ?? "없는 안전거래 링크예요."}</h1>
        <p className="text-sm" style={muted}>링크를 다시 확인하거나 판매자에게 새 링크를 받아 주세요.</p>
      </div>
    );
  }
  const t = d.trade;
  const [label, color] = STATUS[t.status];
  const canPay = t.status === "open" && t.role !== "seller";
  const protecting = t.role === "buyer" && t.status === "paid" && t.holdUntil && Date.parse(t.holdUntil) > Date.now();

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
      <div className="glass flex items-center gap-3 p-4">
        <ShieldCheck className="size-9 shrink-0 text-emerald-500" />
        <div>
          <p className="font-bold" style={text}>DOES 안전거래</p>
          <p className="text-xs" style={muted}>결제한 돈은 DOES가 보관하고, 계정이 문제없을 때만 판매자에게 정산해요.</p>
        </div>
      </div>

      <div className="glass space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs" style={muted}>코드 {t.id} · 판매자 {t.sellerName}</p>
            <h1 className="mt-0.5 text-xl font-black" style={text}>{t.title}</h1>
          </div>
          <span className={`shrink-0 text-xs font-bold ${color}`}>{label}</span>
        </div>
        {t.description ? <p className="whitespace-pre-wrap text-sm" style={muted}>{t.description}</p> : null}
        <p className="text-3xl font-black" style={text}>{won(t.price)}</p>

        {canPay ? (
          d.loggedIn ? (
            <div className="space-y-2">
              <p className="text-xs" style={muted}>내 포인트 {won(d.points ?? 0)} · 링크 만료 {when(t.expiresAt)}</p>
              {(d.points ?? 0) >= t.price ? (
                <button disabled={busy} onClick={() => window.confirm(`${won(t.price)}을(를) 포인트로 결제할까요?`) && act({ action: "pay" }, "결제했어요! 아래 로그인 정보로 바로 확인해 주세요.")} className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white disabled:opacity-50">
                  안전거래로 결제하기
                </button>
              ) : (
                <Link href="/dashboard?tab=charge" className="block w-full rounded-2xl bg-sky-500 py-3 text-center text-sm font-bold text-white">
                  포인트 충전하기 ({won(t.price - (d.points ?? 0))} 부족)
                </Link>
              )}
            </div>
          ) : (
            <Link href="/dashboard?tab=account" className="block w-full rounded-2xl bg-emerald-500 py-3 text-center text-sm font-bold text-white">로그인하고 결제하기</Link>
          )
        ) : null}

        {t.role === "buyer" && t.cred ? (
          <div className="rounded-xl p-3 font-mono text-xs" style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.1))", ...text }}>
            <p className="mb-1 flex items-center gap-1 font-sans font-bold text-emerald-500"><KeyRound className="size-3.5" /> 계정 로그인 정보</p>
            <p>이메일: {t.cred.email}</p>
            <p>비밀번호: {t.cred.password}</p>
            {t.cred.extra ? <p className="whitespace-pre-wrap">추가: {t.cred.extra}</p> : null}
            <button onClick={() => navigator.clipboard?.writeText(`${t.cred!.email}\n${t.cred!.password}`)} className="mt-2 flex items-center gap-1 font-sans text-[11px] font-semibold text-emerald-500"><Copy className="size-3" /> 복사</button>
          </div>
        ) : null}

        {protecting ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-xs" style={muted}><Clock className="size-3.5" /> {when(t.holdUntil!)}까지 구매자 보호 · 그 뒤 자동으로 판매자에게 정산돼요</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => window.confirm("계정에 문제가 없나요? 확정하면 바로 판매자에게 정산돼요.") && act({ action: "confirm" }, "구매를 확정했어요. 거래 완료!")} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                <CheckCircle2 className="size-4" /> 구매 확정
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt("어떤 문제가 있나요? (예: 로그인이 안 돼요, 설명과 달라요)");
                  if (reason) void act({ action: "dispute", reason }, "신고했어요. 정산을 멈추고 관리자가 확인해요.");
                }}
                className="flex-1 rounded-xl bg-rose-500/90 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                문제 신고
              </button>
            </div>
          </div>
        ) : null}

        {t.role === "seller" ? (
          <div className="space-y-2 rounded-xl p-3 text-xs" style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.1))", ...muted }}>
            <p>내가 만든 링크예요 · 정산 {won(t.payout ?? 0)} (수수료 {t.feePercent}%){t.buyerName ? ` · 구매자 ${t.buyerName}` : ""}</p>
            {t.disputeReason ? <p className="text-rose-500">신고 내용: {t.disputeReason}</p> : null}
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold text-emerald-500" style={{ background: "rgba(16,185,129,0.12)" }}><Copy className="size-3" /> 링크 복사</button>
              {t.status === "open" ? <button disabled={busy} onClick={() => window.confirm("링크를 취소할까요?") && act({ action: "cancel" }, "링크를 취소했어요.")} className="rounded-lg bg-rose-500/90 px-3 py-1.5 font-semibold text-white">링크 취소</button> : null}
            </div>
          </div>
        ) : null}

        {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}
      </div>

      <div className="glass p-4 text-xs" style={muted}>
        <p className="mb-1 font-bold" style={text}>안전거래는 이렇게 진행돼요</p>
        <p>1. 구매자가 포인트로 결제 → DOES가 돈을 보관</p>
        <p>2. 계정 로그인 정보가 구매자에게 바로 전달</p>
        <p>3. {d.holdHours ?? 24}시간 구매자 보호 — 문제가 있으면 신고, 없으면 확정</p>
        <p>4. 문제없으면 판매자에게 정산 · 신고가 확인되면 구매자에게 환불</p>
      </div>
    </div>
  );
}
