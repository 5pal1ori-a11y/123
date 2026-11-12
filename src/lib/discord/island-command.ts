import {
  actionRow,
  button,
  ButtonStyle,
  container,
  InteractionResponseType,
  mediaGallery,
  MessageFlags,
  optionValue,
  plainEphemeral,
  separator,
  textDisplay,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { shopUrl } from "@/lib/domain";
import { islandView, syncIsland } from "@/lib/island/server";
import { getUserByDiscordId } from "@/lib/store";
import type { Shop } from "@/lib/types";

/** /island @닉네임 — 회원 섬 사진 */
export async function handleIslandCommand(shop: Shop, interaction: DiscordInteraction, actorId: string) {
  const targetId = String(optionValue(interaction, "user") ?? actorId);
  const resolved = interaction.data?.resolved?.users?.[targetId];
  const mention = `<@${targetId}>`;
  const owner = getUserByDiscordId(shop.id, targetId);
  if (!owner) {
    return plainEphemeral(
      targetId === actorId
        ? "아직 섬이 없어요. 사이트에서 디스코드 계정을 연동하면 바로 섬이 생겨요!"
        : `${mention} 님은 아직 사이트와 연동하지 않아서 섬이 없어요.`,
    );
  }

  const record = await syncIsland(shop.id, owner, { skipFeed: true });
  const view = islandView(record, owner, false);
  const version = new Date(view.updatedAt).getTime().toString(36);
  const image = shopUrl(shop.slug, `/api/island/image?shop=${shop.slug}&u=${targetId}&v=${version}`);
  const link = shopUrl(shop.slug, `/main?island=${targetId}`);
  const name = resolved?.global_name || resolved?.username || view.owner.name;
  const s = view.stats;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      allowed_mentions: { parse: [] },
      components: [
        container([
          textDisplay(`## 🏝️ ${name}의 섬 · Lv.${view.level}`),
          textDisplay(`${mention} 님의 스카이블럭 섬이에요.`),
          mediaGallery([image]),
          separator(true, 1),
          textDisplay(
            [
              `💎 거래 **${s.orders}** · 🌳 후기 **${s.reviews}** · 🌱 출석 **${s.attendance}**`,
              `🎁 이벤트 **${s.events}** · 🚩 인증 **${s.verified ? "완료" : "-"}** · 🧱 블록 **${view.blocks.length}**`,
            ].join("\n"),
          ),
          textDisplay(`-# ${shop.name} · 활동으로 섬을 키워보세요`),
          actionRow(button({ label: "3D로 둘러보기", url: link, style: ButtonStyle.LINK })),
        ]),
      ],
    },
  };
}
