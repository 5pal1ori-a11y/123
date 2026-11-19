#!/usr/bin/env node
/**
 * DOES 상점 시연 영상 (PC) — capture-desktop.cjs 로 녹화한 실제 화면을 브라우저 창에 넣고 설명을 붙여 MP4 로 만든다.
 *   node scripts/brand/shop-demo/capture-desktop.cjs <녹화폴더>
 *   node scripts/brand/shop-demo/render-desktop.mjs <녹화폴더> [출력.mp4]
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)("playwright");
const capDir = path.resolve(process.argv[2] || "shop-demo-capture");
const out = process.argv[3] || path.join(here, "../../../public/brand/does-shop-demo.mp4");
const FPS = 30;
const FINISH = 0.8;

const { frames, marks } = JSON.parse(readFileSync(path.join(capDir, "timeline.json"), "utf8"));
const M = Object.fromEntries(marks.map((m) => [m.name, m.t / 1000]));

// 원본 구간 → 출력 (speed: 배속)
const SEGS = [
  { cap: 0, from: 0.3, to: M.world - 0.05, speed: 1 },
  { cap: 1, from: M.world, to: M.world + 4.4, speed: 4 }, // 월드 불러오는 화면은 빠르게
  { cap: 1, from: M.world + 4.4, to: M.shop - 0.1, speed: 1 },
  { cap: 2, from: M.shop + 0.2, to: M.swipe, speed: 1 },
  { cap: 3, from: M.swipe, to: M.product, speed: 1 },
  { cap: 4, from: M.product, to: M.buy, speed: 1 },
  { cap: 5, from: M.buy, to: M.pay, speed: 1 },
  { cap: 6, from: M.pay, to: M.done, speed: 1 },
  { cap: 7, from: M.done, to: M.end, speed: 1 },
];
let acc = 0;
for (const s of SEGS) {
  s.start = acc;
  acc += (s.to - s.from) / s.speed;
  s.end = acc;
}
const finishAt = acc;
const total = acc + FINISH;
const caps = [];
for (let i = 0; i <= 7; i++) {
  const ss = SEGS.filter((s) => s.cap === i);
  caps.push(ss.length ? { start: ss[0].start, end: ss.at(-1).end } : { start: finishAt, end: total });
}
const outAt = (src) => {
  const s = SEGS.find((x) => src >= x.from && src <= x.to);
  return s ? s.start + (src - s.from) / s.speed : null;
};
const taps = [];

function frameAtSrc(srcSec) {
  const src = srcSec * 1000;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= src) lo = mid;
    else hi = mid - 1;
  }
  return pathToFileURL(path.join(capDir, "frames", frames[lo].file)).href;
}

/** 원본이 끊기는 곳(구간 시작이 앞 구간 끝과 다름)에서 0.35초 동안 앞 화면을 겹친다 */
const FADE = 0.35;
function fadeAt(t) {
  for (let i = 1; i < SEGS.length; i++) {
    const s = SEGS[i], prev = SEGS[i - 1];
    if (Math.abs(s.from - prev.to) < 0.02) continue;
    if (t >= s.start && t < s.start + FADE) {
      const k = (t - s.start) / FADE;
      return { src: frameAtSrc(prev.to), alpha: 1 - k * k * (3 - 2 * k) };
    }
  }
  return null;
}

function srcFrame(t) {
  const s = SEGS.find((x) => t >= x.start && t < x.end) ?? SEGS.at(-1);
  const src = Math.min(s.to, s.from + (t - s.start) * s.speed) * 1000;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= src) lo = mid;
    else hi = mid - 1;
  }
  return pathToFileURL(path.join(capDir, "frames", frames[lo].file)).href;
}

const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "stage-desktop.html")).href);
await page.evaluate(() => window.ready);
// 결제 화면(바로구매 누른 뒤 1초)부터 확대 · 구매 완료 1.2초 뒤 DM 알림
const info = { caps, taps, finishAt, total, zoom: { start: outAt(M.buy + 1.2) ?? 0, scale: 1.9, x: 768, y: 8 }, dmAt: (outAt(M.done) ?? finishAt) + 1.2 };
const n = Math.round(total * FPS);
console.log(`total ${total.toFixed(1)}s · ${n} frames`);

// PREVIEW="3,12,30" 이면 그 시각들만 PNG 로 저장하고 끝낸다
if (process.env.PREVIEW) {
  for (const t of process.env.PREVIEW.split(",").map(Number)) {
    await page.evaluate(([t, src, info]) => window.renderAt(t, src, info), [t, srcFrame(Math.min(t, finishAt - 0.001)), { ...info, fade: fadeAt(t) }]);
    await page.screenshot({ path: path.join(process.env.PREVIEW_DIR || ".", `preview_${t}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const ff = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out],
  { stdio: ["pipe", "inherit", "inherit"] },
);
for (let f = 0; f < n; f++) {
  const t = f / FPS;
  await page.evaluate(([t, src, info]) => window.renderAt(t, src, info), [t, srcFrame(Math.min(t, finishAt - 0.001)), { ...info, fade: fadeAt(t) }]);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${n}\n`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
await browser.close();
console.log(`saved ${out}`);
