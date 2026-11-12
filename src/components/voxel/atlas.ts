import * as THREE from "three";
import { BLOCKS } from "@/lib/voxel/blocks";
import { item } from "@/lib/voxel/items";
import { spritePixels, T, tilePixels } from "@/lib/voxel/textures";

/** 모든 블록 텍스처를 한 장에 모은 아틀라스 */
export type Atlas = {
  texture: THREE.Texture;
  /** 타일 이름 → [열, 행] */
  tiles: Map<string, number>;
  cols: number;
  rows: number;
  size: [number, number];
};

const EXTRA = [
  ...Array.from({ length: 8 }, (_, i) => `wheat_stage${i}`),
  ...Array.from({ length: 10 }, (_, i) => `destroy_stage_${i}`),
  "water",
  "lava",
];

let shared: Atlas | null = null;

export function getAtlas(): Atlas {
  if (shared) return shared;
  const names = new Set<string>();
  for (const b of BLOCKS) for (const f of b.faces) if (f !== "air") names.add(f);
  for (const e of EXTRA) names.add(e);
  const list = [...names];
  const cols = 32;
  const rows = Math.ceil(list.length / cols);
  const c = document.createElement("canvas");
  c.width = cols * T;
  c.height = rows * T;
  const g = c.getContext("2d")!;
  const tiles = new Map<string, number>();
  list.forEach((name, i) => {
    const px = tilePixels(name);
    const img = new ImageData(new Uint8ClampedArray(px), T, T);
    g.putImageData(img, (i % cols) * T, Math.floor(i / cols) * T);
    tiles.set(name, i);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  shared = { texture, tiles, cols, rows, size: [c.width, c.height] };
  return shared;
}

/* ───────────── 아이콘 (인벤토리 · 핫바) ───────────── */

const iconCache = new Map<string, string>();

function pixelsToCanvas(px: Uint8ClampedArray) {
  const c = document.createElement("canvas");
  c.width = T;
  c.height = T;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), T, T), 0, 0);
  return c;
}

/** 블록을 마인크래프트 인벤토리처럼 비스듬히 세운 입체 아이콘 */
function isoBlock(blockId: number) {
  const b = BLOCKS[blockId]!;
  const S = 48;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const top = pixelsToCanvas(tilePixels(b.faces[2]));
  const left = pixelsToCanvas(tilePixels(b.faces[4]));
  const right = pixelsToCanvas(tilePixels(b.faces[0]));
  const tint = (canvas: HTMLCanvasElement, f: number, color?: number) => {
    const t = document.createElement("canvas");
    t.width = T;
    t.height = T;
    const tg = t.getContext("2d")!;
    tg.drawImage(canvas, 0, 0);
    const d = tg.getImageData(0, 0, T, T);
    const cr = color !== undefined ? ((color >> 16) & 255) / 255 : 1;
    const cg = color !== undefined ? ((color >> 8) & 255) / 255 : 1;
    const cb = color !== undefined ? (color & 255) / 255 : 1;
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = d.data[i]! * f * cr;
      d.data[i + 1] = d.data[i + 1]! * f * cg;
      d.data[i + 2] = d.data[i + 2]! * f * cb;
    }
    tg.putImageData(d, 0, 0);
    return t;
  };
  const leafTint = b.tint ? (b.tint === "grass" ? 0x91bd59 : 0x77ab2f) : undefined;
  const w = S / 2;
  const h = S / 4;
  // 윗면
  g.setTransform(w / T, h / T, -w / T, h / T, S / 2, 2);
  g.drawImage(tint(top, 1, leafTint), 0, 0);
  // 왼쪽 면
  g.setTransform(w / T, h / T, 0, (S / 2 - 2) / T, 0, h + 2);
  g.drawImage(tint(left, 0.8, b.tintTop ? undefined : leafTint), 0, 0);
  // 오른쪽 면
  g.setTransform(w / T, -h / T, 0, (S / 2 - 2) / T, w, 2 * h + 2);
  g.drawImage(tint(right, 0.62, b.tintTop ? undefined : leafTint), 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c.toDataURL();
}

function flatIcon(px: Uint8ClampedArray, tint?: number) {
  const S = 32;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  let src = pixelsToCanvas(px);
  if (tint !== undefined) {
    const t = src.getContext("2d")!;
    const d = t.getImageData(0, 0, T, T);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = (d.data[i]! * ((tint >> 16) & 255)) / 255;
      d.data[i + 1] = (d.data[i + 1]! * ((tint >> 8) & 255)) / 255;
      d.data[i + 2] = (d.data[i + 2]! * (tint & 255)) / 255;
    }
    t.putImageData(d, 0, 0);
    src = t.canvas;
  }
  g.drawImage(src, 0, 0, S, S);
  return c.toDataURL();
}

export function itemIcon(key: string): string {
  const hit = iconCache.get(key);
  if (hit) return hit;
  const def = item(key);
  let url = "";
  if (def) {
    if ("block" in def.icon) url = isoBlock(def.icon.block);
    else {
      const name = def.icon.sprite;
      const sprite = spritePixels(name);
      if (sprite) url = flatIcon(sprite);
      else {
        const b = BLOCKS.find((x) => x.key === name);
        url = flatIcon(tilePixels(b ? b.faces[0] : name), b?.tint ? 0x91bd59 : undefined);
      }
    }
  }
  iconCache.set(key, url);
  return url;
}

/** 1인칭 손에 들 아이템 텍스처 (스프라이트 또는 블록 옆면) */
export function heldPixels(key: string): { px: Uint8ClampedArray; block: number | null } {
  const def = item(key);
  if (def && "block" in def.icon) return { px: tilePixels(BLOCKS[def.icon.block]!.faces[4]), block: def.icon.block };
  if (def && "sprite" in def.icon) {
    const name = def.icon.sprite;
    const s = spritePixels(name);
    if (s) return { px: s, block: null };
    const b = BLOCKS.find((x) => x.key === name);
    return { px: tilePixels(b ? b.faces[0] : name), block: null };
  }
  return { px: tilePixels("stone"), block: null };
}
