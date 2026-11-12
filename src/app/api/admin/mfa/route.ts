import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  badRequest,
  forbidden,
  isShop,
  isShopAdmin,
  isShopOwnerAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import { getMfaConfig, mfaFetchStock, refreshMfaStock } from "@/lib/mfa";
import { getMfaStockCache } from "@/lib/mfa-cache";
import { secretLast4 } from "@/lib/security";
import { getShopSettings, initStore, listMfaProducts, persistAsync, saveMfaSettings } from "@/lib/store";

function snapshot(shopId: string) {
  const s = getShopSettings(shopId);
  return {
    url: s.mfaApiUrl ?? null,
    keyHint: secretLast4(s.mfaApiKey),
    configured: Boolean(getMfaConfig(shopId)),
    products: listMfaProducts(shopId).map((p) => ({
      id: p.id,
      name: p.name,
      mfaProduct: p.mfaProduct,
      stock: getMfaStockCache(p.id)?.count ?? p.mfaStock ?? null,
    })),
  };
}

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  return NextResponse.json(snapshot(shop.id));
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    url: z.string().max(300).nullable(),
    key: z.string().max(200).nullable().optional(),
  }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("refresh") }),
]);

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("잘못된 요청입니다.");
    const body = parsed.data;

    if (body.action === "save") {
      const url = body.url?.trim() || null;
      if (url) {
        let u: URL;
        try {
          u = new URL(url);
        } catch {
          return badRequest("API 주소 형식이 올바르지 않아요.");
        }
        if (u.protocol !== "https:") return badRequest("API 주소는 https:// 로 시작해야 해요.");
      }
      const key = body.key === undefined || body.key?.includes("•") ? undefined : body.key;
      saveMfaSettings(shop.id, { url: url ? new URL(url).origin : null, key });
      await persistAsync();
      return NextResponse.json(snapshot(shop.id));
    }

    const cfg = getMfaConfig(shop.id);
    if (!cfg) return badRequest("API 주소와 키를 먼저 저장해 주세요.");

    if (body.action === "test") {
      try {
        const stock = await mfaFetchStock(cfg);
        return NextResponse.json({ ok: true, ...stock });
      } catch (err) {
        return NextResponse.json(
          { ok: false, error: err instanceof Error ? err.message : "연결 실패" },
          { status: 502 },
        );
      }
    }

    const result = await refreshMfaStock(shop.id);
    return NextResponse.json({ ...snapshot(shop.id), result });
  } catch (err) {
    return serverError(err);
  }
}
