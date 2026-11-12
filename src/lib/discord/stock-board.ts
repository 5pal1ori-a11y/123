import {
  actionRow,
  button,
  ButtonStyle,
  cid,
  separator,
  textDisplay,
  v2Message,
} from "@/lib/discord/components";
import { discordRest, editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import {
  getShopById,
  getShopSettings,
  listProducts,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";

/** V2 메시지 하나의 글자 수 한도(4000) 안에 상품 목록을 담는다 */
const TEXT_BUDGET = 3300;
const MAX_GROUPS = 12;

function stockLabel(p: ProductWithStock) {
  if (p.availableCount <= 0) return "품절";
  return p.fulfillment === "manual" ? "판매중" : `재고 ${p.availableCount.toLocaleString("ko-KR")}개`;
}

function productLine(p: ProductWithStock) {
  return `${p.availableCount > 0 ? "🟢" : "⚫"} **${p.name}** · ${formatKRW(p.price)} · ${stockLabel(p)}`;
}

function groupByCategory(products: ProductWithStock[]) {
  const groups = new Map<string, ProductWithStock[]>();
  for (const p of products) {
    const key = p.category?.trim() || "기타";
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0));
  }
  return [...groups.entries()].slice(0, MAX_GROUPS);
}

/**
 * 재고현황 V2 패널.
 * board — 채널에 고정해 두고 재고가 바뀔 때마다 고쳐 쓰는 메시지
 * view — /재고현황 · 버튼으로 여는 나만 보이는 메시지 (새로고침 버튼 포함)
 */
export function buildStockPanel(shopId: string, mode: "board" | "view") {
  const shop = getShopById(shopId);
  const slug = shop?.slug ?? "shop";
  const products = listProducts(shopId).filter((p) => !p.stockBoardHidden);
  const inStock = products.filter((p) => p.availableCount > 0).length;
  const now = Math.floor(Date.now() / 1000);

  const kids: unknown[] = [
    textDisplay(`## ${shop?.name ?? "상점"} 재고현황`),
    textDisplay(`-# 실시간으로 갱신돼요 · 마지막 갱신 <t:${now}:R>`),
    separator(true, 1),
  ];

  if (!products.length) {
    kids.push(textDisplay("등록된 상품이 없어요."));
  } else {
    kids.push(textDisplay(`구매 가능 **${inStock}종** · 품절 **${products.length - inStock}종**`));
    let budget = TEXT_BUDGET;
    for (const [category, list] of groupByCategory(products)) {
      if (budget <= 0) break;
      const lines: string[] = [];
      for (const p of list) {
        const line = productLine(p);
        if (line.length + 1 > budget) break;
        lines.push(line);
        budget -= line.length + 1;
      }
      const hidden = list.length - lines.length;
      if (hidden > 0) lines.push(`-# 외 ${hidden}개`);
      if (!lines.length) break;
      kids.push(separator(false, 1));
      kids.push(textDisplay(`### ${category}\n${lines.join("\n")}`));
      budget -= category.length + 6;
    }
  }

  kids.push(separator(true, 1));
  kids.push(textDisplay("-# 자판기 상품은 충전 후 바로 구매할 수 있어요."));
  kids.push(
    actionRow(
      ...(mode === "view"
        ? [button({ label: "새로고침", customId: cid(slug, "stock_refresh") })]
        : []),
      button({ label: "자판기", customId: cid(slug, "stock_vending") }),
      button({ label: "사이트에서 보기", url: shopUrl(slug, "/dashboard"), style: ButtonStyle.LINK }),
    ),
  );

  return { ...v2Message(kids), allowed_mentions: { parse: [] as string[] } };
}

export async function refreshStockBoard(shopId: string) {
  const settings = getShopSettings(shopId);
  if (!settings.discordBotEnabled || !settings.discordStockChannelId) return { ok: false as const };
  const channelId = settings.discordStockChannelId;
  const payload = buildStockPanel(shopId, "board");
  if (settings.discordStockMessageId) {
    const edited = await editChannelMessage(channelId, settings.discordStockMessageId, payload, shopId);
    if (edited.ok) return { ok: true as const, updated: true as const };
    // 예전 embed 메시지는 V2 로 고쳐 쓸 수 없어(400) 지우고 새로 올린다. 레이트리밋 등 일시 오류면 그대로 둔다
    if (edited.status === 400) {
      await discordRest("DELETE", `/channels/${channelId}/messages/${settings.discordStockMessageId}`, undefined, shopId);
    } else if (edited.status !== 404) {
      return { ok: false as const, error: edited.json };
    }
  }
  const posted = await postChannelMessage(channelId, payload, shopId);
  if (posted.ok && posted.json && typeof posted.json === "object" && "id" in posted.json) {
    updateShopSettings(shopId, {
      discordStockMessageId: String((posted.json as { id: string }).id),
    });
    await persistAsync();
    return { ok: true as const, posted: true as const };
  }
  return { ok: false as const, error: posted.json };
}
