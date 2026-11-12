"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { ShopReview } from "@/lib/types";
import type { ReviewFeed } from "@/lib/review-feed";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "pending" | "approved" | "discord";

function DiscordFeedSettings({ shopSlug, onMessage }: { shopSlug: string; onMessage: (msg: string) => void }) {
  const [channelId, setChannelId] = useState("");
  const [feed, setFeed] = useState<ReviewFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/feed?limit=3&fresh=1", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
        cache: "no-store",
      });
      if (res.ok) setFeed((await res.json()) as ReviewFeed);
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/shop?type=settings", { credentials: "include", headers: shopHeaders(shopSlug) });
      if (res.ok) {
        const data = (await res.json()) as { settings?: { reviewFeedChannelId?: string | null } };
        setChannelId(data.settings?.reviewFeedChannelId ?? "");
      }
    })();
    void refresh();
  }, [shopSlug, refresh]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/shop", {
        method: "PATCH",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ reviewFeedChannelId: channelId.trim() }),
      });
      onMessage(res.ok ? "후기 채널 저장됨" : "저장 실패 (채널 ID는 숫자만)");
      if (res.ok) await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <PanelField label="디스코드 후기 채널 ID (비워두면 이름에 '후기'가 들어간 채널을 자동 감지)">
        <input
          value={channelId}
          onChange={(e) => setChannelId(e.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          placeholder="예: 1432601807216967999"
          className="toss-admin-field font-mono"
        />
      </PanelField>
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-white">연동 상태</p>
          <button
            type="button"
            className="toss-admin-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            다시 확인
          </button>
        </div>
        <p className="mt-2 text-neutral-500">
          {feed
            ? feed.channelId
              ? `채널 ${feed.channelId} · 후기 ${feed.total.toLocaleString()}개`
              : "후기 채널을 찾지 못했어요. 채널 ID를 직접 입력하세요. (봇에게 채널 보기·기록 읽기 권한 필요)"
            : "확인 중…"}
        </p>
        {feed?.items.slice(0, 3).map((r) => (
          <p key={r.id} className="mt-1.5 truncate text-xs text-neutral-400">
            {r.displayName}
            {r.username ? ` (@${r.username})` : ""} · {r.body}
          </p>
        ))}
      </div>
      <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto sm:min-w-[200px]">
        {saving ? "저장 중…" : "저장"}
      </PanelPrimaryBtn>
    </form>
  );
}

export function AdminReviewsPanel({
  shopSlug,
  onMessage,
  reviews,
  pendingCount,
  approvedCount,
  authorEmail,
  onSave,
  onToggleApprove,
  onDelete,
}: {
  shopSlug: string;
  onMessage: (msg: string) => void;
  reviews: ShopReview[];
  pendingCount: number;
  approvedCount: number;
  authorEmail: (userId: string) => string;
  onSave: (reviewId: string, body: string) => Promise<boolean | void>;
  onToggleApprove: (review: ShopReview) => void;
  onDelete: (reviewId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [edits, setEdits] = useState<Record<string, { body: string }>>({});

  const pending = reviews.filter((r) => !r.approved);
  const approved = reviews.filter((r) => r.approved);
  const list = tab === "pending" ? pending : approved;

  function getEdit(r: ShopReview) {
    return edits[r.id] ?? { body: r.body };
  }

  function setEdit(r: ShopReview, patch: Partial<{ body: string }>) {
    setEdits((prev) => ({
      ...prev,
      [r.id]: { ...getEdit(r), ...patch },
    }));
  }

  return (
    <PanelFrame
      stats={[
        { label: "승인 대기", value: pendingCount, warn: pendingCount > 0 },
        { label: "승인됨", value: approvedCount },
      ]}
      tabs={[
        { id: "pending", label: `대기 (${pendingCount})` },
        { id: "approved", label: `승인 (${approvedCount})` },
        { id: "discord", label: "디스코드 연동" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      <PanelTabBody tabKey={tab}>
        {tab === "discord" ? (
          <DiscordFeedSettings shopSlug={shopSlug} onMessage={onMessage} />
        ) : list.length === 0 ? (
          <PanelEmpty message={tab === "pending" ? "대기 중인 후기가 없어요" : "승인된 후기가 없어요"} />
        ) : (
          <div className="space-y-3">
            {list.map((r) => {
              const edit = getEdit(r);
              return (
                <div
                  key={r.id}
                  className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{authorEmail(r.userId)}</p>
                    <span className={r.approved ? "text-xs text-accent" : "text-xs text-neutral-500"}>
                      {r.approved ? "승인됨" : "대기"}
                    </span>
                  </div>
                  <PanelField label="내용">
                    <textarea
                      value={edit.body}
                      onChange={(e) => setEdit(r, { body: e.target.value })}
                      rows={3}
                      className="toss-admin-field resize-y"
                    />
                  </PanelField>
                  <div className="flex flex-wrap gap-2">
                    <PanelPrimaryBtn
                      className="px-4 py-2 text-sm"
                      onClick={() => void onSave(r.id, edit.body)}
                    >
                      저장
                    </PanelPrimaryBtn>
                    <button
                      type="button"
                      className="toss-admin-ghost px-4 py-2 text-sm"
                      onClick={() => onToggleApprove(r)}
                    >
                      {r.approved ? "승인 취소" : "승인"}
                    </button>
                    <button
                      type="button"
                      className="toss-admin-ghost px-4 py-2 text-sm text-red-400"
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="mr-1 inline size-3.5" />
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PanelTabBody>
    </PanelFrame>
  );
}
