import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/csrf";
import { listManageGuildCategories, listManageGuildTextChannels } from "@/lib/manage-bot/rest";
import { sendManageEmbed, sendPartnerBroadcast } from "@/lib/manage-bot/service";
import {
  createManageAdminToken,
  manageAdminCookieName,
  manageAdminCookieOptions,
  readManageAdminFromRequest,
} from "@/lib/manage-bot/session";
import {
  addPartnerWebhook,
  appendManageAudit,
  getManageGuild,
  initManageStore,
  issueBannerLicenses,
  listBannerLicenses,
  listBanners,
  listManageAudits,
  listPartnerSendLogs,
  listPartnerWebhooks,
  persistManageStore,
  publicManageStats,
  removePartnerWebhook,
  setManageGuildPassword,
  updateManageGuild,
  updatePartnerWebhook,
  verifyManageGuildLogin,
} from "@/lib/manage-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ guildId: string }> };

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  guildName: z.string().max(100).optional(),
  bannerCategoryId: z.string().nullable().optional(),
  bannerChannelPrefix: z.string().max(40).optional(),
  bannerPanelTitle: z.string().max(80).optional(),
  bannerPanelDescription: z.string().max(400).optional(),
  bannerButtonLabel: z.string().max(80).optional(),
  partnerMessage: z.string().max(2000).optional(),
  partnerWebhookName: z.string().max(80).optional(),
  partnerWebhookAvatarUrl: z.string().nullable().optional(),
  partnerEnabled: z.boolean().optional(),
  partnerHourKst: z.number().int().min(0).max(23).optional(),
  partnerMinuteKst: z.number().int().min(0).max(59).optional(),
});

export async function GET(request: Request, ctx: Ctx) {
  await initManageStore({ force: true });
  const { guildId } = await ctx.params;
  const guild = getManageGuild(guildId);
  if (!guild) return NextResponse.json({ error: "서버 없음" }, { status: 404 });

  const admin = readManageAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({ needLogin: true, guild: { guildId: guild.guildId, guildName: guild.guildName } });
  }

  const cats = await listManageGuildCategories(guildId);
  const textCh = await listManageGuildTextChannels(guildId);
  return NextResponse.json({
    ok: true,
    guild: {
      ...guild,
      adminPasswordHash: undefined,
      adminPasswordPlain: undefined,
    },
    stats: publicManageStats(guildId),
    licenses: listBannerLicenses(guildId).slice(0, 100),
    banners: listBanners(guildId).slice(0, 80),
    webhooks: listPartnerWebhooks(guildId),
    partnerLogs: listPartnerSendLogs(guildId, 40),
    audits: listManageAudits(guildId, 40),
    categories: cats.categories,
    channels: textCh.channels,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initManageStore();
  const { guildId } = await ctx.params;
  if (!readManageAdminFromRequest(request, guildId)) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "입력 오류" }, { status: 400 });
  const guild = updateManageGuild(guildId, parsed.data);
  if (!guild) return NextResponse.json({ error: "서버 없음" }, { status: 404 });
  appendManageAudit({
    guildId,
    actor: "panel",
    action: "settings_save",
    detail: Object.keys(parsed.data).join(","),
  });
  await persistManageStore();
  return NextResponse.json({ ok: true, guild });
}

