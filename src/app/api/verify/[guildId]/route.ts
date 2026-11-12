import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/csrf";
import {
  buildHourlyHeatmap,
  computeSuspicionScore,
  topBlockedAsns,
  topBlockedCountries,
  topSources,
} from "@/lib/verify-bot/analytics";
import { VERIFY_PLAN_LABELS, verifyHasFeature, recoveryLimitFor } from "@/lib/verify-bot/plan";
import { listGuildRoles, listGuildTextChannels } from "@/lib/verify-bot/rest";
import {
  createVerifyAdminToken,
  readVerifyAdminFromRequest,
  verifyAdminCookieName,
  verifyAdminCookieOptions,
} from "@/lib/verify-bot/session";
import { turnstileSiteKey } from "@/lib/verify-bot/turnstile-public";
import {
  appendVerifyAudit,
  clearVerifyEvents,
  getVerifyGuild,
  initVerifyStore,
  listVerifyAudits,
  listVerifyEvents,
  persistVerifyStore,
  publicGuildStats,
  publicMembers,
  removeVerifyMember,
  rotateVerifyRecoveryKey,
  setVerifyGuildPassword,
  updateVerifyGuild,
  verifyGuildLogin,
} from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ guildId: string }> };

const strList = z.array(z.string()).max(500).optional();

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  verifiedRoleId: z.string().nullable().optional(),
  logChannelId: z.string().nullable().optional(),
  logIp: z.boolean().optional(),
  logEmail: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  requirePhoneLinked: z.boolean().optional(),
  guildName: z.string().optional(),
  joinsToday: z.number().int().min(0).optional(),
  blockVpn: z.boolean().optional(),
  blockProxy: z.boolean().optional(),
  blockMobile: z.boolean().optional(),
  blockForeign: z.boolean().optional(),
  allowedCountries: z.array(z.string().min(2).max(2)).max(20).optional(),
  panelTitle: z.string().max(80).optional(),
  panelDescription: z.string().max(400).optional(),
  buttonLabel: z.string().max(80).optional(),
  minAccountAgeDays: z.number().int().min(0).max(3650).optional(),
  maxVerifiesPerIpPerDay: z.number().int().min(0).max(1000).optional(),
  reverifyCooldownHours: z.number().int().min(0).max(8760).optional(),
  kickUnverifiedMinutes: z.number().int().min(0).max(10080).optional(),
  enableTurnstile: z.boolean().optional(),
  trackSources: z.boolean().optional(),
  blacklistUserIds: strList,
  blacklistIps: strList,
  whitelistIps: strList,
  webhookUrl: z.string().nullable().optional(),
  dmOnVerify: z.boolean().optional(),
  dmMessage: z.string().max(500).optional(),
  logBlockedAttempts: z.boolean().optional(),
  blockDuplicateIp: z.boolean().optional(),
});

const loginSchema = z.object({
  password: z.string().min(1),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change-password"),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(4).max(128),
  }),
  z.object({ action: z.literal("rotate-recovery") }),
  z.object({
    action: z.literal("remove-member"),
    discordUserId: z.string().min(5).max(30),
  }),
  z.object({ action: z.literal("clear-logs") }),
  z.object({ action: z.literal("export-audit") }),
]);

