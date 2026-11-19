#!/usr/bin/env node
/**
 * DOES 소개 영상 렌더러 — intro.html 을 프레임마다 그려 MP4 로 만든다.
 *
 *   node scripts/brand/intro-video/render.mjs [출력.mp4] [--html intro60.html] [--sold 100 --buyers 50 --reviews 32 --avg 5]
 *
 * 필요: playwright(chromium), ffmpeg
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// 전역 설치된 playwright 도 찾도록 require 로 불러온다
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".mp4")) ?? path.join(here, "../../../public/brand/does-intro.mp4");
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const FPS = Number(opt("fps", 30));
const qs = new URLSearchParams({ sold: opt("sold", 100), buyers: opt("buyers", 50), reviews: opt("reviews", 32), avg: opt("avg", 5) });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${pathToFileURL(path.join(here, opt("html", "intro.html"))).href}?${qs}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * FPS);

const ff = spawn(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out],
  { stdio: ["pipe", "inherit", "inherit"] },
);

for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 60 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg ${c}`)))));
await browser.close();
console.log(`saved ${out}`);
