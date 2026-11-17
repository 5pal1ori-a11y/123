// DOES 랭킹 이미지 워커 — vendix 가 서비스 바인딩으로 POST {data} 를 보내면 PNG 를 돌려준다
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { rankTree, rankHeight } from "./render.js";

let fontBuf = null;
async function font() {
  if (!fontBuf) {
    const r = await fetch("https://doesmc.xyz/fonts/Galmuri11.ttf");
    if (!r.ok) throw new Error(`font ${r.status}`);
    fontBuf = await r.arrayBuffer();
  }
  return fontBuf;
}

let logoUrl = null;
async function toDataUrl(url) {
  if (!url || !/^https:\/\/((cdn|media)\.discordapp\.(com|net)|doesmc\.xyz)\//.test(url)) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
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
    if (!d || !Array.isArray(d.rows)) return new Response("bad", { status: 400 });
    d.rows = await Promise.all(d.rows.slice(0, 10).map(async (r) => ({ ...r, avatar: await toDataUrl(r.avatar) })));
    logoUrl ??= await toDataUrl("https://doesmc.xyz/emoji/does_logo.png");
    d.logo = logoUrl;
    const data = await font();
    return ImageResponse.async(rankTree(d), {
      width: 1100,
      height: rankHeight(d),
      fonts: [new CustomFont("Galmuri", () => data)],
      emoji: "twemoji",
      headers: { "cache-control": "public, max-age=86400" },
    });
  },
};
