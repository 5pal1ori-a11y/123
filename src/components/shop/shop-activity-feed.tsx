"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { PublicActivityItem } from "@/lib/activity";
import { PanelEmpty, PanelList, PanelRow } from "@/components/admin/admin-panel-ui";

export function ShopActivityFeed({
  shopSlug,
  limit = 12,
  title = "실시간 활동",
  compact = false,
}: {
  shopSlug: string;
  limit?: number;
  title?: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<PublicActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/activity?limit=${limit}`, {
          headers: shopHeaders(shopSlug, false),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { activities: PublicActivityItem[] };
        if (!cancelled) setItems(json.activities ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopSlug, limit]);

  return (
    <div className={compact ? "space-y-3" : "admin-bento space-y-4 p-4 sm:p-5 lg:p-6"}>
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-neutral-500" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {loading ? (
        <p className="py-4 text-center text-sm text-neutral-500">불러오는 중…</p>
      ) : items.length === 0 ? (
        <PanelEmpty message="아직 공개할 활동이 없어요" />
      ) : (
        <PanelList>
          {items.map((item) => (
            <PanelRow key={item.id} className="items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {item.actorLabel}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-[11px] text-neutral-500">
                {new Date(item.createdAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </div>
  );
}
