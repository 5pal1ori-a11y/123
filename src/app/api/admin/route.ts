import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, isShopOwnerAdmin, requireShop, serverError, unauthorized, forbidden, assertSameOrigin, getShopAdminActor, forbidUnlessStaffCan } from "@/lib/api";
import { isAutoChargeBank } from "@/lib/auto-charge-banks";
import { planFeatureError } from "@/lib/plans";
import { sanitizeShopSettings, looksLikeVendixDeviceKey } from "@/lib/security";
import { maskEmail } from "@/lib/pii";
import {
  adminStats,
  createBugReport,
  createCategory,
  createCoupon,
  createTier,
  deleteCategory,
  renameCategory,
  deleteCoupon,
  deleteEvent,
  deleteNotice,
  deleteProduct,
  deleteReview,
  deleteTier,
  deleteUser,
  extendShopByLicenseKey,
  getShopSettings,
  getShopSubscriptionStatus,
  initStore,
  listBugReports,
  listCategories,
  listCoupons,
  listEventsAdmin,
  listInquiriesAdmin,
  listNotices,
  listBannerAdsAdmin,
  listPendingCharges,
  listRecentCharges,
  listProductsAdmin,
  listReviewsAdmin,
  listTiers,
  listUsersAdmin,
  persistAsync,
  regenerateDeviceKey,
  reviewBannerAd,
  replyInquiry,
  takeDownBannerAd,
  adminUpdateUser,
  updateReview,
  resolveBugReport,
  updateShopBank,
  updateShopAdminCredentials,
  updateShopProfile,
  updateShopSettings,
  applyShopModerationFlag,
  toPublicUser,
  getUserById,
  updateTier,
} from "@/lib/store";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { moderateShopName, moderationUserMessage } from "@/lib/content-moderation";
import { getUserSession } from "@/lib/session-server";
import {
  // keep rest of imports intact - need to check what follows
  ensureLicenseExpiryNotification,
  getLicenseRenewalNotice,
  listAdminNotifications,
  markAdminNotificationRead,
} from "@/lib/store-ext";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopAdmin(request, shop)) return unauthorized();

    const settings = getShopSettings(shop.id);
    const subscription = getShopSubscriptionStatus(shop);
    const { runShopAutomations } = await import("@/lib/store-ext");
    runShopAutomations(shop.id);
    ensureLicenseExpiryNotification(shop.id);
    const owner = isShopOwnerAdmin(request, shop);
    const actor = getShopAdminActor(request, shop);
    const settingsSafe = sanitizeShopSettings(settings);
    const maskPii = settings.maskPiiInAdmin !== false;
    const users = listUsersAdmin(shop.id).map((u) =>
      maskPii
        ? {
            ...u,
            email: owner ? u.email : maskEmail(u.email),
            discordId: u.discordId ? `${u.discordId.slice(0, 4)}…` : null,
            discordUsername: u.discordUsername
              ? `${u.discordUsername.slice(0, 2)}***`
              : null,
          }
        : u,
    );

    return NextResponse.json({
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        tagline: shop.tagline,
        logoUrl: shop.logoUrl,
        adminUsername: shop.adminUsername,
        plan: shop.plan,
        expiresAt: shop.expiresAt,
        graceUntil: shop.graceUntil,
        subscription,
        bankName: shop.bankName,
        bankAccount: shop.bankAccount,
        bankHolder: shop.bankHolder,
        deviceKey: owner ? shop.androidDeviceKey : null,
      },
      settings: settingsSafe,
      isOwnerAdmin: owner,
      staffPermissions: actor?.isOwner ? null : (actor?.permissions ?? []),
      stats: adminStats(shop.id),
      products: listProductsAdmin(shop.id),
      categories: listCategories(shop.id),
      tiers: listTiers(shop.id),
      coupons: listCoupons(shop.id),
      reviews: listReviewsAdmin(shop.id),
      bugReports: listBugReports(shop.id),
      users,
      notices: listNotices(shop.id),
      events: listEventsAdmin(shop.id),
      pendingCharges: listPendingCharges(shop.id),
      recentCharges: listRecentCharges(shop.id, 50),
      inquiries: listInquiriesAdmin(shop.id),
      bannerAds: listBannerAdsAdmin(shop.id),
      notifications: listAdminNotifications(shop.id),
      licenseRenewal: getLicenseRenewalNotice(shop.id),
      maskPiiInAdmin: settings.maskPiiInAdmin !== false,
    });
  } catch (err) {
    return serverError(err);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("regenerate-device-key") }),
  z.object({
    action: z.literal("save-account"),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    bankHolder: z.string().optional(),
    minChargeAmount: z.number().int().min(1).optional(),
    depositSuffixPhrase: z.string().optional(),
    autoChargeEnabled: z.boolean().optional(),
    autoChargeCultureGift: z.boolean().optional(),
    autoChargeCoin: z.boolean().optional(),
    pushbulletAccessToken: z.string().nullable().optional(),
    pushbulletEnabled: z.boolean().optional(),
    cryptoWalletAddress: z.string().nullable().optional(),
    cryptoWalletLabel: z.string().nullable().optional(),
    cultureGiftEnabled: z.boolean().optional(),
    culturelandId: z.string().nullable().optional(),
    culturelandPassword: z.string().nullable().optional(),
    nowpaymentsEnabled: z.boolean().optional(),
    nowpaymentsApiKey: z.string().nullable().optional(),
    nowpaymentsIpnSecret: z.string().nullable().optional(),
    nowpaymentsPayCurrency: z.string().nullable().optional(),
    adminIpWhitelist: z.array(z.string()).optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    lowStockAlertsEnabled: z.boolean().optional(),
    salesGoalDaily: z.number().int().min(0).nullable().optional(),
    bannerAdsEnabled: z.boolean().optional(),
    koreaOnlyAccess: z.boolean().optional(),
    blockVpnProxy: z.boolean().optional(),
    maskPiiInAdmin: z.boolean().optional(),
    loginMicrosoftEnabled: z.boolean().optional(),
    loginDiscordEnabled: z.boolean().optional(),
    restockNotifyEnabled: z.boolean().optional(),
    autoExpireChargesEnabled: z.boolean().optional(),
    chargeExpireMinutes: z.number().int().min(1).max(1440).optional(),
    dailySalesDigestEnabled: z.boolean().optional(),
    dailyDigestHourKst: z.number().int().min(0).max(23).optional(),
    bannerAutoApprove: z.boolean().optional(),
    tierUpgradeNotifyEnabled: z.boolean().optional(),
    welcomeBonusEnabled: z.boolean().optional(),
    welcomeBonusPoints: z.number().int().min(0).max(1_000_000).optional(),
  }),
  z.object({
    action: z.literal("save-store-settings"),
    name: z.string().min(1).optional(),
    tagline: z.string().optional(),
    logoUrl: z.string().nullable().optional(),
    welcomeMessage: z.string().optional(),
    discordInviteUrl: z.string().nullable().optional(),
    backgroundMusicUrl: z.string().nullable().optional(),
    backgroundMusicEnabled: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().max(200).optional(),
    termsVersion: z.string().max(32).optional(),
    termsBody: z.string().max(8000).optional(),
    privacyVersion: z.string().max(32).optional(),
    privacyBody: z.string().max(8000).optional(),
    adminUsername: z.string().min(1).optional(),
    adminPassword: z.string().min(4).optional(),
  }),
  z.object({ action: z.literal("category-create"), name: z.string() }),
  z.object({ action: z.literal("category-delete"), categoryId: z.string() }),
  z.object({ action: z.literal("category-rename"), categoryId: z.string(), name: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("product-delete"), productId: z.string() }),
  z.object({ action: z.literal("notice-delete"), noticeId: z.string() }),
  z.object({ action: z.literal("event-delete"), eventId: z.string() }),
  z.object({
    action: z.literal("tier-create"),
    name: z.string().min(1),
    minTotalCharged: z.coerce.number().min(0),
    discountPercent: z.coerce.number().min(0).max(99),
    color: z.string().optional(),
    discordRoleId: z.string().max(40).nullable().optional(),
  }),
  z.object({
    action: z.literal("tier-update"),
    tierId: z.string(),
    name: z.string().min(1).optional(),
    minTotalCharged: z.coerce.number().min(0).optional(),
    discountPercent: z.coerce.number().min(0).max(99).optional(),
    discordRoleId: z.string().max(40).nullable().optional(),
  }),
  z.object({ action: z.literal("tier-delete"), tierId: z.string() }),
  z.object({
    action: z.literal("coupon-create"),
    code: z.string().min(1),
    discountPercent: z.coerce.number().min(0).max(99),
    maxUses: z.coerce.number().min(1),
    days: z.coerce.number().optional(),
  }),
  z.object({ action: z.literal("coupon-delete"), couponId: z.string() }),
  z.object({
    action: z.literal("user-update"),
    userId: z.string(),
    points: z.number().optional(),
    pointsDelta: z.number().optional(),
    tierId: z.string().nullable().optional(),
    isSubAdmin: z.boolean().optional(),
    staffPermissions: z
      .array(
        z.enum([
          "billing",
          "products",
          "orders",
          "users",
          "inquiries",
          "settings",
          "bot",
          "logs",
        ]),
      )
      .optional(),
    banned: z.boolean().optional(),
    banReason: z.string().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal("inquiry-reply"),
    inquiryId: z.string().min(1),
    reply: z.string().min(1).max(4000),
  }),
  z.object({ action: z.literal("user-delete"), userId: z.string() }),
  z.object({ action: z.literal("extend-license"), licenseKey: z.string().min(8) }),
  z.object({ action: z.literal("notification-read"), notificationId: z.string() }),
  z.object({
    action: z.literal("review-update"),
    reviewId: z.string(),
    body: z.string().optional(),
    rating: z.number().optional(),
    approved: z.boolean().optional(),
  }),
  z.object({ action: z.literal("review-delete"), reviewId: z.string() }),
  z.object({ action: z.literal("bug-resolve"), reportId: z.string() }),
  z.object({
    action: z.literal("bug-report"),
    email: z.string().email(),
    subject: z.string(),
    body: z.string(),
    userId: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal("banner-settings"),
    bannerAdsEnabled: z.boolean().optional(),
    bannerWeeklyPrice: z.coerce.number().min(0).optional(),
    bannerMonthlyPrice: z.coerce.number().min(0).optional(),
  }),
  z.object({
    action: z.literal("banner-review"),
    adId: z.string(),
    decision: z.enum(["approve", "reject"]),
    rejectReason: z.string().optional(),
  }),
  z.object({
    action: z.literal("banner-takedown"),
    adId: z.string(),
  }),
]);

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  try {
    const json = await request.json();
    const parsed = actionSchema.safeParse(json);
    if (!parsed.success) return badRequest("Unknown action");

    const body = parsed.data;

    if (body.action === "bug-report") {
      const session = await getUserSession(shop.slug);
      if (!session && !isShopAdmin(request, shop)) return unauthorized();
      const report = createBugReport({
        shopId: shop.id,
        userId: session?.user.id ?? null,
        email: session?.user.email ?? body.email,
        subject: body.subject,
        body: body.body,
      });
      await persistAsync();
      return NextResponse.json({ report });
    }

    if (!isShopAdmin(request, shop)) {
      return NextResponse.json(
        { error: "로그인이 만료됐어요. 관리자로 다시 로그인해 주세요." },
        { status: 401 },
      );
    }
    const owner = isShopOwnerAdmin(request, shop);

    switch (body.action) {
      case "regenerate-device-key": {
        if (!owner) return forbidden("상점 소유자만 가능합니다.");
        const featureErr = planFeatureError(shop.plan, "aos_auto_charge");
        if (featureErr) return badRequest(featureErr);
        const deviceKey = regenerateDeviceKey(shop.id);
        await persistAsync();
        return NextResponse.json({ deviceKey });
      }
      case "save-account": {
        if (!owner) return forbidden("상점 소유자만 가능합니다. (스태프는 자동충전 토큰을 저장할 수 없어요)");
        if (body.autoChargeEnabled === true) {
          const featureErr = planFeatureError(shop.plan, "aos_auto_charge");
          if (featureErr) return badRequest(featureErr);
        }
        if (body.bankName !== undefined && body.bankName.trim() && !isAutoChargeBank(body.bankName)) {
          return badRequest("자동충전 가능 은행 목록에서 선택해 주세요.");
        }
        if (body.bankName !== undefined || body.bankAccount !== undefined || body.bankHolder !== undefined) {
          updateShopBank(shop.id, {
            bankName: body.bankName,
            bankAccount: body.bankAccount,
            bankHolder: body.bankHolder,
          });
        }
        const current = getShopSettings(shop.id);
        const settingsPatch: Parameters<typeof updateShopSettings>[1] = {
          minChargeAmount:
            body.minChargeAmount !== undefined
              ? Math.max(1, Math.floor(body.minChargeAmount))
              : undefined,
          depositSuffixPhrase: body.depositSuffixPhrase,
          autoChargeEnabled: body.autoChargeEnabled,
          autoChargeCultureGift: body.autoChargeCultureGift,
          autoChargeCoin: body.autoChargeCoin,
          pushbulletEnabled: body.pushbulletEnabled,
          cryptoWalletAddress: body.cryptoWalletAddress,
          cryptoWalletLabel: body.cryptoWalletLabel,
          cultureGiftEnabled: body.cultureGiftEnabled,
          culturelandId: body.culturelandId,
          nowpaymentsEnabled: body.nowpaymentsEnabled,
          nowpaymentsPayCurrency: body.nowpaymentsPayCurrency,
          adminIpWhitelist: body.adminIpWhitelist,
          lowStockThreshold: body.lowStockThreshold,
          lowStockAlertsEnabled: body.lowStockAlertsEnabled,
          salesGoalDaily: body.salesGoalDaily,
          bannerAdsEnabled: body.bannerAdsEnabled,
          koreaOnlyAccess: body.koreaOnlyAccess,
          blockVpnProxy: body.blockVpnProxy,
          maskPiiInAdmin: body.maskPiiInAdmin,
          loginMicrosoftEnabled: body.loginMicrosoftEnabled,
          loginDiscordEnabled: body.loginDiscordEnabled,
        };
        const msOn = body.loginMicrosoftEnabled ?? current.loginMicrosoftEnabled !== false;
        const discordOn = body.loginDiscordEnabled ?? current.loginDiscordEnabled !== false;
        if (!msOn && !discordOn) {
          return badRequest("로그인 방법을 하나는 켜 두어야 해요.");
        }
        if (body.pushbulletAccessToken && !body.pushbulletAccessToken.includes("•")) {
          const pb = body.pushbulletAccessToken.trim();
          if (looksLikeVendixDeviceKey(pb)) {
            return badRequest(
              "이건 기기키가 아니라 Pushbullet Access Token(o. …)을 넣어 주세요.",
            );
          }
          settingsPatch.pushbulletAccessToken = pb;
          // Saving a token with auto-charge on always arms Pushbullet auth
          if (body.autoChargeEnabled !== false) {
            settingsPatch.pushbulletEnabled = true;
            if (body.autoChargeEnabled === undefined) {
              settingsPatch.autoChargeEnabled = true;
            }
          }
        }
        if (
          body.autoChargeEnabled === true &&
          body.pushbulletEnabled === undefined &&
          (settingsPatch.pushbulletAccessToken || current.pushbulletAccessToken)
        ) {
          settingsPatch.pushbulletEnabled = true;
        }
        if (body.culturelandPassword && !body.culturelandPassword.includes("•")) {
          settingsPatch.culturelandPassword = body.culturelandPassword;
        }
        if (body.nowpaymentsApiKey && !body.nowpaymentsApiKey.includes("•")) {
          settingsPatch.nowpaymentsApiKey = body.nowpaymentsApiKey;
        }
        if (body.nowpaymentsIpnSecret && !body.nowpaymentsIpnSecret.includes("•")) {
          settingsPatch.nowpaymentsIpnSecret = body.nowpaymentsIpnSecret;
        }
        void current;
        const settings = updateShopSettings(shop.id, settingsPatch);
        await persistAsync();
        return NextResponse.json({ settings: sanitizeShopSettings(settings) });
      }
      case "save-store-settings": {
        if (!owner) return forbidden("상점 소유자만 가능합니다.");
        try {
          if (body.name !== undefined && body.name.trim() !== shop.name) {
            const mod = await moderateShopName(body.name);
            if (mod.action === "block") {
              return badRequest(moderationUserMessage(mod, "shop") || mod.reason);
            }
            if (mod.action === "review") {
              updateShopProfile(shop.id, {
                name: body.name,
                tagline: body.tagline,
                logoUrl: body.logoUrl,
              });
              applyShopModerationFlag(shop.id, mod.reason);
              if (body.adminUsername !== undefined || body.adminPassword !== undefined) {
                updateShopAdminCredentials(shop.id, {
                  adminUsername: body.adminUsername,
                  adminPassword: body.adminPassword,
                });
              }
              const settings = updateShopSettings(shop.id, {
                welcomeMessage: body.welcomeMessage,
                discordInviteUrl: body.discordInviteUrl,
                backgroundMusicUrl: body.backgroundMusicUrl,
                backgroundMusicEnabled: body.backgroundMusicEnabled,
                maintenanceMode: body.maintenanceMode,
                maintenanceMessage: body.maintenanceMessage,
                termsVersion: body.termsVersion,
                termsBody: body.termsBody,
                privacyVersion: body.privacyVersion,
                privacyBody: body.privacyBody,
              });
              await persistAsync();
              return NextResponse.json({
                warning: moderationUserMessage(mod, "shop"),
                shop: {
                  id: shop.id,
                  slug: shop.slug,
                  name: body.name.trim(),
                  status: "suspended",
                  moderationStatus: "pending_review",
                },
                settings: sanitizeShopSettings(settings),
              });
            }
          }
          const updatedShop = updateShopProfile(shop.id, {
            name: body.name,
            tagline: body.tagline,
            logoUrl: body.logoUrl,
          });
          if (body.adminUsername !== undefined || body.adminPassword !== undefined) {
            updateShopAdminCredentials(shop.id, {
              adminUsername: body.adminUsername,
              adminPassword: body.adminPassword,
            });
          }
          const settings = updateShopSettings(shop.id, {
            welcomeMessage: body.welcomeMessage,
            discordInviteUrl: body.discordInviteUrl,
            backgroundMusicUrl: body.backgroundMusicUrl,
            backgroundMusicEnabled: body.backgroundMusicEnabled,
            maintenanceMode: body.maintenanceMode,
            maintenanceMessage: body.maintenanceMessage,
            termsVersion: body.termsVersion,
            termsBody: body.termsBody,
            privacyVersion: body.privacyVersion,
            privacyBody: body.privacyBody,
          });
          await persistAsync();
          return NextResponse.json({
            shop: {
              id: updatedShop.id,
              slug: updatedShop.slug,
              name: updatedShop.name,
              tagline: updatedShop.tagline,
              logoUrl: updatedShop.logoUrl,
              adminUsername: updatedShop.adminUsername,
              plan: updatedShop.plan,
              expiresAt: updatedShop.expiresAt,
              graceUntil: updatedShop.graceUntil,
              subscription: getShopSubscriptionStatus(updatedShop),
            },
            settings: sanitizeShopSettings(settings),
          });
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "스토어 설정 저장 실패");
        }
      }
      case "category-create": {
        const denied = forbidUnlessStaffCan(request, shop, "products");
        if (denied) return denied;
        try {
          const category = createCategory(shop.id, body.name);
          await persistAsync();
          return NextResponse.json({ category });
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "카테고리 추가 실패");
        }
      }
      case "category-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "products");
        if (denied) return denied;
        deleteCategory(shop.id, body.categoryId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "category-rename": {
        const denied = forbidUnlessStaffCan(request, shop, "products");
        if (denied) return denied;
        try {
          const result = renameCategory(shop.id, body.categoryId, body.name);
          await persistAsync();
          return NextResponse.json(result);
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "카테고리 이름 변경 실패");
        }
      }
      case "product-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "products");
        if (denied) return denied;
        try {
          deleteProduct(shop.id, body.productId);
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "삭제할 수 없어요.");
        }
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "notice-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        deleteNotice(shop.id, body.noticeId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "event-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        deleteEvent(shop.id, body.eventId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "tier-create": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        const featureErr = planFeatureError(shop.plan, "member_tiers");
        if (featureErr) return badRequest(featureErr);
        try {
          const tier = createTier(shop.id, body);
          await persistAsync();
          if (tier.discordRoleId) {
            scheduleDiscordBackground(
              import("@/lib/discord/spend-roles").then(({ backfillTierRole }) => backfillTierRole(shop.id, tier.id)),
            );
          }
          return NextResponse.json({ tier });
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "등급 추가 실패");
        }
      }
      case "tier-update": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        try {
          const { action: _action, tierId, ...patch } = body;
          void _action;
          const tier = updateTier(shop.id, tierId, patch);
          await persistAsync();
          if (tier.discordRoleId) {
            scheduleDiscordBackground(
              import("@/lib/discord/spend-roles").then(({ backfillTierRole }) => backfillTierRole(shop.id, tier.id)),
            );
          }
          return NextResponse.json({ tier });
        } catch (err) {
          return badRequest(err instanceof Error ? err.message : "등급 수정 실패");
        }
      }
      case "tier-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        deleteTier(shop.id, body.tierId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "coupon-create": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        const featureErr = planFeatureError(shop.plan, "coupon");
        if (featureErr) return badRequest(featureErr);
        const coupon = createCoupon(shop.id, body);
        await persistAsync();
        return NextResponse.json({ coupon });
      }
      case "coupon-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        deleteCoupon(shop.id, body.couponId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "user-update": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        if (body.isSubAdmin === true) {
          if (!owner) return forbidden("상점 소유자만 부관리자를 지정할 수 있습니다.");
          const featureErr = planFeatureError(shop.plan, "sub_admin");
          if (featureErr) return badRequest(featureErr);
        }
        if (body.isSubAdmin === false && !owner) {
          return forbidden("상점 소유자만 부관리자를 해제할 수 있습니다.");
        }
        // Sub-admins cannot grant points arbitrarily beyond their own role
        if (!owner && (body.points !== undefined || body.pointsDelta !== undefined || body.isSubAdmin !== undefined || body.staffPermissions !== undefined || body.banned !== undefined)) {
          return forbidden("권한이 없습니다.");
        }
        const user = adminUpdateUser(shop.id, body.userId, body);
        await persistAsync();
        const publicUser = getUserById(user.id);
        return NextResponse.json({ user: publicUser ? toPublicUser(publicUser) : null });
      }
      case "inquiry-reply": {
        const denied = forbidUnlessStaffCan(request, shop, "inquiries");
        if (denied) return denied;
        const inquiry = replyInquiry(shop.id, body.inquiryId, body.reply);
        if (!inquiry) return badRequest("문의를 찾을 수 없어요.");
        await persistAsync();
        return NextResponse.json({ inquiry });
      }
      case "user-delete":
        if (!owner) return forbidden("상점 소유자만 가능합니다.");
        deleteUser(shop.id, body.userId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      case "notification-read":
        markAdminNotificationRead(body.notificationId, shop.id);
        await persistAsync();
        return NextResponse.json({ ok: true });
      case "extend-license": {
        const result = extendShopByLicenseKey(shop.id, body.licenseKey);
        if (!result.ok) return badRequest(result.error);
        await persistAsync();
        return NextResponse.json({
          shop: {
            plan: result.shop.plan,
            expiresAt: result.shop.expiresAt,
            graceUntil: result.shop.graceUntil,
            subscription: getShopSubscriptionStatus(result.shop),
          },
        });
      }
      case "review-update": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        const review = updateReview(shop.id, body.reviewId, body);
        await persistAsync();
        return NextResponse.json({ review });
      }
      case "review-delete": {
        const denied = forbidUnlessStaffCan(request, shop, "users");
        if (denied) return denied;
        deleteReview(shop.id, body.reviewId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "bug-resolve": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        resolveBugReport(shop.id, body.reportId);
        await persistAsync();
        return NextResponse.json({ ok: true });
      }
      case "banner-settings": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        const settings = updateShopSettings(shop.id, {
          bannerAdsEnabled: body.bannerAdsEnabled,
          bannerWeeklyPrice: body.bannerWeeklyPrice,
          bannerMonthlyPrice: body.bannerMonthlyPrice,
        });
        await persistAsync();
        return NextResponse.json({ settings: sanitizeShopSettings(settings) });
      }
      case "banner-review": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        const result = reviewBannerAd(shop.id, body.adId, body.decision, body.rejectReason);
        if (!result.ok) return badRequest(result.error);
        await persistAsync();
        return NextResponse.json({ ad: result.ad, bannerAds: listBannerAdsAdmin(shop.id) });
      }
      case "banner-takedown": {
        const denied = forbidUnlessStaffCan(request, shop, "settings");
        if (denied) return denied;
        const result = takeDownBannerAd(shop.id, body.adId);
        if (!result.ok) return badRequest(result.error);
        await persistAsync();
        return NextResponse.json({ ad: result.ad, bannerAds: listBannerAdsAdmin(shop.id) });
      }
      default:
        return badRequest("Unknown action");
    }
  } catch (err) {
    return serverError(err);
  }
}
