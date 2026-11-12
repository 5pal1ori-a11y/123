import type { SystemLog } from "@/lib/types";
import { listLogs } from "@/lib/store";

export type PublicActivityItem = {
  id: string;
  action: string;
  label: string;
  detail: string | null;
  actorLabel: string;
  createdAt: string;
};

const PUBLIC_ACTIONS = new Set([
  "order.points",
  "order.paid",
  "order.dispensed",
  "charge.complete",
  "user.register",
  "user.google",
  "inventory.bulk_add",
  "banner.approve",
  "banner.purchase",
  "product.create",
  "notice.create",
  "event.create",
]);

function maskActor(actor: string) {
  const a = actor.trim();
  if (!a || a === "admin" || a === "buyer" || a === "user" || a === "platform-admin") {
    return "상점";
  }
  if (a.includes("@")) {
    const [local, domain] = a.split("@");
    const head = (local ?? "").slice(0, 2) || "*";
    return `${head}***@${domain ?? "***"}`;
  }
  if (a.length <= 2) return `${a}*`;
  return `${a.slice(0, 2)}***`;
}

function friendlyLabel(action: string): string {
  switch (action) {
    case "order.points":
    case "order.paid":
    case "order.dispensed":
      return "상품 구매";
    case "charge.complete":
      return "포인트 충전";
    case "user.register":
    case "user.google":
      return "신규 가입";
    case "inventory.bulk_add":
      return "재고 입고";
    case "banner.approve":
      return "배너 광고 게시";
    case "banner.purchase":
      return "배너 광고 신청";
    case "product.create":
      return "새 상품 등록";
    case "notice.create":
      return "공지 등록";
    case "event.create":
      return "이벤트 시작";
    default:
      return action;
  }
}

function friendlyDetail(log: SystemLog): string | null {
  const meta = log.meta ?? {};
  if (typeof meta.price === "number") return `${meta.price.toLocaleString()}P`;
  if (typeof meta.amount === "number") return `${meta.amount.toLocaleString()}P`;
  if (typeof meta.added === "number") return `${meta.added}개`;
  if (typeof meta.slug === "string") return meta.slug;
  return null;
}

export function toPublicActivity(log: SystemLog): PublicActivityItem | null {
  if (!PUBLIC_ACTIONS.has(log.action)) return null;
  return {
    id: log.id,
    action: log.action,
    label: friendlyLabel(log.action),
    detail: friendlyDetail(log),
    actorLabel: maskActor(log.actor),
    createdAt: log.createdAt,
  };
}

export function listPublicActivity(shopId: string, limit = 30): PublicActivityItem[] {
  const logs = listLogs(shopId, Math.max(limit * 4, 80));
  const out: PublicActivityItem[] = [];
  for (const log of logs) {
    const item = toPublicActivity(log);
    if (!item) continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
