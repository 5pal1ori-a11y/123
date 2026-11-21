import { getProductById, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 액티비티 안에서는 외부 이미지를 바로 못 불러서, 상품 썸네일만 대신 불러 준다 (상품 ID 로만 — 아무 주소나 받지 않음) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await initStore();
  const url = getProductById(id)?.thumbnail;
  if (!url || !/^https:\/\//.test(url)) return new Response("not found", { status: 404 });
  try {
    const res = await fetch(url, { headers: { Accept: "image/*", "User-Agent": "DOES-activity/1.0" }, signal: AbortSignal.timeout(8000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response("unavailable", { status: 502 });
    return new Response(res.body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  } catch {
    return new Response("unavailable", { status: 502 });
  }
}
