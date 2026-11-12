import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized, forbidUnlessStaffCan } from "@/lib/api";
import { verifyCaptcha } from "@/lib/captcha";
import { getUserSession } from "@/lib/session-server";
import {
  approvePointCharge,
  cancelPointCharge,
  cancelUserPointCharge,
  cleanDepositSuffix,
  createPointCharge,
  getShopSettings,
  getUserPendingBankCharge,
  initStore,
  listUserCharges,
  persistAsync,
  setUserBankDepositorName,
} from "@/lib/store";
import { expireStalePendingCharges } from "@/lib/store-ext";

const patchSchema = z.object({
  chargeId: z.string(),
  action: z.enum(["approve", "reject"]),
  depositorName: z.string().optional(),
});

const createSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(["bank", "culture_gift", "coin"]).optional(),
  captchaToken: z.string().min(1),
  depositorName: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();
  expireStalePendingCharges(shop.id);
  const charges = listUserCharges(shop.id, session.user.id);
  return NextResponse.json({ charges });
}

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) return badRequest("금액과 보안 확인을 확인하세요.");

    if (!verifyCaptcha(parsed.data.captchaToken)) {
      return badRequest("보안 확인이 만료됐어요. 다시 시도해 주세요.");
    }

    const settings = getShopSettings(shop.id);
    if (parsed.data.amount < settings.minChargeAmount) {
      return badRequest(`최소 충전 금액은 ${settings.minChargeAmount.toLocaleString()}원입니다.`);
    }

    const method = parsed.data.method ?? "bank";
    let bankDepositor = "";
    if (method === "bank") {
      if (expireStalePendingCharges(shop.id)) await persistAsync();
      const existing = getUserPendingBankCharge(shop.id, session.user.id);
      if (existing) {
        if (existing.amount !== parsed.data.amount) {
          return badRequest(
            `이미 ${existing.amount.toLocaleString()}원 충전 신청이 대기 중이에요. 그 신청을 취소한 뒤 다시 신청해 주세요.`,
          );
        }
        return NextResponse.json({ charge: existing, resumed: true });
      }
      const typed = parsed.data.depositorName?.replace(/\s+/g, " ").trim() ?? "";
      bankDepositor = typed || session.user.bankDepositorName?.trim() || "";
      if (!bankDepositor) {
        return badRequest("입금자명(은행 앱에 찍히는 보내는 분 이름)을 적어 주세요.");
      }
      if (typed) setUserBankDepositorName(session.user.id, typed, { overwrite: true });
      const suffix = cleanDepositSuffix(settings.depositSuffixPhrase);
      if (suffix && !bankDepositor.endsWith(suffix)) bankDepositor = `${bankDepositor}${suffix}`;
    }
    if (method === "culture_gift") {
      if (!settings.cultureGiftEnabled || !settings.culturelandId || !settings.culturelandPassword) {
        return badRequest("문화상품권 충전이 아직 설정되지 않았어요.");
      }
    }
    if (method === "coin") {
      if (!settings.nowpaymentsEnabled || !settings.nowpaymentsApiKey || !settings.nowpaymentsIpnSecret) {
        return badRequest("코인 충전이 아직 설정되지 않았어요.");
      }
    }

    const charge = createPointCharge(
      shop.id,
      session.user.id,
      parsed.data.amount,
      method,
      method === "bank" ? bankDepositor : null,
    );
    await persistAsync();
    return NextResponse.json({ charge });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "billing");
  if (denied) return denied;

  try {
    const json = await request.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return badRequest("Invalid payload");

    if (parsed.data.action === "approve") {
      const result = approvePointCharge(
        parsed.data.chargeId,
        shop.id,
        parsed.data.depositorName,
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await persistAsync();
      return NextResponse.json({ charge: result.charge });
    }

    const result = cancelPointCharge(parsed.data.chargeId, shop.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await persistAsync();
    return NextResponse.json({ charge: result.charge });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    let chargeId = new URL(request.url).searchParams.get("chargeId");
    if (!chargeId) {
      const json = (await request.json()) as { chargeId?: string };
      chargeId = json.chargeId ?? null;
    }
    if (!chargeId) return badRequest("chargeId required");

    const result = cancelUserPointCharge(chargeId, shop.id, session.user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await persistAsync();
    return NextResponse.json({ charge: result.charge });
  } catch (err) {
    return serverError(err);
  }
}
