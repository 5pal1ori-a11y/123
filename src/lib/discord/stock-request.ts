/**
 * /재고요청 — 찾는 상품이 품절이거나 목록에 없을 때 손님이 요청을 남기는 패널.
 * 요청 내용은 지정한 채널(판매자만 볼 수 있는 채널)로 올라간다.
 */
import {
  actionRow,
  button,
  cid,
  container,
  errorPanel,
  mediaGallery,
  modalFieldValue,
  plainEphemeral,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  v2Public,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { postChannelMessage } from "@/lib/discord/rest";
import { BANNER_PATHS } from "@/lib/gif/banners";
import { SELLABLE_CAPES } from "@/lib/sellable-capes";
import { getShopBySlug, getShopSettings, listProducts, persistAsync, updateShopSettings } from "@/lib/store";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

/** 같은 사람이 같은 상품을 연달아 보내지 못하게 (인스턴스 단위, 10분) */
const recent = new Map<string, number>();
/** 모두가 볼 수 있는 접수 안내 (멘션 알림은 보내지 않는다) */
function publicNotice(userId: string, name: string, note?: string) {
  const panel = v2Public([
    container([
      textDisplay(`📥 <@${userId}> 님이 **${name.slice(0, 100)}** 재고를 요청했어요`),
      ...(note ? [textDisplay(`> ${note.slice(0, 300)}`)] : []),
      textDisplay("-# 요청이 많은 상품부터 입고를 검토해요"),
    ]),
  ]);
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}

function tooSoon(key: string) {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 600_000) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

export function handleStockRequestCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  receiveChannelId: string | null | undefined,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("재고 요청 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  }
  if (receiveChannelId) {
    updateShopSettings(shop.id, { stockRequestChannelId: receiveChannelId });
    void persistAsync();
  } else if (!getShopSettings(shop.id).stockRequestChannelId) {
    return errorPanel("요청을 받을 채널을 `받을채널` 옵션으로 한 번 지정해 주세요.");
  }

  const options = requestOptions(shop.id);
  const kids: unknown[] = [
    mediaGallery([`${appOrigin()}${BANNER_PATHS.stockRequest}`]),
    textDisplay(
      [
        "### 🛒 찾는 상품이 품절이거나 목록에 없나요?",
        "아래 목록에서 고르면 바로 요청이 접수돼요.",
        "목록에 없는 상품은 **직접 적어서 요청**을 눌러 주세요.",
      ].join("\n"),
    ),
  ];
  if (options.length) {
    kids.push(actionRow(stringSelect({ customId: cid(shop.slug, "sr_pick"), placeholder: "요청할 상품을 골라 주세요", options })));
  }
  kids.push(
    actionRow(button({ customId: cid(shop.slug, "sr_custom"), label: "직접 적어서 요청", emoji: "📝" })),
    separator(true, 1),
    textDisplay(
      `-# 요청이 많은 상품부터 입고를 검토해요 · 요청 내용은 판매자만 봐요\n-# 구매·결제 문의는 티켓을 열어 주세요`,
    ),
  );
  const panel = v2Public([container(kids)]);
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}

/** 품절 상품 먼저, 그다음 아직 재고가 없는 망토 */
function requestOptions(shopId: string) {
  const products = listProducts(shopId).filter((p) => p.active && p.productKind !== "mc_account");
  const out: { label: string; value: string; description?: string }[] = [];
  for (const p of products) {
    if (p.productKind === "mc_cape") continue;
    if (p.availableCount <= 0) out.push({ label: p.name, value: `p:${p.id}`, description: "품절" });
  }
  for (const c of SELLABLE_CAPES) {
    const prod = products.find((p) => p.productKind === "mc_cape" && p.capeType === c.type);
    if (!prod || prod.availableCount <= 0) out.push({ label: `${c.title} 망토`, value: `c:${c.type}`, description: "재고 없음" });
  }
  return out.slice(0, 25);
}

async function deliver(shopId: string, userId: string, what: string, note?: string) {
  const channelId = getShopSettings(shopId).stockRequestChannelId;
  if (!channelId) return false;
  const r = await postChannelMessage(
    channelId,
    {
      content: `📥 **재고 요청** <@${userId}>\n상품: **${what.slice(0, 200)}**${note ? `\n메모: ${note.slice(0, 500)}` : ""}`,
      allowed_mentions: { parse: [] },
    },
    shopId,
  );
  return r.ok;
}

export async function handleStockRequestPick(shopSlug: string, userId: string, value: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop || !value) return plainEphemeral("상품을 찾지 못했어요.");
  let name = "";
  if (value.startsWith("p:")) name = listProducts(shop.id).find((p) => p.id === value.slice(2))?.name ?? "";
  else if (value.startsWith("c:")) {
    const c = SELLABLE_CAPES.find((x) => x.type === value.slice(2));
    name = c ? `${c.title} 망토` : "";
  }
  if (!name) return plainEphemeral("상품을 찾지 못했어요.");
  if (tooSoon(`${userId}:${value}`)) return plainEphemeral(`**${name}** 요청은 이미 접수됐어요. 조금만 기다려 주세요!`);
  const ok = await deliver(shop.id, userId, name);
  return ok ? publicNotice(userId, name) : plainEphemeral("요청을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.");
}

export function handleStockRequestCustomModal(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "sr_modal"),
    title: "재고 요청",
    inputs: [
      textInput({ customId: "name", label: "찾는 상품", placeholder: "예: Fresh MFA 계정", required: true, maxLength: 100 }),
      textInput({ customId: "note", label: "메모 (선택)", style: 2, required: false, maxLength: 300 }),
    ],
  });
}

export async function handleStockRequestModal(shopSlug: string, userId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const name = modalFieldValue(interaction, "name");
  const note = modalFieldValue(interaction, "note");
  if (!name) return plainEphemeral("찾는 상품을 적어 주세요.");
  if (tooSoon(`${userId}:t:${name.toLowerCase()}`)) return plainEphemeral("같은 요청이 이미 접수됐어요.");
  const ok = await deliver(shop.id, userId, name, note);
  return ok ? publicNotice(userId, name, note) : plainEphemeral("요청을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.");
}
