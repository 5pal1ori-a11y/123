import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { boardData } from "@/lib/board";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 거래소 전광판 (공개 · 30초 캐시) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  try {
    return NextResponse.json(await boardData(shop.id), { headers: { "cache-control": "public, max-age=15" } });
  } catch (err) {
    return serverError(err);
  }
}
