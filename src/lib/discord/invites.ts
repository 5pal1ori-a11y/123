/**
 * 초대 이벤트 — 손님마다 자기 초대 링크를 만들어 주고, 새 멤버가 들어오면 어느 링크로 왔는지 찾아 초대한 사람에게 센다.
 * /초대이벤트(패널) · /초대랭킹(1시간마다 갱신) · /초대로그(누가 누구를 초대했는지)
 * 데이터는 KV `invites:v1:<서버ID>` 에 둔다. 봇에게 '초대 만들기' · '서버 관리'(초대 목록 보기) 권한이 필요하다.
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
  sectionText,
  separator,
  textDisplay,
  thumbnail,
  v2Ephemeral,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopById, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";
import type { Shop } from "@/lib/types";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

type InviteDb = {
  codes: Record<string, { inviter: string; uses: number; createdAt: string }>;
  byUser: Record<string, string>;
  joins: Record<string, { inviter: string; at: string; left?: boolean }>;
  counts: Record<string, { joins: number; left: number }>;
};

const key = (guildId: string) => `invites:v1:${guildId}`;

async function load(guildId: string): Promise<InviteDb> {
  const db = await kvGetJson<InviteDb>(key(guildId));
  return db ?? { codes: {}, byUser: {}, joins: {}, counts: {} };
}
async function save(guildId: string, db: InviteDb) {
  await kvPutJson(key(guildId), db);
}

function origin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

function realCount(db: InviteDb, userId: string) {
  const c = db.counts[userId];
  return c ? Math.max(0, c.joins - c.left) : 0;
}

/** 이벤트 보상 안내 (DOES 기본값) */
const DEFAULT_REWARDS = [
  "2명 이상 초대 시 자판기 2,000원 충전",
  "5명 이상 초대 시 망토 증정",
  "10명 이상 초대 시 디스코드 랜덤장식 2개 증정",
  "15명 이상 초대 시 자판기 5,000원 충전",
  "20명 이상 초대 시 망토 또는 자판기 7,000원 충전",
  "25명 이상 초대 시 마인크래프트 정품 계정 지급 (밴 유무 랜덤)",
  "30명 이상 초대 시 마인크래프트 풀보증 정품계정 지급 (모든 서버 언밴)",
  "35명 이상 초대 시 자판기 15,000원 충전",
];

function eventPanel(shop: Shop) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${origin()}/brand/invite-event-hq.gif`]),
          textDisplay("## 초대 이벤트\n아래 버튼으로 **내 초대 링크**를 만들어 친구를 초대해 보세요."),
          separator(true, 1),
          textDisplay(`### 보상\n${DEFAULT_REWARDS.map((r) => `> ${r}`).join("\n")}`),
          actionRow(
            button({ customId: cid(shop.slug, "inv_create"), label: "초대 링크 만들기", emoji: "🔗" }),
            button({ customId: cid(shop.slug, "inv_mine"), label: "내 초대 확인하기", emoji: "📊" }),
          ),
          textDisplay("-# 내 링크로 들어온 사람만 세요 · 나간 사람은 빼고 셉니다 · 보상은 티켓으로 받아 가세요"),
        ],
        0x3b82f6,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

function adminOnly(shop: Shop, actor: { roles: string[] }, perms?: string) {
  return isDiscordAdmin(getShopSettings(shop.id), actor.roles, perms);
}

/** /초대이벤트 — 패널을 채널에 올린다 */
export async function handleInviteEventCommand(shop: Shop, actor: { roles: string[] }, perms: string | undefined, channelId?: string) {
  if (!adminOnly(shop, actor, perms)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const posted = await postChannelMessage(channelId, eventPanel(shop), shop.id);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  return plainEphemeral("초대 이벤트 패널을 올렸어요. 봇에게 **초대 만들기 · 서버 관리** 권한이 있어야 초대를 셀 수 있어요.");
}

/** 버튼: 내 초대 링크 만들기 (이미 있으면 그 링크를 다시 보여 준다) */
export async function handleInviteCreate(shop: Shop, interaction: DiscordInteraction, userId: string) {
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId || !channelId) return plainEphemeral("서버에서만 쓸 수 있어요.");
  const db = await load(guildId);
  const have = db.byUser[userId];
  if (have && db.codes[have]) {
    return v2Ephemeral([
      container([
        textDisplay(`## 내 초대 링크\nhttps://discord.gg/${have}`),
        textDisplay(`지금까지 **${realCount(db, userId)}명** 초대했어요.\n-# 이 링크를 친구에게 보내 주세요 · 링크는 만료되지 않아요`),
      ], 0x3b82f6),
    ]);
  }
  const r = await discordRest("POST", `/channels/${channelId}/invites`, { max_age: 0, max_uses: 0, unique: true, temporary: false }, shop.id);
  const code = r.ok ? (r.json as { code?: string } | null)?.code : null;
  if (!code) return plainEphemeral("초대 링크를 만들지 못했어요. 봇에게 이 채널의 '초대 만들기' 권한이 있는지 관리자에게 알려 주세요.");
  db.codes[code] = { inviter: userId, uses: 0, createdAt: new Date().toISOString() };
  db.byUser[userId] = code;
  await save(guildId, db);
  return v2Ephemeral([
    container([
      textDisplay(`## 내 초대 링크가 만들어졌어요\nhttps://discord.gg/${code}`),
      textDisplay("-# 이 링크로 들어온 친구가 나에게 세어져요 · 링크는 만료되지 않아요"),
    ], 0x22c55e),
  ]);
}

