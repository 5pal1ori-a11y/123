import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  isShop,
  requireShop,
  serverError,
  unauthorized,
  assertSameOrigin,
} from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import {
  getShopSettings,
  initStore,
  listActiveBannerAds,
  listUserBannerAds,
  persistAsync,
  purchaseBannerAd,
  toPublicUser,
  getUserById,
} from "@/lib/store";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;

    const settings = getShopSettings(shop.id);
    const session = await getUserSession(shop.slug, request);
    const mine = session ? listUserBannerAds(shop.id, session.user.id) : [];

    return NextResponse.json({
      enabled: settings.bannerAdsEnabled,
      weeklyPrice: settings.bannerWeeklyPrice,
      monthlyPrice: settings.bannerMonthlyPrice,
      active: listActiveBannerAds(shop.id).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        imageUrl: a.imageUrl,
        linkUrl: a.linkUrl,
        period: a.period,
        endsAt: a.endsAt,
      })),
      mine: mine.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        period: a.period,
        amount: a.amount,
        status: a.status,
        createdAt: a.createdAt,
        endsAt: a.endsAt,
        rejectReason: a.rejectReason,
      })),
      user: session?.user ? toPublicUser(session.user) : null,
    });
  } catch (err) {
    return serverError(err);
  }
}

const purchaseSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(280).optional(),
  imageUrl: z.string().max(500).optional().nullable(),
  linkUrl: z.string().max(500).optional().nullable(),
  period: z.enum(["week", "month"]),
});

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;

    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();

    const json = await request.json().catch(() => null);
    const parsed = purchaseSchema.safeParse(json);
    if (!parsed.success) return badRequest("입력값을 확인해 주세요.");

    const result = purchaseBannerAd({
      shopId: shop.id,
      userId: session.user.id,
      title: parsed.data.title,
      body: parsed.data.body ?? "",
      imageUrl: parsed.data.imageUrl || null,
      linkUrl: parsed.data.linkUrl || null,
      period: parsed.data.period,
    });
    if (!result.ok) return badRequest(result.error);

    await persistAsync();
    const fresh = getUserById(session.user.id);
    return NextResponse.json({
      ok: true,
      ad: result.ad,
      user: fresh ? toPublicUser(fresh) : null,
    });
  } catch (err) {
    return serverError(err);
  }
}
