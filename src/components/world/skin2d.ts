/** 마크 스킨 PNG → 정면 전신 그림 (16×32 픽셀을 키워서) */

type Rect = [number, number, number, number];

function blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, src: Rect, dx: number, dy: number, s: number, mirror = false) {
  const [sx, sy, w, h] = src;
  if (!mirror) {
    ctx.drawImage(img, sx, sy, w, h, dx * s, dy * s, w * s, h * s);
    return;
  }
  ctx.save();
  ctx.translate((dx + w) * s, dy * s);
  ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w * s, h * s);
  ctx.restore();
}

const hatCache = new WeakMap<HTMLImageElement, boolean>();

/** 마크와 같은 규칙: 모자 레이어에 투명 픽셀이 하나도 없으면(옛 스킨의 검은 칠) 그리지 않는다 */
function hatUsable(img: HTMLImageElement) {
  const cached = hatCache.get(img);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 16;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 32, 0, 32, 16, 0, 0, 32, 16);
      const data = g.getImageData(0, 0, 32, 16).data;
      ok = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]! < 128) {
          ok = true;
          break;
        }
      }
    }
  } catch {
    ok = true;
  }
  hatCache.set(img, ok);
  return ok;
}

export function drawSkinFront(canvas: HTMLCanvasElement, img: HTMLImageElement, slim: boolean, scale = 8) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 16 * scale;
  canvas.height = 32 * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const modern = img.naturalHeight >= 64;
  const aw = slim ? 3 : 4;
  const s = scale;

  blit(ctx, img, [8, 8, 8, 8], 4, 0, s);
  blit(ctx, img, [20, 20, 8, 12], 4, 8, s);
  blit(ctx, img, [44, 20, aw, 12], 4 - aw, 8, s);
  if (modern) blit(ctx, img, [36, 52, aw, 12], 12, 8, s);
  else blit(ctx, img, [44, 20, aw, 12], 12, 8, s, true);
  blit(ctx, img, [4, 20, 4, 12], 4, 20, s);
  if (modern) blit(ctx, img, [20, 52, 4, 12], 8, 20, s);
  else blit(ctx, img, [4, 20, 4, 12], 8, 20, s, true);

  if (hatUsable(img)) blit(ctx, img, [40, 8, 8, 8], 4, 0, s);
  if (modern) {
    blit(ctx, img, [20, 36, 8, 12], 4, 8, s);
    blit(ctx, img, [44, 36, aw, 12], 4 - aw, 8, s);
    blit(ctx, img, [52, 52, aw, 12], 12, 8, s);
    blit(ctx, img, [4, 36, 4, 12], 4, 20, s);
    blit(ctx, img, [4, 52, 4, 12], 8, 20, s);
  }
}

export function drawSkinHead(canvas: HTMLCanvasElement, img: HTMLImageElement, scale = 8) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 8 * scale;
  canvas.height = 8 * scale;
  ctx.imageSmoothingEnabled = false;
  blit(ctx, img, [8, 8, 8, 8], 0, 0, scale);
  if (hatUsable(img)) blit(ctx, img, [40, 8, 8, 8], 0, 0, scale);
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();

export function loadSkin(url: string) {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("skin"));
      img.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}
