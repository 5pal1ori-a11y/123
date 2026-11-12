"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  Gift,
  ImageIcon,
  Loader2,
  Package,
  Timer,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import type { ShopSettings } from "@/lib/types";
import { PanelField, PanelPrimaryBtn } from "./admin-panel-ui";

type AutomationSettings = Pick<
  ShopSettings,
  | "autoChargeEnabled"
  | "lowStockAlertsEnabled"
  | "lowStockThreshold"
  | "bannerAdsEnabled"
  | "restockNotifyEnabled"
  | "autoExpireChargesEnabled"
  | "chargeExpireMinutes"
  | "dailySalesDigestEnabled"
  | "dailyDigestHourKst"
  | "bannerAutoApprove"
  | "tierUpgradeNotifyEnabled"
  | "welcomeBonusEnabled"
  | "welcomeBonusPoints"
>;

export function AdminAutomationPanel({
  settings,
  onSave,
  onOpenBilling,
  onOpenBanners,
}: {
  settings: AutomationSettings;
  onSave: (patch: Partial<AutomationSettings>) => Promise<boolean> | boolean;
  onOpenBilling: () => void;
  onOpenBanners: () => void;
}) {
  const [form, setForm] = useState(fromSettings(settings));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(fromSettings(settings));
  }, [settings]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        autoChargeEnabled: form.autoChargeEnabled,
        lowStockAlertsEnabled: form.lowStockAlertsEnabled,
        lowStockThreshold: Math.max(0, Number(form.lowStockThreshold) || 0),
        bannerAdsEnabled: form.bannerAdsEnabled,
        restockNotifyEnabled: form.restockNotifyEnabled,
        autoExpireChargesEnabled: form.autoExpireChargesEnabled,
        chargeExpireMinutes: Math.min(1440, Math.max(1, Number(form.chargeExpireMinutes) || 10)),
        dailySalesDigestEnabled: form.dailySalesDigestEnabled,
        dailyDigestHourKst: Math.min(23, Math.max(0, Number(form.dailyDigestHourKst) || 9)),
        bannerAutoApprove: form.bannerAutoApprove,
        tierUpgradeNotifyEnabled: form.tierUpgradeNotifyEnabled,
        welcomeBonusEnabled: form.welcomeBonusEnabled,
        welcomeBonusPoints: Math.max(0, Number(form.welcomeBonusPoints) || 0),
      });
    } finally {
      setSaving(false);
    }
  }

  const features = [
    {
      icon: Wallet,
      title: "자동 입금 확인",
      body: "입금되면 포인트를 바로 넣습니다.",
      on: form.autoChargeEnabled,
      toggle: () => setForm({ ...form, autoChargeEnabled: !form.autoChargeEnabled }),
      link: { label: "충전 설정", onClick: onOpenBilling },
    },
    {
      icon: Package,
      title: "재고 부족 알림",
      body: "재고가 적으면 알려 줍니다.",
      on: form.lowStockAlertsEnabled,
      toggle: () => setForm({ ...form, lowStockAlertsEnabled: !form.lowStockAlertsEnabled }),
    },
    {
      icon: BellRing,
      title: "재입고 알림",
      body: "관심 상품이 다시 들어오면 알려 줍니다.",
      on: form.restockNotifyEnabled,
      toggle: () => setForm({ ...form, restockNotifyEnabled: !form.restockNotifyEnabled }),
    },
    {
      icon: Timer,
      title: "대기 충전 만료",
      body: "오래 기다린 충전은 자동으로 끝냅니다.",
      on: form.autoExpireChargesEnabled,
      toggle: () => setForm({ ...form, autoExpireChargesEnabled: !form.autoExpireChargesEnabled }),
    },
    {
      icon: TrendingUp,
      title: "일일 매출 요약",
      body: "전날 판매·충전 합계를 알림으로 받습니다.",
      on: form.dailySalesDigestEnabled,
      toggle: () => setForm({ ...form, dailySalesDigestEnabled: !form.dailySalesDigestEnabled }),
    },
    {
      icon: ImageIcon,
      title: "배너 즉시 승인",
      body: "배너 신청을 바로 올립니다.",
      on: form.bannerAutoApprove,
      toggle: () => setForm({ ...form, bannerAutoApprove: !form.bannerAutoApprove }),
      link: { label: "배너 관리", onClick: onOpenBanners },
    },
    {
      icon: Zap,
      title: "등급 승급 알림",
      body: "등급이 오르면 유저에게 알려 줍니다.",
      on: form.tierUpgradeNotifyEnabled,
      toggle: () => setForm({ ...form, tierUpgradeNotifyEnabled: !form.tierUpgradeNotifyEnabled }),
    },
    {
      icon: Gift,
      title: "가입 환영 포인트",
      body: "새 회원에게 포인트를 줍니다.",
      on: form.welcomeBonusEnabled,
      toggle: () => setForm({ ...form, welcomeBonusEnabled: !form.welcomeBonusEnabled }),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="admin-bento space-y-2 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-[10px] bg-[var(--ad-accent-soft)] text-[var(--ad-accent)]">
            <Zap className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">운영 자동화</h3>
            <p className="mt-1 text-sm text-neutral-400">켜고 끄기만 하면 됩니다.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.title}
              type="button"
              onClick={f.toggle}
              className="admin-bento flex flex-col gap-3 p-4 text-left transition hover:border-white/20 sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-neutral-400" />
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    f.on ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-neutral-500"
                  }`}
                >
                  {f.on ? "ON" : "OFF"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-neutral-400">{f.body}</p>
              {f.link ? (
                <span
                  role="link"
                  tabIndex={0}
                  className="self-start text-xs font-medium text-neutral-300 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    f.link?.onClick();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      f.link?.onClick();
                    }
                  }}
                >
                  {f.link.label} →
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => void submit(e)} className="admin-bento space-y-4 p-5 sm:p-6">
        <h4 className="text-sm font-semibold text-white">세부 값</h4>
        <PanelField label="재고 부족 임계값">
          <input
            type="number"
            min={0}
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            className="toss-admin-field"
          />
        </PanelField>
        <PanelField label="대기 충전 만료 (분)">
          <input
            type="number"
            min={1}
            max={1440}
            value={form.chargeExpireMinutes}
            onChange={(e) => setForm({ ...form, chargeExpireMinutes: e.target.value })}
            className="toss-admin-field"
          />
        </PanelField>
        <PanelField label="일일 요약 시각 (KST 0–23)">
          <input
            type="number"
            min={0}
            max={23}
            value={form.dailyDigestHourKst}
            onChange={(e) => setForm({ ...form, dailyDigestHourKst: e.target.value })}
            className="toss-admin-field"
          />
        </PanelField>
        <PanelField label="환영 포인트">
          <input
            type="number"
            min={0}
            value={form.welcomeBonusPoints}
            onChange={(e) => setForm({ ...form, welcomeBonusPoints: e.target.value })}
            className="toss-admin-field"
          />
        </PanelField>
        <Toggle
          label="배너 광고 기능 자체"
          checked={form.bannerAdsEnabled}
          onChange={(v) => setForm({ ...form, bannerAdsEnabled: v })}
        />
        <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "자동화 설정 저장"}
        </PanelPrimaryBtn>
      </form>
    </div>
  );
}

function fromSettings(settings: AutomationSettings) {
  return {
    autoChargeEnabled: settings.autoChargeEnabled,
    lowStockAlertsEnabled: settings.lowStockAlertsEnabled,
    lowStockThreshold: String(settings.lowStockThreshold ?? 5),
    bannerAdsEnabled: settings.bannerAdsEnabled,
    restockNotifyEnabled: settings.restockNotifyEnabled ?? true,
    autoExpireChargesEnabled: settings.autoExpireChargesEnabled ?? true,
    chargeExpireMinutes: String(settings.chargeExpireMinutes ?? 10),
    dailySalesDigestEnabled: settings.dailySalesDigestEnabled ?? false,
    dailyDigestHourKst: String(settings.dailyDigestHourKst ?? 9),
    bannerAutoApprove: settings.bannerAutoApprove ?? false,
    tierUpgradeNotifyEnabled: settings.tierUpgradeNotifyEnabled ?? true,
    welcomeBonusEnabled: settings.welcomeBonusEnabled ?? false,
    welcomeBonusPoints: String(settings.welcomeBonusPoints ?? 1000),
  };
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-neutral-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
    </label>
  );
}
