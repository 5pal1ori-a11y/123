// DOES 랭킹 이미지 워커 — vendix 가 서비스 바인딩으로 POST {data} 를 보내면 PNG 를 돌려준다
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { purchaseTree, queueTree, rankTree, rankHeight, statusTree, stockTree, stockHeight } from "./render.js";

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
async function toDataUrl(url, any = false) {
  if (!url || !(any ? /^https:\/\//.test(url) : /^https:\/\/((cdn|media)\.discordapp\.(com|net)|doesmc\.xyz)\//.test(url))) return null;
  try {
    const r = await fetch(url);
    if (!r.ok || Number(r.headers.get("content-length") || 0) > 3_000_000) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${r.headers.get("content-type") || "image/png"};base64,${btoa(s)}`;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    cache.setExecutionContext(ctx);
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    const body = await request.json().catch(() => null);
    const d = body?.data;
    if (!d || (!["queue", "stock", "status", "purchase_log"].includes(d.kind) && !Array.isArray(d.rows))) return new Response("bad", { status: 400 });
    if (d.kind === "status" || d.kind === "purchase_log") d.avatar = await toDataUrl(d.avatar);
    if (d.kind === "purchase_log") d.img = await toDataUrl(d.img, d.imgKind === "thumb");
    if (d.kind === "stock") {
      for (const g of d.groups ?? []) g.items = await Promise.all(g.items.map(async (it) => ({ ...it, img: await toDataUrl(it.img, it.imgKind === "thumb") })));
    }
    else if (d.kind === "status" || d.kind === "purchase_log") {
      /* 위에서 처리 */
    } else if (d.kind === "queue") d.queue = await Promise.all((d.queue ?? []).slice(0, 8).map(async (r) => ({ ...r, avatar: await toDataUrl(r.avatar) })));
    else d.rows = await Promise.all(d.rows.slice(0, 10).map(async (r) => ({ ...r, avatar: await toDataUrl(r.avatar) })));
    logoUrl ??= await toDataUrl("https://doesmc.xyz/emoji/does_logo.png");
    d.logo = logoUrl;
    const [medium, bold, black] = await Promise.all([font("Medium"), font("Bold"), font("Black")]);
    const queue = d.kind === "queue";
    const stock = d.kind === "stock";
    const status = d.kind === "status";
    const plog = d.kind === "purchase_log";
    return ImageResponse.async(plog ? purchaseTree(d) : status ? statusTree(d) : stock ? stockTree(d) : queue ? queueTree(d) : rankTree(d), {
      width: 1100,
      height: plog ? 420 : status ? 440 : stock ? stockHeight(d) : queue ? (d.queue?.length ? 700 : 590) : rankHeight(d),
      fonts: [
        new CustomFont("Pretendard", () => medium, { weight: 500 }),
        new CustomFont("Pretendard", () => bold, { weight: 700 }),
        new CustomFont("Pretendard", () => black, { weight: 900 }),
      ],
      emoji: "twemoji",
      headers: { "cache-control": "public, max-age=86400" },
    });
  },
};
