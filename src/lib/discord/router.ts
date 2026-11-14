import {
  InteractionResponseType,
  InteractionType,
  actorFromInteraction,
  modalFieldValue,
  optionValue,
  parseCid,
  plainEphemeral,
  type DiscordInteraction,
} from "@/lib/discord/components";
import {
  findShopByGuildIdLoose,
  handleExtendLicenseModal,
  handleExtendLicenseSubmit,
  handleManualChargeCommand,
  handlePersonalBotLicenseCommand,
  handlePersonalBotSettingsCommand,
  handlePersonalBotTokenModal,
  handlePersonalBotTokenSubmit,
  handlePersonalBotToggle,
  handleServerInfoCommand,
  handleWebPanelCommand,
} from "@/lib/discord/admin-commands";
import {
  handleBindGuild,
  handleBuyConfirm,
  handleBuyCategory,
  handleBrowseCategory,
  handleBrowseSelect,
  handleBuySelect,
  handleButtonPanelModal,
  handleButtonPanelSubmit,
  handleChargeAmountModal,
  handleChargeApprove,
  handleChargeCommand,
  handleChargeReject,
  handleChargeUi,
  handleInfo,
  handleNotices,
  handleProductsList,
  handleReviewSubmit,
  handleReviewWriteModal,
  handleCouponModal,
  handleCouponSubmit,
  handleSetLogChannel,
  handleSetLogPrompt,
  handleSettingsPanel,
  handleVendingCommand,
  handleRandomBoxCommand,
  handleRandomBoxOpen,
  handleAccountRegisterCommand,
  handleAccountTab,
  handleReferralCommand,
  handleServerStatusCommand,
  handleReferralMine,
  handleProductAutocomplete,
  handleStockBoardAdd,
  handleStockBoardRemove,
  handleStockCommand,
  handleStockView,
  handleRestockChannelCommand,
  linkGuideMessage,
} from "@/lib/discord/handlers";
import {
  handleEmbedChannel,
  handleEmbedCommand,
  handleEmbedModal,
  handleEmbedPick,
  handleEmbedStep,
} from "@/lib/discord/embed-builder";
import {
  consumeDiscordLinkCode,
  findShopByDiscordGuildId,
  getShopBySlug,
  getShopSettings,
  getUserByDiscordId,
  listShops,
  persistAsync,
  syncDiscordUsername,
} from "@/lib/store";
import { forwardToDoesBot, isDoesCommunityCommand } from "@/lib/discord/does-forward";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";

function resolveShop(interaction: DiscordInteraction) {
  const guildId = interaction.guild_id;
  if (!guildId) return null;
  return findShopByGuildIdLoose(guildId) ?? findShopByDiscordGuildId(guildId);
}

function resolveShopBySlugLoose(slug: string) {
  return listShops().find((s) => s.slug === slug) ?? getShopBySlug(slug);
}

function embedCtx(interaction: DiscordInteraction, shopSlug: string, actor: { id: string; roles: string[] }) {
  return {
    shopSlug,
    guildId: interaction.guild_id ?? "dm",
    userId: actor.id,
    roles: actor.roles,
    permissions: interaction.member?.permissions,
  };
}

