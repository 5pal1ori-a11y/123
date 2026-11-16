"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Handshake, Loader2, RefreshCw, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { RESALE_CAPE_CHOICES, type ResaleRequest } from "@/lib/resale-shared";

const STATUS: Record<ResaleRequest["status"], { label: string; cls: string }> = {
  pending: { label: "검토 중", cls: "bg-amber-400/15 text-amber-300" },
  approved: { label: "승인", cls: "bg-emerald-400/15 text-emerald-300" },
  rejected: { label: "반려", cls: "bg-red-400/15 text-red-300" },
  cancelled: { label: "취소", cls: "bg-white/10 text-neutral-400" },
};

/** 관리자: 대리판매 신청 검토 — 승인하면 「대리판매」 카테고리 마크 계정으로 올라가고 신청자에게 DM 이 간다 */
export function AdminResalePanel({
  shopSlug,
  onReload,
  onMessage,
}: {
  shopSlug: string;
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
}) {
  const [list, setList] = useState<ResaleRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ r: ResaleRequest; price: string; email: string; password: string; extra: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/resale?all=1", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { requests?: ResaleRequest[] } | null;
    setList(data?.requests ?? []);
  }, [shopSlug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>, ok: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/resale/${id}`, { method: "PATCH", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "처리하지 못했어요");
      onMessage(ok);
      setOpen(null);
      await Promise.all([load(), onReload()]);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "처리하지 못했어요");
    } finally {
      setBusy(null);
    }
  }

  const pending = (list ?? []).filter((r) => r.status === "pending");
  const done = (list ?? []).filter((r) => r.status !== "pending").slice(0, 20);
  const capeText = (r: ResaleRequest) => r.capes.map((c) => RESALE_CAPE_CHOICES.find((x) => x.type === c)?.label ?? c).join(", ");
  const field = "toss-admin-field";

  return (
    <section className="admin-bento p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Handshake className="size-5" /> 대리판매 신청 <span className="text-sm font-medium text-neutral-500">{pending.length}</span>
        </h3>
        <button type="button" className="admin-icon-btn" onClick={() => void load()} title="새로고침">
          <RefreshCw className="size-4" />
        </button>
      </div>
      {list === null ? (
        <p className="flex items-center gap-2 py-6 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : pending.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">검토할 신청이 없어요</p>
      ) : (
        <ul className="grid gap-2">
          {pending.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="font-mono">{r.ign}</b>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{r.accountType}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{r.showName ? "닉네임 공개" : "닉네임 가림"}</span>
                <span className="ml-auto text-sm font-bold">{r.price.toLocaleString("ko-KR")}원</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                신청자 {r.userName}
                {r.discordId ? " · 디스코드 연동됨" : " · 디스코드 미연동 (DM 못 보냄)"} · 수수료 {r.feePercent}% · 정산 {r.payout.toLocaleString("ko-KR")}원
              </p>
              {r.capes.length ? <p className="mt-1 text-xs text-neutral-300">망토: {capeText(r)}</p> : null}
              {r.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-300">{r.description}</p> : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="toss-admin-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                  onClick={() => setOpen({ r, price: String(r.price), email: "", password: "", extra: "", reason: "" })}
                >
                  <Check className="size-3.5" /> 검토하기
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-neutral-500">처리된 신청 {done.length}개</summary>
          <ul className="mt-2 grid gap-1">
            {done.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                <span className="font-mono">{r.ign}</span>
                <span className="text-neutral-500">{r.userName}</span>
                <span className="ml-auto text-neutral-400">{r.price.toLocaleString("ko-KR")}원</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div className="admin-bento grid max-h-[92vh] w-full max-w-md gap-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-extrabold">대리판매 검토 · {open.r.ign}</h3>
              <button type="button" className="admin-icon-btn" onClick={() => setOpen(null)}>
                <X className="size-4" />
              </button>
            </div>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">판매 가격 (원)</span>
              <input className={field} inputMode="numeric" value={open.price} onChange={(e) => setOpen({ ...open, price: e.target.value.replace(/[^0-9]/g, "") })} />
            </label>
            <p className="text-xs text-neutral-500">
              계정 정보를 넣으면 구매 즉시 자동 지급돼요. 비우면 「수동 지급」 상품으로 올라가 판매 후 직접 전달하면 돼요.
            </p>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">이메일</span>
              <input className={`${field} font-mono`} value={open.email} onChange={(e) => setOpen({ ...open, email: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">비밀번호</span>
              <input className={`${field} font-mono`} value={open.password} onChange={(e) => setOpen({ ...open, password: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">기타 (복구 코드 등)</span>
              <input className={`${field} font-mono`} value={open.extra} onChange={(e) => setOpen({ ...open, extra: e.target.value })} />
            </label>
            <button
              type="button"
              disabled={busy === open.r.id}
              className="toss-admin-primary inline-flex items-center justify-center gap-2 py-2.5"
              onClick={() => {
                const code =
                  open.email.trim() && open.password.trim()
                    ? [`닉네임: ${open.r.ign}`, `이메일: ${open.email.trim()}`, `비밀번호: ${open.password.trim()}`, open.extra.trim() ? `메모: ${open.extra.trim()}` : ""]
                        .filter(Boolean)
                        .join(" | ")
                    : "";
                void act(open.r.id, { action: "approve", price: Number(open.price) || open.r.price, deliveryCode: code || undefined }, "승인했어요 · 신청자에게 DM 을 보냈어요");
              }}
            >
              {busy === open.r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              승인하고 상점에 올리기
            </button>
            <div className="mt-2 grid gap-2 border-t border-white/10 pt-3">
              <input className={field} placeholder="반려 사유 (선택)" value={open.reason} onChange={(e) => setOpen({ ...open, reason: e.target.value })} />
              <button
                type="button"
                disabled={busy === open.r.id}
                className="toss-admin-ghost inline-flex items-center justify-center gap-2 py-2 text-red-300"
                onClick={() => void act(open.r.id, { action: "reject", reason: open.reason }, "반려했어요")}
              >
                <X className="size-4" /> 반려
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
