// DOES 랭킹 이미지 워커 — vendix 가 서비스 바인딩으로 POST {data} 를 보내면 PNG 를 돌려준다
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { pixelize, withScene } from "./theme.js";
import { boardTree, planPanelTree, planPanelHeight, seasonPassTree, passportTree, coinPanelTree, coinLogTree, coinRestockTree, coinReviewTree, attShopTree, attShopHeight, attResultTree, minePanelTree, mineResultTree, pickaxeCardTree, proxyPanelTree, proxyStatusTree, proxyStatusHeight, shopStatsTree, cardTree, profileTree, receiptTree, restockTree, reviewTree, reviewHeight, welcomeTree, chargeTree, purchaseTree, queueTree, rankTree, rankHeight, statusTree, stockTree, stockHeight } from "./render.js";

const fonts = {};
async function font(w) {
  if (!fonts[w]) {
    const r = await fetch(`https://doesmc.xyz/fonts/Pretendard-${w}.otf`);
    if (!r.ok) throw new Error(`font ${w} ${r.status}`);
    fonts[w] = await r.arrayBuffer();
  }
  return fonts[w];
}

let logoUrl = null;

/* ───────── 마크 밤하늘 테마 (모든 이미지 공통) ─────────
 * 배경: 마크 밤 풍경(집 · 나무 · 네더 포탈) · 제목: 픽셀 글꼴(갈무리) · 로고: 잔디 블록
 * 자산을 못 불러오면 예전 모습 그대로 그린다.
 */
const ASSET = "https://doesmc.xyz";
const BG = { wide: [`${ASSET}/brand/mc-bg-wide.jpg`, 1672, 941], tall: [`${ASSET}/brand/mc-bg-tall.jpg`, 1100, 1480] };
const assets = {};
async function asset(key, url) {
  if (assets[key] === undefined || assets[key] === null) assets[key] = await toDataUrl(url);
  return assets[key];
}
let pixelFont = null;
async function galmuri() {
  if (pixelFont) return pixelFont;
  try {
    const r = await fetch(`${ASSET}/fonts/Galmuri11-Bold.ttf`);
    if (r.ok) pixelFont = await r.arrayBuffer();
  } catch {
    /* 없으면 일반 글꼴 */
  }
  return pixelFont;
}

