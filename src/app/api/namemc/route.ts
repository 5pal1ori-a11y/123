import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { isNameOrUuid, lookupPlayer, popularPlayers } from "@/lib/namemc";

export const dynamic = "force-dynamic";

/** 닉네임 조회 · ?q=닉네임|UUID  /  인기 · 최근 검색 · ?popular=1 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("popular")) return NextResponse.json(await popularPlayers());
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q || !isNameOrUuid(q)) return NextResponse.json({ error: "닉네임(영문 · 숫자 · _ 16자 이하) 또는 UUID를 넣어 주세요." }, { status: 400 });
  const rl = rateLimit(`namemc:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `너무 많이 조회했어요. ${rl.retryAfterSec}초 뒤에 다시 해 주세요.` }, { status: 429 });
  try {
    return NextResponse.json(await lookupPlayer(q));
  } catch (err) {
    console.error("[namemc]", err);
    return NextResponse.json({ error: "모장 서버 응답이 늦어요. 잠시 뒤에 다시 시도해 주세요." }, { status: 502 });
  }
}
