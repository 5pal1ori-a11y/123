import {
  InteractionResponseType,
  InteractionType,
  actorFromInteraction,
  modalFieldValue,
  optionValue,
  parseCid,
  plainEphemeral,
  type DiscordInteraction,
  v2Ephemeral,
  v2Update,
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
  // 직접 그린 봇 이모지 ID 를 준비 (처음 한 번만 KV 를 읽고, 이후에는 메모리)
  await (await import("@/lib/discord/app-emojis")).ensureAppEmojis();

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
    // 숫자 맞추기는 이 봇이 직접 처리한다 (시작 · 정답 발표 이미지)
    if (name === "숫자맞추기" || name === "맞추기") {
      const gameShop = resolveShop(interaction);
      if (!gameShop) return plainEphemeral("이 Discord 서버에 연결된 상점이 없어요.");
      const ng = await import("@/lib/discord/number-guess");
      return name === "숫자맞추기"
        ? ng.handleNumberGuessStart(gameShop, interaction, actor)
        : ng.handleNumberGuess(gameShop, interaction, actor);
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

    if (await import("@/lib/discord/blacklist").then((m) => m.isDiscordBlacklisted(shop.id, actor.id)).catch(() => false)) {
      return plainEphemeral("블랙리스트에 등록된 계정이에요. 이용할 수 없어요.");
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
    if (name === "환영설정") {
      const o = (n: string) => {
        const v = interaction.data?.options?.find((x) => x.name === n)?.value;
        return typeof v === "string" ? v : undefined;
      };
      const ch = o("채널");
      if (!ch) return plainEphemeral("채널을 골라 주세요.");
      const { handleWelcomeSetup } = await import("@/lib/discord/welcome");
      return handleWelcomeSetup(shop.slug, actor.roles, perms, {
        channelId: ch,
        verifyChannelId: o("인증채널"),
        rulesChannelId: o("규칙채널"),
        shopChannelId: o("구매채널"),
        ticketChannelId: o("문의채널"),
        siteUrl: o("웹사이트"),
        userId: actor.id,
        guildId: interaction.guild_id,
      });
    }
    if (name === "내정보") {
      const r = await import("@/lib/discord/rank-image").then((m) => m.profileImageUrl(shop.id, actor.id)).catch(() => null);
      if (!r) return plainEphemeral("지금은 정보를 불러오지 못했어요. 잠시 뒤 다시 해 주세요.");
      const { container, mediaGallery, textDisplay, actionRow, button, ButtonStyle } = await import("@/lib/discord/components");
      const { shopUrl } = await import("@/lib/domain");
      return v2Ephemeral([
        container([
          mediaGallery([r.url]),
          textDisplay(r.linked ? "-# 나만 보이는 카드예요" : "-# 사이트 계정과 디스코드가 연동되지 않아 구매 정보가 비어 있어요 · 사이트 › 내 정보에서 Discord 연동을 해 주세요"),
          actionRow(button({ label: "사이트에서 보기", url: shopUrl(shop.slug, "/dashboard"), style: ButtonStyle.LINK })),
        ]),
      ]);
    }
    if (name === "문의대기") {
      const { handleTicketQueueCommand } = await import("@/lib/discord/ticket-queue");
      return handleTicketQueueCommand(shop.slug, actor.roles, perms, interaction.channel_id, interaction.guild_id);
    }
    if (name === "템플릿") {
      const o = (n: string) => {
        const v = interaction.data?.options?.find((x) => x.name === n)?.value;
        return typeof v === "string" ? v : undefined;
      };
      const { handleTemplateCommand } = await import("@/lib/discord/template-panels");
      return handleTemplateCommand(shop.slug, actor.roles, perms, { kind: o("종류"), link1: o("링크1"), link2: o("링크2"), channelId: interaction.channel_id });
    }
    if (name === "프록시등록" || name === "도스마켓") {
      const ch = interaction.data?.options?.find((o) => o.name === "승인채널")?.value;
      const { handleProxyCommand } = await import("@/lib/discord/proxy-sale");
      return handleProxyCommand(shop.slug, actor.roles, perms, interaction.channel_id, typeof ch === "string" ? ch : null);
    }
    if (name === "랭킹관리") {
      const { handleRankingAdmin } = await import("@/lib/discord/ranking-admin");
      const user = optionValue(interaction, "유저");
      return handleRankingAdmin(shop.slug, actor.roles, perms, String(optionValue(interaction, "동작") ?? "list"), user ? String(user) : null);
    }
    if (name === "코인대행") {
      const opt = (n: string) => {
        const v = interaction.data?.options?.find((o) => o.name === n)?.value;
        return typeof v === "string" ? v : null;
      };
      const { handleCoinCommand } = await import("@/lib/discord/coin-trade");
      return handleCoinCommand(shop.slug, actor.roles, perms, interaction.channel_id, opt("승인채널"), {
        log: opt("로그채널"),
        restock: opt("입고채널"),
        review: opt("후기채널"),
      });
    }
    if (name === "전광판") {
      const { handleBoardCommand } = await import("@/lib/discord/board");
      return handleBoardCommand(shop.slug, actor.roles, perms, interaction.channel_id);
    }
    if (name === "닉네임") {
      const v = interaction.data?.options?.find((o) => o.name === "이름")?.value;
      const { handleNameCommand } = await import("@/lib/discord/board");
      return handleNameCommand(typeof v === "string" ? v : "");
    }
    if (name === "안전거래") {
      const { handleSafeCommand } = await import("@/lib/discord/safe-trade");
      return handleSafeCommand(shop.slug);
    }
    if (name === "도스플랜") {
      const pub = interaction.data?.options?.find((o) => o.name === "공개")?.value === true;
      const { handlePlanCommand } = await import("@/lib/discord/plan");
      return handlePlanCommand(shop.slug, actor.id, actor.roles, perms, interaction.channel_id, pub);
    }
    if (name === "렌탈") {
      const v = interaction.data?.options?.find((o) => o.name === "승인채널")?.value;
      const { handleRentalCommand } = await import("@/lib/discord/rental");
      return handleRentalCommand(shop.slug, actor.roles, perms, interaction.channel_id, typeof v === "string" ? v : null);
    }
    if (name === "시즌패스") {
      const u = interaction.member?.user ?? interaction.user;
      const { handleSeasonPassCommand } = await import("@/lib/discord/season-pass");
      return handleSeasonPassCommand(shop.slug, { id: actor.id, name: u?.global_name || actor.username, avatar: u?.avatar ?? null });
    }
    if (name === "케어") {
      const v = interaction.data?.options?.find((o) => o.name === "승인채널")?.value;
      const { handleCareCommand } = await import("@/lib/discord/care");
      return handleCareCommand(shop.slug, actor.roles, perms, interaction.channel_id, typeof v === "string" ? v : null);
    }
    if (name === "매입") {
      const v = interaction.data?.options?.find((o) => o.name === "승인채널")?.value;
      const { handleBuybackCommand } = await import("@/lib/discord/buyback");
      return handleBuybackCommand(shop.slug, actor.roles, perms, interaction.channel_id, typeof v === "string" ? v : null);
    }
    if (name === "구해드림") {
      const v = interaction.data?.options?.find((o) => o.name === "승인채널")?.value;
      const { handleGugoCommand } = await import("@/lib/discord/gugo");
      return handleGugoCommand(shop.slug, actor.roles, perms, interaction.channel_id, typeof v === "string" ? v : null);
    }
    if (name === "코인입고") {
      const { handleCoinRestockCommand } = await import("@/lib/discord/coin-trade");
      return handleCoinRestockCommand(shop.slug, actor.roles, perms, optionValue(interaction, "코인"), optionValue(interaction, "수량"), optionValue(interaction, "현재재고"));
    }
    if (name === "재고요청") {
      const ch = interaction.data?.options?.find((o) => o.name === "받을채널")?.value;
      const { handleStockRequestCommand } = await import("@/lib/discord/stock-request");
      return handleStockRequestCommand(shop.slug, actor.roles, perms, typeof ch === "string" ? ch : null);
    }
    if (name === "초대이벤트" || name === "초대랭킹" || name === "초대로그") {
      const inv = await import("@/lib/discord/invites");
      if (name === "초대이벤트") return inv.handleInviteEventCommand(shop, actor, perms, interaction.channel_id);
      if (name === "초대랭킹") return inv.handleInviteRankCommand(shop, actor, perms, interaction.channel_id, interaction.guild_id);
      const ch = interaction.data?.options?.find((o) => o.name === "채널")?.value;
      return inv.handleInviteLogCommand(shop, actor, perms, typeof ch === "string" ? ch : null);
    }
    if (name === "뽑기로그") {
      const ch = interaction.data?.options?.find((o) => o.name === "채널")?.value;
      const { handleGachaLogCommand } = await import("@/lib/discord/gacha");
      return handleGachaLogCommand(shop, actor, perms, typeof ch === "string" ? ch : null);
    }
    if (name === "랜덤뽑기") {
      const { handleGachaCommand } = await import("@/lib/discord/gacha");
      return handleGachaCommand(shop, actor, perms, interaction.channel_id);
    }
    if (name === "다이아채굴" || name === "랜덤박스") {
      return handleRandomBoxCommand(shop.slug, actor.roles, perms, interaction.channel_id);
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
    if (name === "태그이벤트") {
      const { handleGiveawayCreate } = await import("@/lib/discord/giveaway");
      return handleGiveawayCreate(shop, interaction, actor, {
        prize: String(optionValue(interaction, "경품") ?? ""),
        winners: Number(optionValue(interaction, "당첨자수") ?? 1),
        hours: Number(optionValue(interaction, "시간") ?? 1),
        description: String(optionValue(interaction, "내용") ?? ""),
        channelId: String(optionValue(interaction, "채널") ?? interaction.channel_id ?? ""),
        requireTag: true,
      });
    }
    if (name === "태그현황") {
      const { isDiscordAdmin } = await import("@/lib/discord/handlers");
      if (!isDiscordAdmin(getShopSettings(shop.id), actor.roles, perms)) return plainEphemeral("관리자만 쓸 수 있어요.");
      const { scanServerTag, getServerTagDb } = await import("@/lib/discord/server-tag");
      const before = await getServerTagDb(shop.id);
      const r = await scanServerTag(shop.id, true).catch(() => null);
      const db = await getServerTagDb(shop.id);
      return plainEphemeral(
        [
          `## 서버 태그 현황`,
          `태그 착용자 **${db.total.toLocaleString("ko-KR")}명**${db.tag ? ` · 태그 **${db.tag}**` : ""}`,
          `-# 전체 ${db.scanned.toLocaleString("ko-KR")}명 검사 · 1시간마다 자동 집계${r && "skipped" in r && r.skipped ? "" : ` · 방금 ${(db.total - before.total >= 0 ? "+" : "")}${db.total - before.total}명`}`,
          db.total === 0 ? "-# 0명이면 디스코드 개발자 포털에서 봇의 **Server Members Intent** 가 켜져 있는지 확인해 주세요." : "",
        ].filter(Boolean).join("\n"),
      );
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

    if (parsed.action === "px_modal" || parsed.action === "px_okm" || parsed.action === "px_nom") {
      const px = await import("@/lib/discord/proxy-sale");
      const modalPerms = interaction.member?.permissions;
      if (parsed.action === "px_modal") return px.handleProxyRegisterSubmit(shop.slug, { id: actor.id, name: actor.username }, interaction);
      if (parsed.action === "px_okm") return px.handleProxyApproveSubmit(shop.slug, parsed.payload, actor.id, actor.roles, modalPerms, interaction);
      return px.handleProxyRejectSubmit(shop.slug, parsed.payload, actor.id, actor.roles, modalPerms, interaction);
    }

    if (parsed.action === "sx_modal") {
      const { handleSafeSubmit } = await import("@/lib/discord/safe-trade");
      return handleSafeSubmit(shop.slug, { id: actor.id, name: actor.username }, interaction);
    }
    if (parsed.action === "dm_repm") {
      const { handleDmReportSubmit } = await import("@/lib/discord/dosmarket-panel");
      return handleDmReportSubmit(shop.slug, actor.id, parsed.payload, interaction);
    }
    if (parsed.action === "pl_keym") {
      const { handlePlanKeySubmit } = await import("@/lib/discord/plan");
      return handlePlanKeySubmit(shop.slug, actor.id, interaction);
    }
    if (parsed.action === "rt_addm" || parsed.action === "rt_donem") {
      const rt = await import("@/lib/discord/rental");
      if (parsed.action === "rt_addm") return rt.handleRentalAddSubmit(shop.slug, actor.roles, interaction.member?.permissions, interaction);
      return rt.handleRentalDoneSubmit(shop.slug, parsed.payload, actor.roles, interaction.member?.permissions, interaction);
    }

    if (parsed.action === "cr_okm" || parsed.action === "cr_nom") {
      const { handleClaimSubmit } = await import("@/lib/discord/care");
      return handleClaimSubmit(shop.slug, parsed.payload, parsed.action === "cr_okm", actor.roles, interaction.member?.permissions, interaction);
    }

    if (parsed.action === "bb_offm" || parsed.action === "bb_rejm") {
      const bb = await import("@/lib/discord/buyback");
      const modalPerms = interaction.member?.permissions;
      if (parsed.action === "bb_offm") return bb.handleBuybackOfferSubmit(shop.slug, parsed.payload, actor.roles, modalPerms, interaction);
      return bb.handleBuybackRejectSubmit(shop.slug, parsed.payload, actor.roles, modalPerms, interaction);
    }

    if (parsed.action === "gg_modal" || parsed.action === "gg_offm" || parsed.action === "gg_rejm") {
      const gg = await import("@/lib/discord/gugo");
      const modalPerms = interaction.member?.permissions;
      if (parsed.action === "gg_modal") return gg.handleGugoSubmit(shop.slug, actor.id, interaction);
      if (parsed.action === "gg_offm") return gg.handleGugoOfferSubmit(shop.slug, parsed.payload, actor.roles, modalPerms, interaction);
      return gg.handleGugoRejectSubmit(shop.slug, parsed.payload, actor.roles, modalPerms, interaction);
    }

    if (parsed.action === "cn_revm") {
      const { handleCoinReviewSubmit } = await import("@/lib/discord/coin-trade");
      return handleCoinReviewSubmit(shop.slug, actor.id, parsed.payload, interaction);
    }

    if (parsed.action === "cn_modal" || parsed.action === "cn_sendm" || parsed.action === "cn_rejm") {
      const cn = await import("@/lib/discord/coin-trade");
      const modalPerms = interaction.member?.permissions;
      if (parsed.action === "cn_modal") return cn.handleCoinBuySubmit(shop.slug, actor.id, parsed.payload, interaction);
      if (parsed.action === "cn_sendm") return cn.handleCoinSendSubmit(shop.slug, parsed.payload, actor.id, actor.roles, modalPerms, interaction);
      return cn.handleCoinRejectSubmit(shop.slug, parsed.payload, actor.id, actor.roles, modalPerms, interaction);
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
    if (await import("@/lib/discord/blacklist").then((m) => m.isDiscordBlacklisted(shop.id, actor.id)).catch(() => false)) {
      return plainEphemeral("블랙리스트에 등록된 계정이에요. 이용할 수 없어요.");
    }
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
    if (action === "stock_cat" || action === "stock_pg") {
      // 카테고리 버튼(고정판) → 나만 보이는 창 / ◀ ▶ (그 창) → 그 자리에서 넘김
      const { buildStockImagePanel } = await import("@/lib/discord/stock-board");
      // 고정 재고판(나만 보기 아님)에서 누르면 재고판 자체가 넘어간다
      const onBoard = Boolean(interaction.message?.id) && interaction.message?.id === getShopSettings(shop.id).discordStockMessageId;
      const panel = await buildStockImagePanel(shop.id, onBoard ? "board" : "view", Number(payload) || 0);
      if (panel) return action === "stock_pg" ? v2Update(panel.components) : v2Ephemeral(panel.components);
      return handleStockView(shop.slug, action === "stock_pg");
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
    if (action === "vf_click") {
      const { handleVerifyButton } = await import("@/lib/verify-bot/router");
      return handleVerifyButton(interaction);
    }
    if (action === "inv_create" || action === "inv_mine") {
      const inv = await import("@/lib/discord/invites");
      return action === "inv_create" ? inv.handleInviteCreate(shop, interaction, actor.id) : inv.handleInviteMine(interaction, actor.id);
    }
    if (action === "gacha_draw") {
      const { handleGachaDraw } = await import("@/lib/discord/gacha");
      return handleGachaDraw(shop, actor.id);
    }
    if (action === "tq_mine") {
      const { handleTicketQueueMine } = await import("@/lib/discord/ticket-queue");
      return handleTicketQueueMine(interaction.guild_id, actor.id);
    }
    if (action === "px_reg" || action === "px_mine" || action === "px_ok" || action === "px_no") {
      const px = await import("@/lib/discord/proxy-sale");
      if (action === "px_reg") return px.handleProxyRegisterButton(shop.slug);
      if (action === "px_ok") return px.handleProxyApproveButton(shop.slug, payload, actor.roles, perms);
      if (action === "px_no") return px.handleProxyRejectButton(shop.slug, payload, actor.roles, perms);
      const u = interaction.member?.user ?? interaction.user;
      const avatar = u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
      return px.handleProxyMine(shop.slug, { id: actor.id, name: u?.global_name || actor.username, avatar });
    }
    if (action === "dm_paid" || action === "dm_release" || action === "dm_refund" || action === "dm_cred") {
      const { handleDosMarketButton } = await import("@/lib/dosmarket");
      return handleDosMarketButton(shop.slug, action, payload, actor.roles, perms);
    }
    if (action.startsWith("sx_")) {
      const sx = await import("@/lib/discord/safe-trade");
      if (action === "sx_new") return sx.handleSafeCommand(shop.slug);
      return sx.handleSafeButton(shop.slug, action, payload, { id: actor.id, roles: actor.roles }, perms, interaction.channel_id);
    }
    if (action === "dm_list" || action === "dm_pick" || action === "dm_buys" || action === "dm_rep") {
      const dm = await import("@/lib/discord/dosmarket-panel");
      if (action === "dm_list") return dm.handleDmList(shop.slug);
      if (action === "dm_pick") return dm.handleDmPick(shop.slug, values[0] ?? payload);
      if (action === "dm_buys") return dm.handleDmBuys(shop.slug, actor.id);
      return dm.handleDmReportButton(shop.slug, payload);
    }
    if (action.startsWith("pl_")) {
      const pl = await import("@/lib/discord/plan");
      if (action === "pl_buy") return pl.handlePlanBuyButton(shop.slug, actor.id, payload);
      if (action === "pl_ok") return pl.handlePlanConfirm(shop.slug, actor.id, payload);
      if (action === "pl_key") return pl.handlePlanKeyButton(shop.slug);
    }
    if (action.startsWith("rt_")) {
      const rt = await import("@/lib/discord/rental");
      if (action === "rt_pick") return rt.handleRentalPick(shop.slug, actor.id, values[0] ?? "");
      if (action === "rt_day") return rt.handleRentalDay(shop.slug, actor.id, payload);
      if (action === "rt_go") return rt.handleRentalGo(shop.slug, actor.id, payload);
      if (action === "rt_x") return v2Update([{ type: 17, components: [{ type: 10, content: "취소했어요." }] }]);
      if (action === "rt_mine") return rt.handleRentalMine(shop.slug, actor.id);
      if (action === "rt_ext") return rt.handleRentalExtend(shop.slug, actor.id, payload);
      if (action === "rt_ret") return rt.handleRentalReturn(shop.slug, actor.id, payload);
      if (action === "rt_add") return rt.handleRentalAddButton(shop.slug, actor.roles, perms);
      if (action === "rt_done") return rt.handleRentalDoneButton(shop.slug, payload, actor.roles, perms);
      if (action === "rt_cred" || action === "rt_hide" || action === "rt_del") return rt.handleRentalAdminButton(shop.slug, action, payload, actor.roles, perms);
    }
    if (action === "sp_pg" || action === "sp_claim" || action === "sp_buy") {
      const u = interaction.member?.user ?? interaction.user;
      const { handleSeasonPassButton } = await import("@/lib/discord/season-pass");
      return handleSeasonPassButton(shop.slug, action, payload, { id: actor.id, name: u?.global_name || actor.username, avatar: u?.avatar ?? null });
    }
    if (action === "cr_ok" || action === "cr_no") {
      const { handleClaimButton } = await import("@/lib/discord/care");
      return handleClaimButton(shop.slug, payload, action === "cr_ok", actor.roles, perms);
    }
    if (action === "bb_mine" || action === "bb_off" || action === "bb_view" || action === "bb_done" || action === "bb_rej" || action === "bb_yes" || action === "bb_no") {
      const bb = await import("@/lib/discord/buyback");
      if (action === "bb_mine") return bb.handleBuybackMine(shop.slug, actor.id);
      if (action === "bb_off") return bb.handleBuybackOfferButton(shop.slug, payload, actor.roles, perms);
      if (action === "bb_view") return bb.handleBuybackView(shop.slug, payload, actor.roles, perms);
      if (action === "bb_done") return bb.handleBuybackDone(shop.slug, payload, actor.roles, perms);
      if (action === "bb_rej") return bb.handleBuybackRejectButton(shop.slug, payload, actor.roles, perms);
      return bb.handleBuybackRespond(shop.slug, actor.id, payload, action === "bb_yes");
    }
    if (action === "gg_new" || action === "gg_mine" || action === "gg_cancel" || action === "gg_pay" || action === "gg_acc" || action === "gg_off" || action === "gg_rej") {
      const gg = await import("@/lib/discord/gugo");
      if (action === "gg_new") return gg.handleGugoNewButton(shop.slug);
      if (action === "gg_mine") return gg.handleGugoMine(shop.slug, actor.id);
      if (action === "gg_cancel") return gg.handleGugoCancel(shop.slug, actor.id, payload);
      if (action === "gg_pay") return gg.handleGugoPay(shop.slug, actor.id, payload);
      if (action === "gg_acc") return gg.handleGugoAccept(shop.slug, payload, actor.roles, perms);
      if (action === "gg_off") return gg.handleGugoOfferButton(shop.slug, payload, actor.roles, perms);
      return gg.handleGugoRejectButton(shop.slug, payload, actor.roles, perms);
    }
    if (action === "cn_buy" || action === "cn_ok" || action === "cn_cancel" || action === "cn_mine" || action === "cn_send" || action === "cn_rej" || action === "cn_chk" || action === "cn_choose" || action === "cn_vip" || action === "cn_pick" || action === "cn_rev") {
      const cn = await import("@/lib/discord/coin-trade");
      if (action === "cn_buy") return cn.handleCoinBuyButton(shop.slug, payload);
      if (action === "cn_pick") return cn.handleCoinBuyButton(shop.slug, values[0] ?? "");
      if (action === "cn_rev") return cn.handleCoinReviewButton(shop.slug, actor.id, payload);
      if (action === "cn_ok") return cn.handleCoinConfirm(shop.slug, actor.id, payload);
      if (action === "cn_cancel") return cn.handleCoinCancel(shop.slug, actor.id, payload);
      if (action === "cn_send") return cn.handleCoinSendButton(shop.slug, payload, actor.roles, perms);
      if (action === "cn_rej") return cn.handleCoinRejectButton(shop.slug, payload, actor.roles, perms);
      if (action === "cn_chk") return cn.handleCoinCheckButton(shop.slug, payload, actor.roles, perms);
      if (action === "cn_choose") return cn.handleCoinChooseButton(shop.slug);
      if (action === "cn_vip") return cn.handleCoinVipButton(shop.slug, actor.id);
      return cn.handleCoinMine(shop.slug, actor.id);
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
      const u = interaction.member?.user ?? interaction.user;
      const avatar = u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
      return handleRandomBoxOpen(shop.slug, actor.id, interaction.channel_id, interaction.message?.id, {
        name: u?.global_name || actor.username,
        avatar,
      });
    }
    if (action === "mine_paid") {
      const u = interaction.member?.user ?? interaction.user;
      const avatar = u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null;
      const { handlePaidMine } = await import("@/lib/discord/handlers");
      // 결과 화면의 '한 번 더' 버튼은 나만 보는 메시지라 패널 메시지 ID 를 넘기지 않는다
      const fromPanel = !(interaction.message?.flags && (interaction.message.flags & 64));
      return handlePaidMine(shop.slug, actor.id, interaction.channel_id, fromPanel ? interaction.message?.id : undefined, {
        name: u?.global_name || actor.username,
        avatar,
      });
    }
    if (action === "pick_view" || action === "pick_buy") {
      const { handlePickaxeView, handlePickaxeBuy } = await import("@/lib/discord/handlers");
      return action === "pick_view" ? handlePickaxeView(shop.slug, actor.id) : handlePickaxeBuy(shop.slug, actor.id);
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
