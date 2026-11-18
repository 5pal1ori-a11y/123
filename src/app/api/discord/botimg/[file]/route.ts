import { createHmac, timingSafeEqual } from "crypto";
import { doesForwardKey } from "@/lib/discord/does-forward";
import { renderBotImage } from "@/lib/discord/rank-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DOES 커뮤니티 봇(discord-shop-bot) 이 쓰는 이미지 — 봇이 DOES_FORWARD_KEY 로 서명한 주소만 그린다.
 * 주소: /api/discord/botimg/<base64url JSON>-<HMAC 앞 16자>.png  (서명 대상 "img1:<base64url>")
 */
const BOT_KINDS = new Set(["att_shop", "att_result"]);

function notFound() {
  return new Response("not found", { status: 404 });
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([A-Za-z0-9_-]{8,1900})-([0-9a-f]{16})\.png$/.exec(file);
  if (!m) return notFound();
  const key = await doesForwardKey();
  if (!key) return notFound();
  const expected = Buffer.from(createHmac("sha256", key).update(`img1:${m[1]}`).digest("hex").slice(0, 16));
  const given = Buffer.from(m[2]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return notFound();
  let data: { kind?: string };
  try {
    data = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")) as { kind?: string };
  } catch {
    return notFound();
  }
  if (!data || typeof data.kind !== "string" || !BOT_KINDS.has(data.kind)) return notFound();
  const res = await renderBotImage(data).catch(() => null);
  if (!res) return new Response("unavailable", { status: 502 });
  return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=86400" } });
}
