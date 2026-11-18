"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Row = { productId: string; name: string; active: boolean; lastAt: string | null; issue: string | null; stopped: boolean; strikes: number };

/** 관리자: 체크락 — 판매 중인 마크 계정 공개 정보 점검 상태 */
export function AdminChecklockCard({ shopSlug, onMessage }: { shopSlug: string; onMessage: (m: string) => void }) {
  const [data, setData] = useState<{ lastRun: string | null; rows: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/checklock", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    setData(((await res?.json().catch(() => null)) as typeof data) ?? null);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/checklock", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug) });
      const r = (await res.json().catch(() => ({}))) as { checked?: number; flagged?: { name: string }[]; error?: string };
      if (!res.ok) throw new Error(r.error || "점검하지 못했어요");
      onMessage(`계정 ${r.checked ?? 0}개를 점검했어요${r.flagged?.length ? ` · ${r.flagged.length}개 판매 중지` : ""}`);
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "점검하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  const bad = rows.filter((r) => r.issue);
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

  return (
    <section className="admin-bento p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5" /> 체크락
        </h3>
        <button type="button" onClick={() => void runNow()} disabled={busy} className="toss-admin-primary inline-flex items-center gap-2 px-4 disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} 지금 점검
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        판매 중인 마크 계정을 30분마다 공개 정보로 점검해요 (로그인하지 않음). 닉네임이 사라지거나 바뀌면 두 번 연속 확인 후 판매를 자동으로 멈추고, 관리자 로그 채널로 알려요.
        <br />
        마이크로소프트 보안 잠금은 로그인해야만 알 수 있어서 여기서는 확인하지 않아요. · 마지막 점검 {fmt(data?.lastRun ?? null)}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 px-3 py-2 text-sm">점검 대상 <b>{rows.filter((r) => r.active).length}</b>개</div>
        <div className="rounded-xl border border-white/10 px-3 py-2 text-sm">문제 <b className={bad.length ? "text-red-300" : ""}>{bad.length}</b>개</div>
        <div className="rounded-xl border border-white/10 px-3 py-2 text-sm">자동 중지 <b>{rows.filter((r) => r.stopped).length}</b>개</div>
      </div>
      {bad.length ? (
        <ul className="mt-3 space-y-1.5">
          {bad.map((r) => (
            <li key={r.productId} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${r.stopped ? "border-red-400/40 bg-red-500/10" : "border-amber-400/30 bg-amber-500/5"}`}>
              <span className="font-semibold">{r.name}</span>
              <span className="text-xs text-neutral-300">
                {r.issue} · {r.stopped ? "판매 중지됨 (확인 후 상품을 다시 켜면 새 기준으로 점검)" : r.strikes ? `한 번 더 확인되면 중지` : "경고"} · {fmt(r.lastAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-emerald-300">{data?.lastRun ? "지금까지 문제가 없어요" : "아직 점검 기록이 없어요 · 「지금 점검」을 눌러 보세요"}</p>
      )}
    </section>
  );
}
