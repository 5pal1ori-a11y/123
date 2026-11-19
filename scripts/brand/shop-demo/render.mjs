#!/usr/bin/env node
/**
 * DOES 상점 시연 영상 — capture.cjs 로 녹화한 실제 화면을 폰 화면에 넣고 설명을 붙여 MP4 로 만든다.
 *   node scripts/brand/shop-demo/capture.cjs <녹화폴더>
 *   node scripts/brand/shop-demo/render.mjs <녹화폴더> [출력.mp4]
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
const FINISH = 6;

const { frames, marks } = JSON.parse(readFileSync(path.join(capDir, "timeline.json"), "utf8"));
const M = Object.fromEntries(marks.map((m) => [m.name, m.t / 1000]));

// 원본 구간 → 출력 (speed: 배속)
const SEGS = [
  { cap: 0, from: 0.3, to: M.world - 0.1, speed: 1 },
  { cap: 1, from: M.world, to: M.world + 3.2, speed: 4 }, // 월드 불러오는 화면은 빠르게
  { cap: 1, from: M.world + 3.2, to: M.shop - 0.3, speed: 1.4 },
  { cap: 2, from: M.shop + 0.4, to: M.swipe, speed: 1 },
  { cap: 3, from: M.swipe, to: M.product, speed: 1 },
  { cap: 4, from: M.product, to: M.buy, speed: 1 },
  { cap: 5, from: M.buy, to: M.end, speed: 1 },
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
for (let i = 0; i <= 6; i++) {
  const ss = SEGS.filter((s) => s.cap === i);
  caps.push(ss.length ? { start: ss[0].start, end: ss.at(-1).end } : { start: finishAt, end: total });
}
const outAt = (src) => {
  const s = SEGS.find((x) => src >= x.from && src <= x.to);
  return s ? s.start + (src - s.from) / s.speed : null;
};
// 손가락: 스와이프 3번 · 바로구매 탭 (폰 화면 500x851, 원본 390x664 기준 좌표를 맞춘다)
const sx = 500 / 390, sy = 851 / 664;
const taps = [
  ...[0, 1.7, 3.4].map((d) => ({ kind: "swipe", t: outAt(M.swipe + d), d: 1, x: 200 * sx, y: 520 * sy, x2: 200 * sx, y2: 200 * sy })),
  { kind: "tap", t: outAt(M.buy) ?? SEGS[6].start, x: 272 * sx, y: 628 * sy },
];

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
await page.goto(pathToFileURL(path.join(here, "stage.html")).href);
await page.evaluate(() => window.ready);
const info = { caps, taps, finishAt, total };
const n = Math.round(total * FPS);
console.log(`total ${total.toFixed(1)}s · ${n} frames`);

// PREVIEW="3,12,30" 이면 그 시각들만 PNG 로 저장하고 끝낸다
if (process.env.PREVIEW) {
  for (const t of process.env.PREVIEW.split(",").map(Number)) {
    await page.evaluate(([t, src, info]) => window.renderAt(t, src, info), [t, srcFrame(Math.min(t, finishAt - 0.001)), info]);
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
  await page.evaluate(([t, src, info]) => window.renderAt(t, src, info), [t, srcFrame(Math.min(t, finishAt - 0.001)), info]);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${n}\n`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
await browser.close();
console.log(`saved ${out}`);
