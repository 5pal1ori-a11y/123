import { getShopBySlug, initStore } from "@/lib/store";
import { renderRankImage } from "@/lib/discord/rank-image";

export const dynamic = "force-dynamic";

/** GET /api/discord/rank-image/<상점>-<해시>.png → 구매 랭킹 PNG (해시는 디스코드 캐시 깨기용) */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-inv-(\d{15,25}))?-([0-9a-f]{12})\.png$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  await initStore();
  const shop = getShopBySlug(m[1]);
  if (!shop) return new Response("not found", { status: 404 });
  const res = await renderRankImage(shop.id, m[2] ?? null).catch(() => null);
  if (!res) return new Response("unavailable", { status: 502 });
  return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
