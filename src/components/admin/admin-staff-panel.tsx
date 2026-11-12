"use client";

import type { AdminNotification, ShopUser } from "@/lib/types";
import { STAFF_PERM_LABELS } from "@/lib/staff-perms";
import { PanelEmpty, PanelList, PanelRow, PanelStats } from "./admin-panel-ui";

export function AdminStaffPanel({
  users,
  onOpenUsers,
}: {
  users: Omit<ShopUser, "passwordHash">[];
  onOpenUsers: () => void;
}) {
  const staff = users.filter((u) => u.isSubAdmin);

  return (
    <div className="space-y-5">
      <PanelStats
        items={[
          { label: "스태프", value: staff.length },
          { label: "전체 유저", value: users.length },
        ]}
      />
      <div className="admin-bento p-4 sm:p-5">
        {staff.length === 0 ? (
          <PanelEmpty
            message="지정된 스태프가 없어요. 유저관리에서 부관리자를 켜 주세요."
            action={
              <button
                type="button"
                onClick={onOpenUsers}
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.08] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-white/[0.12]"
              >
                유저관리로 이동
              </button>
            }
          />
        ) : (
          <PanelList>
            {staff.map((u) => {
              const perms = u.staffPermissions ?? [];
              return (
                <PanelRow key={u.id}>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                    {(u.name || u.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{u.name || u.email}</p>
                    <p className="truncate text-[12px] text-neutral-500">{u.email}</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {perms.length === 0
                        ? "권한: 전체"
                        : perms.map((p) => STAFF_PERM_LABELS[p] ?? p).join(" · ")}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--ad-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ad-accent)]">
                    부관리자
                  </span>
                </PanelRow>
              );
            })}
          </PanelList>
        )}
      </div>
    </div>
  );
}

export function AdminNotificationsPanel({
  notifications,
  onOpenBilling,
}: {
  notifications: AdminNotification[];
  onOpenBilling: () => void;
}) {
  return (
    <div className="space-y-5">
      <PanelStats
        items={[
          { label: "알림", value: notifications.length },
          {
            label: "미확인",
            value: notifications.filter((n) => !n.read).length,
            warn: notifications.some((n) => !n.read),
          },
        ]}
      />
      <div className="admin-bento p-4 sm:p-5">
        {notifications.length === 0 ? (
          <PanelEmpty
            message="새 알림이 없어요"
            action={
              <button
                type="button"
                onClick={onOpenBilling}
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.08] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-white/[0.12]"
              >
                계좌·충전 알림 설정
              </button>
            }
          />
        ) : (
          <PanelList>
            {notifications.map((n) => (
              <PanelRow key={n.id} className="items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="mt-0.5 text-[13px] text-neutral-400">{n.body}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {new Date(n.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                {!n.read ? (
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--ad-accent)]" />
                ) : null}
              </PanelRow>
            ))}
          </PanelList>
        )}
      </div>
    </div>
  );
}
