import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { ticketTranscriptAccessToken, timingSafeEqualString } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { ticketTranscriptUrl } from "@/lib/domain";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import {
  findShopByDiscordGuildId,
  findShopBySlug,
  getShopSettings,
  initStore,
  listOrders,
  listUsers,
} from "@/lib/store";
import {
  listTicketGuildChannels,
  listTicketGuildRoles,
} from "@/lib/ticket-bot/rest";
import {
  closeTicketFlow,
  fetchOpenTicketMessages,
  replyInTicketChannel,
  syncOpenTicketsFromDiscord,
} from "@/lib/ticket-bot/service";
import {
  createTicketAdminToken,
  readTicketAdminFromRequest,
  ticketAdminCookieName,
  ticketAdminCookieOptions,
} from "@/lib/ticket-bot/session";
import {
  appendTicketAudit,
  getTicketById,
  getTicketGuild,
  getTranscript,
  listTicketAudits,
  listTickets,
  listTranscripts,
  markTicketStaffReply,
  persistTicketStore,
  publicTicketGuild,
  refreshTicketStore,
  setTicketGuildPassword,
  ticketGuildStats,
  updateTicketGuild,
  verifyTicketGuildLogin,
} from "@/lib/ticket-bot/store";
import {
  expandTicketMacro,
  type TicketCloseReason,
} from "@/lib/ticket-bot/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ guildId: string }> };

const topicSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(40),
  description: z.string().max(100).optional(),
  emoji: z.string().max(32).nullable().optional(),
});

const macroSchema = z.object({
  id: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(40),
  body: z.string().max(1900),
  shortcut: z.string().max(2).nullable().optional(),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  guildName: z.string().max(100).optional(),
  ticketCategoryId: z.string().nullable().optional(),
  closeRoleIds: z.array(z.string()).max(50).optional(),
  mentionRoleIds: z.array(z.string()).max(50).optional(),
  logChannelId: z.string().nullable().optional(),
  panelTitle: z.string().max(80).optional(),
  panelDescription: z.string().max(400).optional(),
  panelColor: z.number().int().optional(),
  panelBannerUrl: z.string().max(500).nullable().optional(),
  openEmbedTitle: z.string().max(80).optional(),
  openEmbedBody: z.string().max(400).optional(),
  topics: z.array(topicSchema).max(25).optional(),
  blacklistUserIds: z.array(z.string()).max(200).optional(),
  macros: z.array(macroSchema).max(40).optional(),
  linkedShopSlug: z.string().max(80).nullable().optional(),
});

const loginSchema = z.object({ password: z.string().min(1) });

const closeReasonSchema = z.enum(["resolved", "spam", "duplicate", "other"]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change-password"),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }),
  z.object({
    action: z.literal("reply"),
    ticketId: z.string().min(1),
    content: z.string().min(1).max(2000),
    macroId: z.string().optional(),
  }),
  z.object({
    action: z.literal("close"),
    ticketId: z.string().min(1),
    closeReason: closeReasonSchema.optional(),
    csat: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  }),
  z.object({
    action: z.literal("messages"),
    ticketId: z.string().min(1),
  }),
  z.object({
    action: z.literal("logout"),
  }),
]);

/** Only shops whose Discord guild matches this ticket guild may be linked. */
async function resolveLinkedShop(guildId: string, linkedShopSlug: string | null) {
  await initStore({ force: true });
  const byGuild = findShopByDiscordGuildId(guildId);
  if (!byGuild) return null;

  if (linkedShopSlug?.trim()) {
    const bySlug = findShopBySlug(linkedShopSlug.trim());
    if (!bySlug || bySlug.id !== byGuild.id) {
      return {
        id: byGuild.id,
        slug: byGuild.slug,
        name: byGuild.name,
        discordGuildId: getShopSettings(byGuild.id).discordGuildId,
        orderCount: 0,
        userCount: 0,
        totalPoints: 0,
        recentOrders: [] as {
          id: string;
          productId: string;
          status: string;
          amount: number;
          createdAt: string;
        }[],
        linkMismatch: true as const,
      };
    }
  }

  const shop = byGuild;
  const settings = getShopSettings(shop.id);
  const orders = listOrders(shop.id);
  const users = listUsers(shop.id);
  const recentOrders = orders
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((o) => ({
      id: o.id,
      productId: o.productId,
      status: o.status,
      amount: o.amount,
      createdAt: o.createdAt,
    }));
  const totalPoints = users.reduce((sum, u) => sum + (u.points || 0), 0);
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    discordGuildId: settings.discordGuildId,
    orderCount: orders.length,
    userCount: users.length,
    totalPoints,
    recentOrders,
  };
}

