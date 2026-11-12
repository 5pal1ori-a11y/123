import { NextResponse } from "next/server";
import { microsoftEnv } from "@/lib/microsoft-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 로그인 화면이 Microsoft 버튼을 켤지 정할 때 쓴다 (값은 노출하지 않는다) */
export function GET() {
  return NextResponse.json({ user: microsoftEnv().configured });
}
