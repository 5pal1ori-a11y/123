import {
  actionRow,
  actorFromInteraction,
  button,
  ButtonStyle,
  container,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  optionValue,
  separator,
  textDisplay,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { securityOrigin, securityPanelUrl } from "@/lib/domain";
import {
  addMemberRole,
  applyGuildSlowmode,
  banMember,
  bulkDeleteMessages,
  clearTimeoutMember,
  createGuildSnapshotData,
  fetchDiscordGuild,
  fetchGuildMember,
  fetchRecentMessages,
  kickMember,
  listSecurityGuildChannels,
  postSecurityLog,
  registerSecurityGuildCommands,
  resetMemberNick,
  setChannelSlowmode,
  setGuildLockdown,
  syncSecurityAutoMod,
  timeoutMember,
  unbanMember,
} from "@/lib/security-bot/rest";
import {
  addSnapshot,
  addTempBan,
  appendSecurityEvent,
  canUseModCommands,
  countWarns,
  eventCountsSince,
  getSecurityGuild,
  initSecurityStore,
  isProtectedTarget,
  listSecurityEvents,
  listSnapshots,
  listTempBans,
  persistSecurityStore,
  registerSecurityGuild,
  updateSecurityGuild,
} from "@/lib/security-bot/store";

function isGuildAdmin(permissions?: string) {
  if (!permissions) return false;
  try {
    const p = BigInt(permissions);
    const ADMINISTRATOR = BigInt(1) << BigInt(3);
    const MANAGE_GUILD = BigInt(1) << BigInt(5);
    return (p & ADMINISTRATOR) === ADMINISTRATOR || (p & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

function ephemeralV2(kids: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

function errorV2(message: string) {
  return ephemeralV2([textDisplay("## 오류"), separator(true, 1), textDisplay(message)]);
}

function resolvedUser(
  interaction: DiscordInteraction,
  optionName: string,
): { id: string; name: string; roles: string[] } | null {
  const opt = interaction.data?.options?.find((o) => o.name === optionName);
  if (!opt || typeof opt.value !== "string") return null;
  const id = opt.value;
  const users = interaction.data?.resolved?.users;
  const u = users?.[id];
  const name = u?.global_name || u?.username || id;
  const memberRoles =
    (
      interaction.data?.resolved as {
        members?: Record<string, { roles?: string[] }>;
      }
    )?.members?.[id]?.roles ?? [];
  return { id, name, roles: memberRoles };
}

async function logAction(
  guildId: string,
  logChannelId: string | null,
  lines: string,
) {
  if (!logChannelId) return;
  await postSecurityLog(logChannelId, lines).catch(() => null);
}

export async function handleSecurityBotInteraction(interaction: DiscordInteraction) {
  await initSecurityStore({ force: true });

  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }

  const actor = actorFromInteraction(interaction);
  if (!actor) return errorV2("사용자를 확인할 수 없어요.");

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return errorV2("지원하지 않는 상호작용입니다.");
  }

  const name = interaction.data?.name;
  const guildId = interaction.guild_id;
  if (!guildId) return errorV2("서버에서만 사용할 수 있어요.");

  if (name === "등록") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const fetched = await fetchDiscordGuild(guildId);
    const guildName =
      fetched?.name ||
      (interaction as { guild?: { name?: string } }).guild?.name ||
      `서버-${guildId.slice(-4)}`;
    const { guild, created } = registerSecurityGuild({
      guildId,
      guildName,
      registeredBy: actor.id,
    });
    await persistSecurityStore();
    const reg = await registerSecurityGuildCommands(guildId);
    const sync = await syncSecurityAutoMod(guild).catch(() => ({ created: [] as string[] }));
    return ephemeralV2([
      textDisplay(created ? "## 보안봇 등록 완료" : "## 보안봇 재등록 완료"),
      separator(true, 1),
      textDisplay(
        `서버: **${guild.guildName}**\n웹패널: ${securityOrigin()}\n\n웹패널은 **Discord 서버 소유자** 계정으로만 로그인할 수 있어요.`,
      ),
      textDisplay(
        reg.ok
          ? `-# 명령 등록됨 · AutoMod ${Array.isArray(sync.created) ? sync.created.join(", ") || "없음" : ""}`
          : `-# 명령 등록 경고: ${reg.error}`,
      ),
      textDisplay("-# `/보안웹`으로 패널 링크를 다시 받을 수 있어요."),
      actionRow(
        button({
          label: "웹패널 열기",
          style: ButtonStyle.LINK,
          url: securityOrigin(),
        }),
      ),
    ]);
  }

  if (name === "보안웹") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const guild = getSecurityGuild(guildId);
    if (!guild) return errorV2("먼저 `/등록`으로 서버를 등록해 주세요.");
    const fetched = await fetchDiscordGuild(guildId);
    if (fetched?.name && fetched.name !== guild.guildName) {
      updateSecurityGuild(guildId, { guildName: fetched.name });
      guild.guildName = fetched.name;
    }
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 보안 웹패널"),
      separator(true, 1),
      textDisplay(
        `서버: **${guild.guildName}**\n${securityOrigin()}\n\n**Discord로 로그인** 후 소유한 등록 서버를 선택하세요. (비밀번호 로그인 없음)`,
      ),
      textDisplay("-# 서버 소유자 계정으로만 접근할 수 있어요."),
      actionRow(
        button({
          label: "웹패널 열기",
          style: ButtonStyle.LINK,
          url: securityOrigin(),
        }),
      ),
    ]);
  }

  const guild = getSecurityGuild(guildId);
  if (!guild || !guild.enabled) {
    return errorV2("보안봇이 등록되지 않았거나 꺼져 있어요. `/등록`을 먼저 실행하세요.");
  }

  if (name === "보안상태") {
    if (
      !canUseModCommands(guild, actor.roles, interaction.member?.permissions) &&
      !isGuildAdmin(interaction.member?.permissions)
    ) {
      return errorV2("이 명령을 사용할 권한이 없어요.");
    }
    return ephemeralV2([
      textDisplay("## 보안 상태"),
      separator(true, 1),
      textDisplay(
        [
          `서버: **${guild.guildName}**`,
          `락다운: ${guild.lockdownActive ? "**ON**" : "OFF"}`,
          `레이드 방지: ${guild.antiRaidEnabled ? "ON" : "OFF"} (${guild.raidJoinThreshold}/${guild.raidWindowSeconds}s → ${guild.raidAction})`,
          `@everyone/here: ${guild.blockEveryoneHere ? "차단" : "허용"}`,
          `멘션 스팸: ${guild.mentionSpamLimit}회 → ${guild.mentionSpamAction}`,
          `메시지 도배: ${guild.antiMessageFlood ? `${guild.messageFloodLimit}/${guild.messageFloodWindowSeconds}s` : "OFF"}`,
          `링크/초대/스캠: ${[guild.antiLinkSpam && "링크", guild.antiInviteSpam && "초대", guild.antiScamKeywords && "스캠"].filter(Boolean).join("/") || "OFF"}`,
          `신규계정: ${guild.minAccountAgeHours > 0 ? `${guild.minAccountAgeHours}시간 미만 차단` : "OFF"}`,
          `안티누크: ${guild.antiNukeEnabled ? "ON" : "OFF"}`,
          `관리자 보호: ${guild.protectAdminRoles ? "ON" : "OFF"}`,
        ].join("\n"),
      ),
    ]);
  }

  if (name === "오토모드동기화") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const sync = await syncSecurityAutoMod(guild);
    appendSecurityEvent({
      guildId,
      type: "automod_sync",
      actorId: actor.id,
      actorName: actor.username,
      targetId: null,
      targetName: null,
      detail: `규칙 동기화: ${sync.created.join(", ") || "없음"}`,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## AutoMod 동기화"),
      separator(true, 1),
      textDisplay(
        sync.created.length
          ? `적용됨: ${sync.created.join(", ")}`
          : "적용된 규칙이 없어요. 웹패널에서 옵션을 켜 주세요.",
      ),
    ]);
  }

  const needsMod =
    name === "킥" ||
    name === "밴" ||
    name === "언밴" ||
    name === "뮤트" ||
    name === "언뮤트" ||
    name === "청소" ||
    name === "경고" ||
    name === "락다운" ||
    name === "언락" ||
    name === "슬로우모드" ||
    name === "닉네임초기화" ||
    name === "경고목록" ||
    name === "스냅샷" ||
    name === "스냅샷목록" ||
    name === "보안리포트" ||
    name === "유저정보";

  if (needsMod) {
    if (
      !canUseModCommands(guild, actor.roles, interaction.member?.permissions) &&
      !isGuildAdmin(interaction.member?.permissions)
    ) {
      return errorV2("이 명령을 사용할 권한이 없어요.");
    }
  }

  if (name === "킥") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    if (target.id === actor.id) return errorV2("자기 자신은 킥할 수 없어요.");
    if (isProtectedTarget(guild, target.id, target.roles)) {
      return errorV2("보호된 유저/역할입니다.");
    }
    const reason = String(optionValue(interaction, "사유") ?? "사유 없음");
    const res = await kickMember(guildId, target.id, `[${actor.username}] ${reason}`);
    if (!res.ok) return errorV2(`킥 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "kick",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: reason,
    });
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `👢 **킥** · ${target.name} (\`${target.id}\`)\n실행: <@${actor.id}>\n사유: ${reason}`,
    );
    return ephemeralV2([
      textDisplay("## 킥 완료"),
      separator(true, 1),
      textDisplay(`**${target.name}** 을(를) 추방했어요.\n사유: ${reason}`),
    ]);
  }

  if (name === "밴") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    if (target.id === actor.id) return errorV2("자기 자신은 밴할 수 없어요.");
    if (isProtectedTarget(guild, target.id, target.roles)) {
      return errorV2("보호된 유저/역할입니다.");
    }
    const reason = String(optionValue(interaction, "사유") ?? "사유 없음");
    const days = Number(optionValue(interaction, "삭제기간") ?? 0);
    const minutes = Number(optionValue(interaction, "기간분") ?? 0);
    const res = await banMember(guildId, target.id, `[${actor.username}] ${reason}`, days);
    if (!res.ok) return errorV2(`밴 실패 (${res.status})`);
    if (minutes > 0) {
      addTempBan({
        guildId,
        userId: target.id,
        reason,
        expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
        createdBy: actor.id,
      });
    }
    appendSecurityEvent({
      guildId,
      type: minutes > 0 ? "temp_ban" : "ban",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: minutes > 0 ? `${minutes}분 · ${reason}` : reason,
    });
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `🔨 **${minutes > 0 ? "임시밴" : "밴"}** · ${target.name} (\`${target.id}\`)\n실행: <@${actor.id}>\n사유: ${reason}${
        minutes > 0 ? `\n만료: ${minutes}분 후` : ""
      }`,
    );
    return ephemeralV2([
      textDisplay(minutes > 0 ? "## 임시밴 완료" : "## 밴 완료"),
      separator(true, 1),
      textDisplay(
        minutes > 0
          ? `**${target.name}** · ${minutes}분 임시밴\n사유: ${reason}`
          : `**${target.name}** 을(를) 차단했어요.\n사유: ${reason}`,
      ),
    ]);
  }

  if (name === "언밴") {
    const userId = String(optionValue(interaction, "유저id") ?? "").trim();
    if (!/^\d{5,30}$/.test(userId)) return errorV2("올바른 유저 ID를 입력해 주세요.");
    const reason = String(optionValue(interaction, "사유") ?? "언밴");
    const res = await unbanMember(guildId, userId, `[${actor.username}] ${reason}`);
    if (!res.ok) return errorV2(`언밴 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "unban",
      actorId: actor.id,
      actorName: actor.username,
      targetId: userId,
      targetName: null,
      detail: reason,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 언밴 완료"),
      separator(true, 1),
      textDisplay(`\`${userId}\` 차단을 해제했어요.`),
    ]);
  }

  if (name === "뮤트") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    if (isProtectedTarget(guild, target.id, target.roles)) {
      return errorV2("보호된 유저/역할입니다.");
    }
    const minutes = Number(optionValue(interaction, "분") ?? 10);
    const reason = String(optionValue(interaction, "사유") ?? "뮤트");
    const res = await timeoutMember(
      guildId,
      target.id,
      minutes,
      `[${actor.username}] ${reason}`,
    );
    if (!res.ok) return errorV2(`뮤트 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "mute",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: `${minutes}분 · ${reason}`,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 뮤트 완료"),
      separator(true, 1),
      textDisplay(`**${target.name}** · ${minutes}분\n사유: ${reason}`),
    ]);
  }

  if (name === "언뮤트") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    const reason = String(optionValue(interaction, "사유") ?? "언뮤트");
    const res = await clearTimeoutMember(guildId, target.id, `[${actor.username}] ${reason}`);
    if (!res.ok) return errorV2(`언뮤트 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "unmute",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: reason,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 언뮤트 완료"),
      separator(true, 1),
      textDisplay(`**${target.name}** 타임아웃을 해제했어요.`),
    ]);
  }

  if (name === "청소") {
    const count = Number(optionValue(interaction, "개수") ?? 10);
    const onlyUser = resolvedUser(interaction, "유저");
    const channelId = interaction.channel_id;
    if (!channelId) return errorV2("채널을 확인할 수 없어요.");
    const msgs = await fetchRecentMessages(channelId, 100);
    // Discord 일괄 삭제는 14일 지난 메시지가 섞이면 통째로 실패한다
    const cutoff = Date.now() - 14 * 86_400_000 + 60_000;
    const ids = msgs
      .filter((m) => Number((BigInt(m.id) >> BigInt(22)) + BigInt(1420070400000)) > cutoff)
      .filter((m) => !onlyUser || m.author?.id === onlyUser.id)
      .slice(0, count)
      .map((m) => m.id);
    if (ids.length < 2 && ids.length === 1) {
      await bulkDeleteMessages(channelId, ids);
    } else if (ids.length >= 2) {
      const res = await bulkDeleteMessages(channelId, ids);
      if (!res.ok) return errorV2(`청소 실패 (${res.status})`);
    } else {
      return errorV2("삭제할 메시지가 없어요.");
    }
    appendSecurityEvent({
      guildId,
      type: "purge",
      actorId: actor.id,
      actorName: actor.username,
      targetId: onlyUser?.id ?? null,
      targetName: onlyUser?.name ?? null,
      detail: `${ids.length}개 삭제 · #${channelId}`,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 청소 완료"),
      separator(true, 1),
      textDisplay(`${ids.length}개 메시지를 삭제했어요.`),
    ]);
  }

  if (name === "경고") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    if (isProtectedTarget(guild, target.id, target.roles)) {
      return errorV2("보호된 유저/역할입니다.");
    }
    const reason = String(optionValue(interaction, "사유") ?? "");
    if (!reason.trim()) return errorV2("사유를 입력해 주세요.");
    appendSecurityEvent({
      guildId,
      type: "warn",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: reason,
    });
    const warnCount = countWarns(guildId, target.id);
    let autoNote = "";
    if (guild.warnThreshold > 0 && warnCount >= guild.warnThreshold) {
      if (guild.warnAction === "mute") {
        await timeoutMember(
          guildId,
          target.id,
          guild.warnMuteMinutes,
          `warn threshold ${warnCount}`,
        );
        autoNote = `\n자동: 뮤트 ${guild.warnMuteMinutes}분 (${warnCount}경고)`;
      } else if (guild.warnAction === "kick") {
        await kickMember(guildId, target.id, `warn threshold ${warnCount}`);
        autoNote = `\n자동: 킥 (${warnCount}경고)`;
      } else if (guild.warnAction === "ban") {
        await banMember(guildId, target.id, `warn threshold ${warnCount}`, 0);
        autoNote = `\n자동: 밴 (${warnCount}경고)`;
      }
      appendSecurityEvent({
        guildId,
        type: "warn_auto",
        actorId: "system",
        actorName: "auto",
        targetId: target.id,
        targetName: target.name,
        detail: `${guild.warnAction} at ${warnCount}`,
      });
    }
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `⚠️ **경고** · ${target.name} (\`${target.id}\`) · ${warnCount}회\n실행: <@${actor.id}>\n사유: ${reason}${autoNote}`,
    );
    return ephemeralV2([
      textDisplay("## 경고 기록"),
      separator(true, 1),
      textDisplay(`**${target.name}** · 누적 **${warnCount}**회\n사유: ${reason}${autoNote}`),
    ]);
  }

  if (name === "락다운") {
    const reason = String(optionValue(interaction, "사유") ?? "긴급 락다운");
    const res = await setGuildLockdown(guildId, true);
    if (!res.ok) return errorV2(res.error || "락다운 실패");
    updateSecurityGuild(guildId, { lockdownActive: true });
    appendSecurityEvent({
      guildId,
      type: "lockdown",
      actorId: actor.id,
      actorName: actor.username,
      targetId: null,
      targetName: null,
      detail: `${reason} · ${res.changed}채널`,
    });
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `🔒 **락다운** · <@${actor.id}>\n사유: ${reason}\n채널 ${res.changed}개 잠금`,
    );
    return ephemeralV2([
      textDisplay("## 락다운 적용"),
      separator(true, 1),
      textDisplay(`${res.changed}개 채널에서 @everyone 메시지 전송을 차단했어요.`),
    ]);
  }

  if (name === "언락") {
    const res = await setGuildLockdown(guildId, false);
    if (!res.ok) return errorV2(res.error || "언락 실패");
    updateSecurityGuild(guildId, { lockdownActive: false });
    appendSecurityEvent({
      guildId,
      type: "unlock",
      actorId: actor.id,
      actorName: actor.username,
      targetId: null,
      targetName: null,
      detail: `${res.changed}채널`,
    });
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `🔓 **언락** · <@${actor.id}>\n채널 ${res.changed}개 해제`,
    );
    return ephemeralV2([
      textDisplay("## 언락 완료"),
      separator(true, 1),
      textDisplay(`락다운을 해제했어요 (${res.changed}채널).`),
    ]);
  }

  if (name === "슬로우모드") {
    const seconds = Number(optionValue(interaction, "초") ?? 0);
    const channelId = interaction.channel_id;
    if (!channelId) return errorV2("채널을 확인할 수 없어요.");
    const res = await setChannelSlowmode(channelId, seconds);
    if (!res.ok) return errorV2(`슬로우모드 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "slowmode",
      actorId: actor.id,
      actorName: actor.username,
      targetId: null,
      targetName: null,
      detail: `${seconds}초 · #${channelId}`,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 슬로우모드"),
      separator(true, 1),
      textDisplay(seconds === 0 ? "슬로우모드를 해제했어요." : `${seconds}초로 설정했어요.`),
    ]);
  }

  if (name === "닉네임초기화") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    if (isProtectedTarget(guild, target.id, target.roles)) {
      return errorV2("보호된 유저/역할입니다.");
    }
    const reason = String(optionValue(interaction, "사유") ?? "닉네임 초기화");
    const res = await resetMemberNick(guildId, target.id, `[${actor.username}] ${reason}`);
    if (!res.ok) return errorV2(`닉네임 초기화 실패 (${res.status})`);
    appendSecurityEvent({
      guildId,
      type: "nick_reset",
      actorId: actor.id,
      actorName: actor.username,
      targetId: target.id,
      targetName: target.name,
      detail: reason,
    });
    await persistSecurityStore();
    return ephemeralV2([
      textDisplay("## 닉네임 초기화"),
      separator(true, 1),
      textDisplay(`**${target.name}** 닉네임을 초기화했어요.`),
    ]);
  }

  if (name === "유저정보") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    const member = await fetchGuildMember(guildId, target.id);
    const snowflake = BigInt(target.id);
    const createdMs = Number((snowflake >> BigInt(22)) + BigInt(1_420_070_400_000));
    const warns = listSecurityEvents(guildId, 200).filter(
      (e) => e.type === "warn" && e.targetId === target.id,
    );
    const lines = [
      `유저: **${target.name}** (\`${target.id}\`)`,
      `계정 생성: ${new Date(createdMs).toLocaleString("ko-KR")}`,
      member?.joined_at
        ? `서버 가입: ${new Date(member.joined_at).toLocaleString("ko-KR")}`
        : "서버 가입: 확인 불가",
      `닉네임: ${member?.nick || "(없음)"}`,
      `역할 수: ${member?.roles?.length ?? target.roles.length}`,
      member?.communication_disabled_until
        ? `타임아웃: ${new Date(member.communication_disabled_until).toLocaleString("ko-KR")}`
        : "타임아웃: 없음",
      `경고 기록: ${warns.length}건`,
      isProtectedTarget(guild, target.id, target.roles) ? "보호 대상: **예**" : "보호 대상: 아니오",
    ];
    return ephemeralV2([
      textDisplay("## 유저 정보"),
      separator(true, 1),
      textDisplay(lines.join("\n")),
    ]);
  }

  if (name === "경고목록") {
    const target = resolvedUser(interaction, "유저");
    if (!target) return errorV2("유저를 선택해 주세요.");
    const warns = listSecurityEvents(guildId, 200)
      .filter((e) => e.type === "warn" && e.targetId === target.id)
      .slice(0, 10);
    if (!warns.length) {
      return ephemeralV2([
        textDisplay("## 경고 목록"),
        separator(true, 1),
        textDisplay(`**${target.name}** 경고 기록이 없어요.`),
      ]);
    }
    return ephemeralV2([
      textDisplay(`## 경고 목록 · ${target.name}`),
      separator(true, 1),
      textDisplay(
        warns
          .map(
            (w, i) =>
              `${i + 1}. ${w.detail}\n-# ${w.actorName || "?"} · ${new Date(w.createdAt).toLocaleString("ko-KR")}`,
          )
          .join("\n\n"),
      ),
    ]);
  }

  if (name === "스냅샷") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const label = String(optionValue(interaction, "라벨") ?? "manual").slice(0, 80);
    const data = await createGuildSnapshotData(guildId);
    const snap = addSnapshot({
      guildId,
      label,
      createdBy: actor.id,
      channels: data.channels,
      roles: data.roles,
    });
    const g = getSecurityGuild(guildId);
    if (g) {
      g.lastSnapshotAt = snap.createdAt;
      g.updatedAt = snap.createdAt;
    }
    await persistSecurityStore();
    await logAction(
      guildId,
      guild.logChannelId,
      `💾 **스냅샷** · ${label}\n채널 ${data.channels.length} · 역할 ${data.roles.length}\nby <@${actor.id}>`,
    );
    return ephemeralV2([
      textDisplay("## 스냅샷 저장"),
      separator(true, 1),
      textDisplay(
        `ID: \`${snap.id.slice(0, 8)}\`\n채널 **${data.channels.length}** · 역할 **${data.roles.length}**\n라벨: ${label}`,
      ),
    ]);
  }

  if (name === "스냅샷목록") {
    const snaps = listSnapshots(guildId, 8);
    const temps = listTempBans(guildId).slice(0, 5);
    if (!snaps.length) {
      return ephemeralV2([
        textDisplay("## 스냅샷 목록"),
        separator(true, 1),
        textDisplay("저장된 스냅샷이 없어요. `/스냅샷`으로 만들어 보세요."),
      ]);
    }
    return ephemeralV2([
      textDisplay("## 스냅샷 목록"),
      separator(true, 1),
      textDisplay(
        snaps
          .map(
            (s, i) =>
              `${i + 1}. **${s.label}** · 채널 ${s.channels.length}/역할 ${s.roles.length}\n-# \`${s.id.slice(0, 8)}\` · ${new Date(s.createdAt).toLocaleString("ko-KR")}`,
          )
          .join("\n\n"),
      ),
      ...(temps.length
        ? [
            separator(true, 1),
            textDisplay(
              `임시밴 ${temps.length}건\n` +
                temps
                  .map(
                    (b) =>
                      `· <@${b.userId}> ~ ${new Date(b.expiresAt).toLocaleString("ko-KR")}`,
                  )
                  .join("\n"),
            ),
          ]
        : []),
    ]);
  }

  if (name === "보안리포트") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const { total, counts } = eventCountsSince(guildId, Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lines = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, v]) => `· ${k}: **${v}**`)
      .join("\n");
    const body = [
      `📊 **보안 리포트** · ${guild.guildName}`,
      `최근 7일 · 총 **${total}**건`,
      lines || "· (기록 없음)",
    ].join("\n");
    if (guild.logChannelId) {
      await postSecurityLog(guild.logChannelId, body).catch(() => null);
    }
    return ephemeralV2([textDisplay("## 보안 리포트"), separator(true, 1), textDisplay(body)]);
  }

  void listSecurityGuildChannels;
  void applyGuildSlowmode;
  void addMemberRole;
  return errorV2("알 수 없는 명령이에요.");
}
