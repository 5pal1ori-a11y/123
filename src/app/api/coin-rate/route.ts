import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { COIN_MAX_KRW, COIN_MIN_KRW, COINS, fetchKrwRate, getVipFeePercent, getVipTier, type CoinKey } from "@/lib/coin-trade";

export const dynamic = "force-dynamic";

/** 공개 시세 API — 계산기용. 로그인돼 있으면 내 VIP 수수료를 함께 내려준다. */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  if (new URL(request.url).searchParams.get("wallet") === "1") {
    // 연결 확인용 — 키가 맞는지 · 어느 방식인지 (금액은 패널에도 공개되는 재고 합계만)
    const [{ nowpaymentsBalanceDetailed, nowpaymentsPayoutConfig }, { coinPayoutMode, coinWalletKrw }] = await Promise.all([
      import("@/lib/coin-payout-direct"),
      import("@/lib/coin-trade"),
    ]);
    const cfg = await nowpaymentsPayoutConfig();
    const bal = await nowpaymentsBalanceDetailed();
    return NextResponse.json({
      apiKey: Boolean(cfg.apiKey),
      payoutReady: cfg.configured,
      mode: await coinPayoutMode(),
      balanceOk: bal.ok,
      coins: bal.balances ? Object.keys(bal.balances) : [],
      stockKrw: bal.ok ? await coinWalletKrw().catch(() => null) : null,
      error: bal.error,
    });
  }
  if (new URL(request.url).searchParams.get("premium") === "1") {
    const { kimchiPremiumInfo } = await import("@/lib/coin-trade");
    return NextResponse.json(await kimchiPremiumInfo());
  }
  const coin = new URL(request.url).searchParams.get("coin") as CoinKey | null;
  if (!coin || !(coin in COINS)) return NextResponse.json({ error: "코인을 선택해 주세요." }, { status: 400 });

  try {
    const { rate, source } = await fetchKrwRate(coin);

    // 로그인 상태면 VIP 수수료, 아니면 기본 수수료
    let feePercent = getVipFeePercent(0);
    let vipTier = 0;
    const session = await getUserSession(shop.slug, request).catch(() => null);
    if (session) {
      vipTier = session.user.vipTier ?? getVipTier(session.user.totalCoinSpent ?? 0);
      feePercent = getVipFeePercent(vipTier);
    }

    return NextResponse.json({
      coin,
      name: COINS[coin].name,
      network: COINS[coin].network,
      decimals: COINS[coin].decimals,
      rate,
      source,
      feePercent,
      vipTier,
      min: COIN_MIN_KRW,
      max: COIN_MAX_KRW,
    });
  } catch (err) {
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 503 });
    return serverError(err);
  }
}
