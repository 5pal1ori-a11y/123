import type { StaffPermission } from "@/lib/types";
import { ALL_STAFF_PERMISSIONS } from "@/lib/types";

/** 소유자 또는 해당 권한을 가진 스태프인지 */
export function staffCan(
  opts: {
    isOwner: boolean;
    isSubAdmin: boolean;
    permissions?: StaffPermission[] | null;
  },
  need: StaffPermission,
): boolean {
  if (opts.isOwner) return true;
  if (!opts.isSubAdmin) return false;
  const perms = opts.permissions ?? [];
  // Empty permissions = deny-all (explicit grants required)
  if (perms.length === 0) return false;
  return perms.includes(need);
}

export function normalizeStaffPermissions(
  input: unknown,
): StaffPermission[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(ALL_STAFF_PERMISSIONS);
  return input.filter((p): p is StaffPermission => typeof p === "string" && set.has(p as StaffPermission));
}

export const STAFF_PERM_LABELS: Record<StaffPermission, string> = {
  billing: "결제·충전",
  products: "상품",
  orders: "주문",
  users: "고객",
  inquiries: "문의",
  settings: "스토어",
  bot: "봇",
  logs: "로그",
};
