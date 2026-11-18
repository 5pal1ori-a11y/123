// 이모지 프레임 렌더: node render-emoji.cjs outDir name:frames ...
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const outDir = process.argv[2];
  const b = await chromium.launch({ args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto('http://127.0.0.1:8765/scripts/three/index.html');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  for (const spec of process.argv.slice(3)) {
    const [name, n] = spec.split(':');
    const dir = path.join(outDir, name);
    fs.mkdirSync(dir, { recursive: true });
    await p.evaluate((nm) => window.setupEmoji(nm, 384), name);
    for (let i = 0; i < Number(n); i++) {
      const url = await p.evaluate(([i, n]) => window.frameEmoji(i, n), [i, Number(n)]);
      fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('rendered', name);
  }
  await b.close();
})();
