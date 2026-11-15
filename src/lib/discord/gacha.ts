/**
 * /랜덤뽑기 — 관리자가 채널에 패널을 올리면(모두가 봄), 누구나 버튼을 눌러 잔액에서 가격만큼 내고 뽑는다.
 * 결과(GIF · 상품 · 남은 잔액)는 누른 사람에게만 보인다. 상품 · 확률 · 가격은 관리자 웹에서 바꾼다.
 */
import {
  actionRow,
  button,
  cid,
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  separator,
  textDisplay,
  v2Ephemeral,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { postChannelMessage } from "@/lib/discord/rest";
import { drawGacha, getGachaConfig, getShopSettings, getUserByDiscordId, persistAsync } from "@/lib/store";
import type { Shop } from "@/lib/types";
import { formatKRW } from "@/lib/utils";

function origin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

function pct(w: number, total: number) {
  return `${Number(((w / total) * 100).toFixed(2))}%`;
}

export function gachaPanel(shop: Shop) {
  const cfg = getGachaConfig(shop.id);
  const total = cfg.prizes.reduce((s, p) => s + p.weight, 0);
  const lines = cfg.prizes.map((p) => `> ${p.label} · \`${pct(p.weight, total)}\``).join("\n");
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${origin()}/brand/gacha-idle.gif`]),
          textDisplay(`## 랜덤뽑기\n한 번에 **${formatKRW(cfg.price)}** · 잔액에서 바로 차감돼요`),
          separator(true, 1),
          textDisplay(`### 상품 · 확률\n${lines}`),
          actionRow(button({ customId: cid(shop.slug, "gacha_draw"), label: `뽑기 (${formatKRW(cfg.price)})` })),
          textDisplay("-# 결과는 누른 사람에게만 보여요 · 계정 연동 필요"),
        ],
        0xa855f7,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** /랜덤뽑기 — 관리자가 패널을 채널에 올린다 */
export async function handleGachaCommand(
  shop: Shop,
  actor: { id: string; roles: string[] },
  permissions: string | undefined,
  channelId: string | undefined,
) {
  if (!isDiscordAdmin(getShopSettings(shop.id), actor.roles, permissions)) {
    return errorPanel("랜덤뽑기 패널은 관리자만 올릴 수 있어요. 채널의 **뽑기** 버튼을 눌러 주세요.", "권한 없음");
  }
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const posted = await postChannelMessage(channelId, gachaPanel(shop), shop.id);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  return plainEphemeral("랜덤뽑기 패널을 올렸어요. 상품 · 확률 · 가격은 관리자 웹 → 랜덤뽑기 에서 바꿀 수 있어요.");
}

/** 뽑기 버튼 — 결과는 본인에게만 */
export async function handleGachaDraw(shop: Shop, discordId: string) {
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return plainEphemeral("웹사이트와 디스코드 계정을 먼저 연동해 주세요.");
  const r = drawGacha(shop.id, user.id);
  if (!r.ok) return plainEphemeral(r.error);
  await persistAsync();
  const key = r.prize.points > 0 ? "coin" : /꽝/.test(r.prize.label) ? "none" : "item";
  // 고화질 연출 GIF (금액 · 상품 이름은 아래 글자로 보여 준다)
  const gif = `${origin()}/brand/gacha-${key === "item" ? "win" : key}.gif`;
  const won = key !== "none";
  // 포인트가 아닌 상품은 관리자가 직접 지급 → 관리자 로그에 남긴다
  if (key === "item") {
    const { postAdminLog } = await import("@/lib/discord/logs");
    postAdminLog(shop.id, {
      title: "랜덤뽑기 당첨 (지급 필요)",
      lines: [`<@${discordId}> · **${r.prize.label}**`, `-# 확률 ${(r.chance * 100).toFixed(2)}% · 이용자에게 직접 지급해 주세요`],
    });
  }
  return v2Ephemeral([
    container(
      [
        mediaGallery([gif]),
        textDisplay(
          won
            ? `## 당첨! ${r.prize.label}\n${r.prize.points > 0 ? `**${formatKRW(r.prize.points)}** 이 잔액에 바로 들어갔어요.` : "관리자가 확인 후 지급해 드려요. 티켓으로 문의해 주세요."}`
            : "## 꽝\n아쉬워요, 다음에 다시 도전해 보세요!",
        ),
        textDisplay(`-# ${formatKRW(r.price)} 차감 · 남은 잔액 ${formatKRW(r.balance)}`),
      ],
      won ? 0xa855f7 : 0x6b7280,
    ),
  ]);
}
