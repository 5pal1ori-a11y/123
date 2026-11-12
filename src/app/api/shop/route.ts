import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  isShopOwnerAdmin,
  requireShop,
  serverError,
  unauthorized,
  forbidden,
} from "@/lib/api";
import { getOAuthRedirectOrigin } from "@/lib/domain";
import { sanitizeShopSettings } from "@/lib/security";
import { getUserSession } from "@/lib/session-server";
import {
  createNotice,
  createEvent,
  getShopSettings,
  initStore,
  listEvents,
  listNotices,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "settings") {
    if (!isShopAdmin(request, shop)) return unauthorized();
    return NextResponse.json({ settings: sanitizeShopSettings(getShopSettings(shop.id)) });
  }

  if (type === "auto-charge-pairing" || type === "android-pairing") {
    if (!isShopOwnerAdmin(request, shop)) return unauthorized();
    const settings = getShopSettings(shop.id);
    const baseUrl = getOAuthRedirectOrigin();
    return NextResponse.json({
      shopSlug: shop.slug,
      shopName: shop.name,
      baseUrl,
      autoChargeEnabled: settings.autoChargeEnabled,
      pushbulletEnabled: settings.pushbulletEnabled,
    });
  }

  if (type === "events") {
    return NextResponse.json({ events: listEvents(shop.id) });
  }

  const settings = getShopSettings(shop.id);
  return NextResponse.json({
    notices: listNotices(shop.id),
    settings: {
      welcomeMessage: settings.welcomeMessage,
      backgroundMusicEnabled: settings.backgroundMusicEnabled,
      backgroundMusicUrl: settings.backgroundMusicUrl,
      maintenanceMode: settings.maintenanceMode,
      discordInviteUrl: settings.discordInviteUrl,
      termsVersion: settings.termsVersion,
      termsBody: settings.termsBody,
      privacyVersion: settings.privacyVersion,
      privacyBody: settings.privacyBody,
    },
  });
}

const noticeSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  pinned: z.boolean().optional(),
});

const settingsSchema = z.object({
  backgroundMusicUrl: z.string().nullable().optional(),
  backgroundMusicEnabled: z.boolean().optional(),
  welcomeMessage: z.string().optional(),
  discordInviteUrl: z.string().nullable().optional(),
  maintenanceMode: z.boolean().optional(),
  minChargeAmount: z.number().int().min(1).optional(),
  chargePresets: z.array(z.number()).optional(),
  autoChargeEnabled: z.boolean().optional(),
  reviewFeedChannelId: z
    .string()
    .trim()
    .regex(/^\d{0,22}$/)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  productId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(1).max(99),
  days: z.number().int().min(1).max(90).optional(),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "settings");
  if (denied) return denied;

  try {
    const json = await request.json();
    if (json.type === "notice") {
      const parsed = noticeSchema.safeParse(json);
      if (!parsed.success) return badRequest("공지 내용을 확인하세요.");
      const notice = createNotice(shop.id, parsed.data.title, parsed.data.body, parsed.data.pinned);
      await persistAsync();
      return NextResponse.json({ notice }, { status: 201 });
    }
    if (json.type === "event") {
      const parsed = eventSchema.safeParse(json);
      if (!parsed.success) return badRequest("이벤트 내용을 확인하세요.");
      const days = parsed.data.days ?? 7;
      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + days * 86400000).toISOString();
      const event = createEvent(shop.id, {
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        productId: parsed.data.productId ?? null,
        discountPercent: parsed.data.discountPercent,
        startsAt,
        endsAt,
        active: true,
      });
      await persistAsync();
      return NextResponse.json({ event }, { status: 201 });
    }
    return badRequest("Unknown type");
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");

  try {
    const json = await request.json();
    const parsed = settingsSchema.safeParse(json);
    if (!parsed.success) return badRequest("설정값 오류");
    const settings = updateShopSettings(shop.id, parsed.data);
    await persistAsync();
    return NextResponse.json({ settings: sanitizeShopSettings(settings) });
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const { updateUserProfile, toPublicUser } = await import("@/lib/store");
    const user = updateUserProfile(session.user.id, {
      name: json.name,
      theme: json.theme,
      // discordId / discordUsername only via OAuth link — never client-supplied
    });
    await persistAsync();
    return NextResponse.json({ user: toPublicUser(user) });
  } catch (err) {
    return serverError(err);
  }
}
