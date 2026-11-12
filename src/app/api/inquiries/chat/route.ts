import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import {
  appendInquiryAiMessage,
  appendInquiryUserMessage,
  getLatestInquiryForUser,
  initStore,
  listUserInquiries,
  persistAsync,
} from "@/lib/store";
import { generateShopInquiryReply } from "@/lib/shop-inquiry-ai";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { getShopSettings } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const inquiry = getLatestInquiryForUser(shop.id, session.user.id);
  const history = listUserInquiries(shop.id, session.user.id);
  return NextResponse.json({ inquiry, history });
}

const postSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  const settings = getShopSettings(shop.id);
  const access = await evaluateShopVisitorAccess(request, settings);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("내용을 입력해 주세요.");

  const { inquiry } = appendInquiryUserMessage(shop.id, session.user.id, parsed.data.body);
  if (inquiry.aiEnabled) {
    const aiText = await generateShopInquiryReply({
      shopId: shop.id,
      query: parsed.data.body,
      messages: inquiry.messages,
    });
    appendInquiryAiMessage(shop.id, inquiry.id, aiText);
  }
  await persistAsync();
  const latest = getLatestInquiryForUser(shop.id, session.user.id) ?? inquiry;
  return NextResponse.json({ inquiry: latest });
}
