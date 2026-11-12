import { actionRow, separator, textDisplay, v2Message } from "@/lib/discord/components";
import { discordRest } from "@/lib/discord/rest";

/** DM 채널 생성 후 메시지 전송 */
export async function sendDiscordDm(
  recipientDiscordId: string,
  payload: {
    content?: string;
    embeds?: unknown[];
    components?: unknown[];
    flags?: number;
  },
  shopId?: string,
) {
  const channel = await discordRest(
    "POST",
    "/users/@me/channels",
    { recipient_id: recipientDiscordId },
    shopId,
  );
  if (!channel.ok || !channel.json || typeof channel.json !== "object") {
    return { ok: false as const, error: "DM 채널을 열 수 없어요." };
  }
  const channelId = (channel.json as { id?: string }).id;
  if (!channelId) return { ok: false as const, error: "DM 채널 ID 없음" };

  const msg = await discordRest(
    "POST",
    `/channels/${channelId}/messages`,
    payload,
    shopId,
  );
  if (!msg.ok) return { ok: false as const, error: "DM 전송 실패" };
  return { ok: true as const, channelId, message: msg.json };
}

/** 길드 멤버에게 역할 부여 */
export async function addGuildMemberRole(
  guildId: string,
  userDiscordId: string,
  roleId: string,
  shopId?: string,
) {
  return discordRest(
    "PUT",
    `/guilds/${guildId}/members/${userDiscordId}/roles/${roleId}`,
    undefined,
    shopId,
  );
}

export function purchaseSuccessDm(
  input: {
    shopName: string;
    productName: string;
    amountLabel: string;
    orderUuid: string;
    codePreview?: string | null;
  },
  buttons: unknown[] = [],
) {
  return v2Message([
    textDisplay("## 구매가 완료됐어요"),
    textDisplay(`**${input.shopName}**에서 주문이 발급되었습니다.`),
    separator(true, 1),
    textDisplay(`**상품**\n${input.productName}`),
    textDisplay(`**금액**\n${input.amountLabel}`),
    textDisplay(`**주문**\n${input.orderUuid}`),
    ...(input.codePreview ? [textDisplay(`**상품 정보**\n||${input.codePreview.slice(0, 3000)}||`)] : []),
    separator(true, 1),
    textDisplay(`-# DOES · <t:${Math.floor(Date.now() / 1000)}:f>`),
    ...(buttons.length ? [actionRow(...buttons)] : []),
  ]);
}
