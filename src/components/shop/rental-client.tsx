"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Copy, KeyRound, Loader2, RotateCcw, Ticket } from "lucide-react";

type Quote = { days: number; base: number; discount: number; fee: number; deposit: number; total: number };
type Item = { id: string; title: string; description: string; dailyPrice: number; deposit: number; status: "available" | "rented" | "returning"; rentCount: number; availableAt: string | null; quotes: Quote[] };
type Mine = {
  id: string;
  itemTitle: string;
  from: string;
  until: string;
  paid: number;
  deposit: number;
  status: "active" | "returning" | "done";
  depositBack: number | null;
  returnedAt: string | null;
  dailyPrice: number;
  cred: { email: string; password: string; extra?: string } | null;
};
type Data = { items: Item[]; loggedIn: boolean; points?: number; tickets?: number; mine?: Mine[] };

const P = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function left(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "끝남";
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${h}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분 남음`;
}

export function RentalClient() {
  const [d, setD] = useState<Data | null>(null);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/rental", { credentials: "include", cache: "no-store" }).catch(() => null);
    if (r?.ok) setD((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/rental", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setMsg(r?.ok && j?.ok ? { ok: true, t: ok } : { ok: false, t: r?.status === 401 ? "로그인하면 빌릴 수 있어요." : j?.error || "처리하지 못했어요." });
    setBusy(false);
    await load();
  };

  if (!d) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin" style={muted} /></div>;
  const tickets = d.tickets ?? 0;
  const active = (d.mine ?? []).filter((m) => m.status === "active");
  const past = (d.mine ?? []).filter((m) => m.status !== "active").slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-2">
      <div className="glass p-5" style={{ background: "radial-gradient(ellipse 70% 80% at 15% 0%, rgba(168,85,247,0.16), transparent 70%)" }}>
        <p className="text-xs font-bold tracking-[0.3em] text-violet-500">ACCOUNT RENTAL</p>
        <h2 className="mt-0.5 text-2xl font-black" style={text}>사기엔 비싼 계정, 빌려 쓰세요</h2>
        <p className="mt-1 text-xs" style={muted}>1일 · 3일 · 7일(10% 할인) · 30일(20% 할인) · 보증금은 반납 확인 뒤 그대로 환불 · 로그인 정보는 결제 즉시 전달</p>
        {d.loggedIn ? (
          <p className="mt-3 flex flex-wrap gap-3 text-xs font-semibold" style={text}>
            <span>내 포인트 {P(d.points ?? 0)}</span>
            <span className="flex items-center gap-1 text-violet-400"><Ticket className="size-3.5" /> 렌탈 1일권 {tickets}장</span>
          </p>
        ) : null}
      </div>

      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}

      {active.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>지금 빌린 계정</p>
          {active.map((m) => (
            <div key={m.id} className="glass space-y-3 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold" style={text}>{m.itemTitle}</p>
                <span className="flex items-center gap-1 text-xs font-bold text-violet-400"><Clock className="size-3.5" /> {left(m.until)} · {when(m.until)}까지</span>
              </div>
              {m.cred ? (
                <div className="rounded-xl p-3 font-mono text-xs" style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.1))", ...text }}>
                  <p className="mb-1 flex items-center gap-1 font-sans font-bold text-violet-400"><KeyRound className="size-3.5" /> 로그인 정보</p>
                  <p>이메일: {m.cred.email}</p>
                  <p>비밀번호: {m.cred.password}</p>
                  {m.cred.extra ? <p className="whitespace-pre-wrap">추가: {m.cred.extra}</p> : null}
                  <button onClick={() => navigator.clipboard?.writeText(`${m.cred!.email}\n${m.cred!.password}`)} className="mt-2 flex items-center gap-1 font-sans text-[11px] font-semibold text-violet-400"><Copy className="size-3" /> 복사</button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {[1, 7].map((n) => (
                  <button key={n} disabled={busy} onClick={() => post({ action: "extend", rentalId: m.id, days: n }, `${n}일 연장했어요.`)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--ad-border, #333)", ...text }}>
                    +{n}일 연장 · {P(n === 7 ? Math.round(m.dailyPrice * 7 * 0.9) : m.dailyPrice)}
                  </button>
                ))}
                <button disabled={busy} onClick={() => window.confirm("지금 반납할까요? 남은 기간은 환불되지 않아요.") && post({ action: "return", rentalId: m.id }, "반납을 접수했어요. 확인되면 보증금을 돌려드려요.")} className="flex items-center gap-1 rounded-xl bg-rose-500/90 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  <RotateCcw className="size-3.5" /> 지금 반납
                </button>
              </div>
              <p className="text-[11px]" style={muted}>비밀번호 · 이메일 · 보안 설정을 바꾸면 보증금이 차감돼요. 기간이 끝나면 바로 접속을 종료해 주세요.</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold" style={muted}>렌탈 계정</p>
        {d.items.length === 0 ? <div className="glass p-6 text-center text-sm" style={muted}>아직 등록된 렌탈 계정이 없어요. 곧 올라와요!</div> : null}
        {d.items.map((i) => {
          const days = pick[i.id] ?? 1;
          const q = i.quotes.find((x) => x.days === days) ?? i.quotes[0]!;
          const useT = Math.min(tickets, days);
          const fee = Math.max(0, Math.round((q.fee * (days - useT)) / days));
          const total = fee + q.deposit;
          const free = i.status === "available";
          return (
            <div key={i.id} className="glass space-y-3 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold" style={text}>{i.title}</p>
                  {i.description ? <p className="mt-0.5 whitespace-pre-wrap text-xs" style={muted}>{i.description}</p> : null}
                  <p className="mt-1 text-xs" style={muted}>하루 {P(i.dailyPrice)} · 보증금 {P(i.deposit)}{i.rentCount ? ` · ${i.rentCount}회 대여됨` : ""}</p>
                </div>
                <span className={`shrink-0 text-xs font-bold ${free ? "text-emerald-500" : i.status === "rented" ? "text-rose-500" : "text-amber-500"}`}>
                  {free ? "대여 가능" : i.status === "rented" ? `대여 중${i.availableAt ? ` · ${when(i.availableAt)} 반납` : ""}` : "반납 확인 중"}
                </span>
              </div>
              {free ? (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {i.quotes.map((x) => (
                      <button key={x.days} onClick={() => setPick((p) => ({ ...p, [i.id]: x.days }))} className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${x.days === days ? "bg-violet-500 text-white" : ""}`} style={x.days === days ? {} : { background: "var(--mf-surface-2, rgba(127,127,127,0.1))", ...text }}>
                        {x.days}일{x.discount ? <span className="block text-[10px] font-semibold opacity-80">{x.days === 30 ? "20%" : "10%"} 할인</span> : <span className="block text-[10px] opacity-0">-</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs" style={muted}>
                      대여료 {P(fee)}{useT ? ` (1일권 ${useT}장)` : ""} + 보증금 {P(q.deposit)} = <b className="text-base" style={text}>{P(total)}</b>
                    </p>
                    <button disabled={busy || !d.loggedIn} onClick={() => window.confirm(`${i.title} ${days}일 · ${P(total)} 결제할까요?`) && post({ action: "rent", itemId: i.id, days, useTickets: true }, "빌렸어요! 위에서 로그인 정보를 확인하세요. 디스코드 DM으로도 보냈어요.")} className="shrink-0 rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                      {d.loggedIn ? "빌리기" : "로그인 필요"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {past.length > 0 && (
        <div className="space-y-1.5">
          <p className="px-1 text-xs font-semibold" style={muted}>지난 대여</p>
          {past.map((m) => (
            <div key={m.id} className="glass flex justify-between gap-2 p-3 text-xs">
              <span style={text}>{m.itemTitle}</span>
              <span style={muted}>{m.status === "returning" ? "반납 확인 중" : `보증금 ${P(m.depositBack ?? 0)} 환불`} · {when(m.returnedAt ?? m.until)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
