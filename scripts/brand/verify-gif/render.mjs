#!/usr/bin/env node
/**
 * 인증 전용 GIF — verify.html 을 프레임마다 그려 끊김 없이 반복되는 GIF 로 만든다.
 *   node scripts/brand/verify-gif/render.mjs [출력.gif] [--fps 25]
 * 필요: playwright(chromium), ffmpeg
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".gif")) ?? path.join(here, "../../../public/brand/does-verify.gif");
const i = args.indexOf("--fps");
const FPS = i >= 0 ? Number(args[i + 1]) : 25;

const dir = mkdtempSync(path.join(tmpdir(), "verify-gif-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "verify.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const frames = Math.round((await page.evaluate(() => window.DURATION)) * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  writeFileSync(path.join(dir, `f${String(f).padStart(4, "0")}.png`), await page.screenshot({ type: "png" }));
}
await browser.close();
const vf = "split[a][b];[a]palettegen=max_colors=200:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "f%04d.png"), "-filter_complex", vf, "-loop", "0", out]);
rmSync(dir, { recursive: true, force: true });
console.log(`saved ${out} (${frames} frames @ ${FPS}fps)`);
