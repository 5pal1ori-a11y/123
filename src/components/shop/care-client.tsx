"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Loader2, ShieldCheck } from "lucide-react";

type Plan = { id: "basic" | "plus"; name: string; price: number; maxPayout: number };
type Sub = { plan: "basic" | "plus"; status: string; periodEnd: string; coveredFrom: string; autoRenew: boolean; covered: boolean; waiting: boolean };
type Claim = { id: string; productName: string; type: "lock" | "theft" | "ban"; status: "pending" | "approved" | "rejected"; payout: number | null; reason: string | null; createdAt: string };
type Order = { id: string; productName: string; amount: number; paidAt: string };
type Data = {
  loggedIn: boolean;
  plans: Plan[];
  waitDays: number;
  cooldownDays: number;
  claimTypes: Record<string, string>;
  points?: number;
  sub?: Sub | null;
  claims?: Claim[];
  orders?: Order[];
};

const won = (n: number | null | undefined) => `${Math.round(n ?? 0).toLocaleString("ko-KR")}원`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const field = { borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" };

export function CareClient() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState<"lock" | "theft" | "ban">("lock");
  const [desc, setDesc] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/care", { credentials: "include" });
    setD((await r.json().catch(() => null)) as Data | null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (body: Record<string, unknown>, okText: string) => {
    setMsg(null);
    setBusy(String(body.action) + String(body.plan ?? ""));
    try {
      const r = await fetch("/api/care", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || !j?.ok) return setMsg({ ok: false, t: j?.error || "처리하지 못했어요." });
      setMsg({ ok: true, t: okText });
      if (body.action === "claim") setDesc("");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!d) {
    return (
      <div className="flex items-center justify-center gap-2 py-16" style={muted}>
        <Loader2 className="size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  const sub = d.sub;
  const active = sub?.covered;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-1 py-2">
      <div className="glass relative overflow-hidden p-6 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 size-60 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative">
          <ShieldCheck className="mx-auto size-10 text-sky-400" />
          <h2 className="mt-2 text-2xl font-extrabold" style={text}>DOES 케어</h2>
          <p className="mt-1 text-sm font-semibold text-sky-400">망해도, 보상받을 수 있어요.</p>
          <p className="mt-2 text-xs leading-relaxed" style={muted}>
            DOES에서 산 계정이 <b style={text}>잠기거나 · 도난(회수) · 정지</b>되면 케어가 보상해 드려요.
            <br />가입 후 {d.waitDays}일 뒤부터 생긴 문제 · {d.cooldownDays}일에 한 번 · 심사 후 포인트 지급
          </p>
        </div>
      </div>

      {active && sub ? (
        <div className="glass flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-xs" style={muted}>이용 중</p>
            <p className="text-lg font-bold text-sky-400">{d.plans.find((p) => p.id === sub.plan)?.name}</p>
            <p className="text-xs" style={muted}>
              {sub.waiting ? `대기 기간 · ${new Date(sub.coveredFrom).toLocaleDateString("ko-KR")}부터 보장` : "보장 중"} · {sub.autoRenew ? `다음 갱신 ${new Date(sub.periodEnd).toLocaleDateString("ko-KR")}` : `${new Date(sub.periodEnd).toLocaleDateString("ko-KR")}까지 보장 (해지됨)`}
            </p>
          </div>
          {sub.autoRenew ? (
            <button onClick={() => send({ action: "cancel" }, "해지했어요. 남은 기간까지는 보장돼요.")} disabled={busy !== null} className="rounded-xl border px-4 py-2 text-xs" style={field}>
              해지
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {d.plans.map((p) => {
          const plus = p.id === "plus";
          const mine = active && sub?.plan === p.id && sub.autoRenew;
          return (
            <div key={p.id} className={`glass relative flex flex-col p-5 ${plus ? "ring-1 ring-sky-400/40" : ""}`}>
              {plus ? <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-400"><Crown className="size-3" /> 추천</span> : null}
              <p className="text-sm font-bold" style={text}>{p.name.replace("DOES 케어 ", "")}</p>
              <p className="mt-2 text-3xl font-extrabold" style={text}>
                {won(p.price)}
                <span className="text-sm font-medium" style={muted}> / 월</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm" style={muted}>
                <li className="flex items-center gap-2"><Check className="size-4 text-sky-400" /> 한 번 최대 <b style={text}>{won(p.maxPayout)}</b> 보상</li>
                <li className="flex items-center gap-2"><Check className="size-4 text-sky-400" /> 잠금 · 도난(회수) · 정지 보장</li>
                <li className="flex items-center gap-2"><Check className="size-4 text-sky-400" /> 포인트 자동 갱신 · 언제든 해지</li>
              </ul>
              <button
                onClick={() => send({ action: "subscribe", plan: p.id }, `${p.name}에 가입했어요!`)}
                disabled={!d.loggedIn || busy !== null || Boolean(mine)}
                className={`mt-5 rounded-2xl py-3 text-sm font-bold text-white transition disabled:opacity-50 ${plus ? "bg-gradient-to-r from-sky-500 to-indigo-500" : "bg-sky-500"}`}
              >
                {!d.loggedIn ? "로그인 후 가입" : mine ? "이용 중" : active ? "이 플랜으로 바꾸기" : "가입하기"}
              </button>
            </div>
          );
        })}
      </div>

      {active && sub && !sub.waiting ? (
        <div className="glass space-y-3 p-5">
          <p className="text-sm font-bold" style={text}>보상 신청</p>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full rounded-2xl border bg-transparent px-4 py-3 text-sm" style={field}>
            <option value="">문제가 생긴 계정 고르기</option>
            {(d.orders ?? []).map((o) => (
              <option key={o.id} value={o.id} style={{ color: "#111" }}>
                {o.productName} · {won(o.amount)} · {new Date(o.paidAt).toLocaleDateString("ko-KR")}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(d.claimTypes) as [("lock" | "theft" | "ban"), string][]).map(([k, l]) => (
              <button key={k} onClick={() => setType(k)} className={`rounded-2xl border py-2.5 text-xs font-semibold ${type === k ? "border-sky-400/60 bg-sky-500/10 text-sky-400" : ""}`} style={type === k ? undefined : field}>
                {l}
              </button>
            ))}
          </div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 600))} rows={3} placeholder="언제 · 어떻게 문제가 생겼는지 적어 주세요 (10자 이상)" className="w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none" style={field} />
          <button
            onClick={() => send({ action: "claim", orderId, type, description: desc }, "보상 신청했어요. 심사 결과는 DM으로 알려 드려요.")}
            disabled={busy !== null || !orderId || desc.trim().length < 10}
            className="w-full rounded-2xl bg-sky-500 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            보상 신청하기
          </button>
        </div>
      ) : null}

      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}

      {(d.claims ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내 보상 신청</p>
          {d.claims!.map((c) => (
            <div key={c.id} className="glass flex items-start justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-semibold" style={text}>{c.productName} · {d.claimTypes[c.type]}</p>
                <p className="text-xs" style={muted}>{new Date(c.createdAt).toLocaleDateString("ko-KR")}{c.reason ? ` · ${c.reason}` : ""}</p>
              </div>
              <span className={`shrink-0 text-xs font-bold ${c.status === "approved" ? "text-emerald-500" : c.status === "rejected" ? "text-slate-400" : "text-amber-500"}`}>
                {c.status === "approved" ? `${won(c.payout)} 지급` : c.status === "rejected" ? "거절" : "심사 중"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-center text-[11px]" style={muted}>
        DOES 케어는 DOES가 판매한 계정에 대한 자체 보장 서비스예요. 본인 부주의(계정 공유 · 피싱 등)나 약관 위반으로 생긴 문제는 보상하지 않을 수 있어요.
      </p>
    </div>
  );
}
