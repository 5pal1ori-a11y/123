"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { InventoryItem } from "@/lib/types";

type Filter = "all" | "available" | "locked" | "sold";

const STATUS_LABEL: Record<InventoryItem["status"], string> = {
  available: "판매 가능",
  locked: "결제 대기",
  sold: "판매됨",
};

/** 상품별 재고 목록 — 전체 보기 · 검색 · 선택 삭제 (판매된 재고는 기록이라 삭제 불가) */
export function AdminStockList({
  shopSlug,
  productId,
  refreshKey,
  demoMode,
  onMessage,
  onChanged,
}: {
  shopSlug: string;
  productId: string;
  refreshKey: number;
  demoMode?: boolean;
  onMessage: (msg: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("available");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!productId || demoMode) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?productId=${encodeURIComponent(productId)}`, {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { inventories?: InventoryItem[]; error?: string };
      if (!res.ok) {
        onMessage(data.error ?? "재고를 불러오지 못했어요");
        return;
      }
      const list = (data.inventories ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(list);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [productId, shopSlug, demoMode, onMessage]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const counts = useMemo(() => {
    const c = { all: items.length, available: 0, locked: 0, sold: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(
      (i) => (filter === "all" || i.status === filter) && (!query || i.codeValue.toLowerCase().includes(query)),
    );
  }, [items, filter, q]);

  const deletable = visible.filter((i) => i.status !== "sold");
  const allChecked = deletable.length > 0 && deletable.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`재고 ${ids.length}개를 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "DELETE",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; skippedSold?: number; error?: string };
      if (!res.ok) {
        onMessage(data.error ?? "삭제 실패");
        return;
      }
      onMessage(
        `재고 ${data.deleted ?? 0}개 삭제됨${data.skippedSold ? ` · 판매된 ${data.skippedSold}개는 제외` : ""}`,
      );
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function copyVisible() {
    const text = visible.filter((i) => i.status !== "sold").map((i) => i.codeValue).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onMessage("보이는 재고를 복사했어요");
    } catch {
      onMessage("복사 실패");
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">등록된 재고</p>
        <div className="flex gap-2">
          <button type="button" className="toss-admin-ghost" onClick={() => void copyVisible()} disabled={!visible.length}>
            <Copy className="size-3.5" /> 복사
          </button>
          <button type="button" className="toss-admin-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> 새로고침
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["available", "locked", "sold", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? "border-white/25 bg-white text-black"
                : "border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08]"
            }`}
          >
            {f === "all" ? "전체" : STATUS_LABEL[f]} {counts[f]}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="재고 검색"
          className="toss-admin-field h-8 min-w-[140px] flex-1 py-1 text-xs"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-neutral-500" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">표시할 재고가 없어요</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allChecked}
                disabled={!deletable.length}
                onChange={() =>
                  setSelected(allChecked ? new Set() : new Set(deletable.map((i) => i.id)))
                }
              />
              보이는 재고 전체 선택 ({deletable.length})
            </label>
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void remove([...selected])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 font-semibold text-red-300 disabled:opacity-35"
            >
              <Trash2 className="size-3.5" /> 선택 삭제 {selected.size || ""}
            </button>
          </div>
          <ul className="max-h-[420px] divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10">
            {visible.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(i.id)}
                  disabled={i.status === "sold"}
                  onChange={() => toggle(i.id)}
                  aria-label="선택"
                />
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-200">{i.codeValue}</code>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${
                    i.status === "available"
                      ? "text-emerald-400"
                      : i.status === "locked"
                        ? "text-amber-300"
                        : "text-neutral-500"
                  }`}
                >
                  {STATUS_LABEL[i.status]}
                </span>
                <span className="hidden shrink-0 text-[10px] text-neutral-600 sm:inline">
                  {new Date(i.createdAt).toLocaleDateString("ko-KR")}
                </span>
                {i.status !== "sold" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove([i.id])}
                    className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : (
                  <span className="w-[22px] shrink-0" />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
