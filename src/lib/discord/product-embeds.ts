import {
  actionRow,
  button,
  ButtonStyle,
  cid,
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  separator,
  stringSelect,
  textDisplay,
  v2Public,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { BANNER_PATHS } from "@/lib/gif/banners";
import { refreshMfaStockIfStale } from "@/lib/mfa";
import { getShopBySlug, getShopSettings, listProducts } from "@/lib/store";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";

export type ProductEmbedKind = "fresh_mfa" | "cape";

function bannerUrl(path: string) {
  return `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "")}${path}`;
}

function stockText(p: ProductWithStock) {
  if (p.availableCount <= 0) return "품절";
  return p.fulfillment === "manual" ? "판매중" : `재고 ${p.availableCount.toLocaleString("ko-KR")}개`;
}

function stamp() {
  return `<t:${Math.floor(Date.now() / 1000)}:f>`;
}

/** 이름에 Fresh 가 들어간 상품, 없으면 정품계정 분류에서 재고가 가장 많은 상품 */
function pickFreshProduct(products: ProductWithStock[]) {
  const fresh = products.filter((p) => /fresh/i.test(`${p.name} ${p.mfaProduct ?? ""}`));
  const pool = fresh.length ? fresh : products.filter((p) => p.category?.trim() === "정품계정");
  return [...pool].sort((a, b) => b.availableCount - a.availableCount || b.price - a.price)[0] ?? null;
}

function freshMfaKids(slug: string, products: ProductWithStock[]) {
  const p = pickFreshProduct(products);
  if (!p) return null;
  const soldOut = p.availableCount <= 0;
  return [
    mediaGallery([bannerUrl(BANNER_PATHS.freshMfa)]),
    textDisplay("## Fresh MFA 계정"),
    textDisplay(
      [
        "> 첫 닉네임을 직접 정할 수 있는 새 계정이에요",
        "> 어느 서버에도 접속한 기록이 없어요",
        "> 이메일까지 모든 정보를 바꿀 수 있어요",
        "> 평생 사용 (LIFETIME)",
      ].join("\n"),
    ),
    separator(true, 1),
    textDisplay(`**가격** ${formatKRW(p.price)}\n**재고** ${soldOut ? "품절" : stockText(p)}`),
    actionRow(
      button({ label: soldOut ? "품절" : "구매하기", customId: cid(slug, "buy_select", p.id), disabled: soldOut }),
      button({ label: "실시간 재고", customId: cid(slug, "stock_view") }),
      button({ label: "사이트에서 보기", url: shopUrl(slug, "/dashboard"), style: ButtonStyle.LINK }),
    ),
    textDisplay(`-# ${stamp()} 기준 재고 · 구매하려면 상점 계정 연동이 필요해요`),
  ];
}

function capeName(name: string) {
  return name
    .replace(/\((코드|계정)\s*지급\)/, "")
    .replace(/망토/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CAPE_GROUPS: { title: string; test: (name: string) => boolean }[] = [
  { title: "코드로 받는 망토", test: (n) => /코드/.test(n) },
  { title: "계정으로 받는 망토", test: (n) => /계정/.test(n) },
  { title: "그 밖의 망토", test: () => true },
];

function capeKids(slug: string, products: ProductWithStock[]) {
  const capes = products.filter((p) => p.category?.trim() === "망토");
  if (!capes.length) return null;
  const sorted = [...capes].sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0) || b.price - a.price);
  const inStock = capes.filter((p) => p.availableCount > 0).length;

  const kids: unknown[] = [
    mediaGallery([bannerUrl(BANNER_PATHS.capes)]),
    textDisplay("## 망토"),
    textDisplay(`지금 바로 받을 수 있는 망토 **${inStock}종** · 전체 **${capes.length}종**`),
    separator(true, 1),
  ];
  const used = new Set<string>();
  for (const group of CAPE_GROUPS) {
    const list = sorted.filter((p) => !used.has(p.id) && group.test(p.name));
    if (!list.length) continue;
    list.forEach((p) => used.add(p.id));
    const lines = list.map(
      (p) => `${p.availableCount > 0 ? "🟢" : "⚫"} **${capeName(p.name)}** · ${formatKRW(p.price)} · ${stockText(p)}`,
    );
    kids.push(textDisplay(`### ${group.title}\n${lines.join("\n")}`));
  }
  kids.push(
    separator(true, 1),
    actionRow(
      stringSelect({
        customId: cid(slug, "buy_select"),
        placeholder: "망토를 골라 바로 구매하기",
        options: sorted.slice(0, 25).map((p) => ({
          label: `${capeName(p.name)} 망토`,
          value: p.id,
          description: `${formatKRW(p.price)} · ${stockText(p)}`,
        })),
      }),
    ),
    actionRow(
      button({ label: "실시간 재고", customId: cid(slug, "stock_view") }),
      button({ label: "사이트에서 보기", url: shopUrl(slug, "/dashboard"), style: ButtonStyle.LINK }),
    ),
    textDisplay(`-# ${stamp()} 기준 재고 · 계정 지급 망토는 망토가 들어 있는 계정으로 받아요`),
  );
  return kids;
}

/** /임배드 — FRESH MFA · 망토 상품 카드를 지금 채널(또는 고른 채널)에 올린다 */
export async function handleProductEmbedCommand(
  shopSlug: string,
  kind: ProductEmbedKind,
  opts: { channelId: string | null; currentChannelId: string | null; roles: string[]; permissions?: string },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), opts.roles, opts.permissions)) {
    return errorPanel("상품 카드는 관리자만 올릴 수 있어요.", "권한 없음");
  }
  await refreshMfaStockIfStale(shop.id);
  const products = listProducts(shop.id).filter((p) => p.active);
  const kids = kind === "cape" ? capeKids(shop.slug, products) : freshMfaKids(shop.slug, products);
  if (!kids) {
    return errorPanel(
      kind === "cape"
        ? "'망토' 분류에 등록된 상품이 없어요."
        : "FRESH MFA로 보여 줄 상품이 없어요. 상품 이름에 Fresh 를 넣거나 '정품계정' 분류에 상품을 등록해 주세요.",
    );
  }

  if (opts.channelId && opts.channelId !== opts.currentChannelId) {
    const posted = await postChannelMessage(
      opts.channelId,
      { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids)], allowed_mentions: { parse: [] } },
      shop.id,
    ).catch(() => null);
    return plainEphemeral(
      posted?.ok
        ? `<#${opts.channelId}> 에 상품 카드를 올렸어요.`
        : `<#${opts.channelId}> 에 올리지 못했어요. 봇에게 그 채널의 메시지 보내기 권한이 있는지 확인해 주세요.`,
    );
  }
  const panel = v2Public([container(kids)]);
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}
