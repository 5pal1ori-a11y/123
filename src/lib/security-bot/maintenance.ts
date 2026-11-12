import {
  createGuildSnapshotData,
  postSecurityLog,
  unbanMember,
} from "@/lib/security-bot/rest";
import {
  addSnapshot,
  appendSecurityEvent,
  eventCountsSince,
  initSecurityStore,
  listExpiredTempBans,
  listSecurityGuilds,
  persistSecurityStore,
  removeTempBan,
  updateSecurityGuild,
} from "@/lib/security-bot/store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function runSecurityMaintenance() {
  await initSecurityStore({ force: true });
  const now = Date.now();
  let unbanned = 0;
  let reports = 0;
  let snapshots = 0;

  for (const ban of listExpiredTempBans(now)) {
    const res = await unbanMember(ban.guildId, ban.userId, "temp ban expired");
    // 실패하면 다음 크론에서 다시 시도 — 이미 풀린 밴(404)만 기록을 지운다
    if (res.ok || res.status === 404) removeTempBan(ban.id);
    if (res.ok) {
      unbanned += 1;
      appendSecurityEvent({
        guildId: ban.guildId,
        type: "temp_unban",
        actorId: null,
        actorName: "cron",
        targetId: ban.userId,
        targetName: null,
        detail: ban.reason,
      });
      const guild = listSecurityGuilds().find((g) => g.guildId === ban.guildId);
      if (guild?.logChannelId) {
        await postSecurityLog(
          guild.logChannelId,
          `⏳ **임시밴 만료 언밴** · <@${ban.userId}>\n사유: ${ban.reason}`,
        ).catch(() => null);
      }
    }
  }

  for (const guild of listSecurityGuilds()) {
    if (!guild.enabled) continue;

    if (guild.weeklyReportEnabled) {
      const last = guild.lastWeeklyReportAt
        ? new Date(guild.lastWeeklyReportAt).getTime()
        : 0;
      if (now - last >= WEEK_MS) {
        const { total, counts } = eventCountsSince(guild.guildId, now - WEEK_MS);
        const lines = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([k, v]) => `· ${k}: **${v}**`)
          .join("\n");
        if (guild.logChannelId) {
          await postSecurityLog(
            guild.logChannelId,
            [
              `📊 **주간 보안 리포트** · ${guild.guildName}`,
              `기간: 최근 7일 · 총 이벤트 **${total}**`,
              lines || "· (기록 없음)",
            ].join("\n"),
          ).catch(() => null);
        }
        updateSecurityGuild(guild.guildId, {});
        const g = listSecurityGuilds().find((x) => x.guildId === guild.guildId);
        if (g) {
          g.lastWeeklyReportAt = new Date().toISOString();
          g.updatedAt = new Date().toISOString();
        }
        reports += 1;
      }
    }

    if (guild.autoSnapshotEnabled) {
      const last = guild.lastSnapshotAt ? new Date(guild.lastSnapshotAt).getTime() : 0;
      if (now - last >= WEEK_MS) {
        const data = await createGuildSnapshotData(guild.guildId);
        addSnapshot({
          guildId: guild.guildId,
          label: "auto-weekly",
          createdBy: "cron",
          channels: data.channels,
          roles: data.roles,
        });
        const g = listSecurityGuilds().find((x) => x.guildId === guild.guildId);
        if (g) {
          g.lastSnapshotAt = new Date().toISOString();
          g.updatedAt = new Date().toISOString();
        }
        if (guild.logChannelId) {
          await postSecurityLog(
            guild.logChannelId,
            `💾 **자동 스냅샷** · 채널 ${data.channels.length} · 역할 ${data.roles.length}`,
          ).catch(() => null);
        }
        snapshots += 1;
      }
    }
  }

  await persistSecurityStore();
  return { unbanned, reports, snapshots };
}
