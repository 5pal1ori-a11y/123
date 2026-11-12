import { NextResponse } from "next/server";
import { createCaptchaChallenge, solveCaptcha } from "@/lib/captcha";

export const dynamic = "force-dynamic";

export async function GET() {
  const { token } = createCaptchaChallenge();
  return NextResponse.json({ token });
}

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as { token?: string };
    const solved = solveCaptcha(json.token ?? "");
    if (!solved) {
      return NextResponse.json({ error: "확인이 만료됐어요. 다시 눌러 주세요." }, { status: 400 });
    }
    return NextResponse.json({ passToken: solved.passToken });
  } catch {
    return NextResponse.json({ error: "확인에 실패했어요." }, { status: 400 });
  }
}
