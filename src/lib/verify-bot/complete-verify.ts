import {
  container,
  MessageFlags,
  separator,
  textDisplay,
} from "@/lib/discord/components";
import { clientIp, clientUserAgent, deviceLabelFromUa } from "@/lib/request-meta";
import { evaluateIpPolicy, formatIpRegion, lookupIpIntel } from "@/lib/verify-bot/ip-intel";
import {
  addGuildMemberWithOAuth,
  addMemberRole,
  postVerifyLogChannel,
  postVerifyWebhook,
  sendVerifyDm,
} from "@/lib/verify-bot/rest";
import {
  countIpVerifiesToday,
  discordAccountCreatedAt,
  findMemberByUser,
  findOtherMemberWithIp,
  persistVerifyStore,
  recordVerifyBlocked,
  recordVerifySuccess,
  removePendingJoin,
} from "@/lib/verify-bot/store";
import type { VerifyGuild } from "@/lib/verify-bot/types";

export type VerifyCompleteUser = {
  id: string;
  username: string;
  email: string | null;
  verified: boolean;
  phone: string | null;
};

export type VerifyCompleteResult =
  | { ok: true }
  | { ok: false; reason: string; blockLogin: boolean };

function verifyLogFields(input: {
  username: string;
  userId: string;
  guildName: string;
  ip: string | null;
  isp: string | null;
  region: string | null;
  device: string | null;
}) {
  return [
    `유저 이름 : ${input.username}`,
    `유저 아이디 : ${input.userId}`,
    `인증한 서버 : ${input.guildName}`,
    `유저 아이피 : ${input.ip || "—"}`,
    `사용 통신사 : ${input.isp || "—"}`,
    `예상 지역 : ${input.region || "—"}`,
    `유저 기기 : ${input.device || "—"}`,
  ].join("\n");
}

async function block(
  input: Parameters<typeof recordVerifyBlocked>[0],
  reason: string,
  blockLogin: boolean,
): Promise<VerifyCompleteResult> {
  recordVerifyBlocked(input);
  await persistVerifyStore();
  return { ok: false, reason, blockLogin };
}

/**
 * Discord OAuth 직후 서버 입장·역할·IP 기록.
 * shop-login 은 이미 인증된 재로그인의 쿨다운/중복 IP를 건너뛴다.
 */