/** 버튼: 내 초대 확인하기 */
export async function handleInviteMine(interaction: DiscordInteraction, userId: string) {
  const guildId = interaction.guild_id;
  if (!guildId) return plainEphemeral("서버에서만 쓸 수 있어요.");
  const db = await load(guildId);
  const c = db.counts[userId] ?? { joins: 0, left: 0 };
  const ranking = rankList(db);
  const pos = ranking.findIndex((x) => x.id === userId);
  const code = db.byUser[userId];
  const recent = Object.entries(db.joins)
    .filter(([, j]) => j.inviter === userId)
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, 8)
    .map(([mid, j]) => `> <@${mid}>${j.left ? " · 나감" : ""} · <t:${Math.floor(new Date(j.at).getTime() / 1000)}:R>`);
  return v2Ephemeral([
    container([
      textDisplay(`## 내 초대 현황\n**${Math.max(0, c.joins - c.left)}명** 초대 중${pos >= 0 ? ` · 랭킹 **${pos + 1}위**` : ""}`),
      textDisplay(`-# 들어온 사람 ${c.joins}명 · 나간 사람 ${c.left}명`),
      ...(recent.length ? [separator(true, 1), textDisplay(`### 최근 초대\n${recent.join("\n")}`)] : []),
      textDisplay(code ? `-# 내 링크 https://discord.gg/${code}` : "-# 아직 내 초대 링크가 없어요 · '초대 링크 만들기'를 눌러 주세요"),
    ], 0x3b82f6),
  ]);
}

function rankList(db: InviteDb) {
  return Object.entries(db.counts)
    .map(([id, c]) => ({ id, n: Math.max(0, c.joins - c.left), joins: c.joins }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || b.joins - a.joins);
}

/** 게이트웨이: 새 멤버 → 초대 링크 사용 횟수가 늘어난 링크를 찾아 초대한 사람에게 센다 */
export async function onMemberJoin(shopId: string, guildId: string, memberId: string, avatar?: string | null) {
  const db = await load(guildId);
  const tracked = Object.keys(db.codes);
  let inviter: string | null = null;
  if (tracked.length) {
    const r = await discordRest("GET", `/guilds/${guildId}/invites`, undefined, shopId);
    const list = r.ok && Array.isArray(r.json) ? (r.json as { code: string; uses?: number }[]) : [];
    const live = new Map(list.map((i) => [i.code, i.uses ?? 0]));
    for (const code of tracked) {
      const now = live.get(code);
      if (now === undefined) continue;
      if (now > db.codes[code]!.uses && !inviter) inviter = db.codes[code]!.inviter;
      db.codes[code]!.uses = now;
    }
  }
  const already = db.joins[memberId];
  if (inviter && inviter !== memberId) {
    if (already && !already.left && already.inviter === inviter) {
      // 이미 센 사람 (중복)
    } else {
      if (already?.left) {
        const prev = db.counts[already.inviter];
        if (prev) prev.left = Math.max(0, prev.left - (already.inviter === inviter ? 1 : 0));
      }
      const c = (db.counts[inviter] ??= { joins: 0, left: 0 });
      if (!(already?.left && already.inviter === inviter)) c.joins += 1;
      db.joins[memberId] = { inviter, at: new Date().toISOString() };
    }
  }
  await save(guildId, db);
  await postInviteLog(shopId, memberId, avatar ?? null, inviter && inviter !== memberId ? inviter : null, inviter ? realCount(db, inviter) : 0);
  return inviter;
}

/** 게이트웨이: 멤버가 나감 → 초대한 사람의 인원에서 뺀다 */
export async function onMemberLeave(guildId: string, memberId: string) {
  const db = await load(guildId);
  const j = db.joins[memberId];
  if (!j || j.left) return;
  j.left = true;
  const c = db.counts[j.inviter];
  if (c) c.left += 1;
  await save(guildId, db);
}

function avatarUrl(userId: string, avatar: string | null) {
  if (avatar) return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  return "https://cdn.discordapp.com/embed/avatars/0.png";
}

async function postInviteLog(shopId: string, memberId: string, avatar: string | null, inviter: string | null, count: number) {
  const ch = getShopSettings(shopId).inviteLogChannelId;
  if (!ch) return;
  const now = Math.floor(Date.now() / 1000);
  await postChannelMessage(
    ch,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container(
          [
            sectionText({
              text: inviter
                ? `### 🎉 새 멤버가 왔어요\n<@${inviter}> 님이 <@${memberId}> 님을 초대했어요!\n-# <@${inviter}> 님의 초대 **${count}명** · <t:${now}:R>`
                : `### 👋 새 멤버가 왔어요\n<@${memberId}> 님이 들어왔어요\n-# 초대한 사람을 찾지 못했어요 (개인 초대 링크가 아닌 경로) · <t:${now}:R>`,
              accessory: thumbnail(avatarUrl(memberId, avatar)),
            }),
          ],
          inviter ? 0x22c55e : 0x6b7280,
        ),
      ],
      allowed_mentions: { parse: [] },
    },
    shopId,
  ).catch(() => null);
}

