import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { initStore } from "@/lib/store";
import { getApiKeyMeta, setApiKey, testHypixelKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  return NextResponse.json({ hypixel: await getApiKeyMeta("hypixel"), donut: await getApiKeyMeta("donut") }, { headers: { "cache-control": "no-store" } });
}

const schema = z.object({ name: z.enum(["hypixel", "donut"]), key: z.string().max(200) });

export async function PUT(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("키를 확인해 주세요.");
    const { name, key } = parsed.data;
    let test: { ok: boolean; message: string } | null = null;
    if (name === "hypixel" && key.trim()) {
      test = await testHypixelKey(key.trim());
      if (!test.ok) return badRequest(`하이픽셀 키가 작동하지 않아요: ${test.message}`);
    }
    await setApiKey(name, key);
    return NextResponse.json({ ok: true, test, meta: await getApiKeyMeta(name) });
  } catch (e) {
    return serverError(e);
  }
}
