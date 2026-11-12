"use client";

import { useEffect, useState } from "react";
import { shopHeaders } from "@/lib/shop-client";
import { ImageIcon, Music, Shield, Store } from "lucide-react";
import { AdminPane, AdminStat } from "./admin-bento";
import { formatDate } from "@/lib/utils";
import { formatPlanLabel } from "@/lib/plans";
import type { LicensePlan, ShopSettings, SubscriptionStatus } from "@/lib/types";

type StoreShop = {
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  adminUsername: string;
  plan: LicensePlan;
  expiresAt: string;
  graceUntil: string;
  subscription: SubscriptionStatus;
};

type StoreSettingsForm = {
  name: string;
  tagline: string;
  logoUrl: string;
  welcomeMessage: string;
  discordInviteUrl: string;
  backgroundMusicUrl: string;
  backgroundMusicEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  termsVersion: string;
  termsBody: string;
  privacyVersion: string;
  privacyBody: string;
  adminUsername: string;
  adminPassword: string;
};

function toForm(shop: StoreShop, settings: ShopSettings): StoreSettingsForm {
  return {
    name: shop.name,
    tagline: shop.tagline,
    logoUrl: shop.logoUrl ?? "",
    welcomeMessage: settings.welcomeMessage,
    discordInviteUrl: settings.discordInviteUrl ?? "",
    backgroundMusicUrl: settings.backgroundMusicUrl ?? "",
    backgroundMusicEnabled: settings.backgroundMusicEnabled,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage || "잠시 점검 중이에요. 곧 다시 열려요.",
    termsVersion: settings.termsVersion || "1.0",
    termsBody: settings.termsBody || "",
    privacyVersion: settings.privacyVersion || "1.0",
    privacyBody: settings.privacyBody || "",
    adminUsername: shop.adminUsername,
    adminPassword: "",
  };
}