/** /초대로그 채널 */
export async function handleInviteLogCommand(shop: Shop, actor: { roles: string[] }, perms: string | undefined, channelId: string | null) {
  if (!adminOnly(shop, actor, perms)) return errorPanel("관리자만 정할 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널을 골라 주세요.");
  updateShopSettings(shop.id, { inviteLogChannelId: channelId });
  await persistAsync();
  return plainEphemeral(`앞으로 누가 누구를 초대했는지 <#${channelId}> 에 올려요.`);
}

function rankPanel(shopName: string, db: InviteDb) {
  const medals = ["🥇", "🥈", "🥉"];
  const top = rankList(db).slice(0, 10);
  const max = top[0]?.n || 1;
  const lines = top.map((x, i) => {
    const bar = "▰".repeat(Math.max(1, Math.round((x.n / max) * 10))) + "▱".repeat(10 - Math.max(1, Math.round((x.n / max) * 10)));
    return `${medals[i] ?? `**${i + 1}위**`} <@${x.id}> · **${x.n}명**\n\`${bar}\``;
  });
  const now = Math.floor(Date.now() / 1000);
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${origin()}/brand/invite-rank-hq.gif`]),
          textDisplay(`## ${shopName} 초대 랭킹`),
          separator(true, 1),
          textDisplay(lines.length ? lines.join("\n") : "아직 초대한 사람이 없어요. 초대 이벤트 패널에서 링크를 만들어 보세요!"),
          separator(true, 1),
          textDisplay(`-# 1시간마다 갱신 · 실제 남아 있는 인원 기준 · 마지막 갱신 <t:${now}:R>`),
        ],
        0xf59e0b,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** /초대랭킹 — 랭킹판을 올리고 1시간마다 고쳐 쓴다 */
export async function handleInviteRankCommand(shop: Shop, actor: { roles: string[] }, perms: string | undefined, channelId?: string, guildId?: string) {
  if (!adminOnly(shop, actor, perms)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId || !guildId) return errorPanel("서버 채널에서 다시 써 주세요.");
  const db = await load(guildId);
  const posted = await postChannelMessage(channelId, rankPanel(shop.name, db), shop.id);
  const id = posted.ok ? (posted.json as { id?: string } | null)?.id : null;
  if (!id) return errorPanel("랭킹판을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  const panels = [...(getShopSettings(shop.id).inviteRankPanels ?? []), { channelId, messageId: String(id), guildId }].slice(-5);
  updateShopSettings(shop.id, { inviteRankPanels: panels });
  await persistAsync();
  return plainEphemeral("초대 랭킹판을 올렸어요. 1시간마다 자동으로 갱신돼요.");
}

/** 크론: 1시간에 한 번 랭킹판 갱신 */
export async function refreshInviteRanks(shopId: string) {
  const panels = getShopSettings(shopId).inviteRankPanels ?? [];
  const shop = getShopById(shopId);
  if (!panels.length || !shop) return { panels: 0 };
  const alive: typeof panels = [];
  for (const p of panels) {
    const db = await load(p.guildId);
    const r = await editChannelMessage(p.channelId, p.messageId, rankPanel(shop.name, db), shopId).catch(() => null);
    if (r?.ok || (r && r.status !== 404)) alive.push(p);
  }
  if (alive.length !== panels.length) {
    updateShopSettings(shopId, { inviteRankPanels: alive });
    await persistAsync();
  }
  return { panels: alive.length };
}
