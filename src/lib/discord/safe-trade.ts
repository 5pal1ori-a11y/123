/**
 * 안전거래 링크 — 디스코드: /안전거래 (모달로 링크 만들기) · 채널에 공유 · 취소 · 관리자 카드(정산 · 환불 · 송금 완료)
 */
import { appEmoji, plainEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  showModal,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { parseCredLines } from "@/lib/rental";
import { adminSafeAction, cancelSafeTrade, createSafeTrade, getSafeDb, SAFE_HOLD_HOURS, safeUrl, setSafeAdminCard, type SafeTrade } from "@/lib/safe-trade";
import { getShopById, getShopBySlug, getShopSettings, getUserByDiscordId, userPremiumPlan } from "@/lib/store";

const ACCENT = 0x10b981;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const ts = (iso: string, f = "R") => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;

function btn(customId: string, label: string, style: number) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100) };
}
const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });

/** /안전거래 → 링크 만들기 모달 (바로 열어야 해서 가게 정보 없이 만든다) */
export function handleSafeCommand(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "sx_modal"),
    title: "안전거래 링크 만들기",
    inputs: [
      textInput({ customId: "title", label: "상품명", placeholder: "예: 마인콘 2015 망토 계정", required: true, minLength: 2, maxLength: 60 }),
      textInput({ customId: "price", label: "가격 (원)", placeholder: "예: 50000", required: true, maxLength: 9 }),
      textInput({ customId: "desc", label: "설명 (구매자에게 보임)", style: 2, placeholder: "망토 · 랭크 · 특이사항", required: false, maxLength: 1000 }),
      textInput({ customId: "login", label: "계정 로그인 정보 (결제한 구매자에게만 전달)", style: 2, placeholder: "1줄: 이메일\n2줄: 비밀번호\n3줄~: 추가 정보", required: true, maxLength: 800 }),
      textInput({ customId: "account", label: "정산 — '포인트' 또는 계좌(은행·번호·예금주)", placeholder: "포인트  /  카카오뱅크 3333-00-0000000 홍길동", required: true, minLength: 3, maxLength: 100 }),
    ],
  });
}

function linkCard(shopSlug: string, t: SafeTrade, forSeller: boolean) {
  const kids: unknown[] = [
    textDisplay(`## ${appEmoji("does_shield")} DOES 안전거래`),
    textDisplay(`### ${t.title}\n**${won(t.price)}** · 판매자 ${t.sellerName}${t.description ? `\n${t.description.slice(0, 600)}` : ""}`),
    textDisplay(`> 결제한 돈은 DOES가 보관해요 · 로그인 정보는 결제 즉시 전달 · 구매자 보호 ${SAFE_HOLD_HOURS}시간\n> 링크 만료 ${ts(t.expiresAt, "f")}`),
    actionRow(
      link(safeUrl(t.id), "안전거래로 구매하기"),
      ...(forSeller ? [btn(cid(shopSlug, "sx_share", t.id), "이 채널에 공유", ButtonStyle.PRIMARY), btn(cid(shopSlug, "sx_cancel", t.id), "링크 취소", ButtonStyle.DANGER)] : []),
    ),
  ];
  if (forSeller) kids.push(textDisplay(`-# 정산 ${won(t.payout)} (수수료 ${t.feePercent}%) · ${t.payoutMethod === "points" ? "포인트 자동" : "계좌 송금"} · 링크 ${safeUrl(t.id)}`));
  return [container(kids, ACCENT)];
}

export async function handleSafeSubmit(shopSlug: string, discordUser: { id: string; name: string }, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordUser.id);
  if (!user) {
    return v2Ephemeral([
      container([
        textDisplay("## 먼저 사이트 계정을 연결해 주세요"),
        textDisplay("안전거래는 정산 때문에 사이트 계정이 필요해요. 사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요."),
        actionRow(link(shopUrl(shop.slug, "/dashboard?tab=dosmarket&sub=safe"), "사이트에서 로그인")),
      ]),
    ]);
  }
  const cred = parseCredLines(modalFieldValue(interaction, "login"));
  if (!cred) return plainEphemeral("로그인 정보는 1줄에 이메일, 2줄에 비밀번호를 적어 주세요.");
  const accountRaw = modalFieldValue(interaction, "account").trim();
  const byPoints = /^(포인트|point|points|p)$/i.test(accountRaw.replace(/\s/g, ""));
  try {
    const t = await createSafeTrade(
      shop.id,
      { id: user.id, name: user.name || discordUser.name, discordId: discordUser.id, plus: userPremiumPlan(user) === "plus" },
      {
        title: modalFieldValue(interaction, "title"),
        description: modalFieldValue(interaction, "desc"),
        price: Number(modalFieldValue(interaction, "price").replace(/[,\s원₩]/g, "")),
        cred,
        payoutMethod: byPoints ? "points" : "bank",
        payoutAccount: byPoints ? null : accountRaw,
      },
    );
    return v2Ephemeral([textDisplay(`${plainEmoji("does_check")} 안전거래 링크를 만들었어요! 구매자에게 아래 링크를 보내거나 채널에 공유하세요.`), ...linkCard(shopSlug, t, true)]);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "링크를 만들지 못했어요.");
  }
}

