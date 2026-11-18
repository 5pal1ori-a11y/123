// three.js 장면을 프레임마다 투명 PNG 로 뽑는다: node render.cjs jobs.json outDir
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const outDir = process.argv[3];
  const b = await chromium.launch({ args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto('http://127.0.0.1:8765/scripts/three/index.html');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  for (const job of jobs) {
    const dir = path.join(outDir, job.id);
    fs.mkdirSync(dir, { recursive: true });
    await p.evaluate((j) => window.setup(j.scene, j.w, j.h, j.opts || {}), job);
    for (let i = 0; i < job.frames; i++) {
      const url = await p.evaluate(([i, n]) => window.frame(i, n), [i, job.frames]);
      fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('rendered', job.id, job.frames);
  }
  await b.close();
})();
