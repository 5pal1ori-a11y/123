import { NextResponse } from "next/server";
import { forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, unauthorized } from "@/lib/api";
import { maskEmail, maskPiiInText } from "@/lib/pii";
import { getShopSettings, listLogs } from "@/lib/store";
import { initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "logs");
  if (denied) return denied;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const settings = getShopSettings(shop.id);
  const mask = settings.maskPiiInAdmin !== false;
  const logs = listLogs(shop.id, Number.isFinite(limit) ? limit : 50).map((log) => {
    if (!mask) return log;
    return {
      ...log,
      actor: log.actor.includes("@") ? maskEmail(log.actor) : log.actor,
      meta: Object.fromEntries(
        Object.entries(log.meta ?? {}).map(([k, v]) => [
          k,
          typeof v === "string" ? maskPiiInText(v) : v,
        ]),
      ),
    };
  });
  return NextResponse.json({ logs });
}
