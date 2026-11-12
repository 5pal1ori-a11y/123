import { timingSafeEqual } from "crypto";
import { randomBoxGifSigs, renderIdleBoxGif, renderOpenBoxGif } from "@/lib/random-box-gif";
import { RANDOM_BOX_MAX } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gif(bytes: Uint8Array) {
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

function sameSig(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (/^idle(-[a-z]+)?\.gif$/.test(file)) return gif(renderIdleBoxGif());

  const m = /^(\d{1,5})-([0-9a-f]{16})\.gif$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  const amount = Number(m[1]);
  if (!Number.isInteger(amount) || amount < 0 || amount > RANDOM_BOX_MAX) {
    return new Response("not found", { status: 404 });
  }
  if (!randomBoxGifSigs(amount).some((sig) => sameSig(m[2]!, sig))) return new Response("not found", { status: 404 });
  return gif(renderOpenBoxGif(amount));
}
