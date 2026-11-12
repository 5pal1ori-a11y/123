"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { ShopCoupon } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelList,
  PanelPrimaryBtn,
  PanelRow,
  PanelTabBody,
} from "./admin-panel-ui";

export function AdminCouponsPanel({
  coupons,
  onDeleteCoupon,
  onCreateCoupon,
}: {
  coupons: ShopCoupon[];
  onDeleteCoupon: (couponId: string, code: string) => void;
  onCreateCoupon: (body: {
    code: string;
    discountPercent: number;
    maxUses: number;
    days: number;
  }) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [form, setForm] = useState({
    code: "",
    discountPercent: "10",
    maxUses: "100",
    days: "30",
  });

  return (
    <PanelFrame
      stats={[
        { label: "쿠폰", value: coupons.length },
        {
          label: "사용됨",
          value: coupons.reduce((n, c) => n + c.usedCount, 0),
        },
      ]}
      tabs={[
        { id: "list", label: "쿠폰 목록" },
        { id: "create", label: "쿠폰 생성" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === "list" && (
        <PanelTabBody tabKey="list">
          {coupons.length === 0 ? (
            <PanelEmpty
              message="등록된 쿠폰이 없어요"
              action={
                <PanelPrimaryBtn className="px-6" onClick={() => setTab("create")}>
                  쿠폰 생성
                </PanelPrimaryBtn>
              }
            />
          ) : (
            <PanelList>
              {coupons.map((c) => (
                <PanelRow key={c.id}>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-medium text-accent">{c.code}</p>
                    <p className="text-xs text-neutral-500">
                      {c.discountPercent}% · {c.usedCount}/{c.maxUses} 사용
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCoupon(c.id, c.code)}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </PanelRow>
              ))}
            </PanelList>
          )}
        </PanelTabBody>
      )}

      {tab === "create" && (
        <PanelTabBody tabKey="create">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onCreateCoupon({
                code: form.code,
                discountPercent: Number(form.discountPercent),
                maxUses: Number(form.maxUses),
                days: Number(form.days),
              });
              if (ok) {
                setForm({ code: "", discountPercent: "10", maxUses: "100", days: "30" });
                setTab("list");
              }
            }}
            className="space-y-4"
          >
            <PanelField label="쿠폰 코드">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="toss-admin-field font-mono uppercase"
                required
              />
            </PanelField>
            <div className="grid gap-4 sm:grid-cols-3">
              <PanelField label="할인 %">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  className="toss-admin-field"
                  required
                />
              </PanelField>
              <PanelField label="최대 사용">
                <input
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  className="toss-admin-field"
                  required
                />
              </PanelField>
              <PanelField label="유효일">
                <input
                  type="number"
                  min={1}
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: e.target.value })}
                  className="toss-admin-field"
                />
              </PanelField>
            </div>
            <PanelPrimaryBtn type="submit" className="w-full sm:w-auto sm:min-w-[200px]">
              쿠폰 생성
            </PanelPrimaryBtn>
          </form>
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
