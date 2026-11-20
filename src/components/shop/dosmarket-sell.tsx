"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Clock, PackagePlus, ShieldCheck, Store, Wallet } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { ResaleRequestModal } from "./resale-request-modal";

type Sale = {
  id: string;
  ign: string;
  price: number;
  payout: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  soldAt?: string | null;
  payoutState?: "holding" | "ready" | "held" | "paid" | "refunded" | null;
  payoutMethod?: "points" | "bank";
  holdUntil?: string | null;
  rejectReason?: string | null;
  hasCred?: boolean;
};
type Buy = { id: string; name: string; price: number; soldAt: string | null; holdUntil: string | null; state: Sale["payoutState"]; canReport: boolean; disputeReason: string | null };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };

function saleLabel(s: Sale): [string, string] {
  if (s.status === "pending") return ["검토 중", "text-amber-500"];
  if (s.status === "rejected") return ["반려", "text-slate-400"];
  if (s.status === "cancelled") return ["취소", "text-slate-400"];
  if (!s.soldAt) return ["판매 중", "text-sky-500"];
  switch (s.payoutState) {
    case "paid":
      return ["정산 완료", "text-emerald-500"];
    case "ready":
      return ["송금 대기", "text-violet-400"];
    case "held":
      return ["신고로 정산 보류", "text-rose-500"];
    case "refunded":
      return ["구매자 환불", "text-slate-400"];
    default:
      return ["판매됨 · 구매자 보호 중", "text-amber-500"];
  }
}

export function DosMarketSell({ shopSlug }: { shopSlug: string }) {
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [buys, setBuys] = useState<Buy[]>([]);
  const [loggedIn, setLoggedIn] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/resale", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/dosmarket", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    if (a) {
      setSales((a.requests ?? []) as Sale[]);
      setLoggedIn(Boolean(a.loggedIn));
    }
    if (b) setBuys((b.purchases ?? []) as Buy[]);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  const report = async (id: string) => {
    const reason = window.prompt("어떤 문제가 있나요? (예: 로그인이 안 돼요, 정보가 달라요)");
    if (!reason) return;
    const r = await fetch("/api/dosmarket", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify({ requestId: id, reason }) });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setMsg({ ok: Boolean(r.ok && j?.ok), t: r.ok && j?.ok ? "신고했어요. 판매자 정산을 멈추고 관리자가 확인해요." : j?.error || "신고하지 못했어요." });
    await load();
  };

  const steps = [
    { icon: PackagePlus, t: "판매 등록", d: "계정 정보 · 가격 · 로그인 정보" },
    { icon: BadgeCheck, t: "관리자 확인", d: "확인되면 마켓에 공개" },
    { icon: Store, t: "구매 · 자동 전달", d: "구매자는 포인트로 결제" },
    { icon: ShieldCheck, t: "보호 24시간", d: "문제 생기면 정산 보류" },
    { icon: Wallet, t: "정산", d: "수수료 빼고 포인트 · 계좌로" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-1 py-2">
      <div className="glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-500"><Store className="size-4" /> 도스마켓</p>
            <h2 className="mt-1 text-xl font-bold" style={text}>내 계정, DOES가 대신 안전하게 팔아 드려요</h2>
            <p className="mt-0.5 text-xs" style={muted}>구매자 돈은 DOES가 보관했다가, 계정이 문제없이 전달되면 정산해요.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => (loggedIn ? setOpen(true) : setMsg({ ok: false, t: "로그인하면 판매를 등록할 수 있어요." }))} className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white">
              판매 등록하기
            </button>
            <Link href="/dashboard?tab=products" className="rounded-2xl border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--ad-border, #222)", ...text }}>
              마켓 둘러보기
            </Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {steps.map((s, i) => (
            <div key={s.t} className="flex flex-col items-center rounded-2xl p-2 text-center" style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.08))" }}>
              <s.icon className="size-5 text-emerald-500" />
              <p className="mt-1 text-[11px] font-bold" style={text}>{i + 1}. {s.t}</p>
              <p className="text-[10px] leading-tight" style={muted}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}

      {sales.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내 판매</p>
          {sales.map((s) => {
            const [l, c] = saleLabel(s);
            return (
              <div key={s.id} className="glass flex items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold" style={text}>{s.ign} <span className="text-xs font-normal" style={muted}>· {won(s.price)}</span></p>
                  <p className="text-xs" style={muted}>
                    정산 {won(s.payout)} · {(s.payoutMethod ?? "points") === "points" ? "포인트" : "계좌"}
                    {s.payoutState === "holding" && s.holdUntil ? ` · ${new Date(s.holdUntil).toLocaleString("ko-KR")} 이후 정산` : ""}
                    {s.status === "pending" && s.hasCred ? " · 로그인 정보 제출됨" : ""}
                  </p>
                  {s.rejectReason ? <p className="text-xs" style={muted}>반려 사유: {s.rejectReason}</p> : null}
                </div>
                <span className={`shrink-0 text-xs font-bold ${c}`}>{l}</span>
              </div>
            );
          })}
        </div>
      )}

      {buys.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내가 산 도스마켓 계정</p>
          {buys.map((b) => (
            <div key={b.id} className="glass flex items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-semibold" style={text}>{b.name} <span className="text-xs font-normal" style={muted}>· {won(b.price)}</span></p>
                <p className="flex items-center gap-1 text-xs" style={muted}>
                  <Clock className="size-3" />
                  {b.canReport && b.holdUntil ? `${new Date(b.holdUntil).toLocaleString("ko-KR")}까지 구매자 보호` : b.state === "held" ? "신고 접수됨 · 관리자 확인 중" : "보호 기간 끝남"}
                </p>
              </div>
              {b.canReport ? (
                <button onClick={() => report(b.id)} className="shrink-0 rounded-xl bg-rose-500/90 px-3 py-2 text-xs font-bold text-white">
                  문제 신고
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {open ? <ResaleRequestModal shopSlug={shopSlug} onClose={() => { setOpen(false); void load(); }} /> : null}
    </div>
  );
}
