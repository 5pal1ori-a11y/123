"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Coins, Copy, ExternalLink, Gem, Loader2, Medal, Package, Receipt, Search, X } from "lucide-react";
import type { DiscordSDK as DiscordSDKType } from "@discord/embedded-app-sdk";

/** DOES 디스코드 앱 ID (봇과 같은 앱 — 개발자 포털에서 Activities 를 켜야 한다) */
const CLIENT_ID = "1540972072963149944";
const SITE = "https://doesmc.xyz";

type Product = { id: string; slug: string; name: string; category: string; price: number; originalPrice: number | null; stock: number; image: string | null; needsInput: boolean; description: string };
type Order = { id: string; product: string; amount: number; status: string; code: string | null; at: string };
type Home = { me: { name: string; points: number; plan: string | null; season: { level: number; pass: boolean; claimable: number } | null; vip: string | null }; products: Product[]; orders: Order[] };
type Phase = { s: "loading"; msg: string } | { s: "outside" } | { s: "error"; msg: string } | { s: "unlinked"; name: string } | { s: "ready" };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
const STATUS: Record<string, string> = { dispensed: "지급 완료", paid: "지급 중", awaiting_fulfillment: "수동 지급 대기", pending: "결제 대기", failed: "실패", expired: "만료", locked: "확인 중" };

