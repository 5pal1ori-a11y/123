import {
  actionRow,
  actorFromInteraction,
  button,
  ButtonStyle,
  container,
  InteractionResponseType,
  InteractionType,
  mediaGallery,
  MessageFlags,
  optionValue,
  separator,
  textDisplay,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { verifyOAuthStartOrigin, verifyOrigin } from "@/lib/domain";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { computeSuspicionScore } from "@/lib/verify-bot/analytics";
import { createVerifyOAuthState } from "@/lib/verify-bot/oauth";
import { verifyFeatureError, verifyHasFeature, recoveryLimitFor } from "@/lib/verify-bot/plan";
import { recoverMembersToGuild } from "@/lib/verify-bot/recovery";
import {
  editInteractionOriginal,
  registerVerifyGuildCommands,
} from "@/lib/verify-bot/rest";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";
import {
  addBlacklistUser,
  appendVerifyAudit,
  findGuildByRecoveryKey,
  getVerifyGuild,
  initVerifyStore,
  listVerifyEvents,
  listVerifyMembers,
  persistVerifyStore,
  registerVerifyGuild,
  removeBlacklistUser,
} from "@/lib/verify-bot/store";

/** Discord 가 직접 받아 가므로 절대 URL 이어야 한다 (public/brand) */
export const VERIFY_PANEL_BANNER = "https://doesmc.xyz/brand/does-verify-banner.jpg";

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

function publicV2(kids: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

function errorV2(message: string) {
  return ephemeralV2([
    textDisplay("## 오류"),
    separator(true, 1),
    textDisplay(message),
  ]);
}

export async function handleVerifyBotInteraction(interaction: DiscordInteraction) {
  await initVerifyStore();

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

  if (!isGuildAdmin(interaction.member?.permissions)) {
    return errorV2("관리자 권한이 필요합니다.");
  }

  if (name === "등록") {
    const guildName =
      (interaction as { guild?: { name?: string } }).guild?.name ||
      `서버-${guildId.slice(-4)}`;
    const { guild, recoveryKey, created } = registerVerifyGuild({
      guildId,
      guildName,
      registeredBy: actor.id,
    });
    await persistVerifyStore();
    scheduleDiscordBackground(registerVerifyGuildCommands(guildId).then(() => undefined));

    return ephemeralV2([
      textDisplay(created ? "## 서버 등록 완료" : "## 복구키 재발급"),
      separator(true, 1),
      textDisplay(
        `웹패널: ${verifyOrigin()}\n복구키: ||\`${recoveryKey}\`||\n플랜: **${guild.planTier}**\n\n웹패널은 상점 **관리자 계정**으로 로그인합니다.`,
      ),
      textDisplay(
        "-# 복구(`/복구`)를 쓰려면 봇에 **초대 만들기** 권한이 필요합니다.\n" +
          "-# 복구키는 `/복구`에 사용합니다.",
      ),
      actionRow(
        button({
          label: "웹패널 열기",
          style: ButtonStyle.LINK,
          url: verifyOrigin(),
        }),
      ),
    ]);
  }

  if (name === "인증") {
    const guild = getVerifyGuild(guildId);
    if (!guild) return errorV2("먼저 `/등록`으로 서버를 등록해 주세요.");
    if (!guild.enabled) return errorV2("인증봇이 비활성화되어 있어요.");

    const campaign = String(optionValue(interaction, "캠페인") || "").trim() || undefined;
    const channelId = interaction.channel_id || undefined;
    const state = createVerifyOAuthState(guildId, {
      channelId: guild.trackSources ? channelId : undefined,
      campaign: guild.trackSources ? campaign : undefined,
    });
    const origin = verifyOAuthStartOrigin().replace(/\/$/, "");
    const startUrl = `${origin}/api/verify-bot/oauth/start?guild=${encodeURIComponent(guildId)}&state=${encodeURIComponent(state)}`;

    return publicV2([
      mediaGallery([VERIFY_PANEL_BANNER]),
      textDisplay(`## ${guild.panelTitle || "서버 인증"}`),
      separator(true, 1),
      textDisplay(guild.panelDescription || "아래 버튼으로 인증하세요."),
      separator(true, 1),
      actionRow(
        button({
          label: (guild.buttonLabel || "인증하기").slice(0, 80),
          style: ButtonStyle.LINK,
          url: startUrl,
        }),
      ),
    ]);
  }

  if (name === "통계") {
    const featErr = verifyFeatureError(getVerifyGuild(guildId)?.planTier || "free", "slash_mod");
    // stats allowed on free with limited info; full suspicion needs pro
    const guild = getVerifyGuild(guildId);
    if (!guild) return errorV2("등록되지 않은 서버입니다.");
    const events = listVerifyEvents(guildId, 200);
    const suspicion = verifyHasFeature(guild.planTier, "suspicion")
      ? computeSuspicionScore(guild, events)
      : null;
    return ephemeralV2([
      textDisplay("## 인증 통계"),
      separator(true, 1),
      textDisplay(
        `오늘 입장 **${guild.joinsToday}** · 인증 **${guild.verifiesToday}** · 차단 **${guild.blockedToday}**\n` +
          `누적 인증 **${guild.verifyTotal}** · 복구가능 **${listVerifyMembers(guildId).filter((m) => m.refreshTokenEnc).length}/${recoveryLimitFor(guild.planTier)}**\n` +
          `플랜 **${guild.planTier}**` +
          (suspicion
            ? `\n의심점수 **${suspicion.score}** (${suspicion.level})`
            : featErr
              ? `\n-# 의심점수는 PRO 이상`
              : ""),
      ),
    ]);
  }

  if (name === "차단추가" || name === "차단해제") {
    const guild = getVerifyGuild(guildId);
    if (!guild) return errorV2("등록되지 않은 서버입니다.");
    const featErr = verifyFeatureError(guild.planTier, "slash_mod");
    if (featErr) return errorV2(featErr);
    const uid = String(optionValue(interaction, "유저id") || "").trim();
    if (!/^\d{5,30}$/.test(uid)) return errorV2("올바른 유저 ID를 입력해 주세요.");
    if (name === "차단추가") {
      addBlacklistUser(guildId, uid);
      appendVerifyAudit({
        guildId,
        action: "slash_ban",
        actor: actor.id,
        detail: uid,
      });
    } else {
      removeBlacklistUser(guildId, uid);
      appendVerifyAudit({
        guildId,
        action: "slash_unban",
        actor: actor.id,
        detail: uid,
      });
    }
    await persistVerifyStore();
    return ephemeralV2([
      textDisplay(name === "차단추가" ? "## 차단 추가" : "## 차단 해제"),
      separator(true, 1),
      textDisplay(`유저 \`${uid}\``),
    ]);
  }

  if (name === "복구" || name === "인증복구") {
    const key = String(optionValue(interaction, "복구키") || "").trim();
    if (!key) return errorV2("복구키를 입력해 주세요.");

    const source = findGuildByRecoveryKey(key);
    if (!source) return errorV2("복구키가 올바르지 않아요.");

    const limit = recoveryLimitFor(source.planTier);
    let recoverable = listVerifyMembers(source.guildId).filter((m) => m.refreshTokenEnc);
    if (recoverable.length > limit) {
      recoverable = recoverable.slice(0, limit);
    }
    if (recoverable.length === 0) {
      return errorV2("복구 가능한 인증 유저가 없어요.");
    }

    const appId = (await verifyDiscordEnvAsync()).applicationId;
    const token = interaction.token;
    if (!appId || !token) return errorV2("복구를 시작할 수 없어요.");

    appendVerifyAudit({
      guildId: source.guildId,
      action: "recovery_use",
      actor: actor.id,
      detail: `target=${guildId} count=${recoverable.length}`,
    });
    await persistVerifyStore();

    scheduleDiscordBackground(
      (async () => {
        const result = await recoverMembersToGuild({
          sourceGuildId: source.guildId,
          targetGuildId: guildId,
          roleId: getVerifyGuild(guildId)?.verifiedRoleId || source.verifiedRoleId,
        });
        await editInteractionOriginal(appId, token, {
          content:
            `## 복구 완료\n` +
            `원본: **${source.guildName}**\n` +
            `성공 **${result.ok}** / 실패 **${result.fail}** / 이미 있음 **${result.skipped}** (대상 ${result.total}명, 한도 ${limit})` +
            (result.errors.length
              ? `\n\n실패 상세:\n${result.errors.slice(0, 5).map((e) => `• ${e}`).join("\n")}`
              : "") +
            (result.fail > 0
              ? `\n\n-# 봇에 **초대 만들기** 권한이 있는지, 유저가 guilds.join으로 **다시 인증**했는지 확인하세요.`
              : ""),
          flags: MessageFlags.EPHEMERAL,
        });
      })(),
    );

    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: MessageFlags.EPHEMERAL },
    };
  }

  return errorV2("알 수 없는 명령이에요.");
}