export async function POST(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initManageStore();
  const { guildId } = await ctx.params;
  const json = (await request.json().catch(() => ({}))) as {
    action?: string;
    password?: string;
    days?: number;
    count?: number;
    url?: string;
    label?: string;
    webhookId?: string;
    enabled?: boolean;
    channelId?: string;
    embed?: Record<string, unknown>;
  };

  if (json.action === "login") {
    if (!json.password || !verifyManageGuildLogin(guildId, json.password)) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않아요." }, { status: 401 });
    }
    const token = createManageAdminToken(guildId);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(manageAdminCookieName(), token, manageAdminCookieOptions() as never);
    return res;
  }

  if (!readManageAdminFromRequest(request, guildId)) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  if (json.action === "issue-licenses") {
    const days = Number(json.days) || 0;
    const count = Number(json.count) || 0;
    if (days < 1 || count < 1) return NextResponse.json({ error: "일수·갯수 확인" }, { status: 400 });
    const issued = issueBannerLicenses({
      guildId,
      days,
      count,
      createdBy: "panel",
    });
    appendManageAudit({
      guildId,
      actor: "panel",
      action: "license_issue",
      detail: `${days}일 × ${count}개`,
    });
    await persistManageStore();
    return NextResponse.json({ ok: true, licenses: issued });
  }

  if (json.action === "add-webhook") {
    const res = addPartnerWebhook({
      guildId,
      url: json.url || "",
      label: json.label,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    appendManageAudit({
      guildId,
      actor: "panel",
      action: "partner_webhook_add",
      detail: res.webhook.label,
    });
    await persistManageStore();
    return NextResponse.json({ ok: true, webhook: res.webhook });
  }

  if (json.action === "remove-webhook") {
    if (!json.webhookId) return NextResponse.json({ error: "webhookId 필요" }, { status: 400 });
    removePartnerWebhook(guildId, json.webhookId);
    await persistManageStore();
    return NextResponse.json({ ok: true });
  }

  if (json.action === "toggle-webhook") {
    if (!json.webhookId) return NextResponse.json({ error: "webhookId 필요" }, { status: 400 });
    updatePartnerWebhook(guildId, json.webhookId, { enabled: Boolean(json.enabled) });
    await persistManageStore();
    return NextResponse.json({ ok: true });
  }

  if (json.action === "partner-send-now") {
    const result = await sendPartnerBroadcast(guildId, { force: true });
    appendManageAudit({
      guildId,
      actor: "panel",
      action: "partner_send_now",
      detail: `ok ${result.sent} / fail ${result.failed}`,
    });
    await persistManageStore();
    return NextResponse.json(result);
  }

  if (json.action === "send-embed") {
    const embed = (json.embed || {}) as {
      content?: string;
      title?: string;
      url?: string;
      description?: string;
      color?: string;
      authorName?: string;
      authorUrl?: string;
      authorIcon?: string;
      footerText?: string;
      footerIcon?: string;
      thumbnailUrl?: string;
      imageUrl?: string;
      timestamp?: boolean;
      fields?: { name?: string; value?: string; inline?: boolean }[];
    };
    const result = await sendManageEmbed({
      guildId,
      channelId: String(json.channelId || ""),
      actor: "panel",
      draft: {
        content: String(embed.content || ""),
        title: String(embed.title || ""),
        url: String(embed.url || ""),
        description: String(embed.description || ""),
        color: String(embed.color || ""),
        authorName: String(embed.authorName || ""),
        authorUrl: String(embed.authorUrl || ""),
        authorIcon: String(embed.authorIcon || ""),
        footerText: String(embed.footerText || ""),
        footerIcon: String(embed.footerIcon || ""),
        thumbnailUrl: String(embed.thumbnailUrl || ""),
        imageUrl: String(embed.imageUrl || ""),
        timestamp: Boolean(embed.timestamp),
        fields: Array.isArray(embed.fields)
          ? embed.fields.map((f) => ({
              name: String(f.name || ""),
              value: String(f.value || ""),
              inline: Boolean(f.inline),
            }))
          : [],
      },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (json.action === "change-password") {
    if (!json.password || json.password.length < 8) {
      return NextResponse.json({ error: "비밀번호 8자 이상" }, { status: 400 });
    }
    setManageGuildPassword(guildId, json.password);
    await persistManageStore();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { guildId } = await ctx.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(manageAdminCookieName(), "", { ...manageAdminCookieOptions(0), maxAge: 0 });
  void guildId;
  return res;
}
