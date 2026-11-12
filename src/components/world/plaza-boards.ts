import * as THREE from "three";
import type { PlazaBoard } from "@/lib/world/layout";

export type StockItem = { name: string; price: number; status: "in_stock" | "low_stock" | "sold_out"; count: number; manual: boolean };
export type ReviewItem = { name: string; rating: number | null; body: string; product: string | null; createdAt: string };
export type ReviewSummary = { items: ReviewItem[]; total: number; average: number | null };

const PX = 256;
const STOCK_ROWS = 7;
const REVIEW_ROWS = 3;
const PAGE_SECONDS = 7;

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;

function ago(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return `${Math.floor(d / 30)}달 전`;
}

/** 폭에 맞춰 자르고 … 를 붙인다 */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** 글자 단위 줄바꿈 (한국어) — 최대 lines 줄 */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number) {
  const out: string[] = [];
  let cur = "";
  for (const ch of text.replace(/\s+/g, " ").trim()) {
    if (ctx.measureText(cur + ch).width > max) {
      out.push(cur);
      cur = ch === " " ? "" : ch;
      if (out.length === lines) break;
    } else cur += ch;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && text.length > out.join("").length + 1) out[lines - 1] = fit(ctx, `${out[lines - 1]}…`, max);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ───────────── 나무 간판 (짙은 판자 + 분홍 글씨) ───────────── */

function drawWood(ctx: CanvasRenderingContext2D, w: number, h: number, b: PlazaBoard, font: string) {
  const r = rand(b.key.length * 7919 + b.key.charCodeAt(0) * 131);
  const planks = Math.max(2, Math.round(h / 72));
  const ph = h / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 0.88 + r() * 0.2;
    ctx.fillStyle = `rgb(${Math.round(76 * tone)},${Math.round(48 * tone)},${Math.round(29 * tone)})`;
    ctx.fillRect(0, i * ph, w, ph);
    // 나뭇결
    for (let k = 0; k < 26; k++) {
      const y = i * ph + 4 + r() * (ph - 8);
      const x = r() * w;
      const len = 40 + r() * 220;
      ctx.fillStyle = r() < 0.5 ? "rgba(30,16,8,0.35)" : "rgba(140,94,58,0.22)";
      ctx.fillRect(x, y, len, 2 + Math.floor(r() * 2));
    }
    // 옹이
    if (r() < 0.6) {
      ctx.fillStyle = "rgba(34,18,9,0.55)";
      ctx.beginPath();
      ctx.ellipse(r() * w, i * ph + ph / 2, 10 + r() * 8, 4 + r() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#24140a";
    ctx.fillRect(0, i * ph, w, 3);
  }
  // 테두리 (안쪽 밝은 선 · 바깥 어두운 선)
  const bw = Math.max(8, Math.round(h * 0.07));
  ctx.strokeStyle = "#2a170b";
  ctx.lineWidth = bw;
  ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw);
  ctx.strokeStyle = "rgba(160,110,66,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(bw + 1, bw + 1, w - bw * 2 - 2, h - bw * 2 - 2);
  // 못
  for (const [x, y] of [
    [bw * 1.7, bw * 1.7],
    [w - bw * 1.7, bw * 1.7],
    [bw * 1.7, h - bw * 1.7],
    [w - bw * 1.7, h - bw * 1.7],
  ]) {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(x!, y!, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b9b4ac";
    ctx.beginPath();
    ctx.arc(x! - 1, y! - 1, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 글씨: 분홍 + 짙은 외곽선 + 아래 그림자
  const color = b.color ?? "#ff8fd0";
  const hasSub = Boolean(b.sub);
  const size = Math.round(h * (hasSub ? 0.42 : 0.56));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px ${font}`;
  const ty = hasSub ? h * 0.42 : h * 0.53;
  const maxW = w - bw * 5;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(6, size * 0.16);
  ctx.strokeStyle = "#2b0a1f";
  ctx.fillStyle = "#2b0a1f";
  ctx.fillText(b.text ?? "", w / 2 + 4, ty + 6, maxW);
  ctx.strokeText(b.text ?? "", w / 2, ty, maxW);
  ctx.fillStyle = color;
  ctx.fillText(b.text ?? "", w / 2, ty, maxW);
  // 글자 윗부분 하이라이트
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, ty - size / 2, w, size * 0.32);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText(b.text ?? "", w / 2, ty, maxW);
  ctx.restore();
  if (b.sub) {
    ctx.font = `600 ${Math.round(h * 0.17)}px ${font}`;
    ctx.fillStyle = "#ead7c2";
    ctx.fillText(b.sub, w / 2, h * 0.8, maxW);
  }
}

/* ───────────── 종이 카드 공통 ───────────── */

function paperBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#e9dfcc";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.shadowColor = "rgba(60,40,20,0.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#fbf9f4";
  roundRect(ctx, 14, 14, w - 28, h - 28, 28);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(43,38,32,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, 14, 14, w - 28, h - 28, 28);
  ctx.stroke();
}

function header(ctx: CanvasRenderingContext2D, w: number, font: string, title: string, sub: string, right: string, dot: string) {
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(62, 74, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `800 54px ${font}`;
  ctx.fillStyle = "#2b2620";
  ctx.fillText(title, 90, 74);
  const tw = ctx.measureText(title).width;
  ctx.font = `500 28px ${font}`;
  ctx.fillStyle = "#8a8074";
  ctx.fillText(fit(ctx, `· ${sub}`, w - 140 - tw - 230), 100 + tw, 78);
  ctx.textAlign = "right";
  ctx.font = `600 24px ${font}`;
  ctx.fillStyle = "#a39a8e";
  ctx.fillText(right, w - 48, 78);
  ctx.fillStyle = "rgba(43,38,32,0.08)";
  ctx.fillRect(40, 124, w - 80, 2);
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number, font: string, left: string, page: number, pages: number) {
  ctx.textBaseline = "middle";
  ctx.font = `500 22px ${font}`;
  ctx.fillStyle = "#a39a8e";
  ctx.textAlign = "left";
  ctx.fillText(left, 48, h - 44);
  if (pages > 1) {
    ctx.textAlign = "right";
    for (let i = 0; i < pages; i++) {
      ctx.fillStyle = i === page ? "#2b2620" : "rgba(43,38,32,0.18)";
      ctx.beginPath();
      ctx.arc(w - 52 - (pages - 1 - i) * 22, h - 44, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function pill(ctx: CanvasRenderingContext2D, xRight: number, y: number, text: string, fg: string, bg: string, font: string) {
  ctx.font = `700 26px ${font}`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 36;
  roundRect(ctx, xRight - pw, y - 22, pw, 44, 22);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(xRight - pw + 16, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, xRight - pw + 26, y + 1);
  return pw;
}

/* ───────────── 재고현황 ───────────── */

function stockLabel(s: StockItem): { text: string; fg: string; bg: string } {
  if (s.manual) return { text: "판매중", fg: "#2f9e44", bg: "#e7f6ea" };
  if (s.status === "sold_out") return { text: "품절", fg: "#e03131", bg: "#fdeaea" };
  if (s.status === "low_stock") return { text: `재고 ${s.count}개`, fg: "#e8590c", bg: "#fff0e4" };
  return { text: "판매중", fg: "#2f9e44", bg: "#e7f6ea" };
}

function drawStock(ctx: CanvasRenderingContext2D, w: number, h: number, font: string, items: StockItem[] | null, page: number, updated: string) {
  paperBase(ctx, w, h);
  const avail = items ? items.filter((s) => s.manual || s.status !== "sold_out").length : 0;
  header(ctx, w, font, "재고현황", "실시간 재고·가격 한눈에", items ? `구매가능 ${avail}/${items.length}종` : "", "#3fb950");
  if (!items) {
    ctx.textAlign = "center";
    ctx.font = `500 30px ${font}`;
    ctx.fillStyle = "#a39a8e";
    ctx.fillText("재고를 불러오는 중…", w / 2, h / 2);
    return;
  }
  if (!items.length) {
    ctx.textAlign = "center";
    ctx.font = `500 30px ${font}`;
    ctx.fillStyle = "#a39a8e";
    ctx.fillText("등록된 상품이 없어요", w / 2, h / 2);
    return;
  }
  const pages = Math.ceil(items.length / STOCK_ROWS);
  const p = page % pages;
  const rows = items.slice(p * STOCK_ROWS, p * STOCK_ROWS + STOCK_ROWS);
  const top = 140;
  const rh = 76;
  rows.forEach((s, i) => {
    const y = top + i * rh + rh / 2;
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(43,38,32,0.03)";
      roundRect(ctx, 34, y - rh / 2 + 4, w - 68, rh - 8, 14);
      ctx.fill();
    }
    const lab = stockLabel(s);
    const pw = pill(ctx, w - 48, y, lab.text, lab.fg, lab.bg, font);
    ctx.textAlign = "right";
    ctx.font = `700 30px ${font}`;
    ctx.fillStyle = s.status === "sold_out" && !s.manual ? "#b9b1a6" : "#2b2620";
    const price = won(s.price);
    ctx.fillText(price, w - 48 - pw - 22, y + 1);
    const priceW = ctx.measureText(price).width;
    ctx.textAlign = "left";
    ctx.font = `600 30px ${font}`;
    ctx.fillStyle = s.status === "sold_out" && !s.manual ? "#b9b1a6" : "#3a342d";
    ctx.fillText(fit(ctx, s.name, w - 48 - pw - 22 - priceW - 30 - 56), 56, y + 1);
  });
  footer(ctx, w, h, font, `업데이트 ${updated}`, p, pages);
}

/* ───────────── 최근 후기 ───────────── */

function drawReviews(ctx: CanvasRenderingContext2D, w: number, h: number, font: string, data: ReviewSummary | null, page: number, updated: string) {
  paperBase(ctx, w, h);
  const right = data ? `${data.average !== null ? `★ ${data.average.toFixed(1)} · ` : ""}후기 ${data.total.toLocaleString("ko-KR")}개` : "";
  header(ctx, w, font, "최근 후기", "실제 구매 후기", right, "#f59f00");
  if (!data || !data.items.length) {
    ctx.textAlign = "center";
    ctx.font = `500 30px ${font}`;
    ctx.fillStyle = "#a39a8e";
    ctx.fillText(data ? "아직 후기가 없어요" : "후기를 불러오는 중…", w / 2, h / 2);
    return;
  }
  const pages = Math.ceil(data.items.length / REVIEW_ROWS);
  const p = page % pages;
  const rows = data.items.slice(p * REVIEW_ROWS, p * REVIEW_ROWS + REVIEW_ROWS);
  const top = 140;
  const rh = 178;
  rows.forEach((r, i) => {
    const y0 = top + i * rh;
    ctx.fillStyle = "#f4efe6";
    roundRect(ctx, 34, y0 + 6, w - 68, rh - 14, 18);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `700 28px ${font}`;
    ctx.fillStyle = "#2b2620";
    const nm = fit(ctx, r.name || "익명", 320);
    ctx.fillText(nm, 56, y0 + 40);
    const nmW = ctx.measureText(nm).width;
    if (r.product) {
      ctx.font = `600 22px ${font}`;
      const tag = fit(ctx, r.product, w - 56 - nmW - 60 - 160);
      const tw = ctx.measureText(tag).width + 24;
      roundRect(ctx, 70 + nmW, y0 + 24, tw, 32, 16);
      ctx.fillStyle = "#ffe3f1";
      ctx.fill();
      ctx.fillStyle = "#c2255c";
      ctx.fillText(tag, 82 + nmW, y0 + 41);
    }
    ctx.textAlign = "right";
    ctx.font = `500 22px ${font}`;
    ctx.fillStyle = "#a39a8e";
    ctx.fillText(ago(r.createdAt), w - 56, y0 + 40);
    ctx.textAlign = "left";
    ctx.font = `500 27px ${font}`;
    ctx.fillStyle = "#4a433b";
    wrap(ctx, r.body, w - 124, 2).forEach((line, k) => ctx.fillText(line, 56, y0 + 88 + k * 38));
  });
  footer(ctx, w, h, font, `업데이트 ${updated}`, p, pages);
}

/* ───────────── 판 묶음 ───────────── */

type Live = { board: PlazaBoard; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement };

export class PlazaBoards {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  private stock: StockItem[] | null = null;
  private reviews: ReviewSummary | null = null;
  private stockAt = "";
  private reviewsAt = "";
  private page = 0;
  private pageT = 0;
  private frameMat = new THREE.MeshLambertMaterial({ color: 0x3b2414 });
  private edgeMat = new THREE.MeshLambertMaterial({ color: 0x24150b });

  constructor(
    boards: PlazaBoard[],
    private font: () => string,
  ) {
    for (const b of boards) this.build({ ...b });
    this.redraw();
  }

  /** 나무 간판 글씨만 바꿔 다시 그린다 */
  setWood(key: string, patch: { text: string; sub?: string; color?: string }) {
    const l = this.live.find((v) => v.board.key === key);
    if (!l || l.board.kind !== "wood") return;
    if (l.board.text === patch.text && l.board.sub === patch.sub && l.board.color === patch.color) return;
    Object.assign(l.board, patch);
    const ctx = l.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
    drawWood(ctx, l.canvas.width, l.canvas.height, l.board, this.font());
    l.tex.needsUpdate = true;
  }

  private build(b: PlazaBoard) {
    const holder = new THREE.Group();
    holder.position.set(b.x, b.y + b.h / 2, b.z);
    holder.rotation.y = b.yaw;
    const paper = b.kind !== "wood";
    // 뒤판 (종이 카드는 나무 액자 테두리)
    const pad = paper ? 0.12 : 0;
    const back = new THREE.Mesh(new THREE.BoxGeometry(b.w + pad * 2, b.h + pad * 2, 0.1), paper ? this.edgeMat : this.frameMat);
    back.position.z = -0.05;
    holder.add(back);
    if (paper) {
      // 위 처마
      const eave = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.12, 0.36), this.frameMat);
      eave.position.set(0, b.h / 2 + 0.18, 0.06);
      holder.add(eave);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(b.w * (paper ? PX : 200));
    canvas.height = Math.round(b.h * (paper ? PX : 200));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.z = 0.006;
    holder.add(face);
    // 뒷면도 나무로 보이게
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(b.w + pad * 2, b.h + pad * 2), this.frameMat);
    rear.rotation.y = Math.PI;
    rear.position.z = -0.101;
    holder.add(rear);
    this.group.add(holder);
    this.live.push({ board: b, tex, canvas });
  }

  setStock(items: StockItem[]) {
    this.stock = items;
    this.stockAt = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    this.redraw("stock");
  }

  setReviews(data: ReviewSummary) {
    this.reviews = data;
    this.reviewsAt = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    this.redraw("reviews");
  }

  /** 폰트가 늦게 로드되면 다시 그린다 */
  redraw(only?: PlazaBoard["kind"]) {
    const font = this.font();
    for (const l of this.live) {
      if (only && l.board.kind !== only) continue;
      const ctx = l.canvas.getContext("2d")!;
      const { width: w, height: h } = l.canvas;
      ctx.clearRect(0, 0, w, h);
      if (l.board.kind === "wood") drawWood(ctx, w, h, l.board, font);
      else if (l.board.kind === "stock") drawStock(ctx, w, h, font, this.stock, this.page, this.stockAt);
      else drawReviews(ctx, w, h, font, this.reviews, this.page, this.reviewsAt);
      l.tex.needsUpdate = true;
    }
  }

  /** 목록이 길면 몇 초마다 다음 쪽으로 넘긴다 */
  update(dt: number, visible: boolean) {
    this.group.visible = visible;
    if (!visible) return;
    this.pageT += dt;
    if (this.pageT < PAGE_SECONDS) return;
    this.pageT = 0;
    const many = (this.stock?.length ?? 0) > STOCK_ROWS || (this.reviews?.items.length ?? 0) > REVIEW_ROWS;
    if (!many) return;
    this.page++;
    if ((this.stock?.length ?? 0) > STOCK_ROWS) this.redraw("stock");
    if ((this.reviews?.items.length ?? 0) > REVIEW_ROWS) this.redraw("reviews");
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      if (mat && mat !== this.frameMat && mat !== this.edgeMat) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
    this.frameMat.dispose();
    this.edgeMat.dispose();
  }
}
