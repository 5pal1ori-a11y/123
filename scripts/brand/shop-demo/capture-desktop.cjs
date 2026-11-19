/**
 * 실제 doesmc.xyz PC 화면 녹화 (1536x864 화면을 1920x1080 고화질로 · 마우스 커서 · 클릭 표시 포함).
 *   node scripts/brand/shop-demo/capture-desktop.cjs <출력폴더>
 * 결과: <출력폴더>/frames/*.jpg, <출력폴더>/timeline.json
 *
 * 구매 장면은 실제 결제 없이 보여 주려고, 이 녹화 브라우저 안에서만
 * 로그인 확인(/api/auth/user/me)과 포인트 결제(/api/purchase/points) 응답을 데모 값으로 바꾼다.
 * 서버에는 결제 요청이 가지 않는다.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const out = process.argv[2] || "shop-demo-desktop";
fs.mkdirSync(path.join(out, "frames"), { recursive: true });

// 화면에 보이는 마우스 커서 · 클릭 물결 (헤드리스 녹화에는 커서가 안 찍혀서 직접 그린다)
const CURSOR = () => {
  const make = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5v17l4.6-4.3 3 6.6 3-1.4-3-6.5H18z" fill="#fff" stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 3px 6px rgba(0,0,0,.45))" });
    document.documentElement.appendChild(c);
    window.addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 3}px)`), true);
    window.addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        Object.assign(r.style, { position: "fixed", left: e.clientX - 22 + "px", top: e.clientY - 22 + "px", width: "44px", height: "44px", borderRadius: "50%",
          border: "3px solid rgba(129,140,248,.95)", background: "rgba(129,140,248,.25)", zIndex: 2147483646, pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" });
        document.documentElement.appendChild(r);
        requestAnimationFrame(() => { r.style.transform = "scale(2.2)"; r.style.opacity = "0"; });
        setTimeout(() => r.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", make);
  else make();
};

(async () => {
  const b = await chromium.launch({ args: ["--force-device-scale-factor=1.25"] });
  const ctx = await b.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  await ctx.addInitScript(CURSOR);
  const DEMO_USER = {
    id: "usr_demo", email: "demo@doesmc.xyz", name: "DOES 데모", bankDepositorName: null, avatar: null,
    points: 50000, totalCharged: 50000, discordId: "100000000000000001", discordUsername: "does_demo", theme: "dark", tierId: null,
    isSubAdmin: false, staffPermissions: [], banned: false, banReason: null, acceptedTermsVersion: "1.0",
    acceptedPrivacyVersion: "1.0", minecraftUuid: null, minecraftName: null, minecraftManual: false, premium: null,
  };
  let demoPoints = DEMO_USER.points;
  await ctx.route("**/api/auth/user/me", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { user: { ...DEMO_USER, points: demoPoints } } })
      : route.fulfill({ json: { ok: true } }),
  );
  await ctx.route("**/api/purchase/points", async (route) => {
    const body = route.request().postDataJSON() || {};
    demoPoints -= 12900;
    await new Promise((r) => setTimeout(r, 700));
    return route.fulfill({
      json: { order: { id: "ord_demo", orderUuid: "DEMO-ORDER", productId: body.productId, dispensedCode: "DOES-7K2Q-X9M4-TB8R" } },
    });
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  const marks = [];
  let t0 = 0;
  let n = 0;
  // 녹화 중에는 마우스 이동 한 번이 느려서, 실제 시각 대신 "의도한 시각"(vt)으로 프레임 시각을 매긴다
  let vt = 0;
  const adv = (ms) => (vt += ms);
  // 기다리는 중 · 페이지 불러오는 중에는 실제 흐른 시간만큼 vt 를 이어서 흘려보낸다
  // (끝날 때 한꺼번에 더하면 그사이 프레임이 같은 시각에 몰려 영상이 뚝뚝 끊긴다)
  let flowStart = null;
  let flowCap = Infinity;
  const nowVt = () => (flowStart === null ? vt : vt + Math.min(flowCap, Date.now() - flowStart));
  const flow = async (fn, cap = Infinity) => {
    flowStart = Date.now();
    flowCap = cap;
    try { await fn(); } finally { vt += Math.min(cap, Date.now() - flowStart); flowStart = null; }
  };
  let mx = 768, my = 600;
  cdp.on("Page.screencastFrame", (f) => {
    const file = `f${String(n++).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(out, "frames", file), Buffer.from(f.data, "base64"));
    frames.push({ t: Math.round(nowVt()), file });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  const mark = (name) => marks.push({ name, t: Math.round(nowVt()) });
  const wait = (ms) => flow(() => p.waitForTimeout(ms));
  const sleep = (ms) => p.waitForTimeout(ms);
  /** 페이지 불러오기: 걸린 시간만큼(최대 1.2초)만 영상 시각에 더한다 */
  const load = (fn) => flow(fn, 1200);
  /** 부드럽게 마우스 이동 */
  const glide = async (x, y, ms = 650) => {
    const steps = Math.max(8, Math.round(ms / 33));
    const sx = mx, sy = my;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await p.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      adv(ms / steps);
    }
    mx = x; my = y;
  };
  const clickAt = async (x, y) => { await glide(x, y); await wait(150); await p.mouse.down(); await sleep(60); adv(90); await p.mouse.up(); };
  const clickEl = async (loc) => {
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return false;
    await clickAt(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  };
  /** 휠로 부드럽게 스크롤 */
  const wheel = async (dy, ms = 1000) => {
    const steps = Math.round(ms / 33);
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = 1 - Math.pow(1 - k, 3);
      const target = dy * e;
      await p.mouse.wheel(0, target - done);
      done = target;
      await sleep(20);
      adv(ms / steps);
    }
  };

  // 캐시 데우기
  for (const u of ["https://doesmc.xyz/main", "https://doesmc.xyz/dashboard?tab=products", "https://doesmc.xyz/product/mc-mwkj0pkd5qzy", "https://doesmc.xyz/"]) {
    await p.goto(u, { waitUntil: u.endsWith("/main") ? "load" : "networkidle", timeout: 60000 }).catch(() => {});
    await wait(u.endsWith("/main") ? 5000 : 800);
  }
  await p.goto("https://doesmc.xyz/", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await wait(1200);
  await p.mouse.move(mx, my);

  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  t0 = Date.now();
  vt = 0;

  // 1. 홈
  mark("home");
  await wait(1200);
  await glide(560, 760, 900);
  await wait(500);
  await glide(1000, 760, 900);
  await wait(400);
  await glide(768, 575, 700);
  await wait(600);

  // 2. 웹마크
  mark("world");
  await load(() => p.goto("https://doesmc.xyz/main", { waitUntil: "load", timeout: 60000 }).catch(() => {}));
  await p.mouse.move(mx, my);
  await wait(3500);
  await p.locator("canvas").first().focus().catch(() => {});
  await p.keyboard.down("w");
  await wait(1600);
  await p.keyboard.up("w");
  await p.mouse.move(768, 480);
  mx = 768; my = 480;
  await p.mouse.down({ button: "right" });
  await glide(600, 470, 900);
  await p.mouse.up({ button: "right" });
  await p.keyboard.down("w");
  await wait(1400);
  await p.keyboard.up("w");
  await wait(600);

  // 3. 상점 — 탭 넘기기
  mark("shop");
  await load(() => p.goto("https://doesmc.xyz/dashboard?tab=products", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {}));
  await p.mouse.move(mx, my);
  await wait(1200);
  for (const name of ["마인크래프트 망토", "기타상품", "마인크래프트 계정"]) {
    const tab = p.getByRole("button", { name: new RegExp(name) }).first();
    if (await tab.count()) { await clickEl(tab); await wait(1100); }
  }

  // 4. 목록 넘기기 (휠 스크롤 + 카드 위에 올려 보기)
  mark("swipe");
  await glide(900, 560, 500);
  await wheel(520, 1100);
  await wait(400);
  const cards = p.locator('a[href^="/product/mc-"]');
  for (let i = 0; i < 3; i++) {
    const c = cards.nth(i);
    const box = await c.boundingBox().catch(() => null);
    if (box && box.y > 0 && box.y < 800) { await glide(box.x + box.width / 2, Math.min(800, box.y + box.height / 2), 450); await wait(350); }
  }
  await wheel(480, 1000);
  await wait(500);
  await wheel(-700, 1000);
  await wait(500);

  // 5. 상품 열기
  mark("product");
  const target = p.locator('a[href="/product/mc-mwkj0pkd5qzy"]').first();
  if (!(await clickEl(target))) await clickEl(cards.nth(1));
  await load(() => p.waitForURL(/\/product\//, { timeout: 15000 }).then(() => p.waitForLoadState("networkidle")).catch(() => {}));
  await p.mouse.move(mx, my);
  await wait(1300);
  await glide(768, 560, 600);
  await wheel(420, 1100);
  await wait(900);
  await wheel(-420, 900);
  await wait(500);

  // 6. 바로구매 → 결제 화면
  mark("buy");
  const buy = p.getByRole("button", { name: /바로구매/ }).first();
  await clickEl(buy);
  await load(() => p.waitForURL(/checkout/, { timeout: 15000 }).then(() => p.waitForLoadState("networkidle")).catch(() => {}));
  await p.mouse.move(mx, my);
  await wait(1300);
  await glide(900, 300, 900);
  await wait(900);

  // 7. 약관 동의 · 포인트 결제
  mark("pay");
  const agree = p.locator('input[type="checkbox"]').first();
  const agreeBox = await agree.boundingBox().catch(() => null);
  if (agreeBox) await clickAt(agreeBox.x + agreeBox.width / 2, agreeBox.y + agreeBox.height / 2);
  else await agree.check({ force: true }).catch(() => {});
  await wait(700);
  const pay = p.getByRole("button", { name: /포인트로/ }).first();
  await clickEl(pay);
  await load(() => p.getByText("구매 완료").first().waitFor({ timeout: 15000 }).catch(() => {}));
  await wait(600);
  mark("done");
  await glide(768, 380, 700);
  await wait(2600);
  mark("end");
  await cdp.send("Page.stopScreencast");
  await wait(300);
  fs.writeFileSync(path.join(out, "timeline.json"), JSON.stringify({ frames, marks }, null, 1));
  console.log(`frames ${frames.length}, duration ${(frames.at(-1).t / 1000).toFixed(1)}s`, marks.map((m) => `${m.name}@${(m.t / 1000).toFixed(1)}`).join(" "));
  await b.close();
})();
