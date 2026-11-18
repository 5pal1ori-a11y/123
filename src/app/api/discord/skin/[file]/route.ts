import { fetchImage, skinRenderUrls } from "@/lib/mc-profile-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 디스코드 판매 글용 스킨 이미지 — 외부 렌더 사이트를 대신 불러 준다 (UUID 만 받음) */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([0-9a-f]{32})\.png$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  const img = await fetchImage(skinRenderUrls(m[1]!));
  return img ?? new Response("unavailable", { status: 502 });
}
