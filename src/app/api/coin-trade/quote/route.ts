import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { COINS, createCoinQuote, type CoinKey } from "@/lib/coin-trade";
import { identityVerifyRequired, isUserVerified } from "@/lib/identity-verify";

const schema = z.object({
  coin: z.string(),
  krw: z.number().int(),
  address: z.string().min(10).max(120),
});

/** 웹 코인대행 — 견적 생성 (포인트는 아직 안 빠짐) */
export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !(parsed.data.coin in COINS)) return badRequest("입력을 확인해 주세요.");
    const coin = parsed.data.coin as CoinKey;

    // 본인인증 게이트
    if (await identityVerifyRequired(shop.id)) {
      if (!(await isUserVerified(shop.id, session.user.id))) {
        return NextResponse.json({ needVerify: true, error: "먼저 본인인증이 필요해요." }, { status: 403 });
      }
    }

    const user = session.user;
    const o = await createCoinQuote(
      shop.id,
      { id: user.id, discordId: user.discordId, totalCoinSpent: user.totalCoinSpent, vipTier: user.vipTier },
      coin,
      parsed.data.krw,
      parsed.data.address,
    );
    if (user.points < o.krw) {
      return badRequest(`포인트가 부족해요. 필요 ${o.krw.toLocaleString("ko-KR")}P · 보유 ${user.points.toLocaleString("ko-KR")}P`);
    }
    return NextResponse.json({
      id: o.id,
      coin: o.coin,
      coinAmount: o.coinAmount,
      krw: o.krw,
      rate: o.rate,
      rateSource: o.rateSource,
      feePercent: o.feePercent,
      address: o.address,
      network: COINS[o.coin].network,
      quoteExpiresAt: o.quoteExpiresAt,
      balance: user.points,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
