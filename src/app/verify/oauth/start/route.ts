import { NextResponse } from "next/server";
import { getOAuthRedirectOrigin } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Legacy verify.* path → apex OAuth start (cookie + redirect_uri same host). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dest = new URL(
    `${getOAuthRedirectOrigin().replace(/\/$/, "")}/api/verify-bot/oauth/start`,
  );
  url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  return NextResponse.redirect(dest.toString(), 302);
}
