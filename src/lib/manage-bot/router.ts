import {
  actionRow,
  button,
  ButtonStyle,
  container,
  errorPanel,
  InteractionResponseType,
  MessageFlags,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
} from "@/lib/discord/components";
import { manageOrigin } from "@/lib/domain";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { registerManageGuildCommands } from "@/lib/manage-bot/rest";
import { canManageEmbeds, handleEmbedComponent, openEmbedBuilder } from "@/lib/manage-bot/embed-router";
import {
  formatBannerExpiry,
  redeemBannerLicense,
  renameOwnerBanner,
  sendPartnerBroadcast,
} from "@/lib/manage-bot/service";
import {
  addPartnerWebhook,
  appendManageAudit,
  getBannerById,
  getManageGuild,
  initManageStore,
  issueBannerLicenses,
  listOwnerActiveBanners,
  persistManageStore,
  registerManageGuild,
  updateManageGuild,
} from "@/lib/manage-bot/store";
import type { ManageBanner } from "@/lib/manage-bot/types";

function isGuildAdmin(permissions?: string) {
  if (!permissions) return false;
  try {
    const p = BigInt(permissions);
    return (p & BigInt(0x8)) === BigInt(0x8) || (p & BigInt(0x20)) === BigInt(0x20);
  } catch {
    return false;
  }
}

function opt(options: unknown, name: string): unknown {
  if (!Array.isArray(options)) return undefined;
  const hit = options.find(
    (o) => o && typeof o === "object" && (o as { name?: string }).name === name,
  ) as { value?: unknown } | undefined;
  return hit?.value;
}

