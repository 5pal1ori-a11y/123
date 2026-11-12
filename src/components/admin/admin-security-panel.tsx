"use client";

import { Shield } from "lucide-react";
import type { ShopSettings } from "@/lib/types";
import { PanelField, PanelPrimaryBtn } from "@/components/admin/admin-panel-ui";

type SecurityForm = {
  adminIpWhitelist: string;
  lowStockThreshold: string;
  lowStockAlertsEnabled: boolean;
  salesGoalDaily: string;
  koreaOnlyAccess: boolean;
  blockVpnProxy: boolean;
  maskPiiInAdmin: boolean;
  loginMicrosoftEnabled: boolean;
  loginDiscordEnabled: boolean;
};

export function AdminSecurityPanel({
  settings,
  saving,
  onSave,
}: {
  settings: ShopSettings;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const form: SecurityForm = {
    adminIpWhitelist: (settings.adminIpWhitelist ?? []).join("\n"),
    lowStockThreshold: String(settings.lowStockThreshold ?? 5),
    lowStockAlertsEnabled: settings.lowStockAlertsEnabled ?? true,
    salesGoalDaily: settings.salesGoalDaily != null ? String(settings.salesGoalDaily) : "",
    koreaOnlyAccess: settings.koreaOnlyAccess ?? false,
    blockVpnProxy: settings.blockVpnProxy ?? false,
    maskPiiInAdmin: settings.maskPiiInAdmin ?? true,
    loginMicrosoftEnabled: settings.loginMicrosoftEnabled !== false,
    loginDiscordEnabled: settings.loginDiscordEnabled !== false,
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const adminIpWhitelist = String(fd.get("adminIpWhitelist") ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const goalRaw = String(fd.get("salesGoalDaily") ?? "").trim();
    await onSave({
      action: "save-account",
      adminIpWhitelist,
      lowStockThreshold: Math.max(0, Number(fd.get("lowStockThreshold")) || 5),
      lowStockAlertsEnabled: fd.get("lowStockAlertsEnabled") === "on",
      salesGoalDaily: goalRaw ? Math.max(0, Number(goalRaw) || 0) : null,
      koreaOnlyAccess: fd.get("koreaOnlyAccess") === "on",
      blockVpnProxy: fd.get("blockVpnProxy") === "on",
      maskPiiInAdmin: fd.get("maskPiiInAdmin") === "on",
      loginMicrosoftEnabled: fd.get("loginMicrosoftEnabled") === "on",
      loginDiscordEnabled: fd.get("loginDiscordEnabled") === "on",
    });
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Shield className="size-4 text-neutral-500" /> 보안
      </p>
      <PanelField label="하루 매출 목표" hint="비우면 자동">
        <input
          name="salesGoalDaily"
          type="number"
          min={0}
          step={1000}
          defaultValue={form.salesGoalDaily}
          className="admin-input w-full"
          placeholder="예: 100000"
        />
      </PanelField>
      <PanelField label="관리자 IP 허용" hint="한 줄에 하나 · 비우면 모두 허용">
        <textarea
          name="adminIpWhitelist"
          defaultValue={form.adminIpWhitelist}
          rows={3}
          className="admin-input w-full font-mono text-xs"
          placeholder="203.0.113.10"
        />
      </PanelField>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs font-medium text-neutral-300">소셜 로그인</p>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="loginMicrosoftEnabled"
            defaultChecked={form.loginMicrosoftEnabled}
            value="on"
            className="mt-0.5 size-4 rounded"
          />
          <span>
            Microsoft 로그인
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              마인크래프트 정품 계정으로 로그인 · 닉네임과 스킨이 자동으로 들어와요
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="loginDiscordEnabled"
            defaultChecked={form.loginDiscordEnabled}
            value="on"
            className="mt-0.5 size-4 rounded"
          />
          <span>
            Discord 로그인
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              꺼도 이미 로그인한 회원의 Discord 연동은 그대로 쓸 수 있어요
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs font-medium text-neutral-300">방문 제한</p>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="koreaOnlyAccess"
            defaultChecked={form.koreaOnlyAccess}
            value="on"
            className="mt-0.5 size-4 rounded"
          />
          <span>
            한국만 허용
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              관리자 화면은 예외
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="blockVpnProxy"
            defaultChecked={form.blockVpnProxy}
            value="on"
            className="mt-0.5 size-4 rounded"
          />
          <span>
            VPN 차단
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              VPN·프록시 접속을 막습니다
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="maskPiiInAdmin"
            defaultChecked={form.maskPiiInAdmin}
            value="on"
            className="mt-0.5 size-4 rounded"
          />
          <span>
            개인정보 가리기
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              이메일·IP를 일부만 보여 줍니다
            </span>
          </span>
        </label>
      </div>

      <PanelField label="재고 부족 기준">
        <input
          name="lowStockThreshold"
          type="number"
          min={0}
          defaultValue={form.lowStockThreshold}
          className="admin-input w-full"
        />
      </PanelField>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="lowStockAlertsEnabled"
          defaultChecked={form.lowStockAlertsEnabled}
          value="on"
          className="size-4 rounded"
        />
        재고 부족 알림
      </label>
      <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto">
        보안 설정 저장
      </PanelPrimaryBtn>
    </form>
  );
}
