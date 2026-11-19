/**
 * 실제 doesmc.xyz 모바일 화면을 녹화한다 (CDP 스크린캐스트 · 고화질 JPEG 프레임 + 시각).
 *   node scripts/brand/shop-demo/capture.cjs <출력폴더>
 * 결과: <출력폴더>/frames/*.jpg, <출력폴더>/timeline.json (프레임 시각 · 장면 표시)
 */
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || "shop-demo-capture";
fs.mkdirSync(path.join(out, "frames"), { recursive: true });

(async () => {
  // 스크린캐스트는 이 옵션이 있어야 고해상도(2배)로 나온다
  const b = await chromium.launch({ args: ["--force-device-scale-factor=2"] });
  const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  const marks = [];
  let t0 = 0;
  let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `f${String(n++).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(out, "frames", file), Buffer.from(f.data, "base64"));
    frames.push({ t: Date.now() - t0, file });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const mark = (name) => marks.push({ name, t: Date.now() - t0 });
  const wait = (ms) => p.waitForTimeout(ms);
  /** 손가락으로 쓸어 넘기듯 부드럽게 스크롤 (가장 큰 스크롤 영역) */
  const swipe = (dy, ms = 900, sel = null) =>
    p.evaluate(
      ({ dy, ms, sel }) =>
        new Promise((res) => {
          const els = sel ? [document.querySelector(sel)] : [document.scrollingElement, ...document.querySelectorAll("*")];
          let el = null;
          for (const e of els) {
            if (!e) continue;
            const cs = e === document.scrollingElement ? null : getComputedStyle(e);
            const can = e.scrollHeight - e.clientHeight > 50 && (!cs || /(auto|scroll)/.test(cs.overflowY));
            if (can && (!el || e.scrollHeight > el.scrollHeight)) el = e;
          }
          if (!el) return res();
          const start = el.scrollTop, s = performance.now();
          const step = (now) => {
            const k = Math.min(1, (now - s) / ms), e = 1 - Math.pow(1 - k, 3);
            el.scrollTop = start + dy * e;
            k < 1 ? requestAnimationFrame(step) : res();
          };
          requestAnimationFrame(step);
        }),
      { dy, ms, sel },
    );
  const swipeX = (sel, dx, ms = 700) =>
    p.evaluate(
      ({ sel, dx, ms }) =>
        new Promise((res) => {
          const el = document.querySelector(sel);
          if (!el) return res();
          const start = el.scrollLeft, s = performance.now();
          const step = (now) => {
            const k = Math.min(1, (now - s) / ms), e = 1 - Math.pow(1 - k, 3);
            el.scrollLeft = start + dx * e;
            k < 1 ? requestAnimationFrame(step) : res();
          };
          requestAnimationFrame(step);
        }),
      { sel, dx, ms },
    );

  // 미리 한 번 열어 캐시를 데운다
  await p.goto("https://doesmc.xyz/main", { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await wait(6000);
  await p.goto("https://doesmc.xyz/dashboard?tab=products", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.goto("https://doesmc.xyz/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await wait(1500);

  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 780, maxHeight: 1328, everyNthFrame: 1 });
  t0 = Date.now();

  // 1. 홈
  mark("home");
  await p.goto("https://doesmc.xyz/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await wait(2200);
  await swipe(420, 1100);
  await wait(1200);
  await swipe(-420, 900);
  await wait(500);

  // 2. 웹마크
  mark("world");
  await p.goto("https://doesmc.xyz/main", { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await wait(4000);
  // 앞으로 걷기 (키보드) + 시점 돌리기 (터치 드래그)
  await p.keyboard.down("w");
  await wait(1800);
  await p.keyboard.up("w");
  await p.mouse.move(250, 400);
  await p.mouse.down();
  for (let i = 0; i < 20; i++) { await p.mouse.move(250 - i * 6, 400); await wait(40); }
  await p.mouse.up();
  await p.keyboard.down("w");
  await wait(1500);
  await p.keyboard.up("w");
  await wait(800);

  // 3. 상점 — 탭 넘기기 · 목록 스와이프
  mark("shop");
  await p.goto("https://doesmc.xyz/dashboard?tab=products", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await wait(2000);
  for (const name of ["마크 망토", "기타상품", "마크 계정"]) {
    const tab = p.getByRole("button", { name: new RegExp(name) }).first();
    if (await tab.count()) { await tab.click().catch(() => {}); await wait(1300); }
  }
  mark("swipe");
  await swipe(520, 1000);
  await wait(700);
  await swipe(620, 1000);
  await wait(700);
  await swipe(520, 1000);
  await wait(900);

  // 4. 상품 열기
  mark("product");
  const link = p.locator('a[href^="/product/mc-"]').first();
  if (await link.count()) {
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await wait(500);
    await link.click().catch(() => {});
  } else {
    await p.goto("https://doesmc.xyz/product/mc-mwkj0pkd5qzy");
  }
  await p.waitForLoadState("networkidle").catch(() => {});
  await wait(2000);
  await swipe(360, 1000);
  await wait(1000);
  await swipe(-360, 800);
  await wait(800);

  // 5. 바로구매
  mark("buy");
  const buy = p.getByRole("button", { name: /바로구매/ }).first();
  await buy.click().catch(() => {});
  await p.waitForLoadState("networkidle").catch(() => {});
  await wait(2500);
  mark("end");
  await cdp.send("Page.stopScreencast");
  await wait(300);
  fs.writeFileSync(path.join(out, "timeline.json"), JSON.stringify({ frames, marks }, null, 1));
  console.log(`frames ${frames.length}, duration ${(frames.at(-1).t / 1000).toFixed(1)}s`, marks.map((m) => `${m.name}@${(m.t / 1000).toFixed(1)}`).join(" "));
  await b.close();
})();
