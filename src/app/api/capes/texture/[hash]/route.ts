export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Mojang 텍스처(스킨·망토) 중계 — 브라우저 WebGL 이 CORS 없이 쓸 수 있게 같은 도메인으로 내려준다 */
export async function GET(_request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  if (!/^[0-9a-f]{40,64}$/.test(hash)) return new Response("not found", { status: 404 });
  try {
    const res = await fetch(`https://textures.minecraft.net/texture/${hash}`, { headers: { "User-Agent": "VendixShop/1.0" } });
    if (!res.ok) return new Response("unavailable", { status: 502 });
    return new Response(res.body, {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch {
    return new Response("unavailable", { status: 502 });
  }
}
