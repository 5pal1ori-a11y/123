"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Trophy } from "lucide-react";

type Asset = { id: string; label: string; price: number; changePct: number | null };
type Pos = { id: string; label: string; qty: number; price: number; value: number; avgCost: number; pnlPct: number };
type Mine = { cash: number; total: number; profitPct: number; positions: Pos[] };
type Data = { startDc: number; fee: number; assets: Asset[]; leaderboard: { rank: number; name: string; total: number; profitPct: number }[]; mine: Mine | null };

const dc = (n: number) => `${Math.round(n).toLocaleString("ko-KR")} DC`;
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const field = { borderColor: "var(--ad-border, #222)", color: "var(--ad-text, #fff)" };

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs" style={muted}>—</span>;
  const up = v > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-rose-500" : v < 0 ? "text-sky-500" : "text-slate-400"}`}>{v !== 0 ? <Icon className="size-3" /> : null}{v > 0 ? "+" : ""}{v}%</span>;
}

export function MockStockClient() {
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<string>("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/stock", { credentials: "include" });
    const j = (await r.json().catch(() => null)) as Data | null;
    if (j) {
      setD(j);
      setSel((s) => s || j.assets[0]?.id || "");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (side: "buy" | "sell") => {
    setMsg(null);
    const n = Number(amt.replace(/[^\d.]/g, ""));
    if (!(n > 0)) return setMsg({ ok: false, t: side === "buy" ? "살 금액(DC)을 적어 주세요." : "팔 수량을 적어 주세요." });
    setBusy(true);
    const r = await fetch("/api/stock", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side, asset: sel, amount: n }) });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (r.status === 401) return setMsg({ ok: false, t: "로그인하면 모의투자를 할 수 있어요." });
    if (!r.ok || !j?.ok) return setMsg({ ok: false, t: j?.error || "거래하지 못했어요." });
    setAmt("");
    setMsg({ ok: true, t: side === "buy" ? "샀어요!" : "팔았어요!" });
    await load();
  };

  if (!d) return <div className="flex justify-center py-6" style={muted}><Loader2 className="size-4 animate-spin" /></div>;
  const asset = d.assets.find((a) => a.id === sel);
  const pos = d.mine?.positions.find((p) => p.id === sel);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 pb-4">
      <div className="glass p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-400">계정 차트 모의투자</p>
            <p className="mt-0.5 text-xs" style={muted}>현금 가치 없는 모의 머니(DC)로 하는 놀이예요 · 시작 {dc(d.startDc)} · 수수료 {d.fee * 100}%</p>
          </div>
          {d.mine ? (
            <div className="text-right">
              <p className="text-xs" style={muted}>내 총자산</p>
              <p className="text-xl font-extrabold" style={text}>{dc(d.mine.total)} <Pct v={d.mine.profitPct} /></p>
              <p className="text-xs" style={muted}>현금 {dc(d.mine.cash)}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-2xl border bg-transparent px-4 py-3 text-sm" style={field}>
            {d.assets.map((a) => (
              <option key={a.id} value={a.id} style={{ color: "#111" }}>
                {a.label} · {dc(a.price)}
              </option>
            ))}
          </select>
          <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="살 금액(DC) / 팔 수량" className="rounded-2xl border bg-transparent px-4 py-3 text-sm sm:w-44" style={field} />
        </div>
        {asset ? (
          <p className="mt-2 text-xs" style={muted}>
            현재가 {dc(asset.price)} <Pct v={asset.changePct} />{pos ? ` · 보유 ${pos.qty}주 (평단 ${dc(pos.avgCost)}, ${pos.pnlPct > 0 ? "+" : ""}${pos.pnlPct}%)` : ""}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => act("buy")} disabled={busy || !sel} className="rounded-2xl bg-rose-500 py-3 text-sm font-bold text-white disabled:opacity-50">사기</button>
          <button onClick={() => act("sell")} disabled={busy || !sel || !pos} className="rounded-2xl bg-sky-500 py-3 text-sm font-bold text-white disabled:opacity-50">팔기</button>
        </div>
        {msg && <p className={`mt-2 text-center text-sm font-medium ${msg.ok ? "text-emerald-500" : "text-rose-500"}`}>{msg.t}</p>}
      </div>

      {d.mine && d.mine.positions.length > 0 && (
        <div className="glass divide-y overflow-hidden" style={{ borderColor: "var(--ad-border, #222)" }}>
          {d.mine.positions.map((p) => (
            <button key={p.id} onClick={() => setSel(p.id)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm" style={{ borderColor: "var(--ad-border, #222)" }}>
              <span style={text}>{p.label} <span className="text-xs" style={muted}>· {p.qty}주</span></span>
              <span className="text-right"><span style={text}>{dc(p.value)}</span> <Pct v={p.pnlPct} /></span>
            </button>
          ))}
        </div>
      )}

      <div className="glass p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={text}><Trophy className="size-4 text-amber-400" /> 수익률 랭킹</p>
        {d.leaderboard.length ? (
          <ol className="space-y-1.5 text-sm">
            {d.leaderboard.map((r) => (
              <li key={r.rank} className="flex items-center justify-between">
                <span style={text}><b className="mr-2 text-amber-400">{r.rank}</b>{r.name}</span>
                <span className="text-right"><span style={muted}>{dc(r.total)}</span> <Pct v={r.profitPct} /></span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs" style={muted}>아직 거래한 사람이 없어요. 첫 번째가 되어 보세요!</p>
        )}
      </div>
    </div>
  );
}
