// node render.cjs outDir [names...] — 각 이모지를 512px 투명 PNG 프레임으로 뽑는다
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { I, ANIMATED, render } = require('./icons.cjs');
(async () => {
  const out = process.argv[2];
  const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(I);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  for (const n of names) {
    const frames = ANIMATED[n] ?? 1;
    fs.mkdirSync(path.join(out, n), { recursive: true });
    for (let i = 0; i < frames; i++) {
      await p.setContent(`<html><body style="margin:0;background:transparent">${render(n, i / frames, i)}</body></html>`);
      await p.screenshot({ path: path.join(out, n, String(i).padStart(3, '0') + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
    }
  }
  await b.close();
})();
