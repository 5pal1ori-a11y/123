"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Repeat, Search, ShieldAlert, Wallet } from "lucide-react";

type Appraisal = {
  nickname: string;
  uuid: string | null;
  capes: { type: string; title: string }[];
  hypixel: { rank: string | null; level: number; bedwarsStars: number } | null;
  market: number | null;
  low: number | null;
  high: number | null;
  basis: string[];
};
type Req = {
  id: string;
  kind: "buyback" | "tradein";
  nickname: string;
  capes: string[];
  low: number | null;
  high: number | null;
  payout: "points" | "cash";
  targetProductId: string | null;
  offerPrice: number | null;
  offerNote: string | null;
  bonusPrice: number | null;
  status: "submitted" | "offered" | "accepted" | "handover" | "completed" | "rejected" | "cancelled";
  closedReason: string | null;
  result: string | null;
};
type Prod = { id: string; name: string; price: number; category: string };

const won = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString("ko-KR")}원` : "—");
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const field = { borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" };
const inputCls = "w-full rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none focus:border-violet-400/50";

const STATUS: Record<Req["status"], [string, string]> = {
  submitted: ["검수 대기", "text-amber-500"],
  offered: ["매입가 도착", "text-violet-400"],
  accepted: ["로그인 정보 필요", "text-sky-500"],
  handover: ["확인 중", "text-sky-500"],
  completed: ["완료", "text-emerald-500"],
  rejected: ["반려", "text-slate-400"],
  cancelled: ["취소", "text-slate-400"],
};

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: r.ok && Boolean(j?.ok ?? j?.appraisal), status: r.status, j };
}

function Handover({ id, onDone }: { id: string; onDone: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-2xl bg-sky-500/[0.06] p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-sky-400"><Lock className="size-3.5" /> 로그인 정보 제출 (암호화 · 관리자만 확인 · 완료 후 삭제)</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="마이크로소프트 로그인 이메일" className={inputCls} style={field} />
      <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="비밀번호" className={inputCls} style={field} />
      <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="복구 이메일 · 백업 코드 등 (선택)" className={inputCls} style={field} />
      <button
        disabled={busy || !email || !pw}
        onClick={async () => {
          setBusy(true);
          const r = await post(`/api/buyback/${id}`, { action: "handover", email, password: pw, extra });
          setBusy(false);
          onDone(r.ok ? "로그인 정보를 보냈어요. 확인되면 바로 지급해 드려요." : String(r.j?.error ?? "보내지 못했어요."));
        }}
        className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "보내는 중…" : "로그인 정보 보내기"}
      </button>
    </div>
  );
}

export function BuybackClient() {
  const [nick, setNick] = useState("");
  const [ap, setAp] = useState<Appraisal | null>(null);
  const [kind, setKind] = useState<"buyback" | "tradein">("buyback");
  const [payout, setPayout] = useState<"points" | "cash">("points");
  const [bank, setBank] = useState({ name: "", account: "", holder: "" });
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [products, setProducts] = useState<Prod[]>([]);
  const [bonus, setBonus] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [needVerify, setNeedVerify] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/buyback", { credentials: "include" });
    if (r.status === 401) return setMsg({ ok: false, t: "로그인하면 신청할 수 있어요. (시세 조회는 바로 돼요)" });
    const j = (await r.json().catch(() => null)) as { requests?: Req[]; products?: Prod[]; bonusPercent?: number } | null;
    if (j?.requests) setReqs(j.requests);
    if (j?.products) setProducts(j.products);
    if (j?.bonusPercent) setBonus(j.bonusPercent);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const appraise = async () => {
    setMsg(null);
    setAp(null);
    setBusy("ap");
    const r = await post("/api/buyback/appraise", { nickname: nick.trim() });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, t: String(r.j?.error ?? "조회하지 못했어요.") });
    setAp(r.j!.appraisal as Appraisal);
  };

  const submit = async () => {
    setMsg(null);
    setNeedVerify(false);
    setBusy("sub");
    const r = await post("/api/buyback", {
      nickname: ap?.nickname ?? nick.trim(),
      kind,
      payout: kind === "tradein" ? "points" : payout,
      bank: kind === "buyback" && payout === "cash" ? bank : null,
      targetProductId: kind === "tradein" ? target : null,
      note,
      agree,
    });
    setBusy(null);
    if (r.j?.needVerify) return setNeedVerify(true);
    if (!r.ok) return setMsg({ ok: false, t: String(r.j?.error ?? "신청하지 못했어요.") });
    setMsg({ ok: true, t: "신청했어요! 검수 후 매입가를 알려 드릴게요." });
    setAp(null);
    setNick("");
    setAgree(false);
    await load();
  };

  const act = async (id: string, action: "accept" | "decline" | "cancel") => {
    setBusy(id);
    const r = await post(`/api/buyback/${id}`, { action });
    setBusy(null);
    setMsg({ ok: r.ok, t: r.ok ? (action === "accept" ? "수락했어요. 아래에서 로그인 정보를 내 주세요." : "처리했어요.") : String(r.j?.error ?? "처리하지 못했어요.") });
    await load();
  };

  const tp = products.find((p) => p.id === target);
  const credit = ap?.high ? Math.round(ap.high * (1 + bonus / 100)) : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-1 py-2">
      <div className="glass relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-400"><Wallet className="size-4" /> 계정 매입 · 보상판매</div>
          <h2 className="mt-1 text-xl font-bold" style={text}>안 쓰는 계정, DOES가 사요</h2>
          <p className="mt-1 text-xs" style={muted}>닉네임만 넣으면 망토 · 하이픽셀 · 시세로 예상 매입가를 바로 계산해요.</p>
        </div>
      </div>

      <div className="glass space-y-3 p-5">
        <div className="flex gap-2">
          <input value={nick} onChange={(e) => setNick(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16))} placeholder="내 마크 닉네임" className={inputCls} style={field} />
          <button onClick={appraise} disabled={busy === "ap" || nick.length < 3} className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-violet-500 px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy === "ap" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} 시세 조회
          </button>
        </div>
        {ap && (
          <div className="space-y-2 rounded-2xl bg-violet-500/[0.07] p-4">
            <p className="text-xs" style={muted}>예상 매입가</p>
            <p className="text-2xl font-extrabold text-violet-400">{ap.low ? `${won(ap.low)} ~ ${won(ap.high)}` : "관리자 직접 감정"}</p>
            <p className="text-xs" style={muted}>
              망토 {ap.capes.length ? ap.capes.map((c) => c.title).join(", ") : "없음"} · 하이픽셀 {ap.hypixel ? `${ap.hypixel.rank ?? "일반"} · 베드워즈 ${ap.hypixel.bedwarsStars}성` : "기록 없음"}
            </p>
            {ap.basis.length ? <p className="text-[11px]" style={muted}>근거: {ap.basis.join(" · ")}</p> : null}
            <p className="text-[11px]" style={muted}>실제 매입가는 검수 후 정해져요.</p>
          </div>
        )}
      </div>

      {ap && (
        <div className="glass space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["buyback", "매입", "포인트 · 현금으로 받기"],
              ["tradein", "보상판매", `다른 계정으로 바꾸기 · +${bonus}%`],
            ] as const).map(([k, l, d]) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-2xl border p-3 text-left transition ${kind === k ? "border-violet-400/60 bg-violet-500/10" : ""}`} style={kind === k ? undefined : field}>
                <p className={`text-sm font-bold ${kind === k ? "text-violet-400" : ""}`} style={kind === k ? undefined : text}>{k === "tradein" ? <Repeat className="mr-1 inline size-4" /> : null}{l}</p>
                <p className="text-[11px]" style={muted}>{d}</p>
              </button>
            ))}
          </div>

          {kind === "buyback" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(["points", "cash"] as const).map((p) => (
                  <button key={p} onClick={() => setPayout(p)} className={`rounded-2xl border py-2.5 text-sm font-semibold ${payout === p ? "border-violet-400/60 bg-violet-500/10 text-violet-400" : ""}`} style={payout === p ? undefined : field}>
                    {p === "points" ? "포인트 (즉시)" : "현금 송금"}
                  </button>
                ))}
              </div>
              {payout === "cash" && (
                <div className="grid grid-cols-3 gap-2">
                  <input value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} placeholder="은행" className={inputCls} style={field} />
                  <input value={bank.account} onChange={(e) => setBank({ ...bank, account: e.target.value })} placeholder="계좌번호" className={`${inputCls} col-span-2`} style={field} />
                  <input value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} placeholder="예금주" className={`${inputCls} col-span-3`} style={field} />
                </div>
              )}
            </>
          ) : (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} style={{ ...field, background: "transparent" }}>
                <option value="">바꿀 계정 고르기</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} style={{ color: "#111" }}>
                    {p.name} · {won(p.price)}
                  </option>
                ))}
              </select>
              {tp && credit ? (
                <p className="rounded-2xl bg-violet-500/[0.07] px-4 py-3 text-xs" style={muted}>
                  예상 보상가 최대 <b className="text-violet-400">{won(credit)}</b> → 추가로 낼 금액 약 <b style={text}>{won(Math.max(0, tp.price - credit))}</b>
                </p>
              ) : null}
            </>
          )}

          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="관리자에게 남길 말 (선택)" className={inputCls} style={field} />
          <label className="flex items-start gap-2 text-xs" style={muted}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            제 소유의 계정이며, 도난 · 회수 위험이 없는 계정임을 확인해요. 문제가 생기면 지급이 취소될 수 있어요.
          </label>
          <button
            onClick={submit}
            disabled={busy === "sub" || !agree || (kind === "tradein" && !target)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-4 font-bold text-white shadow-lg shadow-violet-500/20 disabled:opacity-50"
          >
            {busy === "sub" ? <Loader2 className="size-4 animate-spin" /> : null} {kind === "tradein" ? "보상판매 신청" : "매입 신청"}
          </button>
        </div>
      )}

      {needVerify && (
        <div className="glass flex items-start gap-3 p-4">
          <ShieldAlert className="size-5 shrink-0 text-amber-500" />
          <div className="text-sm" style={text}>
            계정 매입은 본인인증을 마친 뒤 신청할 수 있어요.
            <a href="/verify-identity" className="ml-1 font-bold text-amber-500 underline">본인인증 하기</a>
          </div>
        </div>
      )}
      {msg && <p className={`text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}

      {reqs.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold" style={muted}>내 신청</p>
          {reqs.map((r) => (
            <div key={r.id} className="glass space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold" style={text}>
                  {r.nickname} <span className="text-xs font-normal" style={muted}>· {r.kind === "tradein" ? "보상판매" : r.payout === "cash" ? "현금 매입" : "포인트 매입"}</span>
                </p>
                <span className={`shrink-0 text-xs font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
              </div>
              <p className="text-xs" style={muted}>예상 {r.low ? `${won(r.low)} ~ ${won(r.high)}` : "직접 감정"}{r.offerPrice ? ` · 제시가 ${won(r.offerPrice)}${r.bonusPrice ? ` (보너스 포함 ${won(r.bonusPrice)})` : ""}` : ""}</p>
              {r.offerNote ? <p className="text-xs" style={muted}>“{r.offerNote}”</p> : null}
              {r.status === "offered" && (
                <div className="flex gap-2">
                  <button onClick={() => act(r.id, "accept")} disabled={busy === r.id} className="flex-1 rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white">수락</button>
                  <button onClick={() => act(r.id, "decline")} disabled={busy === r.id} className="flex-1 rounded-xl border py-2.5 text-sm" style={field}>거절</button>
                </div>
              )}
              {r.status === "accepted" && <Handover id={r.id} onDone={(m) => { setMsg({ ok: true, t: m }); void load(); }} />}
              {["submitted", "offered", "accepted"].includes(r.status) && r.status !== "offered" && (
                <button onClick={() => act(r.id, "cancel")} disabled={busy === r.id} className="text-xs underline" style={muted}>신청 취소</button>
              )}
              {r.result ? <p className="text-xs text-emerald-500">{r.result}</p> : null}
              {r.closedReason ? <p className="text-xs" style={muted}>{r.closedReason}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
