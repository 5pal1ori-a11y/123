/**
 * 사이트 링크 카드 — 채널에 doesmc.xyz / vendix.team 링크가 올라오면
 * 디스코드 기본 링크 미리보기를 숨기고, 같은 모양(배너 · 제목 · 설명)에
 * [웹사이트 바로가기] [디스코드 입당하기] 버튼을 단 V2 카드를 봇이 띄운다.
 * 같은 채널에서 60초 안에는 카드를 다시 띄우지 않는다 (도배 방지).
 * 이때도 기본 미리보기는 숨긴다 (바로 위에 카드가 있으므로).
 */
import { actionRow, button, ButtonStyle, container, mediaGallery, MessageFlags, separator, textDisplay } from "@/lib/discord/components";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { getShopById } from "@/lib/store";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

const COOLDOWN_SEC = 60;
const DEFAULT_INVITE_URL = "https://discord.gg/doesmc";
const BANNER_URL = "https://doesmc.xyz/brand/does-banner.png";
/** MessageFlags.SUPPRESS_EMBEDS — 메시지의 링크 미리보기 숨김 (봇에 메시지 관리 권한 필요) */
const SUPPRESS_EMBEDS = 1 << 2;

async function suppressNativeEmbed(shopId: string, channelId: string, messageId?: string | null) {
  if (!messageId) return;
  const r = await discordRest("PATCH", `/channels/${channelId}/messages/${messageId}`, { flags: SUPPRESS_EMBEDS }, shopId).catch(
    (err) => ({ ok: false, status: 0, json: { error: String(err) } }),
  );
  if (!r.ok) console.error("[link-card] 링크 미리보기 숨김 실패 (봇에 '메시지 관리' 권한이 있는지 확인)", { channelId, status: r.status, json: r.json });
}

export async function postLinkCard(shopId: string, channelId: string, inviteUrl?: string | null, messageId?: string | null) {
  const shop = getShopById(shopId);
  if (!shop) return { skipped: true as const };

  await suppressNativeEmbed(shopId, channelId, messageId);

  const cdKey = `linkcard:cd:${channelId}`;
  if (await kvGetJson<number>(cdKey)) return { skipped: true as const };
  await kvPutJson(cdKey, Date.now(), COOLDOWN_SEC);

  const kids: unknown[] = [
    mediaGallery([BANNER_URL]),
    textDisplay(
      "## DOES · 마인크래프트 정품 계정 샵\n" +
        "자동 자판기 · 16자리 코드 안전 전달 · 30일 보증 · 계좌이체/코인/컬쳐랜드 자동 입금",
    ),
    separator(true, 1),
    actionRow(
      button({ label: "웹사이트 바로가기", url: shopUrl(shop.slug, "/dashboard"), style: ButtonStyle.LINK }),
      button({ label: "디스코드 입당하기", url: inviteUrl || DEFAULT_INVITE_URL, style: ButtonStyle.LINK }),
    ),
  ];
  const r = await postChannelMessage(
    channelId,
    { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, 0x6366f1)], allowed_mentions: { parse: [] as string[] } },
    shopId,
  );
  return { ok: r.ok };
}
