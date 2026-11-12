import { verifyHasFeature, recoveryLimitFor } from "@/lib/verify-bot/plan";
import {
  fetchGuildApproxCounts,
  kickGuildMember,
  listGuildMembersPage,
} from "@/lib/verify-bot/rest";
import {
  applyMemberCountDelta,
  appendVerifyAudit,
  findMemberByUser,
  listAllVerifyGuilds,
  listPendingJoins,
  listVerifyMembers,
  persistVerifyStore,
  removePendingJoin,
  upsertPendingJoin,
} from "@/lib/verify-bot/store";

/** Periodic: member-count joins + unverified auto-kick. */
export async function runVerifyMaintenance() {
  const guilds = listAllVerifyGuilds().filter((g) => g.enabled);
  let kicked = 0;
  let joinUpdates = 0;

  for (const guild of guilds) {
    const counts = await fetchGuildApproxCounts(guild.guildId);
    if (counts.ok && counts.memberCount != null) {
      applyMemberCountDelta(guild.guildId, counts.memberCount);
      joinUpdates += 1;
    }

    if (
      guild.kickUnverifiedMinutes > 0 &&
      guild.verifiedRoleId &&
      verifyHasFeature(guild.planTier, "auto_kick")
    ) {
      const members = await listGuildMembersPage(guild.guildId, 200);
      if (members.ok) {
        const cutoff = Date.now() - guild.kickUnverifiedMinutes * 60_000;
        for (const m of members.members) {
          if (m.user?.bot) continue;
          const uid = m.user?.id;
          if (!uid) continue;
          const roles = m.roles || [];
          if (guild.verifiedRoleId && roles.includes(guild.verifiedRoleId)) {
            removePendingJoin(guild.guildId, uid);
            continue;
          }
          if (findMemberByUser(guild.guildId, uid)) continue;
          const joinedAt = m.joined_at ? new Date(m.joined_at).getTime() : 0;
          upsertPendingJoin({
            guildId: guild.guildId,
            discordUserId: uid,
            username: m.user?.username || uid,
            joinedAt: m.joined_at || undefined,
          });
          if (joinedAt && joinedAt < cutoff) {
            const res = await kickGuildMember(
              guild.guildId,
              uid,
              `미인증 ${guild.kickUnverifiedMinutes}분 초과`,
            );
            if (res.ok || res.status === 204) {
              kicked += 1;
              removePendingJoin(guild.guildId, uid);
              appendVerifyAudit({
                guildId: guild.guildId,
                action: "auto_kick",
                actor: "system",
                detail: uid,
              });
            }
          }
        }
      }

      for (const p of listPendingJoins(guild.guildId)) {
        const joined = new Date(p.joinedAt).getTime();
        if (Date.now() - joined < guild.kickUnverifiedMinutes * 60_000) continue;
        if (findMemberByUser(guild.guildId, p.discordUserId)) {
          removePendingJoin(guild.guildId, p.discordUserId);
          continue;
        }
        const res = await kickGuildMember(
          guild.guildId,
          p.discordUserId,
          `미인증 ${guild.kickUnverifiedMinutes}분 초과`,
        );
        if (res.ok || res.status === 204) {
          kicked += 1;
          removePendingJoin(guild.guildId, p.discordUserId);
          appendVerifyAudit({
            guildId: guild.guildId,
            action: "auto_kick",
            actor: "system",
            detail: p.discordUserId,
          });
        }
      }
    }
  }

  await persistVerifyStore();
  return {
    guilds: guilds.length,
    joinUpdates,
    kicked,
    recoveryHints: guilds.map((g) => ({
      guildId: g.guildId,
      limit: recoveryLimitFor(g.planTier),
      recoverable: listVerifyMembers(g.guildId).filter((m) => m.refreshTokenEnc).length,
    })),
  };
}
