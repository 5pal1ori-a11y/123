import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { initStore, purchaseLicense } from "@/lib/store";
import { getPlatformBank } from "@/lib/bank";
import { LICENSE_PLAN_FEATURES, LICENSE_PLAN_LABELS, LICENSE_PLAN_ORDER, LICENSE_PLAN_PRICES, PAID_LICENSE_PLANS } from "@/lib/plans";

export async function GET() {
  await initStore();
  return NextResponse.json({
    plans: LICENSE_PLAN_ORDER.map((plan) => ({
      plan,
      label: LICENSE_PLAN_LABELS[plan],
      price: LICENSE_PLAN_PRICES[plan],
      billing: plan === "free" ? "free" : "monthly",
      features: LICENSE_PLAN_FEATURES[plan],
    })),
    paidPlans: PAID_LICENSE_PLANS,
    bank: getPlatformBank(),
    paymentMethod: "transfer",
  });
}

const schema = z.object({
  buyerEmail: z.string().email(),
  plan: z.enum(["lite", "pro", "pro_max"]).default("lite"),
});

export async function POST(request: Request) {
  try {
    await initStore();
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("이메일과 플랜을 확인해주세요.");

    const license = purchaseLicense(parsed.data.buyerEmail, parsed.data.plan);
    return NextResponse.json(
      {
        license: {
          id: license.id,
          buyerEmail: license.buyerEmail,
          plan: license.plan,
          amount: license.amount,
          status: license.status,
          createdAt: license.createdAt,
        },
        bank: getPlatformBank(),
        reference: license.id.slice(0, 8).toUpperCase(),
      },
      { status: 201 },
    );
  } catch (err) {
    return serverError(err);
  }
}
