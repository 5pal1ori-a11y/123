/** 새 본인인증 신청이 들어오면 관리자 디스코드 채널에 알린다 (버튼 없는 단순 알림 + 관리자 페이지 링크) */
import type { IdentityRecord } from "@/lib/identity-verify";

export async function notifyAdminIdentityPending(
  shopId: string,
  shopSlug: string,
  user: { id: string; name?: string | null; discordId?: string | null },
  rec: IdentityRecord,
) {
  const { getShopSettings } = await import("@/lib/store");
  const settings = getShopSettings(shopId);
  const channelId = settings.coinAdminChannelId || settings.discordAdminLogChannelId;
  if (!channelId) return;

  const { postChannelMessage } = await import("@/lib/discord/rest");
  const { container, textDisplay, MessageFlags } = await import("@/lib/discord/components");
  const { shopUrl } = await import("@/lib/domain");

  const who = user.discordId ? `<@${user.discordId}>` : user.name || user.id;
  const body = {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay("## 🪪 새 본인인증 신청"),
          textDisplay([`**신청자** ${who}`, rec.realName ? `**이름** ${rec.realName}` : "", `-# 관리자 페이지에서 사진을 확인하고 승인/거절하세요`].filter(Boolean).join("\n")),
        ],
        0xfacc15,
      ),
      {
        type: 1,
        components: [{ type: 2, style: 5, label: "관리자 페이지에서 검토", url: shopUrl(shopSlug, "/dashboard") }],
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
  await postChannelMessage(channelId, body, shopId).catch(() => {});
}
