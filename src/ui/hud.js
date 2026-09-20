// HUD：DOM 覆盖层（状态、订单、报价、提示）
export class HUD {
  constructor(root) {
    root.innerHTML = `
      <div id="hud-status" class="hud-panel">
        <div>🕐 <span id="hud-time">--:--</span></div>
        <div class="money">¥ <span id="hud-money">0.0</span></div>
        <div style="font-size:12px;color:#7fb8d8">已送 <span id="hud-count">0</span> 单 · 超时 <span id="hud-late">0</span></div>
      </div>
      <div id="hud-orders" class="hud-panel"><b>进行中订单</b><div id="hud-order-list"><div style="color:#5b7a94">暂无，按 Enter 接单</div></div></div>
      <div id="hud-offers" class="hud-panel"><b>📡 订单推送</b><div id="hud-offer-list"></div></div>
      <div id="hud-prompt" class="hud-panel"></div>
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
      Math.round(rider.speed * 3.6),
    ].join('|');
    if (key === this.lastKey) return; // 无变化不碰 DOM
    this.lastKey = key;

    this.el.time.textContent = workday.hhmm;
    this.el.money.textContent = money.toFixed(1);
    this.el.count.textContent = orders.stats.delivered;
    this.el.late.textContent = orders.stats.late;
    this.el.speed.textContent = Math.round(Math.abs(rider.speed) * 3.6);

    this.el.offerList.innerHTML = orders.offers.length
      ? orders.offers.map((o, i) =>
          `<div class="offer"><span class="key">[${i === 0 ? 'Enter' : ''}]</span> ${o.restaurant} → 顾客 · ${(o.distM / 1000).toFixed(1)}km · ¥${o.reward} · 限${this.fmtRemain(o.limitSec)}</div>`
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
