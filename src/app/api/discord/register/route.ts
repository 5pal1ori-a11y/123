import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isShop,
  isShopOwnerAdmin,
  requireShop,
  unauthorized,
  forbidden,
  badRequest,
  assertSameOrigin,
} from "@/lib/api";
import { filterTextChannels } from "@/lib/discord/logs";
import { listGuildTextChannels, registerGuildCommands, VENDIX_DISCORD_COMMANDS } from "@/lib/discord/rest";
import { planFeatureError, shopHasFeature } from "@/lib/plans";
import {
  getShopSettings,
  initStore,
  listShops,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";

function isMasked(value: string | null | undefined) {
  return Boolean(value && value.includes("•"));
}

const saveSchema = z.object({
  action: z.literal("save"),
  discordBotEnabled: z.boolean().optional(),
  discordGuildId: z.string().nullable().optional(),
  discordPurchaseLogChannelId: z.string().nullable().optional(),
  discordChargeLogChannelId: z.string().nullable().optional(),
  discordAdminLogChannelId: z.string().nullable().optional(),
  discordReviewLogChannelId: z.string().nullable().optional(),
  discordRestockLogChannelId: z.string().nullable().optional(),
  discordRandomBoxLogChannelId: z.string().nullable().optional(),
  discordStockChannelId: z.string().nullable().optional(),
  spendRoles: z
    .array(
      z.object({
        minAmount: z.number().int().nonnegative(),
        roleId: z.string().min(1).max(32),
      }),
    )
    .max(20)
    .optional(),
  discordAdminRoleId: z.string().nullable().optional(),
  discordBotToken: z.string().nullable().optional(),
  discordApplicationId: z.string().nullable().optional(),
  discordPublicKey: z.string().nullable().optional(),
  discordEmbedTitle: z.string().optional(),
  discordEmbedDescription: z.string().optional(),
  discordEmbedColor: z.string().or(z.number()).optional(),
  discordShowNotices: z.boolean().optional(),
  discordShowProducts: z.boolean().optional(),
  discordShowBuy: z.boolean().optional(),
  discordShowCharge: z.boolean().optional(),
  discordShowInfo: z.boolean().optional(),
  discordBtnStyleNotices: z.number().int().min(1).max(4).optional(),
  discordBtnStyleProducts: z.number().int().min(1).max(4).optional(),
  discordBtnStyleBuy: z.number().int().min(1).max(4).optional(),
  discordBtnStyleCharge: z.number().int().min(1).max(4).optional(),
  discordBtnStyleInfo: z.number().int().min(1).max(4).optional(),
  discordBtnLabelNotices: z.string().optional(),
  discordBtnLabelProducts: z.string().optional(),
  discordBtnLabelBuy: z.string().optional(),
  discordBtnLabelCharge: z.string().optional(),
  discordBtnLabelInfo: z.string().optional(),
  discordPurchaseLogTitle: z.string().optional(),
  discordPurchaseLogTemplate: z.string().optional(),
  discordReviewLogTitle: z.string().optional(),
  discordReviewLogTemplate: z.string().optional(),
});

const registerSchema = z.object({
  action: z.literal("register-commands"),
});

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopOwnerAdmin(request, shop)) return forbidden("소유자만 Discord 설정을 볼 수 있어요.");

  const featureErr = planFeatureError(shop.plan, "discord_bot");
  if (featureErr) return forbidden(featureErr);

  const settings = getShopSettings(shop.id);
  return NextResponse.json({
    discordBotEnabled: settings.discordBotEnabled,
    discordGuildId: settings.discordGuildId,
    discordOwnerId: settings.discordOwnerId,
    discordOwnerUsername: settings.discordOwnerUsername,
    discordOwnerAvatar: settings.discordOwnerAvatar,
    discordPurchaseLogChannelId: settings.discordPurchaseLogChannelId,
    discordChargeLogChannelId: settings.discordChargeLogChannelId,
    discordAdminLogChannelId: settings.discordAdminLogChannelId,
    discordReviewLogChannelId: settings.discordReviewLogChannelId,
    discordRestockLogChannelId: settings.discordRestockLogChannelId,
    discordRandomBoxLogChannelId: settings.discordRandomBoxLogChannelId,
    discordStockChannelId: settings.discordStockChannelId,
    spendRoles: settings.spendRoles ?? [],
    discordAdminRoleId: settings.discordAdminRoleId,
    discordApplicationId: settings.discordApplicationId,
    hasBotToken: Boolean(settings.discordBotToken),
    hasPublicKey: Boolean(settings.discordPublicKey),
    discordEmbedTitle: settings.discordEmbedTitle,
    discordEmbedDescription: settings.discordEmbedDescription,
    discordEmbedColor: settings.discordEmbedColor,
    discordShowNotices: settings.discordShowNotices,
    discordShowProducts: settings.discordShowProducts,
    discordShowBuy: settings.discordShowBuy,
    discordShowCharge: settings.discordShowCharge,
    discordShowInfo: settings.discordShowInfo,
    discordBtnStyleNotices: settings.discordBtnStyleNotices,
    discordBtnStyleProducts: settings.discordBtnStyleProducts,
    discordBtnStyleBuy: settings.discordBtnStyleBuy,
    discordBtnStyleCharge: settings.discordBtnStyleCharge,
    discordBtnStyleInfo: settings.discordBtnStyleInfo,
    discordBtnLabelNotices: settings.discordBtnLabelNotices,
    discordBtnLabelProducts: settings.discordBtnLabelProducts,
    discordBtnLabelBuy: settings.discordBtnLabelBuy,
    discordBtnLabelCharge: settings.discordBtnLabelCharge,
    discordBtnLabelInfo: settings.discordBtnLabelInfo,
    discordPurchaseLogTitle: settings.discordPurchaseLogTitle,
    discordPurchaseLogTemplate: settings.discordPurchaseLogTemplate,
    discordReviewLogTitle: settings.discordReviewLogTitle,
    discordReviewLogTemplate: settings.discordReviewLogTemplate,
    interactionsUrl: "https://vendix.team/api/discord/interactions",
    linkedRoleVerificationUrl: "https://vendix.team/linked-role",
    termsUrl: "https://vendix.team/terms",
    privacyUrl: "https://vendix.team/privacy",
    linkedRoleRedirectUri: "https://vendix.team/api/discord/linked-role/callback",
    plan: shop.plan,
  });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopOwnerAdmin(request, shop)) return unauthorized();

  const featureErr = planFeatureError(shop.plan, "discord_bot");
  if (featureErr) return forbidden(featureErr);

  const json = await request.json().catch(() => null);
  const save = saveSchema.safeParse(json);
  if (save.success) {
    const body = save.data;
    const settings = getShopSettings(shop.id);
    const patch: Parameters<typeof updateShopSettings>[1] = {};
    if (body.discordBotEnabled !== undefined) patch.discordBotEnabled = body.discordBotEnabled;
    if (body.discordGuildId !== undefined) {
      patch.discordGuildId = body.discordGuildId?.trim() || null;
    }
    if (body.discordPurchaseLogChannelId !== undefined) {
      patch.discordPurchaseLogChannelId = body.discordPurchaseLogChannelId?.trim() || null;
    }
    if (body.discordChargeLogChannelId !== undefined) {
      patch.discordChargeLogChannelId = body.discordChargeLogChannelId?.trim() || null;
    }
    if (body.discordAdminLogChannelId !== undefined) {
      patch.discordAdminLogChannelId = body.discordAdminLogChannelId?.trim() || null;
    }
    if (body.discordReviewLogChannelId !== undefined) {
      patch.discordReviewLogChannelId = body.discordReviewLogChannelId?.trim() || null;
    }
    if (body.discordRestockLogChannelId !== undefined) {
      patch.discordRestockLogChannelId = body.discordRestockLogChannelId?.trim() || null;
    }
    if (body.discordRandomBoxLogChannelId !== undefined) {
      patch.discordRandomBoxLogChannelId = body.discordRandomBoxLogChannelId?.trim() || null;
    }
    if (body.discordStockChannelId !== undefined) {
      const next = body.discordStockChannelId?.trim() || null;
      patch.discordStockChannelId = next;
      if (next !== settings.discordStockChannelId) {
        patch.discordStockMessageId = null;
      }
    }
    if (body.spendRoles !== undefined) {
      patch.spendRoles = body.spendRoles
        .filter((r) => r.roleId.trim() && r.minAmount >= 0)
        .slice(0, 20)
        .map((r) => ({ minAmount: r.minAmount, roleId: r.roleId.trim() }));
    }
    if (body.discordAdminRoleId !== undefined) {
      patch.discordAdminRoleId = body.discordAdminRoleId?.trim() || null;
    }

    const canPersonalBot = shopHasFeature(shop.plan, "personal_bot");
    if (canPersonalBot) {
      if (body.discordApplicationId !== undefined) {
        patch.discordApplicationId = body.discordApplicationId?.trim() || null;
      }
      // Empty / null means "keep existing" — never wipe secrets on blank save
      if (body.discordBotToken !== undefined && !isMasked(body.discordBotToken)) {
        const token = body.discordBotToken?.trim();
        if (token) patch.discordBotToken = token;
      }
      if (body.discordPublicKey !== undefined && !isMasked(body.discordPublicKey)) {
        const key = body.discordPublicKey?.trim();
        if (key) patch.discordPublicKey = key;
      }
    } else if (
      (body.discordBotToken && !isMasked(body.discordBotToken) && body.discordBotToken.trim()) ||
      (body.discordPublicKey && !isMasked(body.discordPublicKey) && body.discordPublicKey.trim()) ||
      (body.discordApplicationId && body.discordApplicationId.trim())
    ) {
      return forbidden(
        planFeatureError(shop.plan, "personal_bot") ??
          "개인봇(자체 토큰)은 PRO MAX에서만 사용할 수 있어요.",
      );
    }

    if (body.discordEmbedTitle !== undefined) {
      patch.discordEmbedTitle = body.discordEmbedTitle.trim() || "자판기";
    }
    if (body.discordEmbedDescription !== undefined) {
      patch.discordEmbedDescription = body.discordEmbedDescription.trim();
    }
    if (body.discordEmbedColor !== undefined) {
      const raw = String(body.discordEmbedColor).replace("#", "").trim();
      const n = Number.parseInt(raw, 16);
      patch.discordEmbedColor = Number.isFinite(n) ? n : 0x5865f2;
    }
    if (body.discordShowNotices !== undefined) patch.discordShowNotices = body.discordShowNotices;
    if (body.discordShowProducts !== undefined) patch.discordShowProducts = body.discordShowProducts;
    if (body.discordShowBuy !== undefined) patch.discordShowBuy = body.discordShowBuy;
    if (body.discordShowCharge !== undefined) patch.discordShowCharge = body.discordShowCharge;
    if (body.discordShowInfo !== undefined) patch.discordShowInfo = body.discordShowInfo;
    if (body.discordBtnStyleNotices !== undefined) patch.discordBtnStyleNotices = body.discordBtnStyleNotices;
    if (body.discordBtnStyleProducts !== undefined) patch.discordBtnStyleProducts = body.discordBtnStyleProducts;
    if (body.discordBtnStyleBuy !== undefined) patch.discordBtnStyleBuy = body.discordBtnStyleBuy;
    if (body.discordBtnStyleCharge !== undefined) patch.discordBtnStyleCharge = body.discordBtnStyleCharge;
    if (body.discordBtnStyleInfo !== undefined) patch.discordBtnStyleInfo = body.discordBtnStyleInfo;
    if (body.discordBtnLabelNotices !== undefined) {
      patch.discordBtnLabelNotices = body.discordBtnLabelNotices.trim() || "공지";
    }
    if (body.discordBtnLabelProducts !== undefined) {
      patch.discordBtnLabelProducts = body.discordBtnLabelProducts.trim() || "제품";
    }
    if (body.discordBtnLabelBuy !== undefined) {
      patch.discordBtnLabelBuy = body.discordBtnLabelBuy.trim() || "구매";
    }
    if (body.discordBtnLabelCharge !== undefined) {
      patch.discordBtnLabelCharge = body.discordBtnLabelCharge.trim() || "충전";
    }
    if (body.discordBtnLabelInfo !== undefined) {
      patch.discordBtnLabelInfo = body.discordBtnLabelInfo.trim() || "정보";
    }
    if (body.discordPurchaseLogTitle !== undefined) {
      patch.discordPurchaseLogTitle = body.discordPurchaseLogTitle.trim() || "구매 로그";
    }
    if (body.discordPurchaseLogTemplate !== undefined) {
      patch.discordPurchaseLogTemplate = body.discordPurchaseLogTemplate.trim();
    }
    if (body.discordReviewLogTitle !== undefined) {
      patch.discordReviewLogTitle = body.discordReviewLogTitle.trim() || "후기 로그";
    }
    if (body.discordReviewLogTemplate !== undefined) {
      patch.discordReviewLogTemplate = body.discordReviewLogTemplate.trim();
    }

    // 다른 상점 서버를 가로채거나, 플랫폼 봇으로 남의 채널에 로그를 보내지 못하게 막는다
    if (patch.discordGuildId && patch.discordGuildId !== settings.discordGuildId) {
      const taken = listShops().some(
        (s) => s.id !== shop.id && getShopSettings(s.id).discordGuildId === patch.discordGuildId,
      );
      if (taken) return badRequest("이미 다른 상점에 연결된 Discord 서버예요.");
    }
    const channelKeys = [
      "discordPurchaseLogChannelId",
      "discordChargeLogChannelId",
      "discordAdminLogChannelId",
      "discordReviewLogChannelId",
      "discordRestockLogChannelId",
      "discordRandomBoxLogChannelId",
      "discordStockChannelId",
    ] as const;
    const changedChannels = channelKeys
      .map((k) => (patch[k] && patch[k] !== settings[k] ? patch[k] : null))
      .filter((id): id is string => Boolean(id));
    if (changedChannels.length) {
      const guildId = patch.discordGuildId !== undefined ? patch.discordGuildId : settings.discordGuildId;
      if (!guildId) return badRequest("Guild ID를 먼저 저장하세요.");
      const listed = await listGuildTextChannels(guildId, shop.id);
      if (!listed.ok) return badRequest("Discord 서버 채널을 불러오지 못했어요. 봇이 서버에 있는지 확인해 주세요.");
      const ids = new Set(filterTextChannels(listed.json).map((c) => c.id));
      if (changedChannels.some((id) => !ids.has(id))) {
        return badRequest("선택한 채널이 이 상점의 Discord 서버에 없어요.");
      }
    }

    updateShopSettings(shop.id, patch);
    await persistAsync();
    if (patch.discordStockChannelId) {
      void import("@/lib/discord/stock-board").then(({ refreshStockBoard }) =>
        refreshStockBoard(shop.id).catch(() => null),
      );
    }
    return NextResponse.json({ ok: true });
  }

  const reg = registerSchema.safeParse(json);
  if (reg.success) {
    const settings = getShopSettings(shop.id);
    if (!settings.discordGuildId) {
      return badRequest("먼저 Guild ID를 저장해 주세요.");
    }
    if (shop.slug === "mfa") {
      const { syncMfaDoesDiscord } = await import("@/lib/discord/sync-mfa-does");
      const synced = await syncMfaDoesDiscord(settings.discordGuildId);
      if (!synced.ok) return badRequest(synced.error ?? "명령 등록 실패");
      return NextResponse.json({ ok: true, commands: "does-merged" });
    }
    const result = await registerGuildCommands(
      settings.discordGuildId,
      [...VENDIX_DISCORD_COMMANDS],
      { shopId: shop.id },
    );
    if (!result.ok) return badRequest(result.error);
    void import("@/lib/discord/presence").then(({ updateDiscordBotPresence }) =>
      updateDiscordBotPresence().catch(() => null),
    );
    return NextResponse.json({ ok: true, commands: result.commands });
  }

  return badRequest("알 수 없는 요청");
}
