/**
 * 대리판매 — 일반 회원이 자기 마크 계정을 올려 달라고 신청하고, 관리자가 승인하면 「대리판매」 카테고리 상품으로 올라간다.
 * 신청 목록은 KV(resale:v1:<shopId>)에 둔다. 승인 · 거절 시 신청자에게 디스코드 DM + 사이트 알림을 보낸다.
 */
import { randomUUID } from "crypto";
import { MC_NICKNAME_RE, maskMcNickname } from "@/lib/mc-account";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export {
  RESALE_CAPE_CHOICES,
  RESALE_DEFAULT_FEE_PERCENT,
  RESALE_TYPES,
  resalePayout,
  type ResaleRequest,
  type ResaleStatus,
} from "@/lib/resale-shared";
import { RESALE_CAPE_CHOICES, RESALE_TYPES, resalePayout, type ResaleRequest } from "@/lib/resale-shared";

const key = (shopId: string) => `resale:v1:${shopId}`;
const MAX_KEEP = 500;

export async function listResaleRequests(shopId: string) {
  return (await kvGetJson<ResaleRequest[]>(key(shopId))) ?? [];
}

async function mutate<T>(shopId: string, fn: (list: ResaleRequest[]) => T) {
  return withLock(key(shopId), async () => {
    const list = await listResaleRequests(shopId);
    const out = fn(list);
    await kvPutJson(key(shopId), list.slice(0, MAX_KEEP));
    return out;
  });
}

export type ResaleInput = {
  accountType: string;
  ign: string;
  showName: boolean;
  capes: string[];
  description: string;
  price: number;
  payoutAccount?: string;
};

export function validateResaleInput(input: ResaleInput, types: readonly string[] = RESALE_TYPES): string | null {
  if (!types.includes(input.accountType)) return "상품 유형을 골라 주세요.";
  if (input.payoutAccount !== undefined && input.payoutAccount.trim().length < 6) return "정산 계좌를 은행 · 계좌번호 · 예금주까지 적어 주세요.";
  if ((input.payoutAccount ?? "").length > 100) return "정산 계좌는 100자까지 적을 수 있어요.";
  if (!MC_NICKNAME_RE.test(input.ign.trim())) return "닉네임은 영문·숫자·_ 3~16자예요.";
  if (!Number.isInteger(input.price) || input.price < 1000 || input.price > 10_000_000) return "판매 가격은 1,000원 ~ 10,000,000원 사이로 적어 주세요.";
  if (input.description.length > 1000) return "설명은 1000자까지 적을 수 있어요.";
  return null;
}

export async function createResaleRequest(
  shopId: string,
  user: { id: string; name: string; discordId: string | null },
  input: ResaleInput,
  feePercent: number,
  source: "web" | "discord" = "web",
) {
  const capeSet = new Set(RESALE_CAPE_CHOICES.map((c) => c.type));
  const req: ResaleRequest = {
    id: `rs_${randomUUID().slice(0, 10)}`,
    shopId,
    userId: user.id,
    userName: user.name,
    discordId: user.discordId,
    accountType: input.accountType,
    ign: input.ign.trim(),
    showName: Boolean(input.showName),
    capes: input.capes.filter((c) => capeSet.has(c)).slice(0, 12),
    description: input.description.trim().slice(0, 1000),
    price: input.price,
    feePercent,
    payout: resalePayout(input.price, feePercent),
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    rejectReason: null,
    productId: null,
    payoutAccount: input.payoutAccount?.trim() || null,
    source,
    soldAt: null,
    soldOrderUuid: null,
  };
  return mutate(shopId, (list) => {
    const pending = list.filter((r) => r.userId === user.id && r.status === "pending").length;
    if (pending >= 5) throw new Error("검토 중인 신청이 5개 있어요. 처리된 뒤에 다시 신청해 주세요.");
    if (list.some((r) => r.status === "pending" && r.ign.toLowerCase() === req.ign.toLowerCase())) {
      throw new Error("이 닉네임은 이미 검토 중인 신청이 있어요.");
    }
    list.unshift(req);
    return req;
  });
}

export async function updateResaleRequest(shopId: string, id: string, fn: (r: ResaleRequest) => void) {
  return mutate(shopId, (list) => {
    const r = list.find((x) => x.id === id);
    if (!r) throw new Error("신청을 찾을 수 없어요.");
    fn(r);
    return { ...r };
  });
}

export function resaleProductName(r: Pick<ResaleRequest, "ign" | "showName">) {
  return `대리판매 ${r.showName ? r.ign : maskMcNickname(r.ign)}`;
}

/** 대리판매 상품이 팔리면 신청 건에 판매 완료를 표시한다 (이미 표시됐으면 null) */
export async function markResaleSold(shopId: string, requestId: string, orderUuid: string) {
  return mutate(shopId, (list) => {
    const r = list.find((x) => x.id === requestId);
    if (!r || r.soldAt) return null;
    r.soldAt = new Date().toISOString();
    r.soldOrderUuid = orderUuid;
    return { ...r };
  });
}
