import { NextResponse } from "next/server";
import { z } from "zod";
import { securityDiscordEnvAsync } from "@/lib/security-bot/env";
import {
  addMemberRole,
  applyGuildSlowmode,
  banMember,
  deleteMessage,
  kickMember,
  postSecurityLog,
  resolveAuditActor,
  setGuildLockdown,
  stripDangerousRolesFromMember,
  timeoutMember,
} from "@/lib/security-bot/rest";
import {
  appendSecurityEvent,
  countRecentJoins,
  countRecentNukeActions,
  getSecurityGuild,
  initSecurityStore,
  isSpamExempt,
  persistSecurityStore,
  recordJoin,
  recordNukeAction,
  updateSecurityGuild,
} from "@/lib/security-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const floodBuckets = new Map<string, number[]>();

function recordFlood(guildId: string, userId: string, windowSeconds: number) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const since = now - windowSeconds * 1000;
  const prev = (floodBuckets.get(key) || []).filter((t) => t >= since);
  prev.push(now);
  floodBuckets.set(key, prev);
  if (floodBuckets.size > 5000) {
    const first = floodBuckets.keys().next().value;
    if (first) floodBuckets.delete(first);
  }
  return prev.length;
}

async function assertBotAuth(request: Request) {
  const env = await securityDiscordEnvAsync();
  const auth = request.headers.get("authorization") || "";
  if (!env.botToken || auth !== `Bot ${env.botToken}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function alertPrefix(guild: { alertRoleId: string | null }) {
  return guild.alertRoleId ? `<@&${guild.alertRoleId}> ` : "";
}

async function applyRaidAction(
  guild: NonNullable<ReturnType<typeof getSecurityGuild>>,
  guildId: string,
  userId: string,
) {
  if (guild.raidAlertOnly) return "alert";
  if (guild.raidAction === "lockdown") {
    await setGuildLockdown(guildId, true);
    updateSecurityGuild(guildId, { lockdownActive: true });
    if (guild.raidSlowmodeSeconds > 0) {
      await applyGuildSlowmode(guildId, guild.raidSlowmodeSeconds).catch(() => null);
    }
    return "lockdown";
  }
  if (guild.raidAction === "quarantine" && guild.quarantineRoleId) {
    await addMemberRole(guildId, userId, guild.quarantineRoleId, "anti-raid quarantine");
    return "quarantine";
  }
  if (guild.raidAction === "kick") {
    await kickMember(guildId, userId, "anti-raid");
    return "kick";
  }
  if (guild.raidAction === "ban") {
    await banMember(guildId, userId, "anti-raid", 1);
    return "ban";
  }
  return "none";
}

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("member_join"),
    guildId: z.string().min(5),
    userId: z.string().min(5),
    username: z.string().optional(),
    avatar: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("everyone_spam"),
    guildId: z.string().min(5),
    userId: z.string().min(5),
    username: z.string().optional(),
    channelId: z.string().optional(),
    messageId: z.string().optional(),
    content: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("message_spam"),
    guildId: z.string().min(5),
    userId: z.string().min(5),
    username: z.string().optional(),
    channelId: z.string().optional(),
    messageId: z.string().optional(),
    content: z.string().optional(),
    kind: z.enum(["flood", "link", "invite"]).optional(),
    roleIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("nuke_alert"),
    guildId: z.string().min(5),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
    detail: z.string(),
    kind: z.string().optional(),
    targetId: z.string().optional(),
  }),
  z.object({
    type: z.literal("admin_grant"),
    guildId: z.string().min(5),
    userId: z.string().min(5),
    username: z.string().optional(),
    roleIds: z.array(z.string()).optional(),
  }),
]);

export async function POST(request: Request) {
  const denied = await assertBotAuth(request);
  if (denied) return denied;

  await initSecurityStore({ force: true });
  const json = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const data = parsed.data;
  const guild = getSecurityGuild(data.guildId);
  if (!guild || !guild.enabled) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (data.type === "member_join") {
    // New account age
    if (guild.minAccountAgeHours > 0) {
      try {
        const createdMs = Number((BigInt(data.userId) >> BigInt(22)) + BigInt(1_420_070_400_000));
        const ageHours = (Date.now() - createdMs) / 3_600_000;
        if (ageHours < guild.minAccountAgeHours) {
          await kickMember(data.guildId, data.userId, `account age < ${guild.minAccountAgeHours}h`);
          appendSecurityEvent({
            guildId: data.guildId,
            type: "young_account",
            actorId: null,
            actorName: null,
            targetId: data.userId,
            targetName: data.username ?? null,
            detail: `${ageHours.toFixed(1)}h old`,
          });
          if (guild.logChannelId) {
            await postSecurityLog(
              guild.logChannelId,
              `${alertPrefix(guild)}🆕 **신규 계정 차단** · <@${data.userId}> (${ageHours.toFixed(1)}시간)`,
            ).catch(() => null);
          }
          await persistSecurityStore();
          return NextResponse.json({ ok: true, kicked: "young_account" });
        }
      } catch {
        /* ignore snowflake parse */
      }
    }

    if (guild.blockDefaultAvatars && (data.avatar === null || data.avatar === undefined)) {
      await kickMember(data.guildId, data.userId, "default avatar blocked");
      appendSecurityEvent({
        guildId: data.guildId,
        type: "default_avatar",
        actorId: null,
        actorName: null,
        targetId: data.userId,
        targetName: data.username ?? null,
        detail: "default avatar",
      });
      await persistSecurityStore();
      return NextResponse.json({ ok: true, kicked: "default_avatar" });
    }

    recordJoin(data.guildId, data.userId);
    const n = countRecentJoins(data.guildId, guild.raidWindowSeconds);
    if (guild.antiRaidEnabled && n >= guild.raidJoinThreshold) {
      appendSecurityEvent({
        guildId: data.guildId,
        type: "raid_detected",
        actorId: null,
        actorName: null,
        targetId: data.userId,
        targetName: data.username ?? null,
        detail: `${n} joins / ${guild.raidWindowSeconds}s`,
      });

      const action = await applyRaidAction(guild, data.guildId, data.userId);

      if (guild.logChannelId) {
        await postSecurityLog(
          guild.logChannelId,
          `${alertPrefix(guild)}🚨 **레이드 감지** · ${n}명 / ${guild.raidWindowSeconds}초\n조치: ${action}`,
        ).catch(() => null);
      }
      await persistSecurityStore();
      return NextResponse.json({ ok: true, raid: true, joins: n, action });
    }
    await persistSecurityStore();
    return NextResponse.json({ ok: true, joins: n });
  }

  if (data.type === "everyone_spam") {
    if (
      isSpamExempt(guild, {
        userId: data.userId,
        roleIds: data.roleIds,
        channelId: data.channelId,
      })
    ) {
      return NextResponse.json({ ok: true, skipped: "whitelist" });
    }
    if (guild.blockEveryoneHere) {
      if (data.messageId && data.channelId) {
        await deleteMessage(data.channelId, data.messageId).catch(() => null);
      }
      if (guild.mentionSpamAction === "timeout") {
        await timeoutMember(data.guildId, data.userId, 10, "everyone/here spam");
      } else if (guild.mentionSpamAction === "kick") {
        await kickMember(data.guildId, data.userId, "everyone/here spam");
      }
      appendSecurityEvent({
        guildId: data.guildId,
        type: "everyone_spam",
        actorId: data.userId,
        actorName: data.username ?? null,
        targetId: null,
        targetName: null,
        detail: (data.content || "@everyone/@here").slice(0, 200),
      });
      if (guild.logChannelId) {
        await postSecurityLog(
          guild.logChannelId,
          `${alertPrefix(guild)}🚫 **@everyone/@here** · <@${data.userId}>\n조치: ${guild.mentionSpamAction}`,
        ).catch(() => null);
      }
      await persistSecurityStore();
    }
    return NextResponse.json({ ok: true });
  }

  if (data.type === "message_spam") {
    if (
      isSpamExempt(guild, {
        userId: data.userId,
        roleIds: data.roleIds,
        channelId: data.channelId,
      })
    ) {
      return NextResponse.json({ ok: true, skipped: "whitelist" });
    }
    const kind = data.kind || "flood";
    if (kind === "flood" && guild.antiMessageFlood) {
      const count = recordFlood(
        data.guildId,
        data.userId,
        guild.messageFloodWindowSeconds,
      );
      if (count >= guild.messageFloodLimit) {
        if (data.messageId && data.channelId) {
          await deleteMessage(data.channelId, data.messageId).catch(() => null);
        }
        if (guild.messageFloodAction === "timeout") {
          await timeoutMember(data.guildId, data.userId, 5, "message flood");
        } else if (guild.messageFloodAction === "kick") {
          await kickMember(data.guildId, data.userId, "message flood");
        }
        appendSecurityEvent({
          guildId: data.guildId,
          type: "message_flood",
          actorId: data.userId,
          actorName: data.username ?? null,
          targetId: null,
          targetName: null,
          detail: `${count} msgs / ${guild.messageFloodWindowSeconds}s`,
        });
        if (guild.logChannelId) {
          await postSecurityLog(
            guild.logChannelId,
            `💨 **메시지 도배** · <@${data.userId}> · ${count}회`,
          ).catch(() => null);
        }
        await persistSecurityStore();
        return NextResponse.json({ ok: true, flood: true });
      }
    }

    if (kind === "invite" && guild.antiInviteSpam) {
      if (data.messageId && data.channelId) {
        await deleteMessage(data.channelId, data.messageId).catch(() => null);
      }
      await timeoutMember(data.guildId, data.userId, 10, "invite spam").catch(() => null);
      appendSecurityEvent({
        guildId: data.guildId,
        type: "invite_spam",
        actorId: data.userId,
        actorName: data.username ?? null,
        targetId: null,
        targetName: null,
        detail: (data.content || "").slice(0, 200),
      });
      await persistSecurityStore();
    }

    return NextResponse.json({ ok: true });
  }

  if (data.type === "nuke_alert") {
    if (guild.antiNukeEnabled) {
      // Audit log: CHANNEL_DELETE=12, MEMBER_BAN_ADD=22, MEMBER_KICK=20
      const actionType =
        data.kind === "ban" ? 22 : data.kind === "kick" ? 20 : data.kind === "channel_delete" ? 12 : undefined;
      let actorId = data.actorId && data.actorId !== "unknown" ? data.actorId : null;
      if (actionType !== undefined) {
        const resolved = await resolveAuditActor(
          data.guildId,
          actionType,
          data.targetId,
        ).catch(() => null);
        if (resolved?.actorId) actorId = resolved.actorId;
      }
      actorId = actorId || "unknown";

      recordNukeAction(data.guildId, actorId, data.kind || "nuke");
      const n = countRecentNukeActions(data.guildId, actorId, guild.nukeWindowSeconds);
      if (n >= guild.nukeThreshold) {
        appendSecurityEvent({
          guildId: data.guildId,
          type: "nuke_alert",
          actorId: actorId === "unknown" ? null : actorId,
          actorName: data.actorName ?? null,
          targetId: null,
          targetName: null,
          detail: `${data.detail} · actor=${actorId} (${n}/${guild.nukeWindowSeconds}s)`,
        });
        if (guild.logChannelId) {
          await postSecurityLog(
            guild.logChannelId,
            `${alertPrefix(guild)}💣 **테러/누크 의심** · ${
              actorId !== "unknown" ? `<@${actorId}>` : "실행자 확인 중"
            }\n${data.detail}\n감사로그 기반 · ${n}회/${guild.nukeWindowSeconds}s`,
          ).catch(() => null);
        }
        if (!guild.raidAlertOnly) {
          await setGuildLockdown(data.guildId, true);
          updateSecurityGuild(data.guildId, { lockdownActive: true });
          if (guild.stripDangerousOnNuke && actorId !== "unknown") {
            await timeoutMember(data.guildId, actorId, 60, "anti-nuke").catch(() => null);
          }
        }
        await persistSecurityStore();
        return NextResponse.json({ ok: true, lockdown: true, count: n, actorId });
      }
      await persistSecurityStore();
    }
    return NextResponse.json({ ok: true });
  }

  if (data.type === "admin_grant") {
    if (guild.protectAdminRoles || guild.stripDangerousPerms) {
      const roleIds = data.roleIds || [];
      if (guild.stripDangerousPerms) {
        const { stripped } = await stripDangerousRolesFromMember(
          data.guildId,
          data.userId,
          roleIds,
          guild.trustedAdminRoleIds,
          "vendix: strip dangerous perms",
        );
        if (stripped.length) {
          appendSecurityEvent({
            guildId: data.guildId,
            type: "role_strip",
            actorId: null,
            actorName: "security",
            targetId: data.userId,
            targetName: data.username ?? null,
            detail: `회수: ${stripped.join(", ")}`,
          });
          if (guild.logChannelId) {
            await postSecurityLog(
              guild.logChannelId,
              `${alertPrefix(guild)}🛡️ **위험 권한 회수** · <@${data.userId}>\n${stripped.join(", ")}`,
            ).catch(() => null);
          }
          await persistSecurityStore();
          return NextResponse.json({ ok: true, stripped });
        }
      }

      if (guild.protectAdminRoles && guild.trustedAdminRoleIds.length) {
        const trusted = new Set(guild.trustedAdminRoleIds);
        const granted = roleIds.filter((id) => !trusted.has(id));
        if (granted.length > 0) {
          appendSecurityEvent({
            guildId: data.guildId,
            type: "admin_grant_watch",
            actorId: null,
            actorName: null,
            targetId: data.userId,
            targetName: data.username ?? null,
            detail: `roles: ${granted.slice(0, 5).join(", ")}`,
          });
          if (guild.logChannelId) {
            await postSecurityLog(
              guild.logChannelId,
              `${alertPrefix(guild)}🛡️ **관리자 접근 감시** · <@${data.userId}>\n역할 변경 감지`,
            ).catch(() => null);
          }
          await persistSecurityStore();
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
