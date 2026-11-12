"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { PanelListSkeleton } from "@/components/ui/skeleton";
import { shopHeaders } from "@/lib/shop-client";
import { PanelEmpty, PanelList, PanelRow, PanelStats } from "./admin-panel-ui";

type Who = { userId: string; email: string | null; discord: string | null };
type ChatRow = Who & { name: string; message: string; at: string };
type PlayerRow = Who & { name: string; inPlaza: boolean };

const REFRESH_MS = 10_000;

export function AdminWorldChatPanel({ shopSlug }: { shopSlug: string }) {
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/world-chat", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        chat?: ChatRow[];
        players?: PlayerRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "채팅 기록을 불러오지 못했어요.");
      setChat(json.chat ?? []);
      setPlayers(json.players ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "채팅 기록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chat;
    return chat.filter((c) =>
      [c.name, c.message, c.email ?? "", c.discord ?? ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [chat, query]);

  return (
    <div className="space-y-5" aria-label="마크 월드 채팅">
      <PanelStats
        items={[
          { label: "지금 접속", value: `${players.length}명` },
          { label: "광장에 있음", value: `${players.filter((p) => p.inPlaza).length}명` },
          { label: "저장된 채팅 (7일)", value: chat.length },
        ]}
      />

      {players.length > 0 ? (
        <div className="admin-bento p-4 sm:p-5">
          <p className="mb-3 text-xs text-neutral-500">지금 월드에 있는 사람</p>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <span
                key={p.userId}
                title={p.email ?? p.userId}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-200"
              >
                {p.name}
                {p.inPlaza ? <span className="ml-1.5 text-emerald-400">광장</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-bento p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-neutral-500">
            광장 채팅을 최신순으로 보여줘요. 10초마다 새로 불러와요.
          </p>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="닉네임 · 내용 검색"
              className="toss-admin-field !h-9 !py-1.5 !pl-8 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-neutral-300 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            새로고침
          </button>
        </div>
        {loading ? (
          <PanelListSkeleton rows={6} />
        ) : error ? (
          <PanelEmpty message={error} />
        ) : filtered.length === 0 ? (
          <PanelEmpty message={query ? "검색 결과가 없어요" : "아직 월드 채팅이 없어요"} />
        ) : (
          <PanelList>
            {filtered.map((c, i) => (
              <PanelRow key={`${c.at}-${i}`} className="items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    <span className="font-semibold text-emerald-300">{c.name}</span>
                    <span className="ml-2 break-words text-neutral-100">{c.message}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {c.email ?? c.userId}
                    {c.discord ? ` · @${c.discord}` : ""}
                  </p>
                </div>
                <time dateTime={c.at} className="shrink-0 text-[11px] text-neutral-500">
                  {new Date(c.at).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </PanelRow>
            ))}
          </PanelList>
        )}
      </div>
    </div>
  );
}