export function ActivityApp() {
  const [phase, setPhase] = useState<Phase>({ s: "loading", msg: "디스코드와 연결하는 중…" });
  const [sdk, setSdk] = useState<DiscordSDKType | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [tab, setTab] = useState<"shop" | "orders">("shop");
  const [cat, setCat] = useState("전체");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Product | null>(null);

  const open = useCallback(
    (path: string) => {
      const url = path.startsWith("http") ? path : `${SITE}${path}`;
      if (sdk) void sdk.commands.openExternalLink({ url }).catch(() => null);
      else window.open(url, "_blank");
    },
    [sdk],
  );

  const load = useCallback(async (token: string) => {
    const r = await fetch("/api/discord-activity/home", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.status === 401) return setPhase({ s: "error", msg: "로그인이 끝났어요. 앱을 다시 열어 주세요." });
    setHome((await r.json()) as Home);
    setPhase({ s: "ready" });
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (!qs.get("frame_id")) return setPhase({ s: "outside" });
    let alive = true;
    (async () => {
      try {
        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
        const s = new DiscordSDK(CLIENT_ID);
        setSdk(s);
        await s.ready();
        setPhase({ s: "loading", msg: "로그인하는 중…" });
        const { code } = await s.commands.authorize({ client_id: CLIENT_ID, response_type: "code", state: "", prompt: "none", scope: ["identify"] });
        const r = await fetch("/api/discord-activity/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const j = (await r.json()) as { access_token?: string; session?: string | null; linked?: boolean; discord?: { name: string }; error?: string };
        if (!r.ok || !j.access_token) throw new Error(j.error || "로그인하지 못했어요.");
        await s.commands.authenticate({ access_token: j.access_token });
        if (!alive) return;
        if (!j.linked || !j.session) return setPhase({ s: "unlinked", name: j.discord?.name ?? "회원" });
        setSession(j.session);
        await load(j.session);
      } catch (e) {
        if (alive) setPhase({ s: "error", msg: e instanceof Error ? e.message : "연결하지 못했어요." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const cats = useMemo(() => ["전체", ...Array.from(new Set((home?.products ?? []).map((p) => p.category)))], [home]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (home?.products ?? []).filter((p) => (cat === "전체" || p.category === cat) && (!k || p.name.toLowerCase().includes(k)));
  }, [home, cat, q]);

  if (phase.s !== "ready" || !home) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0b0d12] p-6 text-center text-slate-200">
        <Gem className="size-10 text-emerald-400" />
        <p className="text-xl font-black">DOES 상점</p>
        {phase.s === "loading" ? <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" /> {phase.msg}</p> : null}
        {phase.s === "outside" ? <p className="text-sm text-slate-400">이 화면은 디스코드 앱 안(액티비티)에서 열려요.<br /><a className="text-emerald-400 underline" href={SITE}>웹 상점으로 가기</a></p> : null}
        {phase.s === "error" ? <p className="max-w-sm text-sm text-rose-400">{phase.msg}</p> : null}
        {phase.s === "unlinked" ? (
          <>
            <p className="max-w-sm text-sm text-slate-400">{phase.name}님, 아직 DOES 사이트 계정이 없어요. 사이트에서 <b>디스코드로 로그인</b>을 한 번만 하면 여기서 바로 쇼핑할 수 있어요.</p>
            <button onClick={() => open("/dashboard?tab=account")} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white"><ExternalLink className="size-4" /> 사이트에서 로그인</button>
          </>
        ) : null}
      </div>
    );
  }

  const me = home.me;
  return (
    <div className="min-h-screen bg-[#0b0d12] pb-20 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0b0d12]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.3em] text-emerald-400">DOES SHOP</p>
            <p className="truncate text-base font-black">{me.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {me.season ? <span className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300"><Medal className="size-3.5" /> Lv.{me.season.level}</span> : null}
            {me.vip ? <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold">{me.vip}</span> : null}
            <button onClick={() => open("/dashboard?tab=charge")} className="flex items-center gap-1 rounded-xl bg-emerald-500/15 px-3 py-1.5 text-sm font-black text-emerald-300">
              <Coins className="size-4" /> {won(me.points)}
            </button>
          </div>
        </div>
        {tab === "shop" ? (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <Search className="size-4 text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품 검색" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${cat === c ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-300"}`}>{c}</button>
              ))}
            </div>
          </>
        ) : null}
      </header>

      {tab === "shop" ? (
        <main className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-slate-500">조건에 맞는 상품이 없어요</p> : null}
          {list.map((p) => (
            <button key={p.id} onClick={() => setPick(p)} className="flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] text-left transition hover:border-emerald-500/40">
              <div className="flex aspect-[4/3] items-center justify-center bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" className="size-full object-cover" loading="lazy" /> : <Package className="size-8 text-slate-600" />}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="line-clamp-2 text-sm font-bold leading-snug">{p.name}</p>
                <div className="mt-auto flex items-end justify-between">
                  <div>
                    {p.originalPrice ? <p className="text-[11px] text-slate-500 line-through">{won(p.originalPrice)}</p> : null}
                    <p className="text-base font-black text-emerald-300">{won(p.price)}</p>
                  </div>
                  <span className="text-[11px] text-slate-500">재고 {p.stock}</span>
                </div>
              </div>
            </button>
          ))}
        </main>
      ) : (
        <main className="space-y-2 p-4">
          {home.orders.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">아직 주문이 없어요</p> : null}
          {home.orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-sm">
              <div className="flex justify-between gap-2">
                <p className="truncate font-bold">{o.product}</p>
                <span className={`shrink-0 text-xs font-bold ${o.status === "dispensed" ? "text-emerald-400" : "text-amber-400"}`}>{STATUS[o.status] ?? o.status}</span>
              </div>
              <p className="text-xs text-slate-500">{won(o.amount)} · {new Date(o.at).toLocaleString("ko-KR")}</p>
              {o.code ? <CodeBox code={o.code} /> : null}
            </div>
          ))}
        </main>
      )}

      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-white/5 bg-[#0b0d12]/95 backdrop-blur">
        <NavBtn on={tab === "shop"} onClick={() => setTab("shop")} icon={<Package className="size-5" />} label="상점" />
        <NavBtn on={tab === "orders"} onClick={() => setTab("orders")} icon={<Receipt className="size-5" />} label="내 주문" />
        <NavBtn on={false} onClick={() => open("/dashboard")} icon={<ExternalLink className="size-5" />} label="웹 전체 메뉴" />
      </nav>

      {pick ? (
        <BuySheet
          p={pick}
          points={me.points}
          session={session!}
          onClose={() => setPick(null)}
          onCharge={() => open("/dashboard?tab=charge")}
          onWeb={() => open(`/product/${pick.slug}`)}
          onDone={() => session && void load(session)}
        />
      ) : null}
    </div>
  );
}

function NavBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${on ? "text-emerald-400" : "text-slate-400"}`}>
      {icon}
      {label}
    </button>
  );
}

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-xl bg-black/40 p-2.5">
      <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-200">{code}</pre>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-emerald-400"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function BuySheet({ p, points, session, onClose, onCharge, onWeb, onDone }: { p: Product; points: number; session: string; onClose: () => void; onCharge: () => void; onWeb: () => void; onDone: () => void }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string | null; status: string; manualNotice: string | null } | null>(null);
  const short = points < p.price;

  const buy = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/discord-activity/buy", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` }, body: JSON.stringify({ productId: p.id, agreeTerms: true }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; order?: { code: string | null; status: string; manualNotice: string | null } } | null;
    setBusy(false);
    if (r?.ok && j?.ok && j.order) {
      setResult(j.order);
      onDone();
    } else setErr(j?.error || "구매하지 못했어요.");
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#14171f] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-lg font-black leading-snug">{p.name}</p>
          <button onClick={onClose} className="rounded-full bg-white/5 p-1.5"><X className="size-4" /></button>
        </div>
        {p.description ? <p className="mb-3 whitespace-pre-wrap text-sm text-slate-400">{p.description}</p> : null}
        {result ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1 font-bold text-emerald-400"><Check className="size-5" /> 구매 완료!</p>
            {result.code ? <CodeBox code={result.code} /> : <p className="text-sm text-slate-400">{result.manualNotice || "관리자가 확인하고 지급해요. 지급되면 DM으로 알려 드려요."}</p>}
            <p className="text-xs text-slate-500">지급 정보는 &lsquo;내 주문&rsquo;과 웹 이용 내역에서 언제든 다시 볼 수 있어요. 계정은 비밀번호 · 복구 이메일을 꼭 바꿔 주세요.</p>
          </div>
        ) : p.needsInput ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-400">이 상품은 구매할 때 추가 정보가 필요해서 웹에서 구매해요.</p>
            <button onClick={onWeb} className="flex w-full items-center justify-center gap-1 rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white"><ExternalLink className="size-4" /> 웹에서 구매하기</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-white/5 p-3 text-sm">
              <span className="text-slate-400">가격</span>
              <span className="text-xl font-black text-emerald-300">{won(p.price)}</span>
            </div>
            <p className="text-xs text-slate-500">내 포인트 {won(points)} · 등급 할인이 있으면 결제할 때 자동 적용돼요</p>
            {short ? (
              <button onClick={onCharge} className="w-full rounded-2xl bg-sky-500 py-3 text-sm font-bold text-white">포인트 충전하기 ({won(p.price - points)} 부족)</button>
            ) : (
              <>
                <label className="flex items-start gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
                  <span>DOES 이용약관 · 개인정보처리방침에 동의해요. (웹 구매와 같은 약관이에요)</span>
                </label>
                <button disabled={!agree || busy} onClick={buy} className="flex w-full items-center justify-center gap-1 rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} {won(p.price)} 결제하기
                </button>
              </>
            )}
            {err ? <p className="text-center text-sm text-rose-400">{err}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
