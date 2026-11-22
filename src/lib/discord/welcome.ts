/**
 * 입장 환영 — StatusWatch(게이트웨이)가 GUILD_MEMBER_ADD 를 받으면 /api/discord/server-status(op: member_add)로 넘기고,
 * 여기서 환영 패널(GIF · 몇 번째 멤버 · 처음 오셨나요? · 웹사이트 열기)을 정해 둔 채널에 올린다.
 */
import { MFA_SITE_ORIGIN } from "@/lib/domain";
import { appEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  button,
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  section,
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

const DEFAULT_SITE = `${MFA_SITE_ORIGIN}`;

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

/**
 * 환영 패널 — 위: 프로필 + 인사 / 가운데: GIF / 아래: 바로가기 카드(채널마다 오른쪽 '이동' 버튼) / 맨 아래: 웹사이트 열기
 */
export function welcomePanel(
  shopName: string,
  cfg: WelcomeConfig,
  member: { userId: string; avatar?: string | null; memberCount?: number | null; guildId?: string | null },
  shopSlug?: string | null,
) {
  const created = createdAtSec(member.userId);
  const info = [
    member.memberCount ? `**${member.memberCount.toLocaleString("ko-KR")}번째** 멤버` : "",
    created ? `디스코드 가입 <t:${created}:R>` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const go = (channelId: string) =>
    member.guildId
      ? button({ label: "이동", url: `https://discord.com/channels/${member.guildId}/${channelId}` })
      : null;
  const shortcuts: { channelId: string; title: string; desc: string }[] = [];
  if (cfg.verifyChannelId) shortcuts.push({ channelId: cfg.verifyChannelId, title: "인증하기", desc: "버튼 한 번으로 인증하고 채널을 열어요" });
  if (cfg.rulesChannelId) shortcuts.push({ channelId: cfg.rulesChannelId, title: "규칙 · 이용약관", desc: "이용 전에 꼭 확인해 주세요" });
  if (cfg.shopChannelId) shortcuts.push({ channelId: cfg.shopChannelId, title: "구매하기", desc: "상품을 보고 바로 구매할 수 있어요" });
  if (cfg.ticketChannelId) shortcuts.push({ channelId: cfg.ticketChannelId, title: "문의하기", desc: "궁금한 점은 티켓으로 물어봐 주세요" });

  // 환영 이미지 (프로필 · 이름 · 몇 번째 멤버 · 가입일) — 상점 주소를 알면 이미지, 아니면 예전 GIF 패널
  const image = shopSlug
    ? `${MFA_SITE_ORIGIN}/api/discord/rank-image/${shopSlug}-welcome-${member.guildId ?? "0"}-${member.userId}-${member.memberCount ?? 0}-${member.avatar || "0"}.png`
    : null;
  const kids: unknown[] = image
    ? [
        textDisplay(`<@${member.userId}> 님, **${shopName}** 에 오신 걸 환영해요 ${appEmoji("does_star")}`),
        mediaGallery([image]),
      ]
    : [
        sectionText({
          text: `## 환영합니다!\n<@${member.userId}> 님, **${shopName}** 에 오신 걸 환영해요 ${appEmoji("does_star")}${info ? `\n-# ${info}` : ""}`,
          accessory: thumbnail(avatarUrl(member.userId, member.avatar)),
        }),
        mediaGallery([`${appOrigin()}/brand/welcome-3d.gif`]),
      ];
  if (shortcuts.length) {
    kids.push(separator(true, 1), textDisplay("### 바로가기"));
    for (const sc of shortcuts) {
      const btn = go(sc.channelId);
      const text = `**${sc.title}** · <#${sc.channelId}>\n-# ${sc.desc}`;
      kids.push(btn ? section({ text, accessory: btn }) : textDisplay(text));
    }
  }
  kids.push(
    separator(true, 1),
    actionRow(button({ label: "웹사이트 열기", url: cfg.siteUrl || DEFAULT_SITE })),
  );

  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container(kids, 0x22c55e)],
    allowed_mentions: { users: [member.userId] },
  };
}

/** /환영설정 */
export async function handleWelcomeSetup(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  opts: WelcomeConfig & { test?: boolean; userId?: string; guildId?: string | null },
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
    await postChannelMessage(cfg.channelId, welcomePanel(shop.name, cfg, { userId: opts.userId, guildId: opts.guildId }, shop.slug), shop.id).catch(() => null);
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
  const r = await postChannelMessage(cfg.channelId, welcomePanel(shop.name, cfg, { ...member, memberCount }, shop.slug), shopId);
  return { ok: r.ok, status: r.status };
}
