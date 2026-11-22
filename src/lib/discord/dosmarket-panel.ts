/**
 * 도스마켓 — 디스코드: 매물 보기 · 매물 상세 · 내가 산 계정(구매자 보호 · 문제 신고)
 * (판매 등록 · 내 판매는 proxy-sale.ts 의 px_reg · px_mine, 결제는 상점 규칙대로 웹에서)
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  modalFieldValue,
  plainEphemeral,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { shopUrl, MFA_SITE_ORIGIN } from "@/lib/domain";
import { CAPE_BY_TYPE } from "@/lib/capes-data";
import { buyerPurchases, reportDispute } from "@/lib/dosmarket";
import { listResaleRequests } from "@/lib/resale";
import { resaleShownName } from "@/lib/resale-actions";
import { getShopBySlug, getUserByDiscordId, listProducts } from "@/lib/store";

const ACCENT = 0x6366f1;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const ts = (iso: string, f = "R") => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;
const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });
function btn(customId: string, label: string, style: number) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100) };
}

/** 지금 팔고 있는 도스마켓 매물 (승인됐고 재고가 남은 것) */
async function sellingListings(shopId: string) {
  const products = new Map(listProducts(shopId).map((p) => [p.id, p]));
  return (await listResaleRequests(shopId))
    .filter((r) => r.status === "approved" && !r.soldAt && r.productId && (products.get(r.productId)?.availableCount ?? 0) > 0)
    .map((r) => ({ r, p: products.get(r.productId!)! }));
}

export async function handleDmList(shopSlug: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const list = await sellingListings(shop.id);
  const kids: unknown[] = [textDisplay(`## ${appEmoji("does_chart")} 도스마켓 매물 ${list.length}개`)];
  if (!list.length) {
    kids.push(textDisplay("지금은 판매 중인 매물이 없어요. 새 매물이 올라오면 패널 숫자가 바뀌어요."));
  } else {
    kids.push(
      textDisplay(
        list
          .slice(0, 10)
          .map(({ r, p }) => `**${resaleShownName(r)}** · ${won(p.price)}${r.capes.length ? ` · 망토 ${r.capes.length}개` : ""}`)
          .join("\n"),
      ),
    );
    kids.push(
      actionRow(
        stringSelect({
          customId: cid(shopSlug, "dm_pick"),
          placeholder: "자세히 볼 매물 고르기",
          options: list.slice(0, 25).map(({ r, p }) => ({ label: resaleShownName(r).slice(0, 90), value: r.id, description: `${won(p.price)} · ${r.accountType}` })),
        }),
      ),
    );
  }
  kids.push(actionRow(link(shopUrl(shop.slug, "/dashboard?tab=products"), "웹에서 전체 보기")));
  return v2Ephemeral([container(kids, ACCENT)]);
}

export async function handleDmPick(shopSlug: string, requestId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const hit = (await sellingListings(shop.id)).find((x) => x.r.id === requestId);
  if (!hit) return plainEphemeral("이미 팔렸거나 내려간 매물이에요.");
  const { r, p } = hit;
  const capes = r.capes.map((c) => CAPE_BY_TYPE[c]?.title ?? c).join(", ");
  return v2Update([
    container(
      [
        textDisplay(`## ${resaleShownName(r)}`),
        textDisplay([`**${won(p.price)}** · ${r.accountType}`, capes ? `망토 ${capes}` : "", r.description ? `\n${r.description.slice(0, 900)}` : ""].filter(Boolean).join("\n")),
        separator(true, 1),
        textDisplay(`> ${appEmoji("does_shield")} 도스마켓 구매자 보호 24시간 — 문제가 있으면 \`내가 산 계정\`에서 신고하면 정산이 멈추고 환불받을 수 있어요.`),
        actionRow(
          link(shopUrl(shop.slug, `/product/${p.slug}`), "웹에서 구매하기"),
          link(`${MFA_SITE_ORIGIN}/passport/p/${p.id}`, "계정 여권"),
          btn(cid(shopSlug, "dm_list"), "목록으로", ButtonStyle.SECONDARY),
        ),
        textDisplay("-# 결제 · 지급 안전을 위해 구매는 웹에서 해요. 결제하면 계정 정보가 바로 지급돼요."),
      ],
      ACCENT,
    ),
  ]);
}

export async function handleDmBuys(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요. 사이트에서 디스코드로 로그인해 주세요.");
  const list = await buyerPurchases(shop.id, user.id);
  const kids: unknown[] = [textDisplay("## 내가 산 도스마켓 계정")];
  if (!list.length) kids.push(textDisplay("-# 아직 도스마켓에서 산 계정이 없어요."));
  for (const b of list.slice(0, 5)) {
    kids.push(separator(true, 1));
    const state = b.canReport && b.holdUntil ? `${ts(b.holdUntil)}까지 구매자 보호` : b.state === "held" ? "신고 접수 · 관리자 확인 중" : b.state === "refunded" ? "환불됨" : "보호 기간 끝남";
    kids.push(textDisplay(`**${b.name}** · ${won(b.price)}\n-# ${state}${b.disputeReason ? ` · 신고: ${b.disputeReason}` : ""}`));
    if (b.canReport) kids.push(actionRow(btn(cid(shopSlug, "dm_rep", b.id), "문제 신고", ButtonStyle.DANGER)));
  }
  kids.push(textDisplay("-# 받은 계정 정보는 사이트 이용 내역에서 다시 볼 수 있어요."));
  return v2Ephemeral([container(kids, ACCENT)]);
}

export function handleDmReportButton(shopSlug: string, requestId: string) {
  return showModal({
    customId: cid(shopSlug, "dm_repm", requestId),
    title: "도스마켓 문제 신고",
    inputs: [textInput({ customId: "reason", label: "어떤 문제가 있나요?", style: 2, placeholder: "예: 로그인이 안 돼요 · 설명과 망토가 달라요", required: true, minLength: 5, maxLength: 500 })],
  });
}

export async function handleDmReportSubmit(shopSlug: string, discordId: string, requestId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요.");
  try {
    await reportDispute(shop.id, user.id, requestId, modalFieldValue(interaction, "reason"));
    return plainEphemeral("신고했어요. 판매자 정산을 멈추고 관리자가 확인해요. 결과는 DM으로 알려 드려요.");
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "신고하지 못했어요.");
  }
}
