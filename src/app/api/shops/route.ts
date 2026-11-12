import { NextResponse } from "next/server";
import { serverError } from "@/lib/api";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { initStore, listShops } from "@/lib/store";

export async function GET() {
  await initStore();
  const shops = listShops().map((s) => ({
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    createdAt: s.createdAt,
  }));
  return NextResponse.json({ shops });
}

export async function POST(request: Request) {
  try {
    const rl = rateLimit(`shop-create:${clientIp(request)}`, 5, 60 * 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

    // 상점 개설은 Discord 소유 서버 선택 경로만 허용
    return NextResponse.json(
      {
        error:
          "상점 개설은 Discord 로그인 후, 소유자인 서버를 선택해서 진행해 주세요.",
        redirect: "/admin/discord",
      },
      { status: 403 },
    );
  } catch (err) {
    return serverError(err);
  }
}
