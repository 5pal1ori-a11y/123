import { NextResponse } from "next/server";
import { isNowPaymentCompleted, verifyNowPaymentsIpnSignature } from "@/lib/nowpayments";
import {
  confirmPointCharge,
  findShopBySlug,
  getPointCharge,
  getShopSettings,
  initStore,
  persistAsync,
} from "@/lib/store";

export async function POST(request: Request) {
  await initStore();

  const url = new URL(request.url);
  const shopSlug = url.searchParams.get("shop");
  if (!shopSlug) return NextResponse.json({ error: "shop required" }, { status: 400 });

  const shop = findShopBySlug(shopSlug);
  if (!shop) return NextResponse.json({ error: "shop not found" }, { status: 404 });

  const settings = getShopSettings(shop.id);
  if (!settings.nowpaymentsIpnSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }

  const bodyText = await request.text();
  const signature = request.headers.get("x-nowpayments-sig");

  const valid = await verifyNowPaymentsIpnSignature(
    settings.nowpaymentsIpnSecret,
    bodyText,
    signature,
  );
  if (!valid) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: {
    payment_status?: string;
    order_id?: string;
    payment_id?: string | number;
  };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.order_id || !isNowPaymentCompleted(payload.payment_status ?? "")) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const charge = getPointCharge(payload.order_id, shop.id);
  if (!charge || charge.status === "completed") {
    return NextResponse.json({ ok: true });
  }
  if (charge.method !== "coin") {
    return NextResponse.json({ error: "invalid charge method" }, { status: 400 });
  }

  const priceAmount = (payload as { price_amount?: number }).price_amount;
  if (typeof priceAmount === "number" && Math.abs(priceAmount - charge.amount) > 1) {
    return NextResponse.json({ error: "amount mismatch" }, { status: 400 });
  }

  const result = confirmPointCharge(charge.id, shop.id, "NOWPayments", charge.amount);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await persistAsync();
  return NextResponse.json({ ok: true, chargeId: charge.id });
}
