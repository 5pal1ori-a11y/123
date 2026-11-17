import { getShopBySlug, initStore } from "@/lib/store";
import { renderRankImage } from "@/lib/discord/rank-image";

export const dynamic = "force-dynamic";

/** GET /api/discord/rank-image/<상점>-<해시>.png → 구매 랭킹 PNG (해시는 디스코드 캐시 깨기용) */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  await initStore();
  const img = (res: Response | null, maxAge = 86400) =>
    res ? new Response(res.body, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}` } }) : new Response("unavailable", { status: 502 });
  const rs = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-restock-([A-Za-z0-9_]{4,40})-(\d{1,7})-(\d{1,7})\.png$/.exec(file);
  if (rs) {
    const { renderRestockImage } = await import("@/lib/discord/rank-image");
    return img(await renderRestockImage(rs[2], Number(rs[3]), Number(rs[4])).catch(() => null));
  }
  const rc = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-receipt-([A-Za-z0-9_-]{6,64})\.png$/.exec(file);
  if (rc) {
    const shop = getShopBySlug(rc[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderReceiptImage } = await import("@/lib/discord/rank-image");
    return img(await renderReceiptImage(shop.id, rc[2]).catch(() => null));
  }
  const pf = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-profile-(\d{15,25})-([0-9a-f]{12})\.png$/.exec(file);
  if (pf) {
    const shop = getShopBySlug(pf[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderProfileImage } = await import("@/lib/discord/rank-image");
    return img(await renderProfileImage(shop.id, pf[2], pf[3]).catch(() => null), 3600);
  }
  const rv = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-review-([0-9a-f-]{36})\.png$/.exec(file);
  if (rv) {
    const shop = getShopBySlug(rv[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderReviewImage } = await import("@/lib/discord/rank-image");
    const res = await renderReviewImage(shop.id, rv[2]).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" } });
  }
  const wl = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-welcome-(\d{1,25})-(\d{15,25})-(\d{1,9})-((?:a_)?[0-9a-f]{32}|0)\.png$/.exec(file);
  if (wl) {
    const shop = getShopBySlug(wl[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { getShopSettings, MFA_DISCORD_GUILD_ID } = await import("@/lib/store");
    const guildId = wl[2] !== "0" ? wl[2] : getShopSettings(shop.id).discordGuildId || MFA_DISCORD_GUILD_ID;
    const { renderWelcomeImage } = await import("@/lib/discord/rank-image");
    const res = await renderWelcomeImage(shop.id, guildId, wl[3], Number(wl[4]), wl[5]).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" } });
  }
  const ch = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-charge-([A-Za-z0-9_-]{4,64})\.png$/.exec(file);
  if (ch) {
    const shop = getShopBySlug(ch[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const balance = Number(new URL(request.url).searchParams.get("b") ?? 0) || 0;
    const { renderChargeLogImage } = await import("@/lib/discord/rank-image");
    const res = await renderChargeLogImage(shop.id, ch[2], balance).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" } });
  }
  const od = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-order-([A-Za-z0-9_-]{6,64})\.png$/.exec(file);
  if (od) {
    const shop = getShopBySlug(od[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderPurchaseLogImage } = await import("@/lib/discord/rank-image");
    const res = await renderPurchaseLogImage(shop.id, od[2]).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" } });
  }
  const ad = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-status-([0-9a-f]{12})\.png$/.exec(file);
  if (ad) {
    const shop = getShopBySlug(ad[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderStatusImage } = await import("@/lib/discord/rank-image");
    const res = await renderStatusImage(shop.id).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=600" } });
  }
  const st = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-stock-(?:(\d{1,2})-)?([0-9a-f]{12})\.png$/.exec(file);
  if (st) {
    const shop = getShopBySlug(st[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { renderStockImage } = await import("@/lib/discord/rank-image");
    const res = await renderStockImage(shop.id, Number(st[2] ?? 0)).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=600" } });
  }
  const q = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-q-(\d{15,25})-([0-9a-f]{12})\.png$/.exec(file);
  if (q) {
    const shop = getShopBySlug(q[1]);
    if (!shop) return new Response("not found", { status: 404 });
    const { queueImageDataFor } = await import("@/lib/discord/ticket-queue");
    const { renderQueueImage } = await import("@/lib/discord/rank-image");
    const res = await renderQueueImage(await queueImageDataFor(shop.id, q[2])).catch(() => null);
    if (!res) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=600" } });
  }
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-inv-(\d{15,25}))?-([0-9a-f]{12})\.png$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  const shop = getShopBySlug(m[1]);
  if (!shop) return new Response("not found", { status: 404 });
  const res = await renderRankImage(shop.id, m[2] ?? null).catch(() => null);
  if (!res) return new Response("unavailable", { status: 502 });
  return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600, s-maxage=3600" } });
}
