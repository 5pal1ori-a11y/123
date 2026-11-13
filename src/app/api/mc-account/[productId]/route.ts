import { NextResponse } from "next/server";
import { getProductById, initStore } from "@/lib/store";
import { fetchImage, resolveMcProfile, skinRenderUrls } from "@/lib/mc-profile-server";
import type { McAccountInfo } from "@/lib/mc-account";

/**
 * GET /api/mc-account/:productId            → { ok, capes: [{source, baseWidth}] }
 * GET /api/mc-account/:productId?asset=skin → 스킨 3D 렌더 이미지
 * GET /api/mc-account/:productId?asset=cape&i=0 → 망토 텍스처 이미지
 * 닉네임은 응답에 포함하지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  await initStore();
  const { productId } = await context.params;
  const product = getProductById(productId);
  if (!product || !product.active || product.productKind !== "mc_account" || !product.mcNickname) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const profile = await resolveMcProfile(product.mcNickname);
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");

  if (asset === "skin") {
    const img = await fetchImage(skinRenderUrls(profile?.uuid ?? product.mcNickname));
    return img ?? new NextResponse(null, { status: 502 });
  }

  if (asset === "cape") {
    const i = Number(url.searchParams.get("i") ?? "0");
    const cape = profile?.capes[i];
    if (!cape) return new NextResponse(null, { status: 404 });
    const img = await fetchImage([cape.url]);
    return img ?? new NextResponse(null, { status: 502 });
  }

  const body: McAccountInfo = {
    ok: Boolean(profile?.uuid),
    capes: (profile?.capes ?? []).map(({ source, baseWidth }) => ({ source, baseWidth })),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
  });
}