export async function handleSafeButton(shopSlug: string, action: string, id: string, actor: { id: string; roles: string[] }, permissions: string | undefined, channelId: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  if (action === "sx_share" || action === "sx_cancel") {
    const user = getUserByDiscordId(shop.id, actor.id);
    const t = (await getSafeDb(shop.id)).trades.find((x) => x.id === id);
    if (!user || !t || t.sellerId !== user.id) return plainEphemeral("내가 만든 링크만 다룰 수 있어요.");
    if (action === "sx_cancel") {
      try {
        await cancelSafeTrade(shop.id, user.id, id);
        return v2Update([container([textDisplay(`~~${t.title}~~ 안전거래 링크를 취소했어요.`)], 0x64748b)]);
      } catch (e) {
        return plainEphemeral(e instanceof Error ? e.message : "취소하지 못했어요.");
      }
    }
    if (t.status !== "open") return plainEphemeral("이미 거래됐거나 닫힌 링크예요.");
    if (!channelId) return plainEphemeral("채널에서 눌러 주세요.");
    const posted = await postChannelMessage(channelId, { flags: MessageFlags.IS_COMPONENTS_V2, components: linkCard(shopSlug, t, false), allowed_mentions: { parse: [] as string[] } }, shop.id).catch(() => null);
    return plainEphemeral(posted?.ok ? "채널에 공유했어요." : "공유하지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  }
  // 관리자 카드 버튼
  if (!isDiscordAdmin(getShopSettings(shop.id), actor.roles, permissions)) return plainEphemeral("관리자만 처리할 수 있어요.");
  try {
    const t = await adminSafeAction(shop.id, id, action === "sx_rel" ? "release" : action === "sx_ref" ? "refund" : "paid");
    const note = action === "sx_rel" ? "보류를 풀고 정산했어요" : action === "sx_ref" ? `구매자에게 ${won(t.price)} 환불했어요 · 계정 회수는 따로 진행해 주세요` : "송금 완료로 처리했어요";
    return v2Update(safeCardBody(shopSlug, t, note).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

const STATUS_KO: Record<string, string> = { open: "결제 대기", paid: "구매자 보호 중", held: "신고로 보류", settling: "송금 대기", done: "정산 완료", refunded: "환불", cancelled: "취소", expired: "만료" };

function safeCardBody(shopSlug: string, t: SafeTrade, note: string) {
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_shield")} 안전거래 · ${STATUS_KO[t.status] ?? t.status}`),
    textDisplay(
      [
        `**상품** ${t.title} · ${won(t.price)} · 코드 \`${t.id}\``,
        `**판매자** ${t.sellerDiscordId ? `<@${t.sellerDiscordId}>` : t.sellerName} → **구매자** ${t.buyerDiscordId ? `<@${t.buyerDiscordId}>` : t.buyerName ?? "-"}`,
        `**정산** ${won(t.payout)} (수수료 ${t.feePercent}%) · ${t.payoutMethod === "points" ? "포인트" : `계좌 ${t.payoutAccount ?? "-"}`}`,
        t.paidAt ? `**결제** ${ts(t.paidAt, "f")}` : "",
        t.disputeReason ? `**신고 내용** ${t.disputeReason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    textDisplay(`> ${note}`),
  ];
  const row: unknown[] = [];
  if (t.status === "held") row.push(btn(cid(shopSlug, "sx_rel", t.id), "보류 풀고 정산", ButtonStyle.SUCCESS), btn(cid(shopSlug, "sx_ref", t.id), "구매자 환불", ButtonStyle.DANGER));
  if (t.status === "settling") row.push(btn(cid(shopSlug, "sx_paid", t.id), "송금 완료", ButtonStyle.SUCCESS));
  if (row.length) kids.push(actionRow(...row));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, t.status === "held" ? 0xef4444 : t.status === "done" ? 0x22c55e : ACCENT)], allowed_mentions: { parse: [] as string[] } };
}

export async function postSafeCard(shopId: string, t: SafeTrade, note: string) {
  const slug = getShopById(shopId)?.slug;
  const s = getShopSettings(shopId);
  const ch = s.proxyAdminChannelId || s.rentalAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId;
  if (!slug || !ch) return;
  const body = safeCardBody(slug, t, note);
  if (t.adminCard) {
    const r = await discordRest("PATCH", `/channels/${t.adminCard.channelId}/messages/${t.adminCard.messageId}`, { components: body.components, flags: body.flags }, shopId).catch(() => null);
    if (r?.ok) return;
  }
  const posted = await postChannelMessage(ch, body, shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) await setSafeAdminCard(shopId, t.id, { channelId: ch, messageId });
}

