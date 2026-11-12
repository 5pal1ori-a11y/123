"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Link2, PlugZap, RefreshCw } from "lucide-react";
import { fadeUp, vxTransition } from "@/lib/motion";
import { shopHeaders } from "@/lib/shop-client";

type MfaSnapshot = {
  url: string | null;
  keyHint: string | null;
  configured: boolean;
  products: { id: string; name: string; mfaProduct: string | null; stock: number | null }[];
};

export function MfaMarketPanel({ shopSlug }: { shopSlug: string }) {
  const [snap, setSnap] = useState<MfaSnapshot | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [remote, setRemote] = useState<{ product: string; available: number }[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/mfa", { credentials: "include", headers: shopHeaders(shopSlug, false) });
    if (!res.ok) return;
    const data = (await res.json()) as MfaSnapshot;
    setSnap(data);
    setUrl(data.url ?? "");
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, data };
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await post({ action: "save", url: url.trim() || null, ...(key.trim() ? { key: key.trim() } : {}) });
    if (!ok) return setMsg({ ok: false, text: String(data.error ?? "저장 실패") });
    setSnap(data as unknown as MfaSnapshot);
    setKey("");
    setMsg({ ok: true, text: "저장되었습니다." });
  }

  async function test() {
    const { ok, data } = await post({ action: "test" });
    if (!ok) return setMsg({ ok: false, text: String(data.error ?? "연결 실패") });
    setRemote((data.products as { product: string; available: number }[]) ?? []);
    setMsg({ ok: true, text: `연결 성공 · 전체 재고 ${String(data.available ?? 0)}개` });
  }

  async function refresh() {
    const { ok, data } = await post({ action: "refresh" });
    if (!ok) return setMsg({ ok: false, text: String(data.error ?? "갱신 실패") });
    setSnap(data as unknown as MfaSnapshot);
    setMsg({ ok: true, text: "재고를 갱신했습니다." });
  }

  return (
    <motion.div
      className="toss-admin-panel is-wide px-1"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={{ ...vxTransition, delay: 0.04 }}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-neutral-500/15 text-neutral-300">
          <PlugZap className="size-5" />
        </span>
        <div>
          <h3 className="toss-admin-title text-lg">MFA MARKET 연동</h3>
          <p className="toss-admin-hint text-xs">
            연동 상품이 팔리면 MFA MARKET 재고에서 계정을 배정하고, 구매자 DM·구매내역에 16자리 코드와 확인 링크를 보냅니다.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs text-neutral-400">
            <Link2 className="size-3.5" /> API 주소
          </span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mc-account-delivery.xxxx.workers.dev"
            className="toss-admin-field font-mono text-sm"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs text-neutral-400">
            <KeyRound className="size-3.5" /> 파트너 API 키
            {snap?.keyHint ? <span className="text-neutral-500">· 저장됨 (…{snap.keyHint})</span> : null}
          </span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={snap?.keyHint ? "변경할 때만 입력" : "mfa_…"}
            className="toss-admin-field font-mono text-sm"
            autoComplete="new-password"
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" disabled={busy} className="admin-btn">
            저장
          </button>
          <button type="button" disabled={busy || !snap?.configured} onClick={test} className="toss-admin-ghost">
            <PlugZap className="size-3.5" /> 연결 테스트
          </button>
          <button type="button" disabled={busy || !snap?.configured} onClick={refresh} className="toss-admin-ghost">
            <RefreshCw className="size-3.5" /> 재고 갱신
          </button>
        </div>
        {msg ? (
          <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        ) : null}
      </form>

      {remote ? (
        <div className="mt-6">
          <p className="mb-2 text-xs text-neutral-400">MFA MARKET 재고 (상품 종류별)</p>
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 text-sm">
            {remote.length === 0 ? (
              <li className="px-4 py-3 text-neutral-500">재고 없음</li>
            ) : (
              remote.map((r) => (
                <li key={r.product || "_"} className="flex justify-between px-4 py-2.5">
                  <span className="text-white">{r.product || "(종류 미지정)"}</span>
                  <span className="text-neutral-400">{r.available}개</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="mb-2 text-xs text-neutral-400">연동된 상품</p>
        {snap?.products.length ? (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 text-sm">
            {snap.products.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-white">{p.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {p.mfaProduct} · 재고 {p.stock ?? "-"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-white/10 px-4 py-3 text-xs text-neutral-500">
            상품 관리 → 상품 수정에서 「MFA MARKET 연동」 칸에 상품 종류(예: Normal MFA)를 입력하면 연동됩니다.
          </p>
        )}
      </div>
    </motion.div>
  );
}
