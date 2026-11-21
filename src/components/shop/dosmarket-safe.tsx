"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, ShieldCheck } from "lucide-react";

type Trade = {
  id: string;
  title: string;
  price: number;
  status: "open" | "paid" | "held" | "settling" | "done" | "refunded" | "cancelled" | "expired";
  role: "seller" | "buyer" | "guest";
  payout?: number;
  holdUntil: string | null;
  createdAt: string;
};
type Data = { loggedIn: boolean; fee: number; feePlus: number; myFee?: number; holdHours: number; openDays: number; trades: Trade[] };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const field = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none";
const fieldStyle = { borderColor: "var(--ad-border, rgba(127,127,127,0.3))", background: "var(--mf-surface-2, rgba(127,127,127,0.06))", color: "var(--ad-text, #fff)" };
const STATUS: Record<Trade["status"], [string, string]> = {
  open: ["결제 대기", "text-sky-500"],
  paid: ["구매자 보호 중", "text-amber-500"],
  held: ["신고로 보류", "text-rose-500"],
  settling: ["송금 대기", "text-violet-400"],
  done: ["완료", "text-emerald-500"],
  refunded: ["환불", "text-slate-400"],
  cancelled: ["취소", "text-slate-400"],
  expired: ["만료", "text-slate-400"],
};

export function DosMarketSafe() {
  const [d, setD] = useState<Data | null>(null);
  const [f, setF] = useState({ title: "", price: "", description: "", email: "", password: "", extra: "", method: "points" as "points" | "bank", account: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [made, setMade] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/safe-trade", { credentials: "include", cache: "no-store" }).catch(() => null);
    if (r?.ok) setD((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const price = Number(f.price.replace(/[^\d]/g, "")) || 0;
  const fee = d?.myFee ?? d?.fee ?? 5;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/safe-trade", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: f.title, description: f.description, price, login: { email: f.email, password: f.password, extra: f.extra }, payoutMethod: f.method, payoutAccount: f.method === "bank" ? f.account : undefined }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
    if (r?.ok && j?.ok && j.url) {
      setMade(j.url);
      setF({ title: "", price: "", description: "", email: "", password: "", extra: "", method: f.method, account: f.account });
    } else setMsg({ ok: false, t: r?.status === 401 ? "로그인하면 링크를 만들 수 있어요." : j?.error || "링크를 만들지 못했어요." });
    setBusy(false);
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-1 py-2">
      <div className="glass p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-500"><ShieldCheck className="size-4" /> 안전거래 링크</p>
        <h2 className="mt-1 text-xl font-bold" style={text}>밖에서 만난 거래도, 돈은 DOES가 맡아 드려요</h2>
        <p className="mt-0.5 text-xs" style={muted}>
          링크를 만들어 구매자에게 보내면 → 구매자가 포인트로 결제 → 로그인 정보 자동 전달 → {d?.holdHours ?? 24}시간 보호 뒤 정산. 수수료 {d?.fee ?? 5}% (DOES PASS+ {d?.feePlus ?? 3}%) · 링크는 {d?.openDays ?? 7}일 동안 열려요.
        </p>
      </div>

      {made ? (
        <div className="glass space-y-2 p-4 text-sm">
          <p className="font-bold text-emerald-500">링크를 만들었어요! 구매자에게 보내 주세요.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-xs" style={fieldStyle}>{made}</code>
            <button onClick={() => navigator.clipboard?.writeText(made)} className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white"><Copy className="size-3" /> 복사</button>
          </div>
        </div>
      ) : null}

      {d && !d.loggedIn ? (
        <div className="glass p-5 text-center text-sm" style={muted}>로그인하면 안전거래 링크를 만들 수 있어요. 디스코드에서는 <b>/안전거래</b>로도 만들 수 있어요.</div>
      ) : (
        <div className="glass space-y-3 p-5">
          <input className={field} style={fieldStyle} placeholder="상품명 (예: 마인콘 2015 망토 계정)" value={f.title} onChange={set("title")} maxLength={60} />
          <input className={field} style={fieldStyle} placeholder="가격 (원)" inputMode="numeric" value={f.price} onChange={set("price")} />
          <textarea className={field} style={fieldStyle} rows={3} placeholder="설명 (구매자에게 보여요)" value={f.description} onChange={set("description")} maxLength={1000} />
          <div className="space-y-2 rounded-xl p-3" style={{ background: "rgba(16,185,129,0.07)" }}>
            <p className="text-xs font-bold text-emerald-500">계정 로그인 정보 — 암호화해서 보관하고, 결제한 구매자에게만 보여요</p>
            <input className={field} style={fieldStyle} placeholder="이메일" value={f.email} onChange={set("email")} autoComplete="off" />
            <input className={field} style={fieldStyle} placeholder="비밀번호" value={f.password} onChange={set("password")} autoComplete="off" />
            <input className={field} style={fieldStyle} placeholder="추가 정보 (복구 이메일 등 · 선택)" value={f.extra} onChange={set("extra")} autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["points", "bank"] as const).map((m) => (
              <button key={m} onClick={() => setF((p) => ({ ...p, method: m }))} className={`rounded-xl py-2.5 text-sm font-bold ${f.method === m ? "bg-emerald-500 text-white" : ""}`} style={f.method === m ? {} : { ...fieldStyle }}>
                {m === "points" ? "포인트로 정산 (자동)" : "계좌로 정산"}
              </button>
            ))}
          </div>
          {f.method === "bank" ? <input className={field} style={fieldStyle} placeholder="은행 · 계좌번호 · 예금주" value={f.account} onChange={set("account")} maxLength={100} /> : null}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs" style={muted}>{price >= 1000 ? `정산 예정 ${won(Math.floor(price * (1 - fee / 100)))} (수수료 ${fee}%)` : "가격은 1,000원 이상"}</p>
            <button disabled={busy || price < 1000 || f.title.trim().length < 2 || !f.email || !f.password} onClick={submit} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
              <Link2 className="size-4" /> 링크 만들기
            </button>
          </div>
          {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}
        </div>
      )}

      {d && d.trades.length > 0 ? (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내 안전거래</p>
          {d.trades.map((t) => {
            const [l, c] = STATUS[t.status];
            return (
              <Link key={t.id} href={`/safe/${t.id}`} className="glass flex items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold" style={text}>{t.title} <span className="text-xs font-normal" style={muted}>· {won(t.price)}</span></p>
                  <p className="text-xs" style={muted}>{t.role === "seller" ? `판매 · 정산 ${won(t.payout ?? 0)}` : "구매"} · {t.id}</p>
                </div>
                <span className={`shrink-0 text-xs font-bold ${c}`}>{l}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
