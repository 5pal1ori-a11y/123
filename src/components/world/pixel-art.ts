import { TEX, texturePixels, type TextureName } from "@/lib/island/textures";

type Palette = Record<string, string>;

const cache = new Map<string, string>();

function toDataUrl(key: string, draw: (ctx: CanvasRenderingContext2D) => void, size = TEX) {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  draw(ctx);
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function textureUrl(name: TextureName) {
  return toDataUrl(`tex:${name}`, (ctx) => {
    const img = ctx.createImageData(TEX, TEX);
    img.data.set(texturePixels(name));
    ctx.putImageData(img, 0, 0);
  });
}

export function spriteUrl(key: string, grid: string[], palette: Palette) {
  return toDataUrl(`spr:${key}`, (ctx) => {
    grid.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (!ch || ch === ".") continue;
        const color = palette[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  });
}

/** 블록 부수기 금 0~9단계 */
export function crackUrl(stage: number) {
  const s = Math.max(0, Math.min(9, Math.floor(stage)));
  return toDataUrl(`crack:${s}`, (ctx) => {
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const lines = 2 + s * 2;
    for (let i = 0; i < lines; i++) {
      let x = 8 + Math.round((rand() - 0.5) * (2 + s));
      let y = 8 + Math.round((rand() - 0.5) * (2 + s));
      const len = 2 + Math.floor(rand() * (2 + s * 0.9));
      for (let j = 0; j < len; j++) {
        ctx.fillStyle = j % 3 === 0 ? "rgba(0,0,0,0.85)" : "rgba(20,20,20,0.7)";
        ctx.fillRect(x, y, 1, 1);
        x += Math.round((rand() - 0.5) * 2.4);
        y += Math.round((rand() - 0.5) * 2.4);
        x = Math.max(0, Math.min(15, x));
        y = Math.max(0, Math.min(15, y));
      }
    }
  });
}

export const DIAMOND = [
  "................",
  "................",
  "....kkkkkkkk....",
  "...kwwllcccdk...",
  "..kwllcccccddk..",
  ".kllccccccccddk.",
  ".kkkkkkkkkkkkkk.",
  "..kcllcccccddk..",
  "...kcccccccdk...",
  "....kccccddk....",
  ".....kcccdk.....",
  "......kcdk......",
  ".......kk.......",
  "................",
  "................",
  "................",
];
export const DIAMOND_PAL: Palette = { k: "#0b3b39", w: "#ffffff", l: "#b6fff2", c: "#4aedd9", d: "#1fa597" };

export const TOTEM = [
  "......kkkk......",
  ".....kyyyyk.....",
  "....kyyyyyyk....",
  "....kygyygyk....",
  "....kyyyyyyk....",
  ".....kyooyk.....",
  "..kkkkyyyykkkk..",
  ".kyyyyyyyyyyyyk.",
  ".kyokyyyyyykoyk.",
  "..kk.kyyyyk.kk..",
  ".....kyooyk.....",
  ".....kyyyyk.....",
  "....kyykkyyk....",
  "....kyk..kyk....",
  ".....k....k.....",
  "................",
];
export const TOTEM_PAL: Palette = { k: "#4a2c05", y: "#f7d33f", o: "#c48a1c", g: "#2fd36b" };

export const PICKAXE = [
  "................",
  "....kkkkk.......",
  "...kcccccck.....",
  "..kclcckkcck....",
  "...kkk...kcck...",
  "........kbkck...",
  ".......kbk.kck..",
  "......kbk...kk..",
  ".....kbk........",
  "....kbk.........",
  "...kbk..........",
  "..kbk...........",
  ".kbk............",
  ".kk.............",
  "................",
  "................",
];
export const PICKAXE_PAL: Palette = { k: "#1b1b1b", c: "#4aedd9", l: "#c9fff6", b: "#8a5a2b" };

/** 월드 토큰 — 금테 두른 에메랄드 코인 */
export const TOKEN = [
  "................",
  ".....kkkkkk.....",
  "...kkyyyyyykk...",
  "..kyyggggggyyk..",
  "..kyggllggggyk..",
  ".kyggl.kkgggyyk.",
  ".kyggkgggkggyyk.",
  ".kyggkgggkggyyk.",
  ".kyggkgggkggyyk.",
  ".kyggkgggkggyyk.",
  ".kygggkkkgggyyk.",
  "..kygggggggyyk..",
  "..kyyggggggyyk..",
  "...kkyyyyyykk...",
  ".....kkkkkk.....",
  "................",
];
export const TOKEN_PAL: Palette = { k: "#3b2a06", y: "#f2c94c", g: "#22c55e", l: "#bbf7d0" };

export const HEART = [
  "................",
  "................",
  "................",
  "...kkk...kkk....",
  "..krrwk.krrrk...",
  "..krwrrkrrrrk...",
  "..krrrrrrrrdk...",
  "..krrrrrrrrdk...",
  "...krrrrrrdk....",
  "....krrrrdk.....",
  ".....krrdk......",
  "......kdk.......",
  ".......k........",
  "................",
  "................",
  "................",
];
export const HEART_PAL: Palette = { k: "#1a0606", r: "#e01e1e", w: "#ffb3b3", d: "#8f0e0e" };
export const HEART_EMPTY_PAL: Palette = { k: "#1a0606", r: "#3a2a2a", w: "#4a3a3a", d: "#2a1d1d" };

export function heartUrl(empty = false) {
  return empty ? spriteUrl("heart-empty", HEART, HEART_EMPTY_PAL) : spriteUrl("heart", HEART, HEART_PAL);
}

export function diamondUrl() {
  return spriteUrl("diamond", DIAMOND, DIAMOND_PAL);
}
export function totemUrl() {
  return spriteUrl("totem", TOTEM, TOTEM_PAL);
}
export function pickaxeUrl() {
  return spriteUrl("pickaxe", PICKAXE, PICKAXE_PAL);
}
export function tokenUrl() {
  return spriteUrl("token", TOKEN, TOKEN_PAL);
}
