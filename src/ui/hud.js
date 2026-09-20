// HUD：DOM 覆盖层（状态、订单、报价、提示）
export class HUD {
  constructor(root) {
    root.innerHTML = `
      <div id="hud-status" class="hud-panel">
        <div>🕐 <span id="hud-time">--:--</span> <span id="hud-peak" style="color:#ffd166;font-size:12px;"></span></div>
        <div class="money">¥ <span id="hud-money">0.0</span></div>
        <div style="font-size:12px;color:#7fb8d8">已送 <span id="hud-count">0</span> 单 · 超时 <span id="hud-late">0</span> · 🧠<span id="hud-know">0</span></div>
        <div style="margin-top:4px;font-size:12px;">🔋 <span style="display:inline-block;width:90px;height:8px;background:#12203a;border-radius:4px;vertical-align:middle;"><span id="hud-batt" style="display:block;height:100%;width:100%;background:#7dffb2;border-radius:4px;"></span></span></div>
        <div id="hud-events" style="margin-top:4px;font-size:12px;color:#ff8fa3;"></div>
      </div>
      <div id="hud-orders" class="hud-panel"><b>进行中订单</b><div id="hud-order-list"><div style="color:#5b7a94">暂无，按 Enter 接单</div></div></div>
      <div id="hud-offers" class="hud-panel"><b>📡 订单推送</b><div id="hud-offer-list"></div></div>
      <div id="hud-prompt" class="hud-panel"></div>
      <div id="hud-hint" style="position:absolute;top:64px;left:50%;transform:translateX(-50%);padding:8px 20px;display:none;font-size:15px;color:#ffd166;" class="hud-panel"></div>
      <div id="hud-speed" class="hud-panel"><span id="hud-speed-v">0</span> <small>km/h</small></div>`;
    this.el = {
      time: document.getElementById('hud-time'),
      money: document.getElementById('hud-money'),
      count: document.getElementById('hud-count'),
      late: document.getElementById('hud-late'),
      orderList: document.getElementById('hud-order-list'),
      offerList: document.getElementById('hud-offer-list'),
      prompt: document.getElementById('hud-prompt'),
      speed: document.getElementById('hud-speed-v'),
      batt: document.getElementById('hud-batt'),
      peak: document.getElementById('hud-peak'),
      know: document.getElementById('hud-know'),
      events: document.getElementById('hud-events'),
      hint: document.getElementById('hud-hint'),
    };
    this.lastKey = '';
  }

  fmtRemain(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  update(game) {
    const { workday, orders, rider, money } = game;
    const key = [
      workday.hhmm, money.toFixed(1), orders.stats.delivered, orders.stats.late,
      orders.offers.map((o) => o.id).join(','),
      orders.active.map((o) => `${o.id}:${o.phase}:${Math.ceil(o.remainSec)}`).join(','),
      Math.round(rider.speed * 3.6), Math.round(rider.battery), workday.isPeak ? 1 : 0,
      game.knowledge.unlocked.size,
      game.events.active.map((a) => a.def.id + Math.ceil(a.remainSec)).join(','),
    ].join('|');
    if (key === this.lastKey) return; // 无变化不碰 DOM
    this.lastKey = key;

    this.el.time.textContent = workday.hhmm;
    this.el.peak.textContent = workday.isPeak ? '🔥高峰' : '';
    this.el.money.textContent = money.toFixed(1);
    this.el.count.textContent = orders.stats.delivered;
    this.el.late.textContent = orders.stats.late;
    this.el.know.textContent = game.knowledge.unlocked.size;
    this.el.speed.textContent = Math.round(Math.abs(rider.speed) * 3.6);
    const b = Math.round(rider.battery);
    this.el.batt.style.width = b + '%';
    this.el.batt.style.background = b > 40 ? '#7dffb2' : b > 15 ? '#ffd166' : '#ff4d6d';
    this.el.events.innerHTML = game.events.active
      .map((a) => `${a.def.icon} ${a.def.name} ${Math.ceil(a.remainSec)}s`)
      .join('　');

    this.el.offerList.innerHTML = orders.offers.length
      ? orders.offers.map((o, i) =>
          `<div class="offer">${o.tag || ''}<span class="key">[${i === 0 ? 'Enter' : ''}]</span> ${o.restaurant} → 顾客 · ${(o.distM / 1000).toFixed(1)}km · ¥${o.reward} · 限${this.fmtRemain(o.limitSec)}</div>`
        ).join('')
      : '<div style="color:#5b7a94">等待平台派单…</div>';

    this.el.orderList.innerHTML = orders.active.length
      ? orders.active.map((o) =>
          `<div class="order ${o.remainSec <= 0 ? 'late' : ''}">
            ${o.phase === 'pickup' ? '🏪 取餐' : '📦 送达'} ${o.restaurant}
            <span class="t">${o.remainSec > 0 ? this.fmtRemain(o.remainSec) : '已超时'}</span>
          </div>`
        ).join('')
      : '<div style="color:#5b7a94">暂无，按 Enter 接单</div>';
  }

  prompt(text) {
    if (performance.now() < (this.toastUntil || 0)) return; // toast 优先
    this.el.prompt.style.display = text ? 'block' : 'none';
    if (text) this.el.prompt.textContent = text;
  }

  hint(text, dur = 5) { // 新手引导横幅
    this.el.hint.style.display = 'block';
    this.el.hint.textContent = text;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { this.el.hint.style.display = 'none'; }, dur * 1000);
  }

  toast(text, color = '#7dffb2') { // 简版中央提示，2秒消失
    this.el.prompt.style.display = 'block';
    this.el.prompt.style.color = color;
    this.el.prompt.textContent = text;
    this.toastUntil = performance.now() + 2000;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      this.el.prompt.style.display = 'none';
      this.el.prompt.style.color = '';
    }, 2000);
  }
}
