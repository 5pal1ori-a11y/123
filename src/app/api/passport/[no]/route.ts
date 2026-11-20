import { NextResponse } from "next/server";
import { getShopById, initStore } from "@/lib/store";
import { buildPassport, lookupPassport, passportImageUrl } from "@/lib/passport";

export const dynamic = "force-dynamic";

/** 여권 진위 확인 — 번호로 찾고, 서명이 맞으면 최신 공개 정보까지 돌려준다 */
export async function GET(_request: Request, ctx: { params: Promise<{ no: string }> }) {
  await initStore();
  const { no } = await ctx.params;
  const found = await lookupPassport(no);
  if (!found) return NextResponse.json({ genuine: false, error: "여권 번호 형식이 아니에요." }, { status: 400 });
  if (!found.genuine || !found.productId) return NextResponse.json({ genuine: false, no: found.no, error: "등록되지 않은 여권이에요." }, { status: 404 });
  const data = await buildPassport(found.productId);
  if (!data) return NextResponse.json({ genuine: true, no: found.no, error: "계정 정보가 더 이상 없어요." }, { status: 410 });
  const slug = found.shopId ? getShopById(found.shopId)?.slug : null;
  const image = slug ? await passportImageUrl(slug, data).catch(() => null) : null;
  return NextResponse.json({ genuine: true, data, image }, { headers: { "cache-control": "no-store" } });
}
