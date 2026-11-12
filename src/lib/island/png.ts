import { TEX, texturePixels, type TextureName } from "./textures";
import { cellKey, HUB, sceneItems, type PlacedBlock } from "./world";

type V3 = [number, number, number];

type Piece = {
  min: V3;
  max: V3;
  top: TextureName;
  side: TextureName;
  front: TextureName;
  glow: boolean;
  cullCell?: string;
};

const SHADE = { top: 1, front: 0.84, side: 0.66 };

function expandPieces(blocks: PlacedBlock[]) {
  const items = sceneItems(blocks).filter(
    // 다리 끝 · 도착 광장 · 포털은 섬 이미지에서 뺀다
    (it) => it.kind !== "static" || it.z < HUB.z0,
  );
  const opaque = new Set<string>();
  for (const it of items) if (it.cube) opaque.add(cellKey(it.x, it.y, it.z));

  const pieces: Piece[] = [];
  for (const it of items) {
    for (const box of it.model) {
      const min: V3 = [it.x + box.min[0], it.y + box.min[1], it.z + box.min[2]];
      const max: V3 = [it.x + box.max[0], it.y + box.max[1], it.z + box.max[2]];
      const n = [0, 1, 2].map((a) => Math.max(1, Math.ceil(max[a]! - min[a]! - 1e-6)));
      for (let i = 0; i < n[0]!; i++)
        for (let j = 0; j < n[1]!; j++)
          for (let k = 0; k < n[2]!; k++) {
            const step = [0, 1, 2].map((a) => (max[a]! - min[a]!) / n[a]!);
            const pMin: V3 = [min[0] + i * step[0]!, min[1] + j * step[1]!, min[2] + k * step[2]!];
            const pMax: V3 = [pMin[0] + step[0]!, pMin[1] + step[1]!, pMin[2] + step[2]!];
            pieces.push({
              min: pMin,
              max: pMax,
              top: box.faces.top,
              side: box.faces.side,
              front: box.faces.front ?? box.faces.side,
              glow: Boolean(box.glow),
              cullCell: it.cube ? cellKey(it.x, it.y, it.z) : undefined,
            });
          }
    }
  }
  return { pieces, opaque };
}

function skyColor(t: number): V3 {
  const stops: [number, V3][] = [
    [0, [74, 128, 214]],
    [0.55, [146, 190, 238]],
    [0.85, [244, 196, 150]],
    [1, [250, 160, 112]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]!;
    const [t0, c0] = stops[i - 1]!;
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1]![1];
}

