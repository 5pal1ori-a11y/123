import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { COINS, listCoinOrders } from "@/lib/coin-trade";

/** 웹 코인대행 — 내 주문 목록 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const mine = (await listCoinOrders(shop.id))
      .filter((o) => o.userId === session.user.id && o.status !== "quote")
      .slice(0, 20)
      .map((o) => ({
        id: o.id,
        coin: o.coin,
        coinAmount: o.coinAmount,
        krw: o.krw,
        status: o.status,
        address: o.address,
        txid: o.txid,
        explorer: o.txid ? COINS[o.coin].explorer(o.txid) : null,
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: mine, points: session.user.points });
  } catch (err) {
    return serverError(err);
  }
}