export async function GET(request: Request, ctx: Ctx) {
  await refreshTicketStore();
  const { guildId } = await ctx.params;
  const guild = getTicketGuild(guildId);
  if (!guild) {
    return NextResponse.json({ error: "등록되지 않은 서버입니다." }, { status: 404 });
  }

  const url = new URL(request.url);
  const usernameRaw = url.searchParams.get("username");
  const indexRaw = url.searchParams.get("index");
  const accessToken = url.searchParams.get("t") || url.searchParams.get("token");

  if (usernameRaw && indexRaw) {
    const rl = rateLimit(`tt:${clientIp(request)}:${guildId}`, 60, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

    const index = Number(indexRaw);
    const username = decodeURIComponent(usernameRaw);
    const transcript =
      getTranscript(guildId, username, index) ||
      getTranscript(guildId, usernameRaw, index);
    if (!transcript) {
      return NextResponse.json({ error: "트랜스크립트를 찾을 수 없어요." }, { status: 404 });
    }

    const admin = readTicketAdminFromRequest(request, guildId);
    const expected = ticketTranscriptAccessToken(
      guildId,
      transcript.openerNameSlug,
      transcript.index,
    );
    const tokenOk =
      Boolean(accessToken) && timingSafeEqualString(String(accessToken), expected);
    if (!admin && !tokenOk) {
      return NextResponse.json(
        { error: "접근 토큰이 필요해요.", needToken: true },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true, transcript });
  }

  const admin = readTicketAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({
      ok: false,
      needLogin: true,
      guildId,
      guildName: guild.guildName,
    });
  }

  const [rolesRes, channelsRes] = await Promise.all([
    listTicketGuildRoles(guildId),
    listTicketGuildChannels(guildId),
  ]);

  const openTickets = await syncOpenTicketsFromDiscord(guildId);
  const closedTickets = listTickets(guildId, "closed").slice(0, 40);
  const transcripts = listTranscripts(guildId, 80).map((t) => ({
    id: t.id,
    guildId: t.guildId,
    ticketId: t.ticketId,
    openerNameSlug: t.openerNameSlug,
    index: t.index,
    topicName: t.topicName,
    openerId: t.openerId,
    openerName: t.openerName,
    closedBy: t.closedBy,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    closeReason: t.closeReason,
    csat: t.csat,
    url: ticketTranscriptUrl(
      t.guildId,
      t.openerNameSlug,
      t.index,
      ticketTranscriptAccessToken(t.guildId, t.openerNameSlug, t.index),
    ),
  }));

  const linkedShop = await resolveLinkedShop(guildId, guild.linkedShopSlug);

  return NextResponse.json({
    ok: true,
    guild: publicTicketGuild(guild),
    roles: rolesRes.roles,
    channels: channelsRes.channels,
    categories: channelsRes.channels.filter((c) => c.type === 4),
    openTickets,
    closedTickets,
    transcripts,
    stats: ticketGuildStats(guildId),
    audits: listTicketAudits(guildId, 80),
    linkedShop,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await refreshTicketStore();
  const { guildId } = await ctx.params;
  const json = await request.json().catch(() => null);

  if (json && typeof json === "object" && "password" in json && !("action" in json)) {
    return NextResponse.json(
      { error: "비밀번호 로그인은 종료됐어요. Discord로 로그인해 주세요." },
      { status: 410 },
    );
  }

  const admin = readTicketAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (json && typeof json === "object" && "action" in json) {
    const parsed = actionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }

    if (parsed.data.action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(ticketAdminCookieName(), "", { ...ticketAdminCookieOptions(0), maxAge: 0 });
      return res;
    }

    if (parsed.data.action === "change-password") {
      return NextResponse.json(
        { error: "웹 비밀번호는 더 이상 사용하지 않아요. Discord로 로그인하세요." },
        { status: 410 },
      );
    }

    if (parsed.data.action === "messages") {
      const ticket = getTicketById(parsed.data.ticketId);
      if (!ticket || ticket.guildId !== guildId || ticket.status !== "open") {
        return NextResponse.json({ error: "열린 티켓이 없어요." }, { status: 404 });
      }
      const messages = await fetchOpenTicketMessages(ticket.channelId);
      return NextResponse.json({ ok: true, messages });
    }

    if (parsed.data.action === "reply") {
      const guild = getTicketGuild(guildId);
      const ticket = getTicketById(parsed.data.ticketId);
      if (!ticket || ticket.guildId !== guildId || ticket.status !== "open") {
        return NextResponse.json({ error: "열린 티켓이 없어요." }, { status: 404 });
      }
      let content = parsed.data.content;
      const macroId = parsed.data.macroId;
      if (macroId && guild) {
        const macro = guild.macros.find((m) => m.id === macroId);
        if (macro) {
          content = expandTicketMacro(macro.body, {
            openerName: ticket.openerName,
            openerId: ticket.openerId,
            topicName: ticket.topicName,
            channelId: ticket.channelId,
            userTicketIndex: ticket.userTicketIndex,
          });
        }
      } else if (guild && content.includes("{")) {
        content = expandTicketMacro(content, {
          openerName: ticket.openerName,
          openerId: ticket.openerId,
          topicName: ticket.topicName,
          channelId: ticket.channelId,
          userTicketIndex: ticket.userTicketIndex,
        });
      }
      const posted = await replyInTicketChannel(ticket.channelId, content);
      if (!posted.ok) {
        return NextResponse.json({ error: "메시지 전송에 실패했어요." }, { status: 502 });
      }
      if (markTicketStaffReply(ticket.id)) {
        await persistTicketStore();
      }
      const messages = await fetchOpenTicketMessages(ticket.channelId);
      return NextResponse.json({ ok: true, messages });
    }

    if (parsed.data.action === "close") {
      const ticket = getTicketById(parsed.data.ticketId);
      if (!ticket || ticket.guildId !== guildId) {
        return NextResponse.json({ error: "티켓이 없어요." }, { status: 404 });
      }
      const closed = await closeTicketFlow({
        ticketId: ticket.id,
        closedById: "web",
        closedByLabel: "웹패널",
        closeReason: (parsed.data.closeReason as TicketCloseReason | undefined) ?? "resolved",
        csat: parsed.data.csat ?? null,
      });
      if (!closed.ok) {
        return NextResponse.json({ error: closed.error }, { status: 400 });
      }
      appendTicketAudit({
        guildId,
        actor: "web",
        action: "close",
        detail: `티켓 ${ticket.id} 종료 (${closed.ticket.closeReason || "-"})`,
      });
      await persistTicketStore();
      return NextResponse.json({
        ok: true,
        url: closed.url,
        ticket: closed.ticket,
      });
    }
  }

  const patch = patchSchema.safeParse(json);
  if (!patch.success) {
    return NextResponse.json({ error: "잘못된 설정입니다." }, { status: 400 });
  }

  if (patch.data.linkedShopSlug !== undefined && patch.data.linkedShopSlug) {
    await initStore({ force: true });
    const bound = findShopByDiscordGuildId(guildId);
    const want = findShopBySlug(patch.data.linkedShopSlug.trim());
    if (!bound || !want || bound.id !== want.id) {
      return NextResponse.json(
        {
          error:
            "연동 상점은 이 Discord 서버에 연결된 DOES 샵만 가능합니다. 샵 Discord 길드 ID를 맞춰 주세요.",
        },
        { status: 403 },
      );
    }
  }

  const topics = patch.data.topics?.map((t) => ({
    id: t.id?.trim() || randomUUID().slice(0, 8),
    name: t.name,
    description: t.description || "",
    emoji: t.emoji ?? null,
  }));

  const macros = patch.data.macros?.map((m) => ({
    id: m.id?.trim() || randomUUID().slice(0, 8),
    label: m.label,
    body: m.body,
    shortcut: m.shortcut ?? null,
  }));

  const updated = updateTicketGuild(guildId, {
    ...patch.data,
    topics,
    macros,
  });
  if (!updated) {
    return NextResponse.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });
  }
  appendTicketAudit({
    guildId,
    actor: "web",
    action: "settings",
    detail: `설정 저장 (${Object.keys(patch.data).join(", ") || "patch"})`,
  });
  await persistTicketStore();
  return NextResponse.json({ ok: true, guild: publicTicketGuild(updated) });
}
