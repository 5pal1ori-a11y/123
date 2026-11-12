"use client";

import { PanelListSkeleton } from "@/components/ui/skeleton";
import { adminLogLabel } from "@/lib/activity-labels";
import { shopHeaders } from "@/lib/shop-client";
import type { SystemLog } from "@/lib/types";
import { useEffect, useState } from "react";
import { PanelEmpty, PanelList, PanelRow, PanelStats } from "./admin-panel-ui";

export function AdminLogsPanel({ shopSlug }: { shopSlug: string }) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/logs?limit=120", {
          credentials: "include",
          headers: shopHeaders(shopSlug),
        });
        if (!res.ok) throw new Error("load");
        const json = (await res.json()) as { logs: SystemLog[] };
        if (!cancelled) setLogs(json.logs ?? []);
      } catch {
        if (!cancelled) setError("활동 로그를 불러오지 못했어요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopSlug]);

  return (
    <div className="space-y-5" aria-label="감사 로그">
      <PanelStats
        items={[
          { label: "최근 기록", value: logs.length },
          {
            label: "최신",
            value: logs[0]
              ? new Date(logs[0].createdAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
          },
        ]}
      />
      <div className="admin-bento p-4 sm:p-5">
        <p className="mb-3 text-xs text-neutral-500">
          누가 · 무엇을 · 언제 바꿨는지 기록됩니다. (감사 로그)
        </p>
        {loading ? (
          <PanelListSkeleton rows={6} />
        ) : error ? (
          <PanelEmpty message={error} />
        ) : logs.length === 0 ? (
          <PanelEmpty message="아직 활동 로그가 없어요" />
        ) : (
          <PanelList>
            {logs.map((log) => (
              <PanelRow key={log.id} className="items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{adminLogLabel(log.action)}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">
                    <span className="text-neutral-300">{log.actor}</span>
                    {log.action !== adminLogLabel(log.action) ? ` · ${log.action}` : ""}
                    {Object.keys(log.meta ?? {}).length > 0
                      ? ` · ${JSON.stringify(log.meta).slice(0, 100)}`
                      : ""}
                  </p>
                </div>
                <time
                  dateTime={log.createdAt}
                  className="shrink-0 text-[11px] text-neutral-500"
                >
                  {new Date(log.createdAt).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
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
