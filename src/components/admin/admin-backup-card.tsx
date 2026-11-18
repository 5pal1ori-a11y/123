"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Download, Loader2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Entry = { key: string; at: string; bytes: number; users: number; orders: number; products: number };

/** 관리자: 자동 DB 백업 목록 · 지금 백업 · 다운로드 */
export function AdminBackupCard({ shopSlug, onMessage }: { shopSlug: string; onMessage: (m: string) => void }) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/backup", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { backups?: Entry[] } | null;
    setRows(d?.backups ?? []);
  }, [shopSlug]);
  useEffect(() => { void load(); }, [load]);

  async function backupNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug) });
      if (!res.ok) throw new Error("백업하지 못했어요");
      onMessage("백업을 만들었어요");
      await load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "백업하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  const fmt = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="admin-bento p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold"><DatabaseBackup className="size-5" /> 자동 백업</h3>
        <button type="button" onClick={() => void backupNow()} disabled={busy} className="toss-admin-primary inline-flex items-center gap-2 px-4 disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} 지금 백업
        </button>
      </div>
      <p className="text-xs text-neutral-400">전체 데이터(상품·재고·주문·회원·설정)를 6시간마다 자동 백업해요. 최근 12개를 보관하고, 각 파일은 내려받아 보관할 수 있어요.</p>
      {rows.length ? (
        <ul className="mt-3 space-y-1.5">
          {rows.map((b) => (
            <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
              <span className="font-semibold">{fmt(b.at)}</span>
              <span className="text-xs text-neutral-400">상품 {b.products} · 주문 {b.orders} · 회원 {b.users} · {(b.bytes / 1024).toFixed(0)}KB</span>
              <a href={`/api/admin/backup?key=${encodeURIComponent(b.key)}`} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5">
                <Download className="size-3.5" /> 다운로드
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">아직 백업이 없어요 · 「지금 백업」을 눌러 보세요</p>
      )}
    </section>
  );
}