export async function handleDiscordInteraction(interaction: DiscordInteraction) {
  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }

  const actor = actorFromInteraction(interaction);
  if (!actor) return plainEphemeral("사용자를 확인할 수 없어요.");

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    const name = interaction.data?.name;
    const shop = resolveShop(interaction);
    if (!shop) {
      return { type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, data: { choices: [] } };
    }
    if (name === "추가" || name === "삭제") {
      const focused = interaction.data?.options?.find((o) => o.focused);
      const query = focused ? String(focused.value ?? "") : "";
      return handleProductAutocomplete(shop.slug, query);
    }
    return { type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, data: { choices: [] } };
  }

  const nameShop = resolveShop(interaction);
  if (nameShop && syncDiscordUsername(nameShop.id, actor.id, actor.username)) {
    scheduleDiscordBackground(persistAsync());
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data?.name;
    const perms = interaction.member?.permissions;
    const verifyNames = new Set(["등록", "인증", "인증하기", "인증설정", "복구", "인증복구", "통계", "차단추가", "차단해제"]);
    if (name && verifyNames.has(name)) {
      const { handleVerifyBotInteraction } = await import("@/lib/verify-bot/router");
      return handleVerifyBotInteraction(interaction);
    }
    if (name === "island") {
      const islandShop = resolveShop(interaction);
      if (!islandShop) return plainEphemeral("이 Discord 서버에 연결된 상점이 없어요.");
      const { handleIslandCommand } = await import("@/lib/discord/island-command");
      return handleIslandCommand(islandShop, interaction, actor.id);
    }
    if (isDoesCommunityCommand(name)) {
      return forwardToDoesBot(interaction);
    }

    if (name === "개인봇") {
      return handlePersonalBotLicenseCommand(
        actor.id,
        Number(optionValue(interaction, "일수")),
        Number(optionValue(interaction, "갯수") ?? 1),
      );
    }
    if (name === "연동") {
      const shop = resolveShop(interaction);
      if (!shop) {
        return plainEphemeral(
          "이 서버에 연결된 상점이 없어요.\n웹 관리자 → Discord에서 Guild ID를 저장하거나 상점 등록 시 연동해 주세요.",
        );
      }
      const code = String(optionValue(interaction, "코드") ?? "");
      if (!code.trim()) {
        return linkGuideMessage(shop.name, shop.slug);
      }
      const result = consumeDiscordLinkCode(shop.id, code, actor.id, actor.username);
      if (!result.ok) return plainEphemeral(result.error);
      await persistAsync();
      return plainEphemeral(
        `연동 완료! **${result.user.name}** 계정과 연결됐어요.\n이제 \`/자판기\` 를 사용할 수 있어요.`,
      );
    }

    const shop = resolveShop(interaction);
    if (!shop) {
      return plainEphemeral(
        "이 Discord 서버에 연결된 상점이 없습니다.\n웹 관리자 → Discord에서 Guild ID를 저장해 주세요.",
      );
    }

    const settings = getShopSettings(shop.id);
    const allowWhenDisabled =
      name === "개인봇설정" ||
      name === "서버정보" ||
      name === "웹패널";
    if (!settings.discordBotEnabled && !allowWhenDisabled) {
      return plainEphemeral(
        "이 상점의 Discord 봇이 꺼져 있어요. 웹 관리자 → 봇 자판기에서 활성화하거나 `/설정`을 확인해 주세요.",
      );
    }

    if (name === "버튼") {
      scheduleDiscordBackground(
        import("@/lib/discord/presence").then(({ updateDiscordBotPresence }) => updateDiscordBotPresence()),
      );
      return handleButtonPanelModal(shop.slug, actor.roles, perms);
    }
    if (name === "자판기") {
      scheduleDiscordBackground(
        import("@/lib/discord/presence").then(({ updateDiscordBotPresence }) => updateDiscordBotPresence()),
      );
      return handleVendingCommand(shop.slug, actor.id);
    }
    if (name === "템플릿") {
      const o = (n: string) => {
        const v = interaction.data?.options?.find((x) => x.name === n)?.value;
        return typeof v === "string" ? v : undefined;
      };
      const { handleTemplateCommand } = await import("@/lib/discord/template-panels");
      return handleTemplateCommand(shop.slug, actor.roles, perms, { kind: o("종류"), link1: o("링크1"), link2: o("링크2"), channelId: interaction.channel_id });
    }
    if (name === "재고요청") {
      const ch = interaction.data?.options?.find((o) => o.name === "받을채널")?.value;
      const { handleStockRequestCommand } = await import("@/lib/discord/stock-request");
      return handleStockRequestCommand(shop.slug, actor.roles, perms, typeof ch === "string" ? ch : null);
    }
    if (name === "랜덤박스") {
      return handleRandomBoxCommand(shop.slug, actor.roles, perms);
    }
    if (name === "서버상황") {
      const target = interaction.data?.options?.find((o) => o.name === "대상")?.value;
      return handleServerStatusCommand(
        shop.slug,
        actor.roles,
        perms,
        interaction.channel_id,
        interaction.guild_id,
        typeof target === "string" ? target : null,
      );
    }
    if (name === "계정등록") {
      return handleAccountRegisterCommand(shop.slug, interaction, actor.roles, perms);
    }
    if (name === "추천인") {
      return handleReferralCommand(shop.slug);
    }
    if (name === "웹패널") {
      return handleWebPanelCommand(shop.slug, actor.roles, perms);
    }
    if (name === "서버정보") {
      return handleServerInfoCommand(shop.slug);
    }
    if (name === "개인봇설정") {
      return handlePersonalBotSettingsCommand(shop.slug, actor.roles, perms);
    }
    if (name === "수동충전") {
      const targetId = String(optionValue(interaction, "유저") ?? "");
      const amount = Number(optionValue(interaction, "금액"));
      const resolved = interaction.data?.resolved as
        | { users?: Record<string, { username?: string; global_name?: string | null }> }
        | undefined;
      const u = resolved?.users?.[targetId];
      const targetName = u?.global_name || u?.username || targetId;
      return handleManualChargeCommand({
        shopSlug: shop.slug,
        targetDiscordId: targetId,
        targetName,
        amount,
        actorId: actor.id,
        actorName: actor.username,
        roles: actor.roles,
        permissions: perms,
      });
    }
    if (name === "충전") {
      const raw = optionValue(interaction, "금액");
      if (raw === undefined || raw === null || raw === "") {
        return handleChargeAmountModal(shop.slug, actor.id);
      }
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        return plainEphemeral("올바른 금액을 입력해 주세요.");
      }
      const linked = getUserByDiscordId(shop.id, actor.id);
      if (!linked?.bankDepositorName?.trim()) {
        return handleChargeAmountModal(shop.slug, actor.id, {
          amountPrefill: Math.floor(amount),
        });
      }
      return handleChargeCommand(shop.slug, actor.id, Math.floor(amount), undefined, {
        applicationId: interaction.application_id,
        interactionToken: interaction.token,
      });
    }
    if (name === "설정" || name === "자판기설정") {
      return handleSettingsPanel(shop.slug, actor.roles, perms);
    }
    if (name === "추가") {
      return handleStockBoardAdd(
        shop.slug,
        String(optionValue(interaction, "상품") ?? ""),
        optionValue(interaction, "분류") === "individual" ? "individual" : "vending",
        actor.roles,
        perms,
      );
    }
    if (name === "삭제") {
      return handleStockBoardRemove(
        shop.slug,
        String(optionValue(interaction, "상품") ?? ""),
        optionValue(interaction, "분류") === "individual" ? "individual" : "vending",
        actor.roles,
        perms,
      );
    }
    if (name === "재고현황") {
      const channelId = optionValue(interaction, "채널");
      return handleStockCommand(shop.slug, channelId ? String(channelId) : null, actor.roles, perms);
    }
    if (name === "임배드생성") {
      return handleEmbedCommand(embedCtx(interaction, shop.slug, actor));
    }
    if (name === "입고알림") {
      const roleId = optionValue(interaction, "역할");
      return handleRestockChannelCommand(
        shop.slug,
        String(optionValue(interaction, "채널") ?? ""),
        roleId ? String(roleId) : null,
        actor.roles,
        perms,
      );
    }
    if (name === "티켓설정") {
      const { handleTicketSettingsCommand } = await import("@/lib/discord/does-tickets");
      return handleTicketSettingsCommand(shop, interaction, actor.id, actor.roles);
    }
    if (name === "티켓패널") {
      const { handleTicketPanelCommand } = await import("@/lib/discord/does-tickets");
      return handleTicketPanelCommand(shop, interaction, actor.id, actor.roles);
    }
    if (name === "임배드") {
      const { handleProductEmbedCommand } = await import("@/lib/discord/product-embeds");
      const channelId = optionValue(interaction, "채널");
      return handleProductEmbedCommand(shop.slug, optionValue(interaction, "종류") === "cape" ? "cape" : "fresh_mfa", {
        channelId: channelId ? String(channelId) : null,
        currentChannelId: interaction.channel_id ?? null,
        roles: actor.roles,
        permissions: perms,
      });
    }
    if (name === "이벤트생성") {
      const { handleGiveawayCreate } = await import("@/lib/discord/giveaway");
      return handleGiveawayCreate(shop, interaction, actor, {
        prize: String(optionValue(interaction, "경품") ?? ""),
        winners: Number(optionValue(interaction, "당첨자수") ?? 1),
        hours: Number(optionValue(interaction, "시간") ?? 1),
        description: String(optionValue(interaction, "내용") ?? ""),
        channelId: String(optionValue(interaction, "채널") ?? interaction.channel_id ?? ""),
      });
    }

    return plainEphemeral("알 수 없는 명령이에요.");
  }

  const componentId = interaction.data?.custom_id ?? "";
  if (
    componentId.startsWith("tk|") &&
    (interaction.type === InteractionType.MESSAGE_COMPONENT || interaction.type === InteractionType.MODAL_SUBMIT)
  ) {
    const shop = resolveShop(interaction);
    if (!shop) return plainEphemeral("이 Discord 서버에 연결된 상점이 없어요.");
    const { handleTicketComponent } = await import("@/lib/discord/does-tickets");
    return handleTicketComponent(shop, interaction);
  }

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const customId = interaction.data?.custom_id ?? "";
    const parsed = parseCid(customId);
    if (!parsed) return forwardToDoesBot(interaction);
    const shop = resolveShopBySlugLoose(parsed.shopSlug);
    if (!shop) return plainEphemeral("상점 없음");
    const settings = getShopSettings(shop.id);
    const modalOkWhenDisabled =
      parsed.action === "pbot_modal" || parsed.action === "ext_modal";
    if (!settings.discordBotEnabled && !modalOkWhenDisabled) {
      return plainEphemeral("봇이 비활성이에요.");
    }
    if (interaction.guild_id && settings.discordGuildId && interaction.guild_id !== settings.discordGuildId) {
      return plainEphemeral("이 서버와 상점 연결이 맞지 않아요.");
    }

    if (parsed.action === "chg_modal") {
      const raw = modalFieldValue(interaction, "amount").replace(/[,\s원]/g, "");
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        return plainEphemeral("금액을 숫자로 입력해 주세요. 예: 10000");
      }
      const depositor = modalFieldValue(interaction, "depositor");
      return handleChargeCommand(shop.slug, actor.id, Math.floor(amount), depositor, {
        applicationId: interaction.application_id,
        interactionToken: interaction.token,
      });
    }

    if (parsed.action === "btn_modal") {
      return handleButtonPanelSubmit(
        shop.slug,
        modalFieldValue(interaction, "vend_title"),
        modalFieldValue(interaction, "vend_subtitle"),
        actor.roles,
        interaction.member?.permissions,
      );
    }

    if (parsed.action === "ext_modal") {
      return handleExtendLicenseSubmit(shop.slug, modalFieldValue(interaction, "license"));
    }

    if (parsed.action === "pbot_modal") {
      return handlePersonalBotTokenSubmit(
        shop.slug,
        modalFieldValue(interaction, "bot_token"),
        modalFieldValue(interaction, "app_id"),
        modalFieldValue(interaction, "public_key"),
        actor.roles,
        interaction.member?.permissions,
      );
    }

    if (parsed.action === "buy_modal") {
      const productId = parsed.payload;
      if (!productId) return plainEphemeral("상품 정보가 없어요.");
      const rawQty = modalFieldValue(interaction, "quantity").replace(/[,\s개]/g, "");
      const quantity = Number(rawQty);
      if (!Number.isFinite(quantity) || quantity < 1) {
        return plainEphemeral("올바른 수량(1 이상의 숫자)을 입력해주세요.");
      }
      return handleBuyConfirm(shop.slug, actor.id, productId, Math.floor(quantity));
    }

    if (parsed.action === "sr_modal") {
      const { handleStockRequestModal } = await import("@/lib/discord/stock-request");
      return handleStockRequestModal(shop.slug, actor.id, interaction);
    }

    if (parsed.action === "coupon_modal") {
      return handleCouponSubmit(shop.slug, actor.id, modalFieldValue(interaction, "code"));
    }

    if (parsed.action === "tk_topic_modal") {
      const { handleTicketSettingsAction } = await import("@/lib/discord/does-tickets");
      return handleTicketSettingsAction(shop, interaction, actor, parsed.action);
    }

    if (parsed.action === "emb_modal") {
      return handleEmbedModal(embedCtx(interaction, shop.slug, actor), parsed.payload, interaction);
    }

    if (parsed.action === "rev_modal") {
      const productId = parsed.payload;
      if (!productId) return plainEphemeral("상품 정보가 없어요.");
      return handleReviewSubmit(
        shop.slug,
        actor.id,
        productId,
        modalFieldValue(interaction, "comment"),
      );
    }

    return plainEphemeral("처리되지 않은 입력이에요.");
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? "";
    const parsed = parseCid(customId);
    if (!parsed) return forwardToDoesBot(interaction);

    const shop = resolveShopBySlugLoose(parsed.shopSlug);
    if (!shop) return plainEphemeral("상점 없음");
    const settings = getShopSettings(shop.id);
    const action = parsed.action;
    const allowDisabledAction =
      action === "pbot_token" ||
      action === "pbot_on" ||
      action === "pbot_off" ||
      action === "ext_lic";
    if (!settings.discordBotEnabled && !allowDisabledAction) {
      return plainEphemeral("봇이 비활성이에요.");
    }

    if (
      interaction.guild_id &&
      settings.discordGuildId &&
      interaction.guild_id !== settings.discordGuildId
    ) {
      return plainEphemeral("이 서버와 상점 연결이 맞지 않아요.");
    }

    const payload = parsed.payload;
    const perms = interaction.member?.permissions;
    const values = interaction.data?.values ?? [];

    if (action === "ext_lic") return handleExtendLicenseModal(shop.slug);
    if (action === "pbot_token") return handlePersonalBotTokenModal(shop.slug);
    if (action === "pbot_on") {
      return handlePersonalBotToggle(shop.slug, true, actor.roles, perms);
    }
    if (action === "pbot_off") {
      return handlePersonalBotToggle(shop.slug, false, actor.roles, perms);
    }

    if (action === "refresh") return handleVendingCommand(shop.slug, actor.id);
    if (action === "stock_vending") return handleVendingCommand(shop.slug, actor.id);
    if (action === "stock_inquiry") {
      return plainEphemeral(
        `${shop.name} 문의는 웹 우측 하단 문의 버튼에서 AI가 먼저 답해요.\nhttps://doesmc.xyz/dashboard?tab=inquiry`,
      );
    }
    if (action === "stock_restock") {
      return plainEphemeral("웹에서 상품을 찜해 두면 재입고 시 알림을 받을 수 있어요.");
    }
    if (action.startsWith("tk_")) {
      const { handleTicketSettingsAction, TICKET_SETTING_ACTIONS } = await import("@/lib/discord/does-tickets");
      if (TICKET_SETTING_ACTIONS.has(action)) return handleTicketSettingsAction(shop, interaction, actor, action);
    }
    if (action === "gw_join") {
      const { handleGiveawayJoin } = await import("@/lib/discord/giveaway");
      return handleGiveawayJoin(shop, payload, actor.id);
    }
    if (action === "stock_view") return handleStockView(shop.slug, false);
    if (action === "stock_refresh") return handleStockView(shop.slug, true);
    if (action === "emb_pick") {
      return handleEmbedPick(embedCtx(interaction, shop.slug, actor), values[0] ?? "");
    }
    if (action === "emb_send") return handleEmbedStep(embedCtx(interaction, shop.slug, actor), "send");
    if (action === "emb_back") return handleEmbedStep(embedCtx(interaction, shop.slug, actor), "back");
    if (action === "emb_reset") return handleEmbedStep(embedCtx(interaction, shop.slug, actor), "reset");
    if (action === "emb_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleEmbedChannel(embedCtx(interaction, shop.slug, actor), channelId);
    }
    if (action === "sr_pick") {
      const { handleStockRequestPick } = await import("@/lib/discord/stock-request");
      return handleStockRequestPick(shop.slug, actor.id, values[0]);
    }
    if (action === "sr_custom") {
      const { handleStockRequestCustomModal } = await import("@/lib/discord/stock-request");
      return handleStockRequestCustomModal(shop.slug);
    }
    if (action === "ref_mine") return handleReferralMine(shop.slug, actor.id);
    if (action === "acct_tab") return handleAccountTab(shop.slug, payload, interaction.data?.values?.[0]);
    if (action === "rbox_open") {
      return handleRandomBoxOpen(shop.slug, actor.id, interaction.channel_id, interaction.message?.id);
    }
    if (action === "menu_notices") return handleNotices(shop.slug);
    if (action === "menu_products") return handleProductsList(shop.slug, "browse");
    if (action === "menu_buy") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      return handleProductsList(shop.slug, "buy");
    }
    if (action === "menu_charge") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      return handleChargeAmountModal(shop.slug, actor.id);
    }
    if (action === "menu_coupon") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      return handleCouponModal(shop.slug);
    }
    if (action === "menu_info") return handleInfo(shop.slug, actor.id);
    if (action === "chg_custom") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      return handleChargeAmountModal(shop.slug, actor.id);
    }
    if (action === "buy_cat") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      const category = values[0];
      if (!category) return plainEphemeral("카테고리를 선택해 주세요.");
      return handleBuyCategory(shop.slug, category);
    }
    if (action === "browse_cat") {
      const category = values[0];
      if (!category) return plainEphemeral("카테고리를 선택해 주세요.");
      return handleBrowseCategory(shop.slug, category);
    }
    if (action === "browse_select") {
      const productId = values[0] ?? payload;
      if (!productId || productId === "_wait" || productId === "_empty") {
        return plainEphemeral("먼저 카테고리를 선택한 뒤 제품을 골라 주세요.");
      }
      return handleBrowseSelect(shop.slug, productId);
    }
    if (action === "buy_select") {
      const productId = values[0] ?? payload;
      if (!productId || productId === "_wait" || productId === "_empty") {
        return plainEphemeral("먼저 카테고리를 선택한 뒤 제품을 골라 주세요.");
      }
      return handleBuySelect(shop.slug, actor.id, productId);
    }
    if (action === "buy_confirm") {
      return handleBuyConfirm(shop.slug, actor.id, payload);
    }
    if (action === "rev_write") {
      if (!getUserByDiscordId(shop.id, actor.id)) return linkGuideMessage(shop.name, shop.slug);
      if (!payload) return plainEphemeral("상품 정보가 없어요.");
      return handleReviewWriteModal(shop.slug, payload);
    }
    if (action === "charge_ui") return handleChargeUi(shop.slug, actor.id);
    if (action === "chg_amt") {
      const amount = Number(payload);
      if (!Number.isFinite(amount)) return plainEphemeral("금액 오류");
      if (!getUserByDiscordId(shop.id, actor.id)?.bankDepositorName?.trim()) {
        return handleChargeAmountModal(shop.slug, actor.id, {
          amountPrefill: Math.floor(amount),
        });
      }
      return handleChargeCommand(shop.slug, actor.id, amount);
    }
    if (action === "chg_ok") {
      return handleChargeApprove(shop.slug, payload, actor.roles, perms, `<@${actor.id}>`);
    }
    if (action === "chg_no") {
      return handleChargeReject(shop.slug, payload, actor.roles, perms, `<@${actor.id}>`);
    }
    if (action === "set_plog") return handleSetLogPrompt(shop.slug, "plog");
    if (action === "set_clog") return handleSetLogPrompt(shop.slug, "clog");
    if (action === "set_rlog") return handleSetLogPrompt(shop.slug, "rlog");
    if (action === "set_slog") return handleSetLogPrompt(shop.slug, "slog");
    if (action === "set_bbox") return handleSetLogPrompt(shop.slug, "bbox");
    if (action === "set_plog_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleSetLogChannel(shop.slug, "plog", channelId, actor.roles, perms);
    }
    if (action === "set_clog_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleSetLogChannel(shop.slug, "clog", channelId, actor.roles, perms);
    }
    if (action === "set_rlog_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleSetLogChannel(shop.slug, "rlog", channelId, actor.roles, perms);
    }
    if (action === "set_slog_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleSetLogChannel(shop.slug, "slog", channelId, actor.roles, perms);
    }
    if (action === "set_bbox_ch") {
      const channelId = values[0];
      if (!channelId) return plainEphemeral("채널을 선택해 주세요.");
      return handleSetLogChannel(shop.slug, "bbox", channelId, actor.roles, perms);
    }
    if (action === "bind_guild") {
      return handleBindGuild(shop.slug, interaction.guild_id, actor.roles, perms);
    }

    return plainEphemeral("처리되지 않은 액션이에요.");
  }

  return plainEphemeral("지원하지 않는 인터랙션이에요.");
}
