import { timingSafeEqual } from "crypto";
import { gachaIdleGif, gachaResultGif, type GachaOutcome } from "@/lib/gif/night-scenes";
import { gachaGifSig } from "@/lib/discord/gacha";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gif(bytes: Uint8Array, cache = "public, max-age=86400") {
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: { "content-type": "image/gif", "cache-control": cache },
  });
}

/** /랜덤뽑기 그림 — idle.gif 는 패널, 결과는 서명된 주소만 그려 준다 */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (file === "idle-1.gif") return gif(gachaIdleGif());
  const m = /^(p(\d{1,8})|item|none)-([0-9a-f]{16})\.gif$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  const key = m[1]!;
  const expected = Buffer.from(gachaGifSig(key));
  const given = Buffer.from(m[3]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return new Response("not found", { status: 404 });
  const outcome: GachaOutcome = m[2] ? { kind: "points", amount: Number(m[2]) } : key === "item" ? { kind: "item" } : { kind: "none" };
  return gif(gachaResultGif(outcome));
}
