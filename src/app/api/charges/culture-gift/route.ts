import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, unauthorized } from "@/lib/api";
import { redeemCultureGiftPin } from "@/lib/cultureland-charge";
import { getUserSession } from "@/lib/session-server";
import { confirmPointCharge, getPointCharge, getShopSettings, initStore, persistAsync } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

const schema = z.object({
  chargeId: z.string().uuid(),
  pin: z.string().min(10).max(30),
});

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("상품권 번호를 확인해 주세요.");

    const settings = getShopSettings(shop.id);
    if (!settings.cultureGiftEnabled || !settings.culturelandId || !settings.culturelandPassword) {
      return badRequest("문화상품권 충전이 설정되지 않았습니다.");
    }

    const lockKey = `culture-redeem:${parsed.data.chargeId}`;
    return await withLock(lockKey, async () => {
      await initStore({ force: true });
      const charge = getPointCharge(parsed.data.chargeId, shop.id);
      if (!charge || charge.userId !== session.user.id) {
        return badRequest("충전 요청을 찾을 수 없습니다.");
      }
      if (charge.method !== "culture_gift") return badRequest("문화상품권 충전 요청이 아닙니다.");
      if (charge.status !== "pending") {
        return NextResponse.json({ charge, alreadyDone: true });
      }
      if (charge.expiresAt && Date.now() > new Date(charge.expiresAt).getTime()) {
        return badRequest("충전 요청이 만료됐어요. 새로 신청해 주세요.");
      }
      // 다른 인스턴스에서 같은 신청으로 상품권을 또 쓰지 않게 표시
      if (await kvGetJson<{ at: number }>(lockKey)) {
        return badRequest("이 충전 신청은 이미 상품권을 처리하는 중이에요. 잠시 후 내역을 확인해 주세요.");
      }
      await kvPutJson(lockKey, { at: Date.now() }, 600);

      let amount: number;
      try {
        ({ amount } = await redeemCultureGiftPin(
          { id: settings.culturelandId!, password: settings.culturelandPassword! },
          parsed.data.pin,
        ));
      } catch (err) {
        await kvPutJson(lockKey, null, 60);
        throw err;
      }

      // 상품권은 이미 사용됐으니 실제 금액만큼 지급한다
      if (amount > 0) charge.amount = Math.floor(amount);
      const result = confirmPointCharge(charge.id, shop.id, "문화상품권 API", undefined, { manual: true });
      if (!result.ok) return badRequest(result.error);
      await persistAsync();
      return NextResponse.json({ charge: result.charge, redeemedAmount: amount });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "상품권 처리 실패";
    return badRequest(msg);
  }
}
