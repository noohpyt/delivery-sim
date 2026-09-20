// M1 端到端验证：真实驾驶 + 完整接单→取餐→送达流程，断言收入变化
// 用法：node test/e2e.mjs [milestone]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const milestone = process.argv[2] || 'm1';
const shots = path.join(root, 'docs', 'shots');
fs.mkdirSync(shots, { recursive: true });

const failures = [];
const log = (ok, name, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures.push(name);
};

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error('server not ready'));
          else setTimeout(tick, 300);
        });
    };
    tick();
  });
}

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5173', '--strictPort'], { cwd: root, stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
const killServer = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill('SIGTERM');
  } catch {}
};

let browser;
try {
  await waitForServer('http://localhost:5173/');
  // Playwright 1.63 默认要 chrome-headless-shell（未下载）；直接用已缓存的完整 chromium 无头启动
  const chromeExe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
  const launchOpts = { args: ['--enable-unsafe-swiftshader', '--headless=new'] };
  if (fs.existsSync(chromeExe)) launchOpts.executablePath = chromeExe;
  browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('http://localhost:5173/', { waitUntil: 'load' });
  const ready = await page.waitForFunction(() => window.__game?.ready, null, { timeout: 15000 }).catch(() => null);
  log(!!ready, 'game boots (window.__game ready)');

  await page.waitForTimeout(2500); // 让场景稳定渲染
  await page.screenshot({ path: path.join(shots, `${milestone}-01-city.png`) });

  // 1) 驾驶控制：按 W 应沿车头方向前进且速度>0
  const before = await page.evaluate(() => window.__game.rider());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__game.rider());
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  const fwdDot = ((after.x - before.x) * Math.sin(after.heading) + (after.z - before.z) * Math.cos(after.heading)) / (moved || 1);
  log(after.speed > 2 || moved > 5, 'W accelerates', `speed=${after.speed.toFixed(1)} moved=${moved.toFixed(1)}`);
  log(fwdDot > 0.7, 'movement follows heading', `fwdDot=${fwdDot.toFixed(2)}`);

  // 2) 转向：按 A 车头应左转（heading 增大）
  const h0 = (await page.evaluate(() => window.__game.rider())).heading;
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  const h1 = (await page.evaluate(() => window.__game.rider())).heading;
  log(h1 > h0 + 0.05, 'A steers left', `Δheading=${(h1 - h0).toFixed(2)}`);

  // 3) 完整订单流程：生成→接单→取餐→送达→收入增加
  await page.evaluate(() => { window.__game.spawnOffer(); });
  const money0 = await page.evaluate(() => window.__game.money());
  await page.evaluate(() => window.__game.accept(0));
  let target = await page.evaluate(() => window.__game.targetPos());
  log(target?.phase === 'pickup', 'offer accepted, target = pickup');
  await page.screenshot({ path: path.join(shots, `${milestone}-02-pickup-marker.png`) });

  await page.evaluate((t) => window.__game.teleport(t.x, t.z), target);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  target = await page.evaluate(() => window.__game.targetPos());
  log(target?.phase === 'deliver', 'E picks up, target = deliver');

  await page.evaluate((t) => window.__game.teleport(t.x, t.z), target);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const money1 = await page.evaluate(() => window.__game.money());
  const stats = await page.evaluate(() => window.__game.stats());
  log(money1 > money0, 'delivery pays out', `¥${money0} → ¥${money1.toFixed(1)}`);
  log(stats.delivered === 1, 'stats.delivered = 1');
  await page.screenshot({ path: path.join(shots, `${milestone}-03-delivered.png`) });

  // 4) 时钟推进
  const t0 = await page.evaluate(() => window.__game.minutes());
  await page.waitForTimeout(1000);
  const t1 = await page.evaluate(() => window.__game.minutes());
  log(t1 > t0, 'game clock advances', `${(t1 - t0).toFixed(2)} min/s real`);

  log(consoleErrors.length === 0, 'no console/page errors', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  console.error('E2E crashed:', e);
  failures.push('crash');
} finally {
  await browser?.close();
  killServer();
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
