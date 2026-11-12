import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError } from "@/lib/api";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { establishAdminSession } from "@/lib/session-login";
import { initStore, persistAsync, verifyShopAdmin } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  try {
    const ip = clientIp(request);
    const rl = rateLimit(`admin-login:${shop.id}:${ip}`, 12, 15 * 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

    const json = await request.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("아이디와 비밀번호를 입력하세요.");

    const verified = verifyShopAdmin(shop.slug, parsed.data.username, parsed.data.password);
    if (!verified) {
      return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    await establishAdminSession(request, shop, verified.adminUsername, response);
    await persistAsync();
    return response;
  } catch (err) {
    return serverError(err);
  }
}
