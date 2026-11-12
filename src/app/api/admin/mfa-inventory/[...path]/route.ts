import { NextResponse } from "next/server";
import { assertSameOrigin, forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { mfaAdmin } from "@/lib/mfa";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, ctx: Ctx) {
  await initStore();
  if (request.method !== "GET") {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;
  }
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  try {
    const { path } = await ctx.params;
    const sub = path.map((p) => encodeURIComponent(p)).join("/");
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.json().catch(() => ({}));
    const { status, data } = await mfaAdmin(shop.id, request.method, sub, new URL(request.url).search, body);
    if (request.method !== "GET" && status < 400) {
      void import("@/lib/discord/stock-board").then(({ refreshStockBoard }) =>
        refreshStockBoard(shop.id).catch(() => null),
      );
    }
    return NextResponse.json(data, { status });
  } catch (err) {
    return serverError(err);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