export async function completeGuildVerification(opts: {
  request: Request;
  guild: VerifyGuild;
  accessToken: string | null;
  refreshToken: string | null;
  user: VerifyCompleteUser;
  source: "oauth" | "shop-login";
  channelId?: string | null;
  campaign?: string | null;
}): Promise<VerifyCompleteResult> {
  const { guild, user } = opts;
  const ipRaw = clientIp(opts.request);
  const ip = ipRaw === "unknown" ? null : ipRaw;
  const cfCountry = opts.request.headers.get("cf-ipcountry");
  const ua = clientUserAgent(opts.request);
  const device = deviceLabelFromUa(ua);
  const intel = await lookupIpIntel(ip, cfCountry);
  const region = formatIpRegion(intel);
  const isp = intel.isp || intel.org;
  const existing = findMemberByUser(guild.guildId, user.id);
  const returning = Boolean(existing) && opts.source === "shop-login";

  const baseBlock = {
    guildId: guild.guildId,
    guildName: guild.guildName,
    discordUserId: user.id,
    username: user.username,
    email: user.email,
    ip,
    userAgent: ua,
    device,
    country: intel.country,
    region,
    isp,
    flags: [] as string[],
  };

  if (guild.blacklistUserIds.includes(user.id)) {
    return block({ ...baseBlock, flags: ["bl_user"], reason: "blacklist_user" }, "banned", true);
  }
  if (ip && guild.blacklistIps.includes(ip)) {
    return block({ ...baseBlock, flags: ["bl_ip"], reason: "blacklist_ip" }, "banned", true);
  }
  if (guild.whitelistIps.length > 0 && (!ip || !guild.whitelistIps.includes(ip))) {
    return block({ ...baseBlock, flags: ["wl"], reason: "whitelist" }, "whitelist", true);
  }

  if (!returning) {
    if (guild.requireEmail && !user.email) {
      return { ok: false, reason: "email", blockLogin: true };
    }
    if (guild.requirePhoneLinked) {
      const phoneOk = Boolean(user.phone);
      const verifiedOk = Boolean(user.verified);
      if (!phoneOk && !verifiedOk) {
        return block({ ...baseBlock, flags: ["phone"], reason: "phone" }, "phone", true);
      }
    }
    const createdAt = discordAccountCreatedAt(user.id);
    if (guild.minAccountAgeDays > 0 && createdAt) {
      const ageDays = (Date.now() - createdAt) / (86400 * 1000);
      if (ageDays < guild.minAccountAgeDays) {
        return block({ ...baseBlock, flags: ["age"], reason: "account_age" }, "age", true);
      }
    }
    if (guild.reverifyCooldownHours > 0 && existing) {
      const hours = (Date.now() - new Date(existing.updatedAt).getTime()) / (3600 * 1000);
      if (hours < guild.reverifyCooldownHours) {
        return block({ ...baseBlock, flags: ["cooldown"], reason: "cooldown" }, "cooldown", opts.source !== "shop-login");
      }
    }
    if (guild.maxVerifiesPerIpPerDay > 0 && ip) {
      const n = countIpVerifiesToday(guild.guildId, ip);
      if (n >= guild.maxVerifiesPerIpPerDay) {
        return block({ ...baseBlock, flags: ["ip_rate"], reason: "ip_rate" }, "rate", true);
      }
    }
    if (guild.blockDuplicateIp && ip) {
      const other = findOtherMemberWithIp(guild.guildId, ip, user.id);
      if (other) {
        return block({ ...baseBlock, flags: ["dup_ip"], reason: "duplicate_ip" }, "dupip", true);
      }
    }
  }

  const policy = evaluateIpPolicy(guild, intel);
  if (!returning && !policy.ok) {
    return block({ ...baseBlock, flags: policy.flags, reason: policy.reason }, policy.reason, true);
  }
  const policyFlags = policy.flags;

  if (opts.accessToken) {
    const join = await addGuildMemberWithOAuth(
      guild.guildId,
      user.id,
      opts.accessToken,
      guild.verifiedRoleId ? [guild.verifiedRoleId] : undefined,
    );
    if (!join.joined) {
      console.error("[verify] guilds.join failed", join.status, join.json);
      if (guild.verifiedRoleId) {
        const roleRes = await addMemberRole(guild.guildId, user.id, guild.verifiedRoleId);
        if (!roleRes.ok) {
          console.error("[verify] role assign failed", roleRes.status, roleRes.json);
          if (opts.source !== "shop-login") {
            if (join.status === 403 || join.status === 401) {
              return { ok: false, reason: "join", blockLogin: false };
            }
            return { ok: false, reason: "role", blockLogin: false };
          }
        }
      } else if (opts.source !== "shop-login" && (join.status === 403 || join.status === 401)) {
        return { ok: false, reason: "join", blockLogin: false };
      }
    }
  } else if (guild.verifiedRoleId) {
    const roleRes = await addMemberRole(guild.guildId, user.id, guild.verifiedRoleId);
    if (!roleRes.ok && opts.source !== "shop-login") {
      return { ok: false, reason: "role", blockLogin: false };
    }
  }

  if (!opts.refreshToken) {
    console.warn("[verify] no refresh_token — recovery will not work for this user");
  }

  const sourceFlags = [...policyFlags];
  if (intel.asn) sourceFlags.push(`asn:${intel.asn}`);
  if (guild.trackSources) {
    if (opts.channelId) sourceFlags.push(`ch:${opts.channelId}`);
    if (opts.campaign) sourceFlags.push(`camp:${opts.campaign}`);
  }
  if (opts.source === "shop-login") sourceFlags.push("src:shop-login");

  const event = recordVerifySuccess({
    guildId: guild.guildId,
    guildName: guild.guildName,
    discordUserId: user.id,
    username: user.username,
    email: guild.logEmail ? user.email : null,
    ip,
    userAgent: ua,
    device,
    country: intel.country,
    region,
    isp,
    flags: sourceFlags,
    refreshToken: opts.refreshToken,
  });
  removePendingJoin(guild.guildId, user.id);
  await persistVerifyStore();

  const logBody = verifyLogFields({
    username: user.username,
    userId: user.id,
    guildName: guild.guildName,
    ip: guild.logIp ? ip : "(비공개)",
    isp,
    region,
    device,
  });

  if (!returning && guild.dmOnVerify && guild.dmMessage.trim()) {
    void sendVerifyDm(user.id, guild.dmMessage).catch(() => null);
  }
  if (!returning && guild.webhookUrl) {
    void postVerifyWebhook(
      guild.webhookUrl,
      `✅ 인증 · **${user.username}** (\`${user.id}\`)\n\`\`\`\n${logBody}\n\`\`\``,
    ).catch(() => null);
  }
  if (!returning && guild.logChannelId && event) {
    const lines = [textDisplay("## 인증 완료"), separator(true, 1), textDisplay(logBody)];
    if (guild.logEmail && user.email) {
      lines.push(separator(true, 1), textDisplay(`**이메일**\n${user.email}`));
    }
    void postVerifyLogChannel(guild.logChannelId, {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container(lines)],
    }).catch(() => null);
  }

  return { ok: true };
}
