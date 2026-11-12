import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import {
  listSecurityGuildChannels,
  listSecurityGuildRoles,
  syncSecurityAutoMod,
} from "@/lib/security-bot/rest";
import {
  createSecurityAdminToken,
  readSecurityAdminFromRequest,
  securityAdminCookieName,
  securityAdminCookieOptions,
} from "@/lib/security-bot/session";
import {
  appendSecurityAudit,
  getSecurityGuild,
  listSecurityAudits,
  listSecurityEvents,
  listSnapshots,
  listTempBans,
  persistSecurityStore,
  publicSecurityGuild,
  refreshSecurityStore,
  setSecurityGuildPassword,
  updateSecurityGuild,
  verifySecurityGuildLogin,
} from "@/lib/security-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ guildId: string }> };

const loginSchema = z.object({ password: z.string().min(1) });

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  guildName: z.string().max(100).optional(),
  logChannelId: z.string().nullable().optional(),
  modRoleIds: z.array(z.string()).max(50).optional(),
  protectedRoleIds: z.array(z.string()).max(50).optional(),
  protectedUserIds: z.array(z.string()).max(100).optional(),
  antiRaidEnabled: z.boolean().optional(),
  raidJoinThreshold: z.number().int().min(3).max(100).optional(),
  raidWindowSeconds: z.number().int().min(5).max(300).optional(),
  raidAction: z.enum(["lockdown", "kick", "ban", "quarantine"]).optional(),
  raidAlertOnly: z.boolean().optional(),
  raidSlowmodeSeconds: z.number().int().min(0).max(21600).optional(),
  blockEveryoneHere: z.boolean().optional(),
  mentionSpamLimit: z.number().int().min(2).max(50).optional(),
  mentionSpamAction: z.enum(["delete", "timeout", "kick"]).optional(),
  antiNukeEnabled: z.boolean().optional(),
  nukeThreshold: z.number().int().min(2).max(50).optional(),
  nukeWindowSeconds: z.number().int().min(5).max(300).optional(),
  stripDangerousOnNuke: z.boolean().optional(),
  protectAdminRoles: z.boolean().optional(),
  trustedAdminRoleIds: z.array(z.string()).max(50).optional(),
  antiInviteSpam: z.boolean().optional(),
  antiLinkSpam: z.boolean().optional(),
  antiScamKeywords: z.boolean().optional(),
  antiMessageFlood: z.boolean().optional(),
  messageFloodLimit: z.number().int().min(3).max(50).optional(),
  messageFloodWindowSeconds: z.number().int().min(2).max(60).optional(),
  messageFloodAction: z.enum(["timeout", "kick", "delete"]).optional(),
  minAccountAgeHours: z.number().int().min(0).max(720).optional(),
  blockDefaultAvatars: z.boolean().optional(),
  quarantineRoleId: z.string().nullable().optional(),
  alertRoleId: z.string().nullable().optional(),
  stripDangerousPerms: z.boolean().optional(),
  warnThreshold: z.number().int().min(0).max(50).optional(),
  warnAction: z.enum(["mute", "kick", "ban"]).optional(),
  warnMuteMinutes: z.number().int().min(1).max(40320).optional(),
  whitelistRoleIds: z.array(z.string()).max(50).optional(),
  whitelistChannelIds: z.array(z.string()).max(50).optional(),
  weeklyReportEnabled: z.boolean().optional(),
  autoSnapshotEnabled: z.boolean().optional(),
  lockdownActive: z.boolean().optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change-password"),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("sync-automod") }),
]);

export async function GET(request: Request, ctx: Ctx) {
  await refreshSecurityStore();
  const { guildId } = await ctx.params;
  const guild = getSecurityGuild(guildId);
  if (!guild) {
    return NextResponse.json({ error: "등록되지 않은 서버입니다." }, { status: 404 });
  }

  const admin = readSecurityAdminFromRequest(request, guildId);
  if (!admin) {
    return NextResponse.json({
      ok: false,
      needLogin: true,
      guildId,
      guildName: guild.guildName,
    });
  }

  const [rolesRes, channelsRes] = await Promise.all([
    listSecurityGuildRoles(guildId),
    listSecurityGuildChannels(guildId),
  ]);

  return NextResponse.json({
    ok: true,
    guild: publicSecurityGuild(guild),
    roles: rolesRes.roles,
    channels: channelsRes.channels.filter((c) => c.type === 0 || c.type === 5),
    events: listSecurityEvents(guildId, 100),
    audits: listSecurityAudits(guildId, 80),
    snapshots: listSnapshots(guildId, 10).map((s) => ({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      channelCount: s.channels.length,
      roleCount: s.roles.length,
    })),
    tempBans: listTempBans(guildId).map((b) => ({
      id: b.id,
      userId: b.userId,
      reason: b.reason,
      expiresAt: b.expiresAt,
      createdBy: b.createdBy,
    })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await refreshSecurityStore();
  const { guildId } = await ctx.params;
  const json = await request.json().catch(() => null);

  if (json && typeof json === "object" && "password" in json && !("action" in json)) {
    return NextResponse.json(
      { error: "비밀번호 로그인은 종료됐어요. Discord로 로그인해 주세요." },
      { status: 410 },
    );
  }

  const admin = readSecurityAdminFromRequest(request, guildId);
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
      res.cookies.set(securityAdminCookieName(), "", {
        ...securityAdminCookieOptions(0),
        maxAge: 0,
      });
      return res;
    }

    if (parsed.data.action === "change-password") {
      return NextResponse.json(
        { error: "웹 비밀번호는 더 이상 사용하지 않아요. Discord로 로그인하세요." },
        { status: 410 },
      );
    }

    if (parsed.data.action === "sync-automod") {
      const guild = getSecurityGuild(guildId);
      if (!guild) return NextResponse.json({ error: "서버 없음" }, { status: 404 });
      const sync = await syncSecurityAutoMod(guild);
      appendSecurityAudit({
        guildId,
        actor: "web",
        action: "automod",
        detail: `동기화: ${sync.created.join(", ") || "없음"}`,
      });
      await persistSecurityStore();
      return NextResponse.json({ ok: true, created: sync.created });
    }
  }

  const patch = patchSchema.safeParse(json);
  if (!patch.success) {
    return NextResponse.json({ error: "잘못된 설정입니다." }, { status: 400 });
  }

  const updated = updateSecurityGuild(guildId, patch.data);
  if (!updated) {
    return NextResponse.json({ error: "서버를 찾을 수 없어요." }, { status: 404 });
  }
  appendSecurityAudit({
    guildId,
    actor: "web",
    action: "settings",
    detail: `설정 저장 (${Object.keys(patch.data).join(", ")})`,
  });
  await persistSecurityStore();

  // Best-effort AutoMod sync on save
  void syncSecurityAutoMod(updated).catch(() => null);

  return NextResponse.json({ ok: true, guild: publicSecurityGuild(updated) });
}
