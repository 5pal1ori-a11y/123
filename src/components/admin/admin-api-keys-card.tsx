"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Meta = { set: boolean; source: "dashboard" | "env" | null; masked: string | null; updatedAt: string | null };

const ROWS = [
  { name: "hypixel" as const, title: "Hypixel API 키", help: "developer.hypixel.net 에서 받은 키 (개발 키는 하루마다 바뀌어요 — 매일 여기에 새 키를 넣어 주세요)" },
  { name: "donut" as const, title: "DonutSMP API 키", help: "게임 안에서 /api 로 받은 키 — 넣으면 계정 상세에 도넛 통계가 보여요" },
];

/** 관리자: 외부 API 키 넣기 (하이픽셀 · 도넛SMP) */
export function AdminApiKeysCard({ shopSlug, onMessage }: { shopSlug: string; onMessage: (m: string) => void }) {
  const [meta, setMeta] = useState<Record<string, Meta> | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({ hypixel: "", donut: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/api-keys", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    setMeta(((await res?.json().catch(() => null)) as Record<string, Meta> | null) ?? null);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(name: "hypixel" | "donut") {
    setBusy(name);
    try {
      const res = await fetch("/api/admin/api-keys", { method: "PUT", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify({ name, key: vals[name] ?? "" }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "저장하지 못했어요");
      setVals((v) => ({ ...v, [name]: "" }));
      onMessage(name === "hypixel" ? "하이픽셀 키를 확인하고 저장했어요" : "도넛SMP 키를 저장했어요");
      await load();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "저장하지 못했어요");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-bento p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <KeyRound className="size-5" /> API 키
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {ROWS.map((r) => {
          const m = meta?.[r.name];
          const updated = m?.updatedAt ? new Date(m.updatedAt) : null;
          const today = updated ? updated.toDateString() === new Date().toDateString() : false;
          return (
            <div key={r.name} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{r.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m?.set ? (r.name === "hypixel" && !today && m.source === "dashboard" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300") : "bg-white/10 text-neutral-400"}`}>
                  {m?.set
                    ? `${m.masked}${updated ? ` · ${updated.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : " · 환경변수"}`
                    : "없음"}
                </span>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(r.name);
                }}
              >
                <input
                  className="toss-admin-field min-w-0 flex-1 font-mono"
                  value={vals[r.name] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [r.name]: e.target.value }))}
                  placeholder="새 키 붙여넣기"
                />
                <button type="submit" disabled={busy === r.name || !(vals[r.name] ?? "").trim()} className="toss-admin-primary shrink-0 px-4 disabled:opacity-40">
                  {busy === r.name ? <Loader2 className="size-4 animate-spin" /> : "저장"}
                </button>
              </form>
              <p className="text-[11px] text-neutral-500">{r.help}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