function v2Ephemeral(kids: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

function plainEphemeral(content: string) {
  return v2Ephemeral([textDisplay(content.slice(0, 3900))]);
}

function actorFromInteraction(interaction: Record<string, unknown>) {
  const member = (interaction.member || {}) as {
    user?: { id?: string; username?: string; global_name?: string };
  };
  const user = (interaction.user || member.user || {}) as {
    id?: string;
    username?: string;
    global_name?: string;
  };
  const id = String(member.user?.id || user.id || "");
  const name = String(
    member.user?.global_name || member.user?.username || user.global_name || user.username || id,
  );
  return { id, name };
}

function bannerSettingsPanel(guildId: string, banner: ManageBanner) {
  const exp = formatBannerExpiry(banner.expiresAt);
  return v2Ephemeral([
    textDisplay(`## ${banner.displayName}`),
    separator(true, 1),
    textDisplay(`**채널**\n<#${banner.channelId}>`),
    textDisplay(`**만료일 (KST)**\n${exp.label}`),
    textDisplay(`**남은 기간**\n${exp.expired ? "만료됨" : `약 ${exp.remainDays}일`}`),
    separator(true, 2),
    actionRow(
      button({
        customId: `mg|${guildId}|bn_rename|${banner.id}`,
        label: "배너명 변경",
        style: ButtonStyle.SECONDARY,
      }),
    ),
  ]);
}

function ownerBannerPicker(guildId: string, banners: ManageBanner[]) {
  if (banners.length === 1) return bannerSettingsPanel(guildId, banners[0]!);
  return v2Ephemeral([
    textDisplay("## 내 배너 설정"),
    separator(true, 1),
    textDisplay("등록한 배너만 선택할 수 있어요."),
    separator(true, 2),
    actionRow(
      stringSelect({
        customId: `mg|${guildId}|banner_pick`,
        placeholder: "배너 선택",
        options: banners.slice(0, 25).map((b) => {
          const exp = formatBannerExpiry(b.expiresAt);
          return {
            label: b.displayName.slice(0, 100),
            value: b.id,
            description: `만료 ${exp.label}`.slice(0, 100),
          };
        }),
      }),
    ),
  ]);
}

export async function handleManageBotInteraction(interaction: Record<string, unknown>) {
  await initManageStore({ force: true });
  const type = Number(interaction.type);

  if (type === 2) {
    // APPLICATION_COMMAND
    const data = (interaction.data || {}) as {
      name?: string;
      options?: unknown[];
    };
    const name = data.name || "";
    const guildId = String(interaction.guild_id || "");
    const member = (interaction.member || {}) as {
      permissions?: string;
      user?: { id?: string; username?: string; global_name?: string };
    };
    const { id: actorId, name: actorName } = actorFromInteraction(interaction);
    const guildName =
      typeof interaction.guild_id === "string"
        ? String((interaction as { guild?: { name?: string } }).guild?.name || `서버-${guildId.slice(-4)}`)
        : `서버-${guildId.slice(-4)}`;

    if (!guildId) return plainEphemeral("서버에서만 사용할 수 있어요.");

    if (name === "등록") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 등록할 수 있어요.");
      const { guild, password, created } = registerManageGuild({
        guildId,
        guildName,
        registeredBy: actorId,
      });
      await persistManageStore();
      scheduleDiscordBackground(registerManageGuildCommands(guildId));
      return v2Ephemeral([
        textDisplay(created ? "## 관리봇 등록 완료" : "## 이미 등록된 서버"),
        separator(true, 1),
        textDisplay(`**웹패널**\n${manageOrigin()}/${guild.guildId}`),
        textDisplay(`**관리 비밀번호**\n||\`${password}\`||`),
        textDisplay("Discord 로그인으로도 패널에 접속할 수 있어요."),
      ]);
    }

    const guild = getManageGuild(guildId);
    if (!guild) {
      return plainEphemeral("먼저 `/등록`으로 서버를 등록해 주세요.");
    }

    if (name === "배너패널") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 가능해요.");
      scheduleDiscordBackground(registerManageGuildCommands(guildId));
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: MessageFlags.IS_COMPONENTS_V2,
          components: [
            container([
              textDisplay(`## ${guild.bannerPanelTitle}`),
              separator(true, 1),
              textDisplay(guild.bannerPanelDescription),
              separator(true, 2),
              actionRow(
                button({
                  customId: `mg|${guildId}|banner_claim`,
                  label: guild.bannerButtonLabel || "배너 생성",
                  style: ButtonStyle.SECONDARY,
                }),
                button({
                  customId: `mg|${guildId}|banner_settings`,
                  label: "설정",
                  style: ButtonStyle.SECONDARY,
                }),
              ),
            ]),
          ],
        },
      };
    }

    if (name === "배너라이센스") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 가능해요.");
      const days = Number(opt(data.options, "일수") || 0);
      const count = Number(opt(data.options, "갯수") || 0);
      if (!days || !count) return plainEphemeral("일수와 갯수를 입력해 주세요.");
      const issued = issueBannerLicenses({
        guildId,
        days,
        count,
        createdBy: actorId,
      });
      appendManageAudit({
        guildId,
        actor: actorName,
        action: "license_issue",
        detail: `${days}일 × ${count}개`,
      });
      await persistManageStore();
      const codes = issued.map((l) => `\`${l.code}\` (${l.days}일)`).join("\n");
      return v2Ephemeral([
        textDisplay("## 배너 라이선스 발급"),
        separator(true, 1),
        textDisplay(codes.slice(0, 3500)),
      ]);
    }

    if (name === "파트너설정") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 가능해요.");
      const msg = opt(data.options, "문구");
      const whName = opt(data.options, "웹훅명");
      const avatar = opt(data.options, "웹훅사진");
      const hour = opt(data.options, "시");
      const minute = opt(data.options, "분");
      const on = opt(data.options, "사용");
      const patch: Parameters<typeof updateManageGuild>[1] = {};
      if (typeof msg === "string" && msg.trim()) patch.partnerMessage = msg.trim().slice(0, 2000);
      if (typeof whName === "string" && whName.trim()) patch.partnerWebhookName = whName.trim().slice(0, 80);
      if (typeof avatar === "string") {
        patch.partnerWebhookAvatarUrl = avatar.trim() || null;
      }
      if (typeof hour === "number") patch.partnerHourKst = hour;
      if (typeof minute === "number") patch.partnerMinuteKst = minute;
      if (typeof on === "number") patch.partnerEnabled = on === 1;
      if (Object.keys(patch).length) {
        updateManageGuild(guildId, patch);
        appendManageAudit({
          guildId,
          actor: actorName,
          action: "partner_settings",
          detail: JSON.stringify(patch).slice(0, 200),
        });
        await persistManageStore();
      }
      const g = getManageGuild(guildId)!;
      return v2Ephemeral([
        textDisplay("## 파트너 설정"),
        separator(true, 1),
        textDisplay(`**사용**\n${g.partnerEnabled ? "ON" : "OFF"}`),
        textDisplay(
          `**발송 시각 (KST)**\n${String(g.partnerHourKst).padStart(2, "0")}:${String(g.partnerMinuteKst).padStart(2, "0")}`,
        ),
        textDisplay(`**웹훅명**\n${g.partnerWebhookName}`),
        textDisplay(`**문구**\n${g.partnerMessage.slice(0, 500)}`),
      ]);
    }

    if (name === "파트너웹훅") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 가능해요.");
      const url = String(opt(data.options, "url") || "");
      const label = String(opt(data.options, "이름") || "웹훅");
      const res = addPartnerWebhook({ guildId, url, label });
      if (!res.ok) return plainEphemeral(res.error);
      appendManageAudit({
        guildId,
        actor: actorName,
        action: "partner_webhook_add",
        detail: res.webhook.label,
      });
      await persistManageStore();
      return v2Ephemeral([
        textDisplay("## 웹훅 추가됨"),
        separator(true, 1),
        textDisplay(`**이름**\n${res.webhook.label}`),
      ]);
    }

    if (name === "파트너즉시") {
      if (!isGuildAdmin(member.permissions)) return plainEphemeral("관리자만 가능해요.");
      const result = await sendPartnerBroadcast(guildId, { force: true });
      if (!result.ok && result.sent === 0) return plainEphemeral(result.error || "발송 실패");
      return v2Ephemeral([
        textDisplay("## 파트너 발송 완료"),
        separator(true, 1),
        textDisplay(`성공 **${result.sent}** · 실패 **${result.failed}**`),
      ]);
    }

    if (name === "임배드생성") {
      if (!canManageEmbeds(member.permissions)) {
        return plainEphemeral("메시지 관리 권한이 필요해요.");
      }
      return openEmbedBuilder({
        guildId,
        ownerDiscordId: actorId,
        channelId: String(interaction.channel_id || "") || null,
      });
    }

    return plainEphemeral("알 수 없는 명령이에요.");
  }

  if (type === 3) {
    // MESSAGE_COMPONENT
    const data = (interaction.data || {}) as {
      custom_id?: string;
      values?: string[];
      component_type?: number;
    };
    const customId = data.custom_id || "";
    const parts = customId.split("|");
    const { id: actorId } = actorFromInteraction(interaction);

    if (parts[0] === "mg" && parts[2] === "banner_claim") {
      const guildId = parts[1];
      return showModal({
        customId: `mg|${guildId}|banner_modal`,
        title: "상단 배너 생성",
        inputs: [
          textInput({
            customId: "license",
            label: "라이선스 코드",
            placeholder: "BNR-XXXXXX-XXXX",
            required: true,
            minLength: 4,
            maxLength: 40,
          }),
          textInput({
            customId: "name",
            label: "배너명 (채널명에 사용)",
            placeholder: "내서버",
            required: true,
            minLength: 1,
            maxLength: 40,
          }),
        ],
      });
    }

    if (parts[0] === "mg" && parts[2] === "banner_settings") {
      const guildId = parts[1] || "";
      const mine = listOwnerActiveBanners(guildId, actorId);
      if (!mine.length) {
        return plainEphemeral("등록한 활성 배너가 없어요. 배너 생성 후 설정할 수 있어요.");
      }
      return ownerBannerPicker(guildId, mine);
    }

    if (parts[0] === "mg" && parts[2] === "banner_pick") {
      const guildId = parts[1] || "";
      const bannerId = String(data.values?.[0] || "");
      const banner = getBannerById(bannerId);
      if (!banner || banner.guildId !== guildId || banner.status !== "active") {
        return plainEphemeral("배너를 찾을 수 없어요.");
      }
      if (banner.ownerDiscordId !== actorId) {
        return plainEphemeral("배너를 등록한 사람만 설정할 수 있어요.");
      }
      return bannerSettingsPanel(guildId, banner);
    }

    if (parts[0] === "mg" && parts[2] === "bn_rename") {
      const guildId = parts[1] || "";
      const bannerId = parts[3] || "";
      const banner = getBannerById(bannerId);
      if (!banner || banner.guildId !== guildId || banner.status !== "active") {
        return plainEphemeral("배너를 찾을 수 없어요.");
      }
      if (banner.ownerDiscordId !== actorId) {
        return plainEphemeral("배너를 등록한 사람만 설정할 수 있어요.");
      }
      return showModal({
        customId: `mg|${guildId}|rename_modal|${bannerId}`,
        title: "배너명 변경",
        inputs: [
          textInput({
            customId: "name",
            label: "새 배너명",
            placeholder: banner.displayName.slice(0, 40),
            required: true,
            minLength: 1,
            maxLength: 40,
          }),
        ],
      });
    }

    if (parts[0] === "mg" && (parts[2] === "emb" || parts[2] === "embm")) {
      return handleEmbedComponent({
        parts,
        actorId,
        values: data.values,
        fields: new Map(),
        isModal: false,
      });
    }

    return plainEphemeral("알 수 없는 버튼이에요.");
  }

  if (type === 5) {
    // MODAL_SUBMIT
    const data = (interaction.data || {}) as {
      custom_id?: string;
      components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }>;
    };
    const customId = data.custom_id || "";
    const parts = customId.split("|");
    const fields = new Map<string, string>();
    for (const row of data.components || []) {
      for (const c of row.components || []) {
        if (c.custom_id) fields.set(c.custom_id, c.value || "");
      }
    }
    const { id: ownerId, name: ownerName } = actorFromInteraction(interaction);

    if (parts[0] === "mg" && parts[2] === "banner_modal") {
      const guildId = parts[1] || "";
      const result = await redeemBannerLicense({
        guildId,
        licenseCode: fields.get("license") || "",
        displayName: fields.get("name") || "",
        ownerDiscordId: ownerId,
        ownerUsername: ownerName,
      });
      if (!result.ok) return plainEphemeral(result.error);
      const expiresLabel = formatBannerExpiry(result.banner.expiresAt).label;
      return v2Ephemeral([
        textDisplay("## 배너 생성 완료"),
        separator(true, 1),
        textDisplay(`**채널**\n<#${result.channelId}>`),
        textDisplay(`**만료일 (KST)**\n${expiresLabel}`),
      ]);
    }

    if (parts[0] === "mg" && parts[2] === "rename_modal") {
      const guildId = parts[1] || "";
      const bannerId = parts[3] || "";
      const result = await renameOwnerBanner({
        bannerId,
        ownerDiscordId: ownerId,
        displayName: fields.get("name") || "",
      });
      if (!result.ok) return plainEphemeral(result.error);
      if (result.banner.guildId !== guildId) return plainEphemeral("잘못된 요청이에요.");
      const exp = formatBannerExpiry(result.banner.expiresAt);
      return v2Ephemeral([
        textDisplay("## 배너명 변경 완료"),
        separator(true, 1),
        textDisplay(`**배너명**\n${result.banner.displayName}`),
        textDisplay(`**채널**\n<#${result.banner.channelId}> (\`${result.banner.channelName}\`)`),
        textDisplay(`**만료일 (KST)**\n${exp.label}`),
      ]);
    }

    if (parts[0] === "mg" && (parts[2] === "emb" || parts[2] === "embm")) {
      return handleEmbedComponent({
        parts,
        actorId: ownerId,
        fields,
        isModal: true,
      });
    }

    return plainEphemeral("알 수 없는 모달이에요.");
  }

  return errorPanel("지원하지 않는 상호작용이에요.");
}