export function StoreSettingsPanel({
  shop,
  settings,
  saving,
  licenseKey,
  onLicenseKeyChange,
  onExtendLicense,
  onSave,
}: {
  shop: StoreShop;
  settings: ShopSettings;
  saving: boolean;
  licenseKey: string;
  onLicenseKeyChange: (value: string) => void;
  onExtendLicense: (e: React.FormEvent) => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState(() => toForm(shop, settings));

  useEffect(() => {
    setForm(toForm(shop, settings));
  }, [shop, settings]);

  const subLabel =
    shop.subscription === "active"
      ? "이용 중"
      : shop.subscription === "grace"
        ? "유예 기간"
        : "만료";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      action: "save-store-settings",
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      logoUrl: form.logoUrl.trim() || null,
      welcomeMessage: form.welcomeMessage.trim(),
      discordInviteUrl: form.discordInviteUrl.trim() || null,
      backgroundMusicUrl: form.backgroundMusicUrl.trim() || null,
      backgroundMusicEnabled: form.backgroundMusicEnabled,
      maintenanceMode: form.maintenanceMode,
      maintenanceMessage: form.maintenanceMessage.trim(),
      termsVersion: form.termsVersion.trim() || "1.0",
      termsBody: form.termsBody.trim(),
      privacyVersion: form.privacyVersion.trim() || "1.0",
      privacyBody: form.privacyBody.trim(),
      adminUsername: form.adminUsername.trim(),
    };
    if (form.adminPassword.trim()) {
      body.adminPassword = form.adminPassword;
    }
    const ok = await onSave(body);
    if (ok) setForm((prev) => ({ ...prev, adminPassword: "" }));
  }

  const logoPreview = form.logoUrl.trim();

  return (
    <div className="admin-bento-grid">
      <AdminPane
        title="스토어 설정"
        className="lg:col-span-12"
        action={
          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Store className="size-3.5" />
            {shop.slug}.vendix.team
          </span>
        }
      >
        <p className="text-sm text-neutral-500">
          스토어 기본 정보, 배경음악, 관리자 계정 등을 한곳에서 설정할 수 있습니다.
        </p>
      </AdminPane>

      <AdminStat
        className="lg:col-span-4"
        label="현재 플랜"
        value={formatPlanLabel(shop.plan)}
        hint={`만료 ${new Date(shop.expiresAt).getUTCFullYear() >= 9999 ? "무제한" : formatDate(shop.expiresAt)} · ${subLabel}`}
      />
      <AdminPane title="플랜 한도 안내" className="lg:col-span-8">
        <p className="text-sm text-neutral-300">
          {shop.plan === "free"
            ? "FREE · 상품 최대 20개 · 카테고리 최대 5개"
            : `${formatPlanLabel(shop.plan)} · 상품·카테고리 무제한`}
        </p>
        <p className="mt-2 text-[11px] text-neutral-500">
          사용량은 상품 관리 탭 상단에서 확인할 수 있어요. 한도 초과 시 등록이 막힙니다.
        </p>
      </AdminPane>
      <AdminPane title="라이선스 연장" className="lg:col-span-12">
        <p className="mb-3 text-xs text-neutral-500">
          만료 후 7일 이내에 라이선스 키를 입력하면 30일 연장(부활)됩니다.
        </p>
        <form onSubmit={onExtendLicense} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={licenseKey}
            onChange={(e) => onLicenseKeyChange(e.target.value)}
            placeholder="DOES-XXXX-XXXX-XX"
            className="admin-input flex-1 font-mono text-sm"
            required
          />
          <button type="submit" disabled={saving} className="admin-btn shrink-0">
            연장하기
          </button>
        </form>
      </AdminPane>

      <form onSubmit={handleSubmit} className="contents">
        <AdminPane title="기본 정보" className="lg:col-span-6">
          <div className="space-y-4">
            <label className="block text-sm text-neutral-400">
              스토어명
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="내 상점 이름"
                className="admin-input mt-1"
                required
              />
            </label>
            <label className="block text-sm text-neutral-400">
              한 줄 소개
              <input
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                placeholder="상점을 소개하는 짧은 문구"
                className="admin-input mt-1"
              />
            </label>
            <label className="block text-sm text-neutral-400">
              환영 메시지
              <input
                value={form.welcomeMessage}
                onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                placeholder="고객에게 보여줄 인사말"
                className="admin-input mt-1"
              />
            </label>
            <label className="block text-sm text-neutral-400">
              Discord 초대 링크
              <input
                value={form.discordInviteUrl}
                onChange={(e) => setForm({ ...form, discordInviteUrl: e.target.value })}
                placeholder="https://discord.gg/..."
                className="admin-input mt-1"
              />
            </label>
          </div>
        </AdminPane>

        <AdminPane title="스토어 사진" className="lg:col-span-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-10 text-neutral-600" strokeWidth={1.25} />
              )}
            </div>
            <label className="block flex-1 text-sm text-neutral-400">
              이미지 URL
              <input
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="https://..."
                className="admin-input mt-1"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                상점·관리자에 표시
              </span>
            </label>
          </div>
        </AdminPane>

        <AdminPane title="배경음악" className="lg:col-span-6">
          <div className="space-y-4">
            <label className="block text-sm text-neutral-400">
              <span className="mb-1 flex items-center gap-1.5">
                <Music className="size-3.5" />
                음악 URL
              </span>
              <input
                value={form.backgroundMusicUrl}
                onChange={(e) => setForm({ ...form, backgroundMusicUrl: e.target.value })}
                placeholder="https://..."
                className="admin-input mt-1"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg bg-black/30 p-4">
              <div>
                <p className="font-medium text-white">자동 재생</p>
                <p className="text-xs text-neutral-500">상점에서 틀기</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setForm({ ...form, backgroundMusicEnabled: !form.backgroundMusicEnabled })
                }
                className={`relative h-8 w-14 rounded-full transition ${
                  form.backgroundMusicEnabled ? "bg-accent" : "bg-neutral-700"
                }`}
                aria-pressed={form.backgroundMusicEnabled}
              >
                <span
                  className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${
                    form.backgroundMusicEnabled ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </AdminPane>

        <AdminPane title="스토어 관리자" className="lg:col-span-6">
          <div className="space-y-4">
            <label className="block text-sm text-neutral-400">
              <span className="mb-1 flex items-center gap-1.5">
                <Shield className="size-3.5" />
                관리자 아이디
              </span>
              <input
                value={form.adminUsername}
                onChange={(e) => setForm({ ...form, adminUsername: e.target.value })}
                placeholder="admin"
                className="admin-input mt-1"
                required
              />
            </label>
            <label className="block text-sm text-neutral-400">
              새 비밀번호
              <input
                type="password"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                placeholder="변경할 때만 (4자 이상)"
                className="admin-input mt-1"
                autoComplete="new-password"
              />
            </label>
            <div className="flex items-center justify-between rounded-lg bg-black/30 p-4">
              <div>
                <p className="font-medium text-white">점검 모드</p>
                <p className="text-xs text-neutral-500">고객 접속 시 점검 안내 표시</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setForm({ ...form, maintenanceMode: !form.maintenanceMode })}
                className={`relative h-8 w-14 rounded-full transition ${
                  form.maintenanceMode ? "bg-orange-500" : "bg-neutral-700"
                }`}
                aria-pressed={form.maintenanceMode}
              >
                <span
                  className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${
                    form.maintenanceMode ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
            {form.maintenanceMode ? (
              <label className="block text-sm">
                <span className="text-neutral-400">점검 안내 문구</span>
                <input
                  value={form.maintenanceMessage}
                  onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
                  className="admin-input mt-1"
                  maxLength={200}
                />
              </label>
            ) : null}
          </div>
        </AdminPane>

        <AdminPane title="약관 · 개인정보 버전" className="lg:col-span-12">
          <p className="mb-4 text-xs text-neutral-500">
            버전을 올리면 신규 가입 시 새 버전에 동의합니다. (기존 회원은 기록된 동의 버전을 유지)
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-neutral-400">
              이용약관 버전
              <input
                value={form.termsVersion}
                onChange={(e) => setForm({ ...form, termsVersion: e.target.value })}
                className="admin-input mt-1 font-mono text-sm"
                placeholder="1.0"
              />
            </label>
            <label className="block text-sm text-neutral-400">
              개인정보 버전
              <input
                value={form.privacyVersion}
                onChange={(e) => setForm({ ...form, privacyVersion: e.target.value })}
                className="admin-input mt-1 font-mono text-sm"
                placeholder="1.0"
              />
            </label>
            <label className="block text-sm text-neutral-400 sm:col-span-1">
              이용약관 본문
              <textarea
                value={form.termsBody}
                onChange={(e) => setForm({ ...form, termsBody: e.target.value })}
                rows={5}
                className="admin-input mt-1"
              />
            </label>
            <label className="block text-sm text-neutral-400 sm:col-span-1">
              개인정보 처리방침 본문
              <textarea
                value={form.privacyBody}
                onChange={(e) => setForm({ ...form, privacyBody: e.target.value })}
                rows={5}
                className="admin-input mt-1"
              />
            </label>
          </div>
        </AdminPane>

        <AdminPane className="lg:col-span-12">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5"
              onClick={async () => {
                const res = await fetch("/api/admin/backup", {
                  credentials: "include",
                  headers: shopHeaders(shop.slug),
                });
                if (!res.ok) return;
                const json = await res.json();
                const blob = new Blob([JSON.stringify(json, null, 2)], {
                  type: "application/json",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `does-backup-${shop.slug}.json`;
                a.click();
              }}
            >
              백업 다운로드
            </button>
            <label className="cursor-pointer rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/5">
              백업 복원
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const json = JSON.parse(text) as Record<string, unknown>;
                    const res = await fetch("/api/admin/backup", {
                      method: "POST",
                      credentials: "include",
                      headers: {
                        "Content-Type": "application/json",
                        ...shopHeaders(shop.slug),
                      },
                      body: JSON.stringify(json),
                    });
                    if (res.ok) window.location.reload();
                  } catch {
                    /* ignore */
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <button type="submit" disabled={saving} className="admin-btn w-full sm:w-auto sm:min-w-48">
            스토어 설정 저장
          </button>
        </AdminPane>
      </form>
    </div>
  );
}
