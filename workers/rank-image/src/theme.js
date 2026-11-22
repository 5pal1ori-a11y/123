// 마크 밤하늘 테마 — 모든 이미지 공통 (픽셀 제목 · 밤 풍경 배경)

/** 큰 제목(숫자 없는 글) · 영문 소제목(자간 넓은 글)을 픽셀 글꼴로 */
export function pixelize(node) {
  if (!node || typeof node !== "object") return;
  const p = node.props;
  if (!p) return;
  const st = p.style || {};
  const kids = Array.isArray(p.children) ? p.children : [p.children];
  const text = kids.filter((k) => typeof k === "string").join("");
  if (text.trim()) {
    const fs = Number(st.fontSize) || 0;
    const fw = Number(st.fontWeight) || 400;
    const ls = Number(st.letterSpacing) || 0;
    const title = fs >= 30 && fw >= 800 && !/[0-9₩%,]/.test(text);
    const eyebrow = ls >= 3 && fs <= 24;
    if (title || eyebrow) p.style = { ...st, fontFamily: "Galmuri", fontWeight: 700, letterSpacing: eyebrow ? Math.min(ls, 4) : 0 };
  }
  for (const k of kids) pixelize(k);
}

/** 그림 전체를 밤 풍경 위에 올린다 (배경은 아래쪽 기준으로 꽉 채움) */
export function withScene(tree, W, H, bg) {
  if (!bg) return tree;
  const [data, bw, bh] = bg;
  const s = Math.max(W / bw, H / bh);
  const iw = Math.ceil(bw * s);
  const ih = Math.ceil(bh * s);
  const root = { ...tree, props: { ...tree.props, style: { ...(tree.props?.style || {}), position: "relative", width: W, height: H, background: "linear-gradient(180deg, rgba(8,9,22,0.48) 0%, rgba(10,11,26,0.26) 45%, rgba(6,7,16,0.46) 100%)" } } };
  return {
    type: "div",
    props: {
      style: { display: "flex", position: "relative", width: W, height: H, background: "#0b0d1a" },
      children: [{ type: "img", props: { src: data, style: { position: "absolute", left: Math.round((W - iw) / 2), top: H - ih, width: iw, height: ih } } }, root],
    },
  };
}
async function toDataUrl(url, any = false) {
  if (!url || !(any ? /^https:\/\//.test(url) : /^https:\/\/((cdn|media)\.discordapp\.(com|net)|doesmc\.xyz|([a-z]+\.)?xn--hq1b35z\.com)\//.test(url))) return null;
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