function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export async function GET(request: Request, ctx: Ctx) {
  await initVerifyStore();
  const { guildId } = await ctx.params;
  const guild = getVerifyGuild(guildId);
  if (!guild) {
    return NextResponse.json({ error: "등록되지 않은 서버입니다." }, { status: 404 });
  }

  const admin = readVerifyAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({
      ok: false,
      needLogin: true,
      guildId,
      guildName: guild.guildName,
    });
  }

  const [rolesRes, channelsRes] = await Promise.all([
    listGuildRoles(guildId),
    listGuildTextChannels(guildId),
  ]);

  const events = listVerifyEvents(guildId, 400);
  const insights = {
    suspicion: verifyHasFeature(guild.planTier, "suspicion")
      ? computeSuspicionScore(guild, events)
      : null,
    heatmap: verifyHasFeature(guild.planTier, "heatmap")
      ? buildHourlyHeatmap(events, 7)
      : null,
    blockedCountries: topBlockedCountries(events, 12),
    blockedAsns: verifyHasFeature(guild.planTier, "asn_chart")
      ? topBlockedAsns(events, 12)
      : [],
    sources: verifyHasFeature(guild.planTier, "source_tracking")
      ? topSources(events, 12)
      : [],
  };

  return NextResponse.json({
    ok: true,
    guild: publicGuildStats(guild),
    planLabel: VERIFY_PLAN_LABELS[guild.planTier],
    recoveryLimit: recoveryLimitFor(guild.planTier),
    turnstileConfigured: Boolean(turnstileSiteKey()),
    features: {
      heatmap: verifyHasFeature(guild.planTier, "heatmap"),
      audit: verifyHasFeature(guild.planTier, "audit_log"),
      suspicion: verifyHasFeature(guild.planTier, "suspicion"),
      autoKick: verifyHasFeature(guild.planTier, "auto_kick"),
      turnstile: verifyHasFeature(guild.planTier, "turnstile"),
      asn: verifyHasFeature(guild.planTier, "asn_chart"),
      sources: verifyHasFeature(guild.planTier, "source_tracking"),
      phone: verifyHasFeature(guild.planTier, "require_phone"),
    },
    insights,
    audits: verifyHasFeature(guild.planTier, "audit_log")
      ? listVerifyAudits(guildId, 80)
      : [],
    roles: rolesRes.roles,
    channels: channelsRes.channels,
    members: publicMembers(guildId),
    events: events.slice(0, 100).map((e) => ({
      id: e.id,
      guildId: e.guildId,
      guildName: e.guildName,
      discordUserId: e.discordUserId,
      username: e.username,
      email: e.email,
      ip: e.ip,
      userAgent: e.userAgent,
      device: e.device,
      country: e.country ?? null,
      region: e.region,
      isp: e.isp,
      flags: e.flags ?? [],
      status: e.status,
      reason: e.reason,
      createdAt: e.createdAt,
    })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initVerifyStore();
  const { guildId } = await ctx.params;
  const json = await request.json().catch(() => null);
  const ip = clientIp(request);

  if (json && typeof json === "object" && "action" in json) {
    const admin = readVerifyAdminFromRequest(request, guildId);
    if (!admin) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const parsed = actionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const act = parsed.data;
    if (act.action === "change-password") {
      return NextResponse.json(
        { error: "웹 비밀번호는 더 이상 사용하지 않아요. Discord로 로그인하세요." },
        { status: 410 },
      );
    }
    if (act.action === "rotate-recovery") {
      const key = rotateVerifyRecoveryKey(guildId);
      if (!key) return NextResponse.json({ error: "실패" }, { status: 400 });
      appendVerifyAudit({
        guildId,
        action: "recovery_rotate",
        actor: "admin",
        ip,
      });
      await persistVerifyStore();
      return NextResponse.json({ ok: true, recoveryKey: key });
    }
    if (act.action === "remove-member") {
      removeVerifyMember(guildId, act.discordUserId);
      appendVerifyAudit({
        guildId,
        action: "member_remove",
        actor: "admin",
        ip,
        detail: act.discordUserId,
      });
      await persistVerifyStore();
      return NextResponse.json({ ok: true, members: publicMembers(guildId) });
    }
    if (act.action === "clear-logs") {
      clearVerifyEvents(guildId);
      appendVerifyAudit({
        guildId,
        action: "logs_clear",
        actor: "admin",
        ip,
      });
      await persistVerifyStore();
      return NextResponse.json({ ok: true, events: [] });
    }
    if (act.action === "export-audit") {
      appendVerifyAudit({
        guildId,
        action: "logs_export",
        actor: "admin",
        ip,
        detail: "audit",
      });
      await persistVerifyStore();
      return NextResponse.json({ ok: true, audits: listVerifyAudits(guildId, 500) });
    }
  }

  return NextResponse.json(
    { error: "비밀번호 로그인은 종료됐어요. Discord로 로그인해 주세요." },
    { status: 410 },
  );
}

export async function PATCH(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initVerifyStore();
  const { guildId } = await ctx.params;
  const admin = readVerifyAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const guildBefore = getVerifyGuild(guildId);
  const patch = { ...parsed.data };
  if (patch.verifiedRoleId !== undefined) {
    patch.verifiedRoleId = patch.verifiedRoleId?.trim() || null;
  }
  if (patch.logChannelId !== undefined) {
    patch.logChannelId = patch.logChannelId?.trim() || null;
  }
  if (patch.guildName !== undefined) {
    patch.guildName = patch.guildName.trim() || undefined;
  }
  if (patch.allowedCountries) {
    patch.allowedCountries = patch.allowedCountries.map((c) => c.toUpperCase());
  }
  if (patch.webhookUrl !== undefined) {
    const w = patch.webhookUrl?.trim() || null;
    if (w && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(w)) {
      return NextResponse.json({ error: "Discord 웹훅 URL만 사용할 수 있어요." }, { status: 400 });
    }
    patch.webhookUrl = w;
  }

  if (patch.enableTurnstile && guildBefore && !verifyHasFeature(guildBefore.planTier, "turnstile")) {
    return NextResponse.json({ error: "Turnstile은 PRO MAX 플랜 기능이에요." }, { status: 403 });
  }
  if (
    patch.kickUnverifiedMinutes &&
    patch.kickUnverifiedMinutes > 0 &&
    guildBefore &&
    !verifyHasFeature(guildBefore.planTier, "auto_kick")
  ) {
    return NextResponse.json({ error: "자동 킥은 PRO 이상 기능이에요." }, { status: 403 });
  }
  if (
    patch.requirePhoneLinked &&
    guildBefore &&
    !verifyHasFeature(guildBefore.planTier, "require_phone")
  ) {
    return NextResponse.json({ error: "인증 계정 강제는 PRO 이상 기능이에요." }, { status: 403 });
  }

  const guild = updateVerifyGuild(guildId, patch);
  if (!guild) {
    return NextResponse.json({ error: "서버를 찾을 수 없습니다." }, { status: 404 });
  }
  appendVerifyAudit({
    guildId,
    action: "settings_save",
    actor: "admin",
    ip: clientIp(request),
    detail: Object.keys(parsed.data).join(","),
  });
  await persistVerifyStore();
  return NextResponse.json({ ok: true, guild: publicGuildStats(guild) });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { guildId } = await ctx.params;
  const admin = readVerifyAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(verifyAdminCookieName(), "", { ...verifyAdminCookieOptions(0), maxAge: 0 });
  return res;
}
