"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Crown, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { PREMIUM_PLANS, type PremiumPlanId } from "@/lib/premium-plans";

type Key = { key: string; plan: PremiumPlanId; days: number; createdAt: string; note: string; usedBy: string | null; usedAt: string | null; usedByName: string | null };
type Sub = { userId: string; name: string; discordUsername: string | null; plan: PremiumPlanId; active: boolean; expiresAt: string };

const d = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");

/** 관리자: 프리미엄 플랜 라이선스 키 발급 · 구독 회원 */
export function AdminPremiumPanel({ shopSlug, onMessage }: { shopSlug: string; onMessage: (m: string) => void }) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [plan, setPlan] = useState<PremiumPlanId>("plus");
  const [count, setCount] = useState("1");
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [who, setWho] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/premium/admin", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { keys?: Key[]; subs?: Sub[] } | null;
    setKeys(data?.keys ?? []);
    setSubs(data?.subs ?? []);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/premium/admin", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; keys?: Key[] };
      if (!res.ok) throw new Error(data.error || "처리하지 못했어요");
      if (data.keys) setFresh(data.keys.map((k) => k.key));
      onMessage(ok);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const field = "toss-admin-field";
  const unused = (keys ?? []).filter((k) => !k.usedBy);
  const used = (keys ?? []).filter((k) => k.usedBy);

  return (
    <div className="space-y-5">
      <section className="admin-bento p-4 sm:p-5">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold">
          <KeyRound className="size-5" /> 라이선스 키 발급
        </h3>
        <p className="mb-4 text-xs text-neutral-500">
          계좌이체로 결제한 손님에게 키를 보내 주세요. 손님이 「프리미엄 플랜」 탭에서 키를 넣으면 바로 적용돼요. (포인트로 구독하면 키가 자동 발급돼요)
        </p>
        <div className="grid gap-2 sm:grid-cols-5">
          <select className={field} value={plan} onChange={(e) => setPlan(e.target.value as PremiumPlanId)}>
            <option value="basic">BASIC PASS (₩{PREMIUM_PLANS.basic.price.toLocaleString("ko-KR")})</option>
            <option value="plus">DOES PASS+ (₩{PREMIUM_PLANS.plus.price.toLocaleString("ko-KR")})</option>
          </select>
          <input className={field} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} placeholder="개수" />
          <input className={field} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="일수" />
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (입금자 등)" />
          <button
            type="button"
            disabled={busy}
            className="toss-admin-primary inline-flex items-center justify-center gap-2"
            onClick={() => void post({ action: "create", plan, count: Math.max(1, Number(count) || 1), days: Math.max(1, Number(days) || 30), note }, "키를 만들었어요")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} 발급
          </button>
        </div>
        {fresh.length ? (
          <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-emerald-200">
              <span>방금 만든 키 {fresh.length}개</span>
              <button type="button" className="inline-flex items-center gap-1" onClick={() => void navigator.clipboard?.writeText(fresh.join("\n")).then(() => onMessage("복사했어요"))}>
                <Copy className="size-3.5" /> 전체 복사
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm">{fresh.join("\n")}</pre>
          </div>
        ) : null}
      </section>

      <section className="admin-bento p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Crown className="size-5" /> 구독 회원 <span className="text-sm font-medium text-neutral-500">{subs.filter((s) => s.active).length}명 이용 중</span>
          </h3>
          <button type="button" className="admin-icon-btn" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </button>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input className={field} value={who} onChange={(e) => setWho(e.target.value)} placeholder="회원 이메일 · 이름 · 디스코드 ID" />
          <button type="button" disabled={busy || !who.trim()} className="toss-admin-primary px-4" onClick={() => void post({ action: "set", who, plan, days: Number(days) || 30 }, "구독을 적용했어요")}>
            {PREMIUM_PLANS[plan].name} {Number(days) || 30}일 적용
          </button>
          <button type="button" disabled={busy || !who.trim()} className="toss-admin-ghost px-4 text-red-300" onClick={() => void post({ action: "set", who, plan: null }, "구독을 해지했어요")}>
            해지
          </button>
        </div>
        {subs.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500">아직 구독 회원이 없어요</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm">
            {subs.map((s) => (
              <li key={s.userId} className="flex items-center gap-2 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.active ? "bg-amber-400/15 text-amber-300" : "bg-white/10 text-neutral-500"}`}>
                  {PREMIUM_PLANS[s.plan].name}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {s.name}
                  {s.discordUsername ? <span className="text-neutral-500"> · @{s.discordUsername}</span> : null}
                </span>
                <span className="text-xs text-neutral-400">{s.active ? `${d(s.expiresAt)} 까지` : "만료"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-bento p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-bold">
          발급된 키 <span className="text-sm font-medium text-neutral-500">미사용 {unused.length} · 사용 {used.length}</span>
        </h3>
        {keys === null ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-white/10 overflow-y-auto text-sm">
            {[...unused, ...used].map((k) => (
              <li key={k.key} className="flex items-center gap-2 py-2">
                <code className={`font-mono ${k.usedBy ? "text-neutral-500 line-through" : ""}`}>{k.key}</code>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{PREMIUM_PLANS[k.plan].name} · {k.days}일</span>
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{k.usedBy ? `${k.usedByName} · ${k.usedAt ? d(k.usedAt) : ""}` : k.note}</span>
                {!k.usedBy ? (
                  <>
                    <button type="button" className="admin-icon-btn" title="복사" onClick={() => void navigator.clipboard?.writeText(k.key).then(() => onMessage("복사했어요"))}>
                      <Copy className="size-3.5" />
                    </button>
                    <button type="button" className="admin-icon-btn" title="삭제" onClick={() => void post({ action: "delete", key: k.key }, "키를 지웠어요")}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
