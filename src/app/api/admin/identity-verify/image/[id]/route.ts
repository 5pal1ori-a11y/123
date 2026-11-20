import { isShop, isShopAdmin, requireShop } from "@/lib/api";
import { initStore } from "@/lib/store";
import { getVerificationImage } from "@/lib/identity-verify";

export const dynamic = "force-dynamic";

/** 신분증 사진 — 관리자만 조회. 캐시 금지. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (!/^idv_[a-z0-9]{1,30}$/.test(id)) return new Response("not found", { status: 404 });

  const img = await getVerificationImage(shop.id, id);
  if (!img || !img.base64) return new Response("not found", { status: 404 });

  try {
    const bytes = Buffer.from(img.base64, "base64");
    return new Response(bytes, {
      headers: {
        "content-type": img.type || "image/jpeg",
        "cache-control": "no-store, private",
        "content-disposition": "inline",
      },
    });
  } catch {
    return new Response("error", { status: 500 });
  }
}
