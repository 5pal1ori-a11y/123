import { NextResponse } from "next/server";
import {
  forbidden,
  isShop,
  isShopOwnerAdmin,
  requireShop,
} from "@/lib/api";
import { filterTextChannels } from "@/lib/discord/logs";
import { listGuildTextChannels } from "@/lib/discord/rest";
import { planFeatureError } from "@/lib/plans";
import { getShopSettings, initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopOwnerAdmin(request, shop)) return forbidden("소유자만 채널 목록을 볼 수 있어요.");

  const featureErr = planFeatureError(shop.plan, "discord_bot");
  if (featureErr) return forbidden(featureErr);

  const settings = getShopSettings(shop.id);
  if (!settings.discordGuildId) {
    return NextResponse.json({ channels: [], error: "Guild ID를 먼저 저장하세요." }, { status: 400 });
  }

  const res = await listGuildTextChannels(settings.discordGuildId, shop.id);
  if (!res.ok) {
    const msg =
      typeof res.json === "object" && res.json && "message" in res.json
        ? String((res.json as { message?: string }).message)
        : `Discord API ${res.status}`;
    return NextResponse.json({ channels: [], error: msg }, { status: 502 });
  }

  return NextResponse.json({ channels: filterTextChannels(res.json) });
}
