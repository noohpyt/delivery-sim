// 端到端验证：驾驶 + 接单→规划→取餐→送达全流程 + 系统层（昼夜/事件/难度/知识/日结）
// 用法：node test/e2e.mjs [milestone]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const milestone = process.argv[2] || 'm3';
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

  // 0) 班次选择（M3）
  await page.waitForTimeout(800);
  log((await G('state()')) === 'shift', 'boots into shift select');
  await page.screenshot({ path: path.join(shots, `${milestone}-00-shift.png`) });
  await page.keyboard.press('Digit3'); // 夜班（覆盖 16:00–24:00，便于测真·夜晚）
  await page.waitForTimeout(300);
  log((await G('state()')) === 'ride', 'shift selected → ride');
  await page.evaluate(() => window.__game.eventsTimer(9999)); // 冻结随机事件，逐个手动触发

  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(shots, `${milestone}-01-city.png`) });

  // 1) 驾驶控制
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

  // 2) 接单 → 规划 → 送达
  await page.evaluate(() => { window.__game.spawnOffer(); });
  const money0 = await G('money()');
  await page.evaluate(() => window.__game.accept(0));
  await page.waitForTimeout(200);
  log((await G('state()')) === 'plan', 'accepting enters PLAN state');
  const planInfo = await G('planInfo()');
  log(planInfo.totalEtaSec > 0 && planInfo.stops === 2, 'plan has ETA + 2 stops', JSON.stringify(planInfo));
  await page.screenshot({ path: path.join(shots, `${milestone}-02-plan.png`) });
  log(await page.evaluate(() => !!document.querySelector('#minimap')), 'minimap canvas exists');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  log((await G('state()')) === 'ride', 'Enter confirms plan → ride');
  log(await G('routeVisible()'), 'auto-nav route ribbon visible');

  let target = await G('targetPos()');
  log(target?.phase === 'pickup', 'next stop = pickup');
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
  await page.screenshot({ path: path.join(shots, `${milestone}-03-delivered.png`) });

  // 3) M3 系统层
  // 昼夜光照
  await page.evaluate(() => window.__game.setMinutes(12 * 60));
  await page.waitForTimeout(300);
  const noon = await G('lighting()');
  await page.screenshot({ path: path.join(shots, `${milestone}-04-noon.png`) });
  await page.evaluate(() => window.__game.setMinutes(22 * 60));
  await page.waitForTimeout(300);
  const night = await G('lighting()');
  await page.screenshot({ path: path.join(shots, `${milestone}-05-night.png`) });
  log(noon.sunI > night.sunI && noon.sky !== night.sky, 'day/night lighting differs', `noon=${JSON.stringify(noon)} night=${JSON.stringify(night)}`);
  // 高峰
  await page.evaluate(() => window.__game.setMinutes(11.5 * 60));
  log(await G('isPeak()'), 'peak hour detected at 11:30');
  await page.evaluate(() => window.__game.setMinutes(15 * 60));
  log(!(await G('isPeak()')), 'off-peak at 15:00');

  // 事件：封路
  await page.evaluate(() => window.__game.forceEvent('road_closure'));
  await page.waitForTimeout(150);
  const blocked = await G('blockedEdges()');
  log(blocked.some((e) => e.blocked), 'road_closure blocks an edge', JSON.stringify(blocked));
  // 事件：堵车
  await page.evaluate(() => window.__game.forceEvent('traffic_jam'));
  await page.waitForTimeout(150);
  log((await G('eventsActive()')).includes('traffic_jam'), 'traffic_jam active');
  // 事件：无人机（好事件）
  await page.evaluate(() => window.__game.forceEvent('drone_guide'));
  await page.waitForTimeout(150);
  log((await G('eventsActive()')).includes('drone_guide'), 'drone_guide active (good event)');
  // 事件：订单转让（高风险高回报）
  await page.evaluate(() => window.__game.forceEvent('order_transfer'));
  await page.waitForTimeout(150);
  const offers = await G('offers()');
  log(offers.some((o) => o.tag === '⚡转让'), 'order_transfer adds high-reward offer');

  // 事件：交警查车 → 冻结 → 解锁知识 → 到时放行
  await page.evaluate(() => window.__game.forceEvent('police_check'));
  await page.waitForTimeout(150);
  log((await G('rider()')).frozen, 'police_check freezes rider');
  log((await G('knowledge()')).includes('cop_friend'), 'knowledge unlocked: cop_friend');
  await page.waitForTimeout(6500);
  log(!(await G('rider()')).frozen, 'rider released after check');

  // 电池：加速耗电
  await page.evaluate(() => window.__game.charge(60));
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const batt = (await G('rider()')).battery;
  log(batt < 58, 'boost drains battery', `battery=${batt.toFixed(1)}`);

  // 难度渐进：连续快送 → 时限收紧
  const s0 = await G('slackScale()');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__game.recordDelivery(0.4); });
  const s1 = await G('slackScale()');
  log(s1 < s0, 'difficulty tightens after fast deliveries', `${s0} → ${s1}`);

  // 知识锁：送达数解锁
  await page.evaluate(() => window.__game.setDelivered(5));
  const know = await G('knowledge()');
  log(know.includes('pre_order') && know.includes('merge_orders'), 'knowledge unlocked by deliveries', know.join(','));

  // 日终结算（夜班 24:00 结束）
  await page.evaluate(() => window.__game.setMinutes(24 * 60 + 0.01));
  await page.waitForTimeout(400);
  log((await G('state()')) === 'dayend', 'day ends at 24:00 → settlement');
  await page.screenshot({ path: path.join(shots, `${milestone}-06-dayend.png`) });
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
