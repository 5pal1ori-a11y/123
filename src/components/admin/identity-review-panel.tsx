"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, X, Check } from "lucide-react";

type Record = {
  id: string;
  status: "pending" | "approved" | "rejected";
  realName: string | null;
  userName: string | null;
  userEmail: string | null;
  discordId: string | null;
  hasImage: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
};

export function IdentityReviewPanel() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/identity-verify", { credentials: "include" });
      const data = (await res.json().catch(() => null)) as { records?: Record[] } | null;
      setRecords(data?.records ?? []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, approve: boolean) => {
    if (!approve) {
      const reason = window.prompt("반려 사유를 입력하세요 (손님에게 전달됩니다)", "신분증이 명확하지 않습니다");
      if (reason === null) return;
      setBusy(id);
      await act(id, false, reason);
    } else {
      setBusy(id);
      await act(id, true);
    }
  };

  const act = async (id: string, approve: boolean, reason?: string) => {
    try {
      const res = await fetch("/api/admin/identity-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recordId: id, approve, reason }),
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  };

  const pending = records.filter((r) => r.status === "pending");
  const done = records.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <div className="toss-admin-panel is-wide px-1">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">본인인증 검토</h3>
          <p className="text-xs text-neutral-500">신분증 사진을 확인하고 승인/거절하세요. 승인 시 사진은 자동 삭제됩니다.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-neutral-400">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">대기 중인 신청이 없어요.</p>}

          {pending.map((r) => (
            <div key={r.id} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-white">
                  <span className="font-semibold">{r.realName || r.userName || "이름 미입력"}</span>
                  <span className="ml-2 text-xs text-neutral-500">{r.userEmail}</span>
                  {r.discordId && <span className="ml-2 text-xs text-indigo-300">Discord: {r.discordId}</span>}
                </div>
                <span className="text-xs text-neutral-500">{new Date(r.submittedAt).toLocaleString("ko-KR")}</span>
              </div>

              {r.hasImage && (
                <a href={`/api/admin/identity-verify/image/${r.id}`} target="_blank" rel="noreferrer" className="mt-3 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/admin/identity-verify/image/${r.id}`} alt="신분증" className="max-h-60 rounded-lg border border-white/10 object-contain" />
                </a>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => review(r.id, true)}
                  disabled={busy === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} 승인
                </button>
                <button
                  onClick={() => review(r.id, false)}
                  disabled={busy === r.id}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  <X className="size-4" /> 거절
                </button>
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-neutral-500">처리 완료</p>
              <div className="space-y-1.5">
                {done.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                    <span className="text-neutral-300">{r.realName || r.userName || r.userEmail}</span>
                    <span className={r.status === "approved" ? "text-emerald-400" : "text-rose-400"}>
                      {r.status === "approved" ? "승인됨" : `거절됨${r.rejectReason ? ` · ${r.rejectReason}` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
