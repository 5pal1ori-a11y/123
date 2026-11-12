import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError } from "@/lib/api";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { verifyCaptcha } from "@/lib/captcha";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { establishUserSession } from "@/lib/session-login";
import {
  getShopSettings,
  initStore,
  loginUser,
  persistAsync,
  registerUser,
  toPublicUser,
} from "@/lib/store";

const registerSchema = z.object({
  email: z.string().trim().email("이메일 형식이 올바르지 않아요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 해요."),
  name: z.string().trim().min(1, "닉네임을 입력해 주세요."),
  captchaToken: z.string().min(1, "DOES CAPCHA를 먼저 확인해 주세요."),
  acceptTerms: z.literal(true),
});

const loginSchema = z.object({
  email: z.string().trim().email("이메일 형식이 올바르지 않아요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
  captchaToken: z.string().min(1, "DOES CAPCHA를 먼저 확인해 주세요."),
});

function firstZodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "입력값을 확인하세요.";
}

function verifyCaptchaOrBadRequest(token: string) {
  if (!verifyCaptcha(token)) {
    return badRequest("보안 확인이 만료됐어요. 「로봇이 아닙니다」를 다시 눌러 주세요.");
  }
  return null;
}

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  try {
    const ip = clientIp(request);
    const rl = rateLimit(`user-auth:${shop.id}:${ip}`, 20, 15 * 60_000);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

    const settings = getShopSettings(shop.id);
    const access = await evaluateShopVisitorAccess(request, settings);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const json = await request.json();
    const action = json.action as string;

    if (action === "register") {
      const parsed = registerSchema.safeParse(json);
      if (!parsed.success) {
        if (!json.acceptTerms) return badRequest("이용약관과 개인정보에 동의해 주세요.");
        return badRequest(firstZodError(parsed.error));
      }
      const captchaError = verifyCaptchaOrBadRequest(parsed.data.captchaToken);
      if (captchaError) return captchaError;
      const result = registerUser({
        shopId: shop.id,
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        ip,
        acceptedTermsVersion: settings.termsVersion,
        acceptedPrivacyVersion: settings.privacyVersion,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await persistAsync();
      const response = NextResponse.json({ user: toPublicUser(result.user) });
      await establishUserSession(request, shop, result.user.id, response);
      return response;
    }

    if (action === "login") {
      const parsed = loginSchema.safeParse(json);
      if (!parsed.success) return badRequest(firstZodError(parsed.error));
      const captchaError = verifyCaptchaOrBadRequest(parsed.data.captchaToken);
      if (captchaError) return captchaError;
      const user = loginUser(shop.id, parsed.data.email, parsed.data.password);
      if (!user) {
        return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
      }
      const response = NextResponse.json({ user: toPublicUser(user) });
      await establishUserSession(request, shop, user.id, response);
      return response;
    }

    return badRequest("알 수 없는 action");
  } catch (err) {
    return serverError(err);
  }
}
