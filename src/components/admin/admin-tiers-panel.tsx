"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import type { ShopTier } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "list" | "create";

function TierRoleEditor({
  tier,
  onSave,
}: {
  tier: ShopTier;
  onSave: (tierId: string, roleId: string | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(tier.discordRoleId ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== (tier.discordRoleId ?? "");

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(tier.id, value.trim() || null);
        setSaving(false);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="지급할 역할 ID (비우면 지급 안 함)"
        inputMode="numeric"
        className="toss-admin-field h-9 min-w-0 flex-1 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={!dirty || saving}
        className="toss-admin-primary h-9 shrink-0 px-3 text-xs disabled:opacity-40"
      >
        {saving ? "저장 중…" : "역할 저장"}
      </button>
    </form>
  );
}

export function AdminTiersPanel({
  tiers,
  avgDiscount,
  onSave,
  onUpdateRole,
  onDelete,
}: {
  tiers: ShopTier[];
  avgDiscount: number;
  onSave: (body: {
    name: string;
    minTotalCharged: number;
    discountPercent: number;
    discordRoleId: string | null;
  }) => Promise<boolean>;
  onUpdateRole: (tierId: string, discordRoleId: string | null) => Promise<boolean>;
  onDelete: (tierId: string, name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("list");
  const [form, setForm] = useState({ name: "", minTotalCharged: "", discountPercent: "", discordRoleId: "" });

  function resetForm() {
    setForm({ name: "", minTotalCharged: "", discountPercent: "", discordRoleId: "" });
  }

  return (
    <PanelFrame
      stats={[
        { label: "등급 수", value: tiers.length },
        { label: "평균 할인", value: `${avgDiscount}%` },
        { label: "역할 연결", value: tiers.filter((t) => t.discordRoleId).length },
      ]}
      tabs={[
        { id: "list", label: "등급 목록" },
        { id: "create", label: "등급 추가" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === "list" && (
        <PanelTabBody tabKey="list">
          {tiers.length === 0 ? (
            <PanelEmpty
              message="등록된 등급이 없어요"
              action={
                <PanelPrimaryBtn className="px-6" onClick={() => setTab("create")}>
                  등급 추가
                </PanelPrimaryBtn>
              }
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-neutral-500">
                누적 충전액이 기준에 닿는 즉시 입력한 Discord 역할이 자동으로 지급돼요. 저장하면 이미 기준을 넘은
                회원에게도 지급됩니다.
              </p>
              <PanelList>
                {tiers.map((t) => (
                  <PanelRow key={t.id}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">{t.name}</p>
                      <p className="text-xs text-neutral-500">
                        {formatKRW(t.minTotalCharged)} 이상 · {t.discountPercent}% 할인
                      </p>
                      <TierRoleEditor key={`${t.id}:${t.discordRoleId ?? ""}`} tier={t} onSave={onUpdateRole} />
                    </div>
                    <button
                      type="button"
                      onClick={() => onDelete(t.id, t.name)}
                      className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </PanelRow>
                ))}
              </PanelList>
            </>
          )}
        </PanelTabBody>
      )}

      {tab === "create" && (
        <PanelTabBody tabKey="create">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onSave({
                name: form.name.trim(),
                minTotalCharged: Number(form.minTotalCharged || 0),
                discountPercent: Number(form.discountPercent || 0),
                discordRoleId: form.discordRoleId.trim() || null,
              });
              if (ok) {
                resetForm();
                setTab("list");
              }
            }}
            className="space-y-4"
          >
            <PanelField label="등급 이름">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="toss-admin-field"
                required
              />
            </PanelField>
            <div className="grid gap-4 sm:grid-cols-2">
              <PanelField label="최소 누적 충전액">
                <input
                  type="number"
                  min={0}
                  value={form.minTotalCharged}
                  onChange={(e) => setForm({ ...form, minTotalCharged: e.target.value })}
                  className="toss-admin-field"
                  required
                />
              </PanelField>
              <PanelField label="할인율 (%)">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  className="toss-admin-field"
                  required
                />
              </PanelField>
            </div>
            <PanelField label="지급 역할 ID (선택)">
              <input
                value={form.discordRoleId}
                onChange={(e) => setForm({ ...form, discordRoleId: e.target.value })}
                placeholder="예: 1432601807216967793"
                inputMode="numeric"
                className="toss-admin-field"
              />
            </PanelField>
            <PanelPrimaryBtn type="submit" className="w-full sm:w-auto sm:min-w-[200px]">
              등급 추가
            </PanelPrimaryBtn>
          </form>
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
