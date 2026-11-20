import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError } from "@/lib/api";
import { initStore } from "@/lib/store";
import { appraiseAccount } from "@/lib/buyback";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";

const schema = z.object({ nickname: z.string().min(3).max(16) });

/** 예상 매입가 조회 (로그인 없이도 가능) */
export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  try {
    const rl = rateLimit(`buyback-appraise:${clientIp(request)}`, 12, 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("닉네임을 확인해 주세요.");
    const a = await appraiseAccount(shop.id, parsed.data.nickname);
    if (!a.ok) return badRequest("마인크래프트 정품 계정을 찾지 못했어요.");
    return NextResponse.json({ appraisal: { ...a, uuid: a.uuid ? a.uuid.replace(/-/g, "").slice(0, 8) : null } });
  } catch (err) {
    return serverError(err);
  }
}
