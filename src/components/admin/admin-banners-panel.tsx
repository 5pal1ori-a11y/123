"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, EyeOff, ImageIcon, Loader2, X } from "lucide-react";
import { formatDate, formatKRW } from "@/lib/utils";
import type { ShopBannerAd, ShopSettings } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelList,
  PanelPrimaryBtn,
  PanelRow,
  PanelStats,
  PanelTabBody,
} from "./admin-panel-ui";

type TabId = "pending" | "live" | "all" | "pricing";

const TABS: { id: TabId; label: string }[] = [
  { id: "pending", label: "승인 대기" },
  { id: "live", label: "노출 중" },
  { id: "all", label: "전체" },
  { id: "pricing", label: "요금 설정" },
];

export function AdminBannersPanel({
  ads,
  settings,
  userLabel,
  onSavePricing,
  onReview,
  onTakeDown,
}: {
  ads: ShopBannerAd[];
  settings: Pick<ShopSettings, "bannerAdsEnabled" | "bannerWeeklyPrice" | "bannerMonthlyPrice">;
  userLabel: (userId: string) => string;
  onSavePricing: (body: {
    bannerAdsEnabled: boolean;
    bannerWeeklyPrice: number;
    bannerMonthlyPrice: number;
  }) => Promise<void> | void;
  onReview: (adId: string, decision: "approve" | "reject", rejectReason?: string) => Promise<void> | void;
  onTakeDown: (adId: string) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<TabId>("pending");
  const [enabled, setEnabled] = useState(settings.bannerAdsEnabled);
  const [weekly, setWeekly] = useState(String(settings.bannerWeeklyPrice));
  const [monthly, setMonthly] = useState(String(settings.bannerMonthlyPrice));
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(settings.bannerAdsEnabled);
    setWeekly(String(settings.bannerWeeklyPrice));
    setMonthly(String(settings.bannerMonthlyPrice));
  }, [settings.bannerAdsEnabled, settings.bannerWeeklyPrice, settings.bannerMonthlyPrice]);

  const pending = useMemo(() => ads.filter((a) => a.status === "pending"), [ads]);
  const live = useMemo(() => ads.filter((a) => a.status === "active"), [ads]);

  const list =
    tab === "pending" ? pending : tab === "live" ? live : tab === "all" ? ads : [];

  async function savePricing(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSavePricing({
        bannerAdsEnabled: enabled,
        bannerWeeklyPrice: Math.max(0, Number(weekly) || 0),
        bannerMonthlyPrice: Math.max(0, Number(monthly) || 0),
      });
    } finally {
      setSaving(false);
    }
  }

  async function review(adId: string, decision: "approve" | "reject") {
    const reason =
      decision === "reject" ? window.prompt("거절 사유 (선택)", "") ?? undefined : undefined;
    setBusyId(adId);
    try {
      await onReview(adId, decision, reason || undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function takeDown(adId: string, title: string) {
    if (!confirm(`「${title}」 배너를 지금 내릴까요?`)) return;
    setBusyId(adId);
    try {
      await onTakeDown(adId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PanelStats
        items={[
          { label: "승인 대기", value: String(pending.length) },
          { label: "노출 중", value: String(live.length) },
          { label: "주간 요금", value: formatKRW(settings.bannerWeeklyPrice) },
          { label: "월간 요금", value: formatKRW(settings.bannerMonthlyPrice) },
        ]}
      />

      <PanelFrame tabs={TABS} activeTab={tab} onTabChange={(id) => setTab(id as TabId)}>
        {tab === "pricing" ? (
          <PanelTabBody tabKey="pricing">
            <form onSubmit={(e) => void savePricing(e)} className="space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-neutral-300">마이페이지 배너 광고 사용</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-4"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <PanelField label="주간 요금 (포인트)">
                  <input
                    type="number"
                    min={0}
                    value={weekly}
                    onChange={(e) => setWeekly(e.target.value)}
                    className="toss-admin-field"
                  />
                </PanelField>
                <PanelField label="월간 요금 (포인트)">
                  <input
                    type="number"
                    min={0}
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                    className="toss-admin-field"
                  />
                </PanelField>
              </div>
              <p className="text-xs text-neutral-500">
                유저가 마이페이지 상단 배너를 구매하면 포인트가 차감되고, 여기서 승인하면 기간 동안
                노출됩니다. 거절 시 포인트는 환불됩니다.
              </p>
              <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="size-4 animate-spin" /> : "요금 저장"}
              </PanelPrimaryBtn>
            </form>
          </PanelTabBody>
        ) : (
          <PanelTabBody tabKey={tab}>
            {list.length === 0 ? (
              <PanelEmpty
                message={
                  tab === "pending"
                    ? "대기 중인 배너 신청이 없어요"
                    : tab === "live"
                      ? "현재 노출 중인 배너가 없어요"
                      : "배너 신청 내역이 없어요"
                }
              />
            ) : (
              <PanelList>
                {list.map((ad) => (
                  <PanelRow key={ad.id}>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="size-3.5 shrink-0 text-neutral-500" />
                          <p className="truncate font-medium text-white">{ad.title}</p>
                          <StatusPill status={ad.status} />
                        </div>
                        {ad.body ? (
                          <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{ad.body}</p>
                        ) : null}
                        <p className="mt-1.5 text-[11px] text-neutral-500">
                          {userLabel(ad.userId)} · {ad.period === "week" ? "주간" : "월간"} ·{" "}
                          {formatKRW(ad.amount)}
                          {ad.endsAt ? ` · ~${formatDate(ad.endsAt)}` : ""} · {formatDate(ad.createdAt)}
                        </p>
                        {ad.rejectReason ? (
                          <p className="mt-1 text-[11px] text-amber-300">거절: {ad.rejectReason}</p>
                        ) : null}
                      </div>
                      {ad.status === "pending" ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            disabled={busyId === ad.id}
                            onClick={() => void review(ad.id, "approve")}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                          >
                            {busyId === ad.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5" />
                            )}
                            승인
                          </button>
                          <button
                            type="button"
                            disabled={busyId === ad.id}
                            onClick={() => void review(ad.id, "reject")}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                          >
                            <X className="size-3.5" />
                            거절
                          </button>
                        </div>
                      ) : null}
                      {ad.status === "active" ? (
                        <button
                          type="button"
                          disabled={busyId === ad.id}
                          onClick={() => void takeDown(ad.id, ad.title)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-white/15 disabled:opacity-40"
                        >
                          {busyId === ad.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <EyeOff className="size-3.5" />
                          )}
                          배너 내리기
                        </button>
                      ) : null}
                    </div>
                  </PanelRow>
                ))}
              </PanelList>
            )}
          </PanelTabBody>
        )}
      </PanelFrame>
    </div>
  );
}

function StatusPill({ status }: { status: ShopBannerAd["status"] }) {
  const map: Record<ShopBannerAd["status"], string> = {
    pending: "bg-amber-500/15 text-amber-300",
    approved: "bg-neutral-500/15 text-neutral-300",
    rejected: "bg-red-500/15 text-red-300",
    active: "bg-emerald-500/15 text-emerald-300",
    expired: "bg-white/10 text-neutral-400",
  };
  const label: Record<ShopBannerAd["status"], string> = {
    pending: "대기",
    approved: "승인",
    rejected: "거절",
    active: "노출",
    expired: "만료",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}
