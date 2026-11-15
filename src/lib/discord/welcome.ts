/**
 * 입장 환영 — StatusWatch(게이트웨이)가 GUILD_MEMBER_ADD 를 받으면 /api/discord/server-status(op: member_add)로 넘기고,
 * 여기서 환영 패널(GIF · 몇 번째 멤버 · 처음 오셨나요? · 웹사이트 열기)을 정해 둔 채널에 올린다.
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  button,
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  sectionText,
  separator,
  textDisplay,
  thumbnail,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { getShopById, getShopBySlug, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";

export type WelcomeConfig = {
  channelId: string;
  verifyChannelId?: string | null;
  rulesChannelId?: string | null;
  shopChannelId?: string | null;
  ticketChannelId?: string | null;
  siteUrl?: string | null;
};

const DEFAULT_SITE = "https://doesmc.xyz";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

/** 디스코드 ID(스노우플레이크)에서 계정 만든 시각 */
function createdAtSec(userId: string) {
  try {
    return Math.floor(Number((BigInt(userId) >> BigInt(22)) + BigInt(1420070400000)) / 1000);
  } catch {
    return null;
  }
}

function avatarUrl(userId: string, avatar: string | null | undefined) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  try {
    const idx = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export function welcomePanel(
  shopName: string,
  cfg: WelcomeConfig,
  member: { userId: string; avatar?: string | null; memberCount?: number | null },
) {
  const created = createdAtSec(member.userId);
  const info = [
    member.memberCount ? `${member.memberCount.toLocaleString("ko-KR")}번째 멤버` : "",
    created ? `디스코드 가입 <t:${created}:R>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const steps: string[] = [];
  let n = 1;
  if (cfg.verifyChannelId) steps.push(`> ${n++}. <#${cfg.verifyChannelId}> 에서 ${appEmoji("does_check")} 버튼을 눌러 인증해 주세요`);
  if (cfg.rulesChannelId) steps.push(`> ${n++}. <#${cfg.rulesChannelId}> 를 확인해 주세요`);
  if (cfg.shopChannelId) steps.push(`> ${n++}. <#${cfg.shopChannelId}> 에서 바로 구매할 수 있어요`);
  else steps.push(`> ${n++}. 아래 **웹사이트 열기** 에서 바로 구매할 수 있어요`);
  if (cfg.ticketChannelId) steps.push(`> └ 궁금한 점은 <#${cfg.ticketChannelId}> 로 문의해 주세요`);

  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${appOrigin()}/brand/welcome.gif`]),
          sectionText({
            text: `${appEmoji("does_star")} <@${member.userId}> 님, **${shopName}** 에 오신 걸 환영해요.${info ? `\n-# ${info}` : ""}`,
            accessory: thumbnail(avatarUrl(member.userId, member.avatar)),
          }),
          separator(true, 1),
          textDisplay(`### ${appEmoji("does_online")} 처음 오셨나요?\n${steps.join("\n")}`),
          actionRow(button({ label: "웹사이트 열기", emoji: appEmoji("does_star"), url: cfg.siteUrl || DEFAULT_SITE })),
          separator(true, 1),
          textDisplay("-# 판매자·봇은 DM으로 결제·계정 정보·인증 코드를 절대 먼저 요구하지 않습니다 — 그런 DM은 사기입니다"),
        ],
        0xef4444,
      ),
    ],
    allowed_mentions: { users: [member.userId] },
  };
}

/** /환영설정 */
export async function handleWelcomeSetup(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  opts: WelcomeConfig & { test?: boolean; userId?: string },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("관리자만 설정할 수 있어요.", "권한 없음");
  }
  const site = opts.siteUrl?.trim();
  if (site && !/^https?:\/\/\S+$/i.test(site)) return errorPanel("웹사이트 주소는 https:// 로 시작해야 해요.");
  const cfg: WelcomeConfig = {
    channelId: opts.channelId,
    verifyChannelId: opts.verifyChannelId || null,
    rulesChannelId: opts.rulesChannelId || null,
    shopChannelId: opts.shopChannelId || null,
    ticketChannelId: opts.ticketChannelId || null,
    siteUrl: site || null,
  };
  updateShopSettings(shop.id, { welcome: cfg });
  await persistAsync();
  // 미리보기: 설정한 사람으로 한 번 올려 본다
  if (opts.userId) {
    await postChannelMessage(cfg.channelId, welcomePanel(shop.name, cfg, { userId: opts.userId }), shop.id).catch(() => null);
  }
  return plainEphemeral(
    `입장 환영 채널을 <#${cfg.channelId}> 로 정했어요. 미리보기를 한 번 올렸어요.\n-# 새 멤버가 들어오면 자동으로 올라가요 · 디스코드 개발자 포털에서 봇의 **Server Members Intent** 가 켜져 있어야 해요`,
  );
}

/** 게이트웨이에서 받은 입장 이벤트 */
export async function postWelcome(shopId: string, member: { userId: string; avatar?: string | null; guildId: string }) {
  const shop = getShopById(shopId);
  const cfg = getShopSettings(shopId).welcome;
  if (!shop || !cfg?.channelId) return { ok: false as const, error: "welcome not configured" };
  let memberCount: number | null = null;
  const g = await discordRest("GET", `/guilds/${member.guildId}?with_counts=true`, undefined, shopId).catch(() => null);
  if (g?.ok) memberCount = (g.json as { approximate_member_count?: number })?.approximate_member_count ?? null;
  const r = await postChannelMessage(cfg.channelId, welcomePanel(shop.name, cfg, { ...member, memberCount }), shopId);
  return { ok: r.ok, status: r.status };
}
