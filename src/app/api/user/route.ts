import { NextResponse } from "next/server";

import { z } from "zod";

import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";

import { planFeatureError } from "@/lib/plans";

import { getUserSession, clearSessionCookie } from "@/lib/session-server";

import { reviewableCount } from "@/lib/store-admin";

import {

  aggregateUserMonthlyReport,

  listAuthSessions,

  listLoginHistory,

  listWishlistProductIds,

  listUserNotifications,

  revokeAuthSession,

  revokeOtherAuthSessions,

} from "@/lib/store-ext";

import {

  changeUserEmail,

  changeUserPassword,

  createInquiry,

  deleteOwnAccount,

  initStore,

  listUserCharges,

  listUserInquiries,

  listUserOrders,

  persistAsync,

  resolveUserTier,

  toPublicUser,

  updateUserProfile,

} from "@/lib/store";



export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug);
    if (!session) return unauthorized();

    const tier = resolveUserTier(shop.id, session.user);
    const inquiries = listUserInquiries(shop.id, session.user.id);
    const orders = listUserOrders(shop.id, session.user.id)
      .slice()
      .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))
      .slice(0, 40)
      .map((o) => ({
        id: o.id,
        orderUuid: o.orderUuid,
        amount: o.amount,
        status: o.status,
        paymentMethod: o.paymentMethod,
        dispensedCode: o.dispensedCode,
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        productName: o.productName,
        canReview:
          Boolean(o.productId) &&
          (o.status === "dispensed" || o.status === "paid" || o.status === "awaiting_fulfillment") &&
          reviewableCount(shop.id, session.user.id, o.productId) > 0,
      }));
    const charges = listUserCharges(shop.id, session.user.id)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        amount: c.amount,
        status: c.status,
        reference: c.reference,
        failReason: c.failReason,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
      }));

    return NextResponse.json({
      user: toPublicUser(session.user),
      tier,
      inquiries,
      orders,
      charges,
      wishlist: listWishlistProductIds(shop.id, session.user.id),
      notifications: listUserNotifications(shop.id, session.user.id, true),
      monthlyReport: aggregateUserMonthlyReport(shop.id, session.user.id),
      loginHistory: listLoginHistory(shop.id, session.user.id, "user"),
      sessions: listAuthSessions(shop.id, session.user.id, "user").map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        ip: s.ip,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        current: s.id === session.sessionId,
      })),
    });
  } catch (err) {
    return serverError(err);
  }
}



const actionSchema = z.discriminatedUnion("action", [

  z.object({

    action: z.literal("update-profile"),

    name: z.string().min(1).optional(),

    theme: z.enum(["light", "dark", "system"]).optional(),

  }),

  z.object({

    action: z.literal("change-password"),

    currentPassword: z.string().min(1),

    newPassword: z.string().min(6),

  }),

  z.object({

    action: z.literal("change-email"),

    newEmail: z.string().email(),

    password: z.string().min(1),

  }),

  z.object({

    action: z.literal("inquiry"),

    subject: z.string().min(1),

    body: z.string().min(1),

  }),

  z.object({

    action: z.literal("revoke-session"),

    sessionId: z.string().min(1),

  }),

  z.object({

    action: z.literal("revoke-other-sessions"),

  }),

  z.object({

    action: z.literal("delete-account"),

    password: z.string().min(1),

  }),

]);



export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);

  if (!isShop(shop)) return shop;

  const session = await getUserSession(shop.slug);

  if (!session) return unauthorized();



  try {

    const json = await request.json();

    const parsed = actionSchema.safeParse(json);

    if (!parsed.success) return badRequest("요청 형식이 올바르지 않습니다.");



    const body = parsed.data;

    const userId = session.user.id;



    if (body.action === "update-profile") {

      const user = updateUserProfile(userId, {

        name: body.name,

        theme: body.theme,

      });

      return NextResponse.json({ user: toPublicUser(user) });

    }



    if (body.action === "change-password") {

      const result = changeUserPassword(userId, body.currentPassword, body.newPassword);

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      if (session.sessionId) revokeOtherAuthSessions(shop.id, userId, "user", session.sessionId);

      await persistAsync();

      return NextResponse.json({ ok: true });

    }



    if (body.action === "change-email") {

      const result = changeUserEmail(userId, body.newEmail, body.password);

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      return NextResponse.json({ user: toPublicUser(result.user) });

    }



    if (body.action === "inquiry") {

      const featureErr = planFeatureError(shop.plan, "inquiry");

      if (featureErr) return badRequest(featureErr);

      const inquiry = createInquiry({

        shopId: shop.id,

        userId,

        subject: body.subject,

        body: body.body,

      });

      return NextResponse.json({ inquiry });

    }



    if (body.action === "revoke-session") {

      const result = revokeAuthSession(body.sessionId, shop.id, userId);

      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      await persistAsync();

      return NextResponse.json({ ok: true });

    }



    if (body.action === "revoke-other-sessions") {

      if (!session.sessionId) return badRequest("현재 세션을 확인할 수 없습니다.");

      revokeOtherAuthSessions(shop.id, userId, "user", session.sessionId);

      await persistAsync();

      return NextResponse.json({ ok: true });

    }

    if (body.action === "delete-account") {
      const result = deleteOwnAccount(shop.id, userId, body.password);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await persistAsync();
      await clearSessionCookie(shop.slug, "user");
      return NextResponse.json({ ok: true });
    }

    return badRequest("Unknown action");

  } catch (err) {

    return serverError(err);

  }

}