export function renderIslandRgba(blocks: PlacedBlock[], width = 1100, height = 760) {
  const W = width;
  const H = height;
  const px = new Uint8ClampedArray(W * H * 4);
  const depth = new Float32Array(W * H).fill(-1e9);

  for (let y = 0; y < H; y++) {
    const c = skyColor(y / H);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  const sunX = Math.round(W * 0.8);
  const sunY = Math.round(H * 0.16);
  for (let y = sunY - 46; y < sunY + 46; y++)
    for (let x = sunX - 46; x < sunX + 46; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.max(Math.abs(x - sunX), Math.abs(y - sunY));
      const i = (y * W + x) * 4;
      const a = d < 26 ? 1 : Math.max(0, 1 - (d - 26) / 20) * 0.35;
      px[i] = px[i]! + (255 - px[i]!) * a;
      px[i + 1] = px[i + 1]! + (246 - px[i + 1]!) * a;
      px[i + 2] = px[i + 2]! + (196 - px[i + 2]!) * a;
    }
  const clouds: [number, number, number, number][] = [
    [0.08, 0.1, 0.16, 0.035], [0.3, 0.2, 0.12, 0.03], [0.55, 0.07, 0.2, 0.04], [0.62, 0.32, 0.1, 0.025], [0.15, 0.4, 0.09, 0.022],
  ];
  for (const [cx, cy, cw, ch] of clouds) {
    const x0 = Math.round(cx * W);
    const y0 = Math.round(cy * H);
    const x1 = x0 + Math.round(cw * W);
    const y1 = y0 + Math.round(ch * H);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        px[i] = px[i]! + (255 - px[i]!) * 0.82;
        px[i + 1] = px[i + 1]! + (255 - px[i + 1]!) * 0.82;
        px[i + 2] = px[i + 2]! + (255 - px[i + 2]!) * 0.82;
      }
  }

  const { pieces, opaque } = expandPieces(blocks);

  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pieces) {
    for (const X of [p.min[0], p.max[0]])
      for (const Y of [p.min[1], p.max[1]])
        for (const Z of [p.min[2], p.max[2]]) {
          const u = (X - Z) * 0.866;
          const v = (X + Z) * 0.5 - Y;
          u0 = Math.min(u0, u);
          u1 = Math.max(u1, u);
          v0 = Math.min(v0, v);
          v1 = Math.max(v1, v);
        }
  }
  const s = Math.max(14, Math.min(40, Math.floor(Math.min((W * 0.92) / (u1 - u0), (H * 0.86) / (v1 - v0)))));
  const A = s * 0.866;
  const B = s * 0.5;
  const C = s;
  const ox = W / 2 - ((u0 + u1) / 2) * s;
  const oy = H * 0.52 - ((v0 + v1) / 2) * s;
  const proj = (X: number, Y: number, Z: number): [number, number] => [ox + (X - Z) * A, oy + (X + Z) * B - Y * C];
  const translucent: (() => void)[] = [];

  const drawFace = (O: V3, U: V3, Vv: V3, tex: TextureName, shadeF: number, pass: "opaque" | "clear") => {
    const t = texturePixels(tex);
    const o = proj(O[0], O[1], O[2]);
    const pu = proj(O[0] + U[0], O[1] + U[1], O[2] + U[2]);
    const pv = proj(O[0] + Vv[0], O[1] + Vv[1], O[2] + Vv[2]);
    const us: [number, number] = [pu[0] - o[0], pu[1] - o[1]];
    const vs: [number, number] = [pv[0] - o[0], pv[1] - o[1]];
    const det = us[0] * vs[1] - us[1] * vs[0];
    if (Math.abs(det) < 1e-6) return;
    const xs = [o[0], pu[0], pv[0], o[0] + us[0] + vs[0]];
    const ys = [o[1], pu[1], pv[1], o[1] + us[1] + vs[1]];
    const bx0 = Math.max(0, Math.floor(Math.min(...xs)));
    const bx1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const by0 = Math.max(0, Math.floor(Math.min(...ys)));
    const by1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    if (bx0 > bx1 || by0 > by1) return;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const dx = x + 0.5 - o[0];
        const dy = y + 0.5 - o[1];
        const u = (dx * vs[1] - dy * vs[0]) / det;
        const v = (us[0] * dy - us[1] * dx) / det;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const d = O[0] + O[1] + O[2] + u * (U[0] + U[1] + U[2]) + v * (Vv[0] + Vv[1] + Vv[2]);
        const zi = y * W + x;
        if (d <= depth[zi]!) continue;
        const ti = (Math.min(TEX - 1, (v * TEX) | 0) * TEX + Math.min(TEX - 1, (u * TEX) | 0)) * 4;
        const a = t[ti + 3]!;
        if (a === 0) continue;
        const i = zi * 4;
        if (a === 255) {
          if (pass !== "opaque") continue;
          px[i] = t[ti]! * shadeF;
          px[i + 1] = t[ti + 1]! * shadeF;
          px[i + 2] = t[ti + 2]! * shadeF;
          depth[zi] = d;
        } else {
          if (pass !== "clear") continue;
          const f = a / 255;
          px[i] = px[i]! * (1 - f) + t[ti]! * shadeF * f;
          px[i + 1] = px[i + 1]! * (1 - f) + t[ti + 1]! * shadeF * f;
          px[i + 2] = px[i + 2]! * (1 - f) + t[ti + 2]! * shadeF * f;
        }
      }
    }
  };

  const drawPiece = (p: Piece, pass: "opaque" | "clear") => {
    const [x0, y0, z0] = p.min;
    const [x1, y1, z1] = p.max;
    const cell = p.cullCell?.split(",").map(Number);
    const hidden = (dx: number, dy: number, dz: number) =>
      cell ? opaque.has(cellKey(cell[0]! + dx, cell[1]! + dy, cell[2]! + dz)) : false;
    const g = (f: number) => (p.glow ? Math.max(f, 0.96) : f);
    if (!hidden(0, 1, 0)) drawFace([x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], p.top, g(SHADE.top), pass);
    if (!hidden(0, 0, 1)) drawFace([x0, y1, z1], [x1 - x0, 0, 0], [0, -(y1 - y0), 0], p.front, g(SHADE.front), pass);
    if (!hidden(1, 0, 0)) drawFace([x1, y1, z0], [0, 0, z1 - z0], [0, -(y1 - y0), 0], p.side, g(SHADE.side), pass);
  };

  for (const p of pieces) {
    drawPiece(p, "opaque");
    translucent.push(() => drawPiece(p, "clear"));
  }
  for (const fn of translucent) fn();

  return { width: W, height: H, rgba: px };
}

/* ───────────── PNG 인코딩 (deflate = zlib 스트림) ───────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePng(width: number, height: number, rgba: Uint8ClampedArray) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = row + 1 + x * 3;
      raw[d] = rgba[s]!;
      raw[d + 1] = rgba[s + 1]!;
      raw[d + 2] = rgba[s + 2]!;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = await deflate(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export async function renderIslandPng(blocks: PlacedBlock[]) {
  const { width, height, rgba } = renderIslandRgba(blocks);
  return encodePng(width, height, rgba);
}
