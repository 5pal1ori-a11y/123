import { normalizeUuid, profileByUuid } from "@/lib/world/minecraft";

export const dynamic = "force-dynamic";

/** 스킨 PNG 프록시 — three.js 텍스처는 같은 출처여야 깔끔하다 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  let uuid = normalizeUuid(sp.get("uuid"));
  // 구매 전 체험: 판매 중인 계정 상품의 스킨 (닉네임은 내보내지 않는다)
  const productId = sp.get("product");
  if (!uuid && productId && /^[\w-]{1,60}$/.test(productId)) {
    const [{ getProductById, initStore }, { resolveMcProfile }] = await Promise.all([import("@/lib/store"), import("@/lib/mc-profile-server")]);
    await initStore();
    const p = getProductById(productId);
    if (!p || !p.active || p.productKind !== "mc_account" || !p.mcNickname) return new Response("not found", { status: 404 });
    uuid = normalizeUuid((await resolveMcProfile(p.mcNickname).catch(() => null))?.uuid ?? null);
  }
  if (!uuid) return new Response("bad uuid", { status: 400 });
  const profile = await profileByUuid(uuid).catch(() => null);

  let upstream: string;
  if (profile?.skinUrl) {
    const url = new URL(profile.skinUrl);
    if (url.hostname !== "textures.minecraft.net") return new Response("bad host", { status: 400 });
    url.protocol = "https:";
    upstream = url.toString();
  } else {
    // Mojang 세션 서버가 Cloudflare 에서 막히는 경우가 있어 스킨 미러로 대신 받는다
    upstream = `https://mc-heads.net/skin/${uuid}`;
  }

  const res = await fetch(upstream, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) {
    return new Response("upstream", { status: 502 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=21600, s-maxage=21600",
      "x-content-type-options": "nosniff",
    },
  });
}
