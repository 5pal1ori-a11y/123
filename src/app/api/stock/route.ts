import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { leaderboard, myPortfolio, START_DC, stockAssets, trade, TRADE_FEE } from "@/lib/mock-stock";

/** 모의투자 — 종목 · 랭킹 (로그인하면 내 포트폴리오) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  try {
    const session = await getUserSession(shop.slug, request);
    const name = session ? session.user.discordUsername || session.user.name || "회원" : "";
    const [assets, top, mine] = await Promise.all([
      stockAssets(shop.id),
      leaderboard(shop.id),
      session ? myPortfolio(shop.id, session.user.id, name) : Promise.resolve(null),
    ]);
    return NextResponse.json({ startDc: START_DC, fee: TRADE_FEE, assets, leaderboard: top, mine });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({ side: z.enum(["buy", "sell"]), asset: z.string().min(1).max(80), amount: z.number().positive() });

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("입력을 확인해 주세요.");
    const name = session.user.discordUsername || session.user.name || "회원";
    await trade(shop.id, { id: session.user.id, name }, parsed.data.side, parsed.data.asset, parsed.data.amount);
    return NextResponse.json({ ok: true, mine: await myPortfolio(shop.id, session.user.id, name) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
