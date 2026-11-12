import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { createNowPayment } from "@/lib/nowpayments";
import { getUserSession } from "@/lib/session-server";
import {
  attachChargePayment,
  getPointCharge,
  getShopSettings,
  initStore,
  persistAsync,
} from "@/lib/store";

const schema = z.object({
  chargeId: z.string().uuid(),
});

function appOrigin(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("요청 형식이 올바르지 않습니다.");

    const settings = getShopSettings(shop.id);
    if (!settings.nowpaymentsEnabled || !settings.nowpaymentsApiKey || !settings.nowpaymentsIpnSecret) {
      return badRequest("코인 결제 API가 설정되지 않았습니다.");
    }

    const charge = getPointCharge(parsed.data.chargeId, shop.id);
    if (!charge || charge.userId !== session.user.id) {
      return badRequest("충전 요청을 찾을 수 없습니다.");
    }
    if (charge.method !== "coin") return badRequest("코인 충전 요청이 아닙니다.");
    if (charge.status !== "pending") {
      return NextResponse.json({
        charge,
        payment: charge.payAddress
          ? {
              payAddress: charge.payAddress,
              payAmount: charge.payAmount,
              payCurrency: charge.payCurrency,
              nowpaymentsId: charge.nowpaymentsId,
            }
          : null,
      });
    }

    if (charge.payAddress && charge.nowpaymentsId) {
      return NextResponse.json({
        charge,
        payment: {
          payAddress: charge.payAddress,
          payAmount: charge.payAmount,
          payCurrency: charge.payCurrency,
          nowpaymentsId: charge.nowpaymentsId,
        },
      });
    }

    const ipnUrl = `${appOrigin(request)}/api/webhooks/nowpayments?shop=${encodeURIComponent(shop.slug)}`;
    const payment = await createNowPayment(
      {
        apiKey: settings.nowpaymentsApiKey,
        ipnSecret: settings.nowpaymentsIpnSecret,
      },
      {
        orderId: charge.id,
        amountKrw: charge.amount,
        payCurrency: settings.nowpaymentsPayCurrency ?? "usdttrc20",
        ipnCallbackUrl: ipnUrl,
        orderDescription: `${shop.name} 포인트 충전`,
      },
    );

    const updated = attachChargePayment(charge.id, shop.id, {
      nowpaymentsId: String(payment.payment_id),
      payAddress: payment.pay_address,
      payAmount: payment.pay_amount,
      payCurrency: payment.pay_currency,
    });
    await persistAsync();

    return NextResponse.json({
      charge: updated,
      payment: {
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        payCurrency: payment.pay_currency,
        nowpaymentsId: String(payment.payment_id),
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
