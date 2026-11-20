/**
 * 대리판매(프록시) 승인 · 거절 · 판매 완료 처리 — 웹 관리자 화면(/api/resale/[id])과
 * 디스코드 /프록시등록 관리자 버튼이 같은 코드를 쓴다. 결과는 신청자에게 디스코드 DM + 사이트 알림.
 */
import { appEmoji, ensureAppEmojis } from "@/lib/discord/app-emojis";
import { container, mediaGallery, MessageFlags, separator, textDisplay } from "@/lib/discord/components";
import { sendDiscordDm } from "@/lib/discord/dm";
import { MC_RESALE_CATEGORY } from "@/lib/mc-account";
import {
  listResaleRequests,
  markResaleSold,
  RESALE_CAPE_CHOICES,
  resalePayout,
  resaleProductName,
  updateResaleRequest,
  type ResaleRequest,
} from "@/lib/resale";
import { addInventoryCodes, createProduct, getShopById, persistAsync } from "@/lib/store";
import { pushUserNotification } from "@/lib/store-ext";

const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;

function capeLabels(r: ResaleRequest) {
  return r.capes.map((c) => RESALE_CAPE_CHOICES.find((x) => x.type === c)?.label ?? c).join(", ");
}

export function resaleShownName(r: ResaleRequest) {
  return r.showName ? r.ign : resaleProductName(r).replace("대리판매 ", "");
}

async function dm(r: ResaleRequest, title: string, lines: string[], color: number, shopId: string, image?: string | null) {
  if (!r.discordId) return;
  await ensureAppEmojis().catch(() => null);
  await sendDiscordDm(
    r.discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container(
          [...(image ? [mediaGallery([image])] : []), textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n"))],
          color,
        ),
      ],
    },
    shopId,
  ).catch(() => null);
}

async function card(shopId: string, p: Parameters<typeof import("@/lib/discord/rank-image")["cardImageUrl"]>[1]) {
  const slug = getShopById(shopId)?.slug;
  if (!slug) return null;
  return import("@/lib/discord/rank-image").then((m) => m.cardImageUrl(slug, p)).catch(() => null);
}

/** 패널 숫자(등록자 · 판매)가 바뀌었으니 /프록시등록 패널을 다시 그린다 — 실패해도 무시 */
function refreshPanel(shopId: string) {
  return import("@/lib/discord/proxy-sale").then((m) => m.refreshProxyPanel(shopId)).catch(() => null);
}

export async function getResaleRequest(shopId: string, id: string) {
  return (await listResaleRequests(shopId)).find((r) => r.id === id) ?? null;
}

/** 거절 */
export async function rejectResaleRequest(shopId: string, id: string, reason: string) {
  const current = await getResaleRequest(shopId, id);
  if (!current) throw new Error("신청을 찾을 수 없어요.");
  if (current.status !== "pending") throw new Error("이미 처리된 신청이에요.");
  const why = reason.trim();
  const r = await updateResaleRequest(shopId, id, (x) => {
    x.status = "rejected";
    x.reviewedAt = new Date().toISOString();
    x.rejectReason = why || null;
  });
  pushUserNotification(shopId, r.userId, "resale", "대리판매 신청 반려", `${r.ign} 대리판매 신청이 반려됐어요.${why ? ` 사유: ${why}` : ""}`);
  await persistAsync();
  const image = await card(shopId, {
    theme: "red",
    eyebrow: "PROXY REJECTED",
    title: "대리판매 신청 반려",
    ...(r.discordId ? { people: [{ id: r.discordId }] } : {}),
    subtitle: resaleShownName(r),
    ...(why ? { note: `사유 · ${why.slice(0, 70)}` } : {}),
  });
  await dm(
    r,
    "대리판매 신청이 반려되었습니다",
    [`**계정** ${resaleShownName(r)}`, why ? `**사유** ${why}` : "", "-# 궁금한 점은 문의 티켓으로 남겨 주세요"],
    0xef4444,
    shopId,
    image,
  );
  void refreshPanel(shopId);
  return r;
}

