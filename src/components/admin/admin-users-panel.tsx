"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ShopTier, ShopUser } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "list" | "detail";
type UserRow = Omit<ShopUser, "passwordHash">;

export function AdminUsersPanel({
  users,
  tiers,
  subAdminCount,
  pointsSum,
  onUpdate,
  onDelete,
}: {
  users: UserRow[];
  tiers: ShopTier[];
  subAdminCount: number;
  pointsSum: number;
  onUpdate: (
    userId: string,
    patch: {
      pointsDelta?: number;
      tierId?: string | null;
      isSubAdmin?: boolean;
      staffPermissions?: import("@/lib/types").StaffPermission[];
      banned?: boolean;
      banReason?: string | null;
    },
  ) => Promise<void>;
  onDelete: (userId: string, email: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pointsDelta, setPointsDelta] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }, [users, search]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  function openUser(userId: string) {
    setSelectedId(userId);
    setPointsDelta("");
    setTab("detail");
  }

  return (
    <PanelFrame
      stats={[
        { label: "회원", value: users.length },
        { label: "부관리자", value: subAdminCount },
        { label: "총 포인트", value: pointsSum.toLocaleString() },
      ]}
      tabs={[
        { id: "list", label: "회원 목록" },
        { id: "detail", label: selected ? (selected.name || selected.email) : "회원 상세" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === "list" && (
        <PanelTabBody tabKey="list">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 · 이메일 검색"
            className="toss-admin-field mb-4"
          />
          {filtered.length === 0 ? (
            <PanelEmpty message="검색 결과가 없어요" />
          ) : (
            <PanelList>
              {filtered.map((u) => (
                <PanelRow key={u.id}>
                  <button
                    type="button"
                    onClick={() => openUser(u.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium text-white">
                      {u.name || "이름 없음"}
                      {u.isSubAdmin ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-accent">
                          부관리자
                        </span>
                      ) : null}
                      {u.banned ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-red-400">
                          제재
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {u.email} · {u.points.toLocaleString()}P
                    </p>
                  </button>
                </PanelRow>
              ))}
            </PanelList>
          )}
        </PanelTabBody>
      )}

      {tab === "detail" && (
        <PanelTabBody tabKey="detail">
          {!selected ? (
            <PanelEmpty
              message="목록에서 회원을 선택하세요"
              action={
                <PanelPrimaryBtn className="px-6" onClick={() => setTab("list")}>
                  목록으로
                </PanelPrimaryBtn>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="font-semibold text-white">{selected.name || "이름 없음"}</p>
                <p className="mt-1 text-sm text-neutral-500">{selected.email}</p>
                <p className="mt-2 text-xs text-neutral-600">가입 {formatDate(selected.createdAt)}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  포인트{" "}
                  <span className="font-medium text-white">{selected.points.toLocaleString()}P</span>
                </p>
              </div>

              <PanelField label="포인트 조정" hint="+/- 숫자">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={pointsDelta}
                    onChange={(e) => setPointsDelta(e.target.value)}
                    placeholder="예: 1000 또는 -500"
                    className="toss-admin-field flex-1"
                  />
                  <PanelPrimaryBtn
                    className="shrink-0 px-5"
                    disabled={!pointsDelta}
                    onClick={() =>
                      void onUpdate(selected.id, { pointsDelta: Number(pointsDelta) }).then(() =>
                        setPointsDelta(""),
                      )
                    }
                  >
                    적용
                  </PanelPrimaryBtn>
                </div>
              </PanelField>

              <PanelField label="등급">
                <select
                  value={selected.tierId ?? ""}
                  onChange={(e) =>
                    void onUpdate(selected.id, { tierId: e.target.value || null })
                  }
                  className="toss-admin-field"
                >
                  <option value="">없음</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </PanelField>

              <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                <span className="text-sm text-neutral-300">부관리자 권한</span>
                <input
                  type="checkbox"
                  checked={selected.isSubAdmin}
                  onChange={(e) => void onUpdate(selected.id, { isSubAdmin: e.target.checked })}
                  className="size-4 accent-accent"
                />
              </label>

              {selected.isSubAdmin ? (
                <div className="rounded-2xl border border-white/10 p-4">
                  <p className="mb-2 text-xs font-medium text-neutral-400">스태프 권한 (비우면 전체)</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        "billing",
                        "products",
                        "orders",
                        "users",
                        "inquiries",
                        "settings",
                        "bot",
                        "logs",
                      ] as const
                    ).map((perm) => {
                      const on = (selected.staffPermissions ?? []).includes(perm);
                      return (
                        <button
                          key={perm}
                          type="button"
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            on
                              ? "bg-neutral-500/20 text-neutral-200"
                              : "bg-white/5 text-neutral-500"
                          }`}
                          onClick={() => {
                            const cur = new Set(selected.staffPermissions ?? []);
                            if (on) cur.delete(perm);
                            else cur.add(perm);
                            void onUpdate(selected.id, {
                              staffPermissions: [...cur],
                            });
                          }}
                        >
                          {perm}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 rounded-2xl border border-red-500/20 p-4">
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm text-neutral-300">제재(블랙리스트)</span>
                  <input
                    type="checkbox"
                    checked={selected.banned}
                    onChange={(e) =>
                      void onUpdate(selected.id, {
                        banned: e.target.checked,
                        banReason: e.target.checked
                          ? selected.banReason || "운영 정책 위반"
                          : null,
                      })
                    }
                    className="size-4 accent-red-500"
                  />
                </label>
                {selected.banned ? (
                  <input
                    value={selected.banReason ?? ""}
                    onChange={(e) =>
                      void onUpdate(selected.id, { banReason: e.target.value || null })
                    }
                    placeholder="제재 사유"
                    className="toss-admin-field"
                  />
                ) : null}
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 py-3 text-sm text-red-400 hover:bg-red-500/10"
                onClick={() => onDelete(selected.id, selected.email)}
              >
                <Trash2 className="size-4" />
                회원 삭제
              </button>

              <button
                type="button"
                className="toss-admin-ghost w-full py-3 text-sm"
                onClick={() => setTab("list")}
              >
                목록으로
              </button>
            </div>
          )}
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
