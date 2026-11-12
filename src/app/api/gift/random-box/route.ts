import { NextResponse } from "next/server";
import { assertSameOrigin, isShop, requireShop, unauthorized } from "@/lib/api";
import { getRandomBoxResultToday, openRandomBoxOnce } from "@/lib/random-box-claim";
import { getUserSession } from "@/lib/session-server";
import { getRandomBoxHistory, initStore, listTodayRandomBoxDraws } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function payload(
  shopId: string,
  userId: string,
  claimed: boolean,
  amount: number | null,
  jackpot: boolean,
  balance: number,
  already: boolean,
  dayKey: string | null,
) {
  const draws = listTodayRandomBoxDraws(shopId);
  const top = draws[0] ? Math.max(...draws.map((d) => d.amount)) : 0;
  return {
    claimed,
    amount,
    jackpot,
    balance,
    already,
    dayKey,
    draws,
    stats: {
      opened: draws.length,
      jackpots: draws.filter((d) => d.jackpot).length,
      top,
    },
    history: getRandomBoxHistory(shopId, userId),
  };
}

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  const done = await getRandomBoxResultToday(shop.id, session.user);
  return NextResponse.json(
    payload(
      shop.id,
      session.user.id,
      Boolean(done),
      done?.amount ?? null,
      done?.jackpot ?? false,
      session.user.points,
      Boolean(done),
      done?.dayKey ?? null,
    ),
  );
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  const result = await openRandomBoxOnce(shop.id, session.user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(
    payload(
      shop.id,
      session.user.id,
      true,
      result.amount,
      result.jackpot,
      result.balance,
      result.already,
      result.dayKey,
    ),
  );
}
