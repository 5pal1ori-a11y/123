import { appEmoji, loadSavedEmojis } from "@/lib/discord/app-emojis";
import { componentEmbedJson, shopStats } from "@/lib/discord/component-embed";
import { getShopBySlug, getStoreForRead, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** doesmc.xyz 상점 slug (src/lib/domain.ts 의 커스텀 도메인 매핑) */
const SHOP_SLUG = "mfa";

/** 디스코드 링크 미리보기용 Component Embed JSON (layout <head> 의 <link rel="discord:component-embed">) */
export async function GET() {
  let stats: ReturnType<typeof shopStats> | null = null;
  let statsImageUrl: string | null = null;
  try {
    await initStore();
    const shop = getShopBySlug(SHOP_SLUG);
    if (shop) {
      stats = shopStats(getStoreForRead(), shop.id, shop.createdAt);
      const { shopStatsImageUrl } = await import("@/lib/discord/rank-image");
      statsImageUrl = await shopStatsImageUrl(shop.slug, stats).catch(() => null);
    }
  } catch (err) {
    console.error("[component-embed] 통계 조회 실패 — 통계 없이 응답", err);
  }
  // 상점 커스텀 이모지 (KV 에 저장된 ID 만 읽음 — 없으면 일반 이모지)
  await loadSavedEmojis().catch(() => null);
  return new Response(componentEmbedJson(stats, appEmoji, statsImageUrl), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
