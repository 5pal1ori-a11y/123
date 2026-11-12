import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { getAdminSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getAdminSession(shop.slug);
  if (!session) return NextResponse.json({ admin: null });
  return NextResponse.json({ admin: { id: session.adminId } });
}
