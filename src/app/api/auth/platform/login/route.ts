import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { verifyPlatformAdminAsync } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { setPlatformAdminSession } from "@/lib/session-server";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const rl = rateLimit(`platform-login:${clientIp(request)}`, 5, 15 * 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("아이디와 비밀번호를 입력하세요.");

    if (!(await verifyPlatformAdminAsync(parsed.data.username, parsed.data.password))) {
      return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
    }

    await setPlatformAdminSession(parsed.data.username.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