/** 승인 → 「대리판매」 카테고리 마크 계정 상품으로 올린다 */
export async function approveResaleRequest(shopId: string, id: string, opts: { price?: number; deliveryCode?: string } = {}) {
  const current = await getResaleRequest(shopId, id);
  if (!current) throw new Error("신청을 찾을 수 없어요.");
  if (current.status !== "pending") throw new Error("이미 처리된 신청이에요.");
  const price = opts.price && opts.price > 0 ? Math.floor(opts.price) : current.price;
  // 도스마켓: 판매자가 웹에서 낸 로그인 정보가 있으면 그걸 지급 코드로 써서 팔리면 바로 전달된다
  const { credentialsText } = await import("@/lib/dosmarket");
  const code = opts.deliveryCode?.trim() || credentialsText(current);
  const desc = [`[${current.accountType}] 대리판매 계정`, current.capes.length ? `보유 망토: ${capeLabels(current)}` : "", current.description]
    .filter(Boolean)
    .join("\n");
  const product = createProduct(shopId, {
    name: resaleProductName(current),
    slug: `resale-${current.id.slice(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    price,
    category: MC_RESALE_CATEGORY,
    description: desc,
    tags: [current.accountType === "일반 계정" ? "NON" : current.accountType.replace(" 계정", "")],
    productKind: "mc_account",
    mcNickname: current.ign,
    mcShowName: current.showName,
    mcCapes: current.capes.length ? current.capes : null,
    listingKind: "individual",
    fulfillment: code ? "auto" : "manual",
    manualNotice: code ? null : "대리판매 계정이라 판매자 확인 후 관리자가 직접 전달해 드려요.",
    purchaseLimitPerUser: null,
    resale: {
      requestId: current.id,
      sellerUserId: current.userId,
      sellerDiscordId: current.discordId,
      feePercent: current.feePercent,
      payout: resalePayout(price, current.feePercent),
    },
  });
  if (code) addInventoryCodes(shopId, product.id, [code], "admin");
  const r = await updateResaleRequest(shopId, id, (x) => {
    x.status = "approved";
    x.reviewedAt = new Date().toISOString();
    x.productId = product.id;
    // 지급 코드로 옮겼으니 암호화 사본은 지운다
    x.credEnc = null;
    x.price = price;
    x.payout = resalePayout(price, x.feePercent);
  });
  pushUserNotification(
    shopId,
    r.userId,
    "resale",
    "대리판매 승인",
    `${r.ign} 계정이 대리판매로 등록됐어요. 판매되면 ${won(r.payout)}을 정산해 드려요.`,
    product.id,
  );
  await persistAsync();
  const image = await card(shopId, {
    theme: "green",
    eyebrow: "PROXY APPROVED",
    title: "대리판매 승인 완료",
    ...(r.discordId ? { people: [{ id: r.discordId }] } : {}),
    subtitle: resaleShownName(r),
    chips: [`판매가 ${won(price)}`, `예상 정산 ${won(r.payout)}`],
    note: "상점에 올라갔어요 · 판매되면 다시 알려 드릴게요",
  });
  await dm(
    r,
    `대리판매 요청이 승인되었습니다 ${appEmoji("does_check")}`,
    [
      `**계정** ${resaleShownName(r)} · ${r.accountType}`,
      `**판매 가격** ${won(price)}`,
      `**수수료** ${r.feePercent}% · **예상 정산 금액** ${won(r.payout)}`,
      "-# 상점 「마인크래프트 계정 › 대리판매」 탭에 올라갔어요. 판매되면 다시 알려 드릴게요.",
    ],
    0x22c55e,
    shopId,
    image,
  );
  void refreshPanel(shopId);
  return { request: r, productId: product.id };
}

/** 대리판매 상품이 팔렸을 때 (구매 완료 직후) — 신청 건 표시 + 판매자 DM + 패널 갱신 */
export async function notifyResaleSold(shopId: string, product: { name: string; resale?: { requestId: string } | null }, orderUuid: string) {
  const reqId = product.resale?.requestId;
  if (!reqId) return;
  const r0 = await markResaleSold(shopId, reqId, orderUuid);
  if (!r0) return;
  const { startPayoutHold } = await import("@/lib/dosmarket");
  const r = (await startPayoutHold(shopId, reqId)) ?? r0;
  pushUserNotification(shopId, r.userId, "resale", "대리판매 판매 완료", `${r.ign} 계정이 판매됐어요. 정산 예정 금액 ${won(r.payout)}`);
  await persistAsync().catch(() => null);
  const image = await card(shopId, {
    theme: "gold",
    eyebrow: "PROXY SOLD",
    title: "대리판매 계정이 판매됐어요",
    ...(r.discordId ? { people: [{ id: r.discordId }] } : {}),
    subtitle: resaleShownName(r),
    chips: [`판매가 ${won(r.price)}`, `정산 예정 ${won(r.payout)}`],
    note: "구매자 보호 24시간 뒤 정산돼요",
  });
  await dm(
    r,
    `대리판매 계정이 판매되었습니다 ${appEmoji("does_party")}`,
    [
      `**계정** ${resaleShownName(r)}`,
      `**판매 가격** ${won(r.price)} · **수수료** ${r.feePercent}%`,
      `**정산 예정 금액** ${won(r.payout)}`,
      "-# 구매자 보호 24시간이 지나면 정산돼요 (포인트는 자동 · 계좌는 관리자가 송금)",
    ],
    0xfacc15,
    shopId,
    image,
  );
  void refreshPanel(shopId);
}
