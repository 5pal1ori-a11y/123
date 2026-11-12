import { BANNER_FILES } from "@/lib/gif/banners";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cache = new Map<string, Uint8Array>();

/** /임배드 상품 카드 배너 — 그림이 바뀌면 파일 이름의 숫자를 올린다 */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const render = BANNER_FILES[file];
  if (!render) return new Response("not found", { status: 404 });
  let bytes = cache.get(file);
  if (!bytes) {
    bytes = render();
    cache.set(file, bytes);
  }
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
