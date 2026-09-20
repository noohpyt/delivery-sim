// 端到端验证：开场叙事 → 选班 → 驾驶 → 接单→规划→取餐→送达 → 系统层 → 日终结算
// 用法：node test/e2e.mjs [milestone]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const milestone = process.argv[2] || 'm4';
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
  const chromeExe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
  const launchOpts = { args: ['--enable-unsafe-swiftshader', '--headless=new'] };
  if (fs.existsSync(chromeExe)) launchOpts.executablePath = chromeExe;
  browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const G = (expr) => page.evaluate(new Function('return window.__game.' + expr));

  await page.goto('http://localhost:5173/', { waitUntil: 'load' });
  const ready = await page.waitForFunction(() => window.__game?.ready, null, { timeout: 15000 }).catch(() => null);
  log(!!ready, 'game boots (window.__game ready)');

  // === M4 叙事层：产品经理开场 ===
  log((await G('state()')) === 'pm', 'boots into PM phase');
  await page.waitForTimeout(8500); // 等开场文案 + 第一张决策卡
  await page.screenshot({ path: path.join(shots, `${milestone}-01-pm.png`) });
  const pm0 = await G('pmInfo()');
  log(pm0 && pm0.round === 0, 'PM decision card phase', JSON.stringify(pm0));
  // 做 3 轮决策（全选压缩）
  for (let r = 0; r < 3; r++) {
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(400);
  }
  const pm1 = await G('pmInfo()');
  log(pm1.round === 3 && pm1.perf > 50, '3 decisions applied, perf up', JSON.stringify(pm1));
  await page.waitForTimeout(3500); // 等进入转场
  log((await G('state()')) === 'layoff', 'layoff transition starts');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(shots, `${milestone}-02-layoff.png`) });
  await page.evaluate(() => window.__game.skipLayoff()); // 补全文字
  await page.evaluate(() => window.__game.skipLayoff()); // 结束转场
  await page.waitForTimeout(300);
  log((await G('state()')) === 'shift', 'layoff done → shift select');

  // === 选班 ===
  await page.keyboard.press('Digit3'); // 夜班
  await page.waitForTimeout(300);
  log((await G('state()')) === 'ride', 'shift selected → ride');
  await page.evaluate(() => window.__game.eventsTimer(9999));

  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `${milestone}-03-city.png`) });

  // === 驾驶控制 ===
  const before = await G('rider()');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const after = await G('rider()');
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  const fwdDot = ((after.x - before.x) * Math.sin(after.heading) + (after.z - before.z) * Math.cos(after.heading)) / (moved || 1);
  log(after.speed > 2 || moved > 5, 'W accelerates', `speed=${after.speed.toFixed(1)} moved=${moved.toFixed(1)}`);
  log(fwdDot > 0.7, 'movement follows heading', `fwdDot=${fwdDot.toFixed(2)}`);
  const h0 = (await G('rider()')).heading;
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  const h1 = (await G('rider()')).heading;
  log(h1 > h0 + 0.05, 'A steers left', `Δheading=${(h1 - h0).toFixed(2)}`);

  // === 接单 → 规划 → 近肩镜头 → 送达 ===
  await page.evaluate(() => { window.__game.spawnOffer(); });
  const money0 = await G('money()');
  await page.evaluate(() => window.__game.accept(0));
  await page.waitForTimeout(200);
  log((await G('state()')) === 'plan', 'accepting enters PLAN state');
  const planInfo = await G('planInfo()');
  log(planInfo.totalEtaSec > 0 && planInfo.stops === 2, 'plan has ETA + 2 stops', JSON.stringify(planInfo));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  log((await G('state()')) === 'ride', 'Enter confirms plan → ride');
  log(await G('routeVisible()'), 'auto-nav route ribbon visible');

  let target = await G('targetPos()');
  log(target?.phase === 'pickup', 'next stop = pickup');
  // 靠近目标 → 镜头推近（近肩沉浸）
  await page.evaluate((t) => window.__game.teleport(t.x + 12, t.z), target);
  await page.waitForTimeout(2500);
  const blend = await G('camBlend()');
  log(blend > 0.4, 'camera blends to near-shoulder near stop', `camBlend=${blend}`);
  await page.screenshot({ path: path.join(shots, `${milestone}-04-nearcam.png`) });
  await page.keyboard.press('KeyE'); // 已在交互半径外？12m > 7m，靠近一点
  await page.evaluate((t) => window.__game.teleport(t.x, t.z), target);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  target = await G('targetPos()');
  log(target?.phase === 'deliver', 'E picks up, next stop = deliver');
  await page.evaluate((t) => window.__game.teleport(t.x, t.z), target);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const money1 = await G('money()');
  const stats = await G('stats()');
  log(money1 > money0, 'delivery pays out', `¥${money0} → ¥${money1.toFixed(1)}`);
  log(stats.delivered === 1, 'stats.delivered = 1');
  log((await G('odoKm()')) > 0, 'odometer tracks distance');

  // === M3 系统层回归 ===
  await page.evaluate(() => window.__game.setMinutes(12 * 60));
  await page.waitForTimeout(300);
  const noon = await G('lighting()');
  await page.evaluate(() => window.__game.setMinutes(22 * 60));
  await page.waitForTimeout(300);
  const night = await G('lighting()');
  log(noon.sunI > night.sunI && noon.sky !== night.sky, 'day/night lighting differs', `noon=${JSON.stringify(noon)} night=${JSON.stringify(night)}`);
  await page.evaluate(() => window.__game.setMinutes(11.5 * 60));
  log(await G('isPeak()'), 'peak hour detected at 11:30');
  await page.evaluate(() => window.__game.setMinutes(15 * 60));

  await page.evaluate(() => window.__game.forceEvent('road_closure'));
  await page.waitForTimeout(150);
  log((await G('blockedEdges()')).some((e) => e.blocked), 'road_closure blocks an edge');
  await page.evaluate(() => window.__game.forceEvent('traffic_jam'));
  await page.evaluate(() => window.__game.forceEvent('drone_guide'));
  await page.evaluate(() => window.__game.forceEvent('order_transfer'));
  await page.waitForTimeout(200);
  log((await G('offers()')).some((o) => o.tag === '⚡转让'), 'order_transfer adds high-reward offer');

  await page.evaluate(() => window.__game.forceEvent('police_check'));
  await page.waitForTimeout(150);
  log((await G('rider()')).frozen, 'police_check freezes rider');
  log((await G('knowledge()')).includes('cop_friend'), 'knowledge unlocked: cop_friend');
  await page.waitForTimeout(6500);
  log(!(await G('rider()')).frozen, 'rider released after check');

  await page.evaluate(() => window.__game.charge(60));
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const batt = (await G('rider()')).battery;
  log(batt < 58, 'boost drains battery', `battery=${batt.toFixed(1)}`);

  const s0 = await G('slackScale()');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__game.recordDelivery(0.4); });
  const s1 = await G('slackScale()');
  log(s1 < s0, 'difficulty tightens after fast deliveries', `${s0} → ${s1}`);
  await page.evaluate(() => window.__game.setDelivered(5));
  const know = await G('knowledge()');
  log(know.includes('pre_order') && know.includes('merge_orders'), 'knowledge unlocked by deliveries', know.join(','));

  // === 日终结算（M4 版内容断言） ===
  await page.evaluate(() => window.__game.setMinutes(24 * 60 + 0.01));
  await page.waitForTimeout(400);
  log((await G('state()')) === 'dayend', 'day ends at 24:00 → settlement');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, `${milestone}-05-dayend.png`) });
  const dayendHtml = await page.evaluate(() => document.getElementById('overlay').textContent);
  log(dayendHtml.includes('今日收入') && dayendHtml.includes('准时率') && dayendHtml.includes('今日遭遇') && dayendHtml.includes('段位'), 'settlement shows income/on-time/events/rank');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  log((await G('state()')) === 'shift', 'R starts new day (shift select)');

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