export default {
  async fetch(request, env, ctx) {
    cache.setExecutionContext(ctx);
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    const body = await request.json().catch(() => null);
    const d = body?.data;
    if (!d || (!["queue", "stock", "status", "purchase_log", "charge_log", "welcome", "review", "restock", "receipt", "profile", "card", "shop_stats", "proxy_panel", "proxy_status", "mine_panel", "mine_result", "pickaxe_card", "att_shop", "att_result", "coin_panel", "coin_log", "coin_restock", "coin_review", "passport", "season_pass", "plan_panel", "board"].includes(d.kind) && !Array.isArray(d.rows))) return new Response("bad", { status: 400 });
    if (["status", "purchase_log", "charge_log", "welcome", "review", "restock", "receipt", "profile", "card", "proxy_status", "mine_result", "att_result"].includes(d.kind)) d.avatar = await toDataUrl(d.avatar);
    if (["purchase_log", "review", "restock", "receipt"].includes(d.kind)) d.img = await toDataUrl(d.img, d.imgKind === "thumb");
    if (["coin_log", "coin_review"].includes(d.kind)) d.avatar = await toDataUrl(d.avatar);
    if (["coin_log", "coin_restock", "coin_review"].includes(d.kind)) d.icon = await toDataUrl(d.icon);
    if (d.kind === "passport") d.skin = await toDataUrl(d.skin);
    if (d.kind === "season_pass") d.av = await toDataUrl(d.av);
    if (d.kind === "coin_panel") d.coins = await Promise.all((d.coins ?? []).slice(0, 4).map(async (c) => ({ sym: String(c.sym ?? "").slice(0, 6), icon: await toDataUrl(c.icon) })));
    if (d.kind === "stock") {
      for (const g of d.groups ?? []) g.items = await Promise.all(g.items.map(async (it) => ({ ...it, img: await toDataUrl(it.img, it.imgKind === "thumb") })));
    }
    else if (["status", "purchase_log", "charge_log", "welcome", "review", "restock", "receipt", "profile", "card", "shop_stats", "proxy_panel", "proxy_status", "mine_panel", "mine_result", "pickaxe_card", "att_shop", "att_result", "coin_panel", "coin_log", "coin_restock", "coin_review", "passport", "season_pass", "plan_panel", "board"].includes(d.kind)) {
      /* 위에서 처리 */
    } else if (d.kind === "queue") d.queue = await Promise.all((d.queue ?? []).slice(0, 8).map(async (r) => ({ ...r, avatar: await toDataUrl(r.avatar) })));
    else d.rows = await Promise.all(d.rows.slice(0, 10).map(async (r) => ({ ...r, avatar: await toDataUrl(r.avatar) })));
    // 로고는 잔디 블록 (아직 못 받았으면 예전 DOES 로고로 그리고 다음에 다시 시도)
    logoUrl ??= await toDataUrl(`${ASSET}/brand/mc-grass.png`);
    d.logo = logoUrl ?? (await toDataUrl("https://doesmc.xyz/emoji/does_logo.png"));
    const [medium, bold, black, pixel] = await Promise.all([font("Medium"), font("Bold"), font("Black"), galmuri()]);
    const queue = d.kind === "queue";
    const stock = d.kind === "stock";
    const status = d.kind === "status";
    const plog = d.kind === "purchase_log";
    const clog = d.kind === "charge_log";
    const wel = d.kind === "welcome";
    const rev = d.kind === "review";
    const one = { restock: [restockTree, 420], receipt: [receiptTree, 470], profile: [profileTree, 380], card: [cardTree, 470], shop_stats: [shopStatsTree, 300], proxy_panel: [proxyPanelTree, 340], proxy_status: [proxyStatusTree, proxyStatusHeight(d)], mine_panel: [minePanelTree, 470], mine_result: [mineResultTree, 610], pickaxe_card: [pickaxeCardTree, 560], att_shop: [attShopTree, attShopHeight(d)], att_result: [attResultTree, 420], coin_panel: [coinPanelTree, 400], coin_log: [coinLogTree, 400], coin_restock: [coinRestockTree, 380], coin_review: [coinReviewTree, 420], passport: [passportTree, 560], season_pass: [seasonPassTree, 615], plan_panel: [planPanelTree, planPanelHeight(d)], board: [boardTree, 680] }[d.kind];
    const height = one ? one[1] : rev ? reviewHeight(d) : wel ? 440 : plog || clog ? 420 : status ? 560 : stock ? stockHeight(d) : queue ? (d.queue?.length ? 700 : 590) : rankHeight(d);
    let tree = one ? one[0](d) : rev ? reviewTree(d) : wel ? welcomeTree(d) : clog ? chargeTree(d) : plog ? purchaseTree(d) : status ? statusTree(d) : stock ? stockTree(d) : queue ? queueTree(d) : rankTree(d);
    if (pixel) pixelize(tree);
    const tall = height / 1100 > 0.95;
    const bgSpec = tall ? BG.tall : BG.wide;
    const bgData = await asset(tall ? "tall" : "wide", bgSpec[0]);
    tree = withScene(tree, 1100, height, bgData ? [bgData, bgSpec[1], bgSpec[2]] : null);
    return ImageResponse.async(tree, {
      width: 1100,
      height,
      fonts: [
        new CustomFont("Pretendard", () => medium, { weight: 500 }),
        new CustomFont("Pretendard", () => bold, { weight: 700 }),
        new CustomFont("Pretendard", () => black, { weight: 900 }),
        ...(pixel ? [new CustomFont("Galmuri", () => pixel, { weight: 700 })] : []),
      ],
      emoji: "twemoji",
      headers: { "cache-control": "public, max-age=86400" },
    });
  },
};
