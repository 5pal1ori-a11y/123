/**
 * 코인대행 송금 중계 서버(relay/coin-payout) → 송금 결과 알림.
 * 본문: { orderId, ok, txid?, payoutId?, error? } · 서명: x-relay-ts / x-relay-sig (HMAC-SHA256, COIN_RELAY_SECRET)
 */
import { NextResponse } from "next/server";
import { coinRelayConfig, relayVerify } from "@/lib/coin-trade";
import { findShopBySlug, initStore } from "@/lib/store";

export async function POST(request: Request) {
  const cfg = await coinRelayConfig();
  if (!cfg) return NextResponse.json({ error: "not configured" }, { status: 400 });
  const body = await request.text();
  if (!relayVerify(cfg.secret, request.headers.get("x-relay-ts"), body, request.headers.get("x-relay-sig"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let p: { orderId?: string; ok?: boolean; txid?: string | null; payoutId?: string | null; error?: string };
  try {
    p = JSON.parse(body) as typeof p;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slug = new URL(request.url).searchParams.get("shop");
  if (!slug || !p.orderId) return NextResponse.json({ error: "bad request" }, { status: 400 });

  await initStore({ force: true });
  const shop = findShopBySlug(slug);
  if (!shop) return NextResponse.json({ error: "shop not found" }, { status: 404 });

  const { applyRelayResult } = await import("@/lib/discord/coin-trade");
  try {
    const order = await applyRelayResult(
      shop.id,
      p.orderId,
      p.ok
        ? { ok: true, txid: p.txid ?? null, payoutId: p.payoutId ?? null }
        : { ok: false, error: p.error || "송금 실패", payoutId: p.payoutId ?? null },
    );
    return NextResponse.json({ ok: true, status: order.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
