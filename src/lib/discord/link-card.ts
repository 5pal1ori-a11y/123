/**
 * 사이트 링크 카드 — 채널에 doesmc.xyz / vendix.team 링크가 올라오면
 * 봇이 상점 소개 카드(배너 · 통계 · 특징 · 버튼)를 자동으로 띄운다.
 * 같은 채널에서 60초 안에는 다시 띄우지 않는다 (도배 방지).
 */
import { actionRow, button, ButtonStyle, container, mediaGallery, MessageFlags, separator, textDisplay } from "@/lib/discord/components";
import { appEmoji } from "@/lib/discord/app-emojis";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { getShopById, getShopSettings, getStoreForRead } from "@/lib/store";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
const COOLDOWN_MS = 60_000;

function stats(shopId: string) {
  const store = getStoreForRead();
  const orders = store.orders.filter((o) => o.shopId === shopId && COUNTED.has(o.status));
  const sold = orders.reduce((n, o) => n + (o.quantity || 1), 0);
  const buyers = new Set(orders.map((o) => o.userId).filter(Boolean)).size;
  const reviews = store.reviews.filter((r) => r.shopId === shopId);
  const rated = reviews.filter((r) => r.rating > 0);
  const avg = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : 5;
  return { sold, buyers, reviews: reviews.length, avg };
}

export async function postLinkCard(shopId: string, channelId: string, inviteUrl?: string | null, messageId?: string | null) {
  const cdKey = `linkcard:cd:${channelId}`;
  if (await kvGetJson<number>(cdKey)) return { skipped: true as const };
  await kvPutJson(cdKey, Date.now(), 60);
  const shop = getShopById(shopId);
  if (!shop) return { skipped: true as const };
  const settings = getShopSettings(shopId);
  const s = stats(shopId);
  const banner = "https://doesmc.xyz/brand/does-link-v2.gif";
  const kids: unknown[] = [
    mediaGallery([banner]),
    textDisplay(`## ${appEmoji("does_gem")} ${shop.name} Store`),
    textDisplay(`${appEmoji("does_fire")} 한국 마인크래프트 정품 계정 샵 · 거래소`),
    textDisplay(`${appEmoji("does_crown")} 믿고 사는 자동 거래`),
    separator(true, 1),
    textDisplay(`${appEmoji("does_sold")} 판매 **${s.sold.toLocaleString("ko-KR")}개** · 구매자 **${s.buyers.toLocaleString("ko-KR")}명** · 후기 **${s.reviews.toLocaleString("ko-KR")}개** ${appEmoji("does_star")} ${s.avg.toFixed(1)}`),
    separator(true, 1),
    textDisplay(
      [
        `${appEmoji("does_lightning")} **자동 자판기** — 충전·구매·전달까지 24시간 자동`,
        `${appEmoji("does_lock")} **안전 전달** — 구매하면 16자리 코드로 안전하게 전달`,
        `${appEmoji("does_coin")} **입금 자동 확인** — 계좌이체 / 코인 / 컬쳐랜드`,
        `${appEmoji("does_check")} **30일 보증** — 수령 후 30일 교체·환불 보장`,
      ].join("\n"),
    ),
  ];
  const buttons = [
    button({ label: "웹사이트에서 구매하기", url: shopUrl(shop.slug, "/dashboard"), style: ButtonStyle.LINK }),
    ...(inviteUrl ? [button({ label: "디스코드 들어가기", url: inviteUrl, style: ButtonStyle.LINK })] : []),
  ];
  kids.push(separator(true, 1), actionRow(...buttons));
  void settings;
  const r = await postChannelMessage(channelId, { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, 0x6366f1)], allowed_mentions: { parse: [] as string[] } }, shopId);
  // 디스코드가 자동으로 붙이는 링크 미리보기(네이티브 임베드)를 숨겨 V2 카드만 남긴다 (봇에 메시지 관리 권한 필요)
  if (messageId) {
    await discordRest("PATCH", `/channels/${channelId}/messages/${messageId}`, { flags: 4 }, shopId).catch(() => null);
  }
  return { ok: r.ok };
}
