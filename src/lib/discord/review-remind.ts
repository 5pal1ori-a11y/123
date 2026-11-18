/**
 * 구매 후 후기 요청 — 지급 완료된 지 하루 지난 주문 중 아직 후기를 안 쓴 구매자에게
 * 디스코드 DM 으로 "후기 쓰면 포인트" 안내를 한 번 보낸다. 보낸 주문은 KV 에 기록해 중복 방지.
 */
import { getShopById, getStoreForRead } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

const key = (shopId: string) => `review-remind:v1:${shopId}`;
const DELAY_MS = 24 * 60 * 60_000;
const MAX_AGE_MS = 14 * 24 * 60 * 60_000; // 너무 오래된 주문은 건너뜀
const COUNTED = new Set(["dispensed", "paid"]);
const REWARD = 100;

export async function remindReviews(shopId: string) {
  return withLock(key(shopId), async () => {
    const shop = getShopById(shopId);
    if (!shop) return { sent: 0 };
    const store = getStoreForRead();
    const done = new Set((await kvGetJson<string[]>(key(shopId))) ?? []);
    const now = Date.now();
    const reviewedProductByUser = new Set(store.reviews.filter((r) => r.shopId === shopId).map((r) => `${r.userId}:${r.productId ?? ""}`));
    const todo: { orderUuid: string; discordId: string; productId: string; productName: string }[] = [];
    for (const o of store.orders) {
      if (o.shopId !== shopId || !o.userId || !o.productId || !COUNTED.has(o.status)) continue;
      if (done.has(o.orderUuid)) continue;
      const t = new Date(o.paidAt || o.createdAt).getTime();
      if (now - t < DELAY_MS || now - t > MAX_AGE_MS) continue;
      const user = store.users.find((u) => u.id === o.userId);
      if (!user?.discordId) {
        done.add(o.orderUuid);
        continue;
      }
      if (reviewedProductByUser.has(`${o.userId}:${o.productId}`)) {
        done.add(o.orderUuid);
        continue;
      }
      const product = store.products.find((p) => p.id === o.productId);
      todo.push({ orderUuid: o.orderUuid, discordId: user.discordId, productId: o.productId, productName: product?.name ?? "상품" });
    }
    let sent = 0;
    for (const t of todo.slice(0, 8)) {
      const ok = await sendReviewDm(shopId, shop.slug, t.discordId, t.productName, t.productId).catch(() => false);
      done.add(t.orderUuid);
      if (ok) sent++;
    }
    await kvPutJson(key(shopId), [...done].slice(-2000), 30 * 86_400);
    return { sent, pending: todo.length };
  });
}

async function sendReviewDm(shopId: string, slug: string, discordId: string, productName: string, productId: string) {
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  const { container, mediaGallery, MessageFlags, textDisplay, actionRow, button, cid } = await import("@/lib/discord/components");
  const { shopUrl } = await import("@/lib/domain");
  const card = await import("@/lib/discord/rank-image")
    .then((m) =>
      m.cardImageUrl(slug, {
        theme: "pink",
        eyebrow: "REVIEW",
        title: "후기를 남겨 주세요",
        people: [{ id: discordId }],
        subtitle: productName,
        chips: [`후기 쓰면 +${REWARD}P`],
        note: "별점·한 줄이면 충분해요",
      }),
    )
    .catch(() => null);
  const r = await sendDiscordDm(
    discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          ...(card ? [mediaGallery([card])] : []),
          textDisplay(`**${productName}** 잘 쓰고 계신가요? 후기를 남겨 주시면 **${REWARD}P** 를 드려요.`),
          actionRow(
            button({ customId: cid(slug, "rev_write", productId), label: "후기 작성" }),
            button({ label: "사이트에서 쓰기", url: shopUrl(slug, "/dashboard?tab=history"), style: 5 }),
          ),
        ]),
      ],
    },
    shopId,
  ).catch(() => null);
  return Boolean(r && (r as { ok?: boolean }).ok !== false);
}
