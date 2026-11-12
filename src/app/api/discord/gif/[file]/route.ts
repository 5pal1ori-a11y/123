import { createHmac, timingSafeEqual } from "crypto";
import { doesForwardKey } from "@/lib/discord/does-forward";
import { checkinGif, gambleGif, raffleGif, type RafflePrize } from "@/lib/gif/cute-scenes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** DOES 봇 결과 GIF — 봇이 DOES_FORWARD_KEY 로 서명한 주소만 그려 준다 */
const MAX_AMOUNT = 1_000_000_000;
/** 그림이 바뀌면 봇과 함께 앞에 새 버전을 넣는다 — 디스코드가 주소별로 이미지를 오래 캐시함 */
const SIG_VERSIONS = ["gif3", "gif2", "gif"] as const;

function notFound() {
  return new Response("not found", { status: 404 });
}

function render(payload: string): Uint8Array | null {
  let m = /^(checkin|jackpot)-(\d{1,7})$/.exec(payload);
  if (m) return checkinGif(Number(m[2]), m[1] === "jackpot");
  m = /^gamble-(w|l)-(\d{1,10})$/.exec(payload);
  if (m) {
    const amount = Number(m[2]);
    return amount <= MAX_AMOUNT ? gambleGif(m[1] === "w", amount) : null;
  }
  m = /^raffle-(nitro|mc|charge|none)$/.exec(payload);
  if (m) return raffleGif(m[1] as RafflePrize);
  return null;
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([a-z0-9-]{1,40})-([0-9a-f]{16})\.gif$/.exec(file);
  if (!m) return notFound();
  const key = await doesForwardKey();
  if (!key) return notFound();
  const given = Buffer.from(m[2]!);
  const signed = SIG_VERSIONS.some((v) => {
    const expected = Buffer.from(createHmac("sha256", key).update(`${v}:${m[1]}`).digest("hex").slice(0, 16));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!signed) return notFound();
  const bytes = render(m[1]!);
  if (!bytes) return notFound();
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
