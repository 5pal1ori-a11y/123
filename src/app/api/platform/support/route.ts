import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  isShop,
  isShopAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import {
  createPlatformSupportMessage,
  listPlatformSupportForShop,
  listPlatformSupportInbox,
  replyPlatformSupport,
  setPlatformSupportAiReply,
} from "@/lib/store-admin";
import { generateVendixSupportReply } from "@/lib/vendix-support-ai";

const postSchema = z.object({
  body: z.string().min(1).max(4000),
  senderEmail: z.string().email().optional(),
});

const replySchema = z.object({
  id: z.string().min(1),
  reply: z.string().min(1).max(4000),
});

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);

  if (url.searchParams.get("scope") === "platform") {
    if (!getPlatformAdminFromRequest(request)) return unauthorized();
    return NextResponse.json({ messages: listPlatformSupportInbox() });
  }

  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();

  return NextResponse.json({ messages: listPlatformSupportForShop(shop.id) });
}

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();

  try {
    const json = await request.json();
    const parsed = postSchema.safeParse(json);
    if (!parsed.success) return badRequest("문의 내용을 입력해 주세요.");

    const recentThread = listPlatformSupportForShop(shop.id)
      .slice(0, 6)
      .map((m) => ({
        body: m.body,
        aiReply: m.aiReply,
        reply: m.reply,
      }));

    const aiReply = await generateVendixSupportReply({
      body: parsed.data.body,
      shopName: shop.name,
      shopSlug: shop.slug,
      recentThread,
    });

    const msg = createPlatformSupportMessage({
      shopId: shop.id,
      shopSlug: shop.slug,
      shopName: shop.name,
      senderEmail: parsed.data.senderEmail ?? `admin@${shop.slug}.vendix.team`,
      body: parsed.data.body,
      aiReply,
    });
    // ensure AI fields persisted even if create path skipped
    if (!msg.aiReply) setPlatformSupportAiReply(msg.id, aiReply);
    await persistAsync();
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request) {
  await initStore();
  if (!getPlatformAdminFromRequest(request)) return unauthorized();

  try {
    const json = await request.json();
    const parsed = replySchema.safeParse(json);
    if (!parsed.success) return badRequest("답변 내용을 입력해 주세요.");

    const msg = replyPlatformSupport(parsed.data.id, parsed.data.reply);
    if (!msg) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
    await persistAsync();
    return NextResponse.json({ message: msg });
  } catch (err) {
    return serverError(err);
  }
}
