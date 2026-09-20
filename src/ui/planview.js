// 送前暂停规划界面：大地图 + 分段 ETA + 总耗时 + 自动导航开关
import { drawMap } from './minimap.js';

export class PlanView {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'plan-view';
    this.el.style.cssText =
      'position:fixed;inset:0;display:none;background:rgba(4,8,18,0.86);z-index:20;' +
      'font-family:"Segoe UI","Microsoft YaHei",monospace;color:#cfeaff;';
    this.el.innerHTML = `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;gap:22px;align-items:flex-start;">
        <canvas id="plan-canvas" width="520" height="520" style="border:1px solid rgba(0,229,255,.5);border-radius:10px;box-shadow:0 0 24px rgba(0,229,255,.3);"></canvas>
        <div style="width:330px;padding:18px;background:rgba(8,14,30,.85);border:1px solid rgba(0,229,255,.45);border-radius:10px;">
          <h2 style="margin:0 0 4px;color:#00e5ff;font-size:20px;">📋 配送规划</h2>
          <div style="color:#7fb8d8;font-size:12px;margin-bottom:10px;">出发前暂停 · 时间已冻结</div>
          <div id="plan-legs" style="font-size:14px;line-height:1.9;"></div>
          <div id="plan-total" style="margin-top:12px;font-size:16px;color:#ffd166;"></div>
          <div id="plan-nav" style="margin-top:8px;font-size:13px;color:#7dffb2;"></div>
          <div style="margin-top:16px;font-size:13px;color:#9fc6e0;line-height:2;">
            <b>[Enter]</b> 确认出发<br>
            <b>[N]</b> 切换自动导航<br>
            <b>[X]</b> 放弃不可达订单（若有）
          </div>
        </div>
      </div>`;
    root.appendChild(this.el);
    this.ctx = this.el.querySelector('#plan-canvas').getContext('2d');
    this.legsEl = this.el.querySelector('#plan-legs');
    this.totalEl = this.el.querySelector('#plan-total');
    this.navEl = this.el.querySelector('#plan-nav');
  }

  fmt(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  open(net, rider, plan, autoNav) {
    this.el.style.display = 'block';
    this.render(net, rider, plan, autoNav);
  }
  render(net, rider, plan, autoNav) {
    drawMap(this.ctx, 520, { net, rider, plan, pulse: 0.5 });
    this.legsEl.innerHTML = plan.legs.map((l, i) =>
      `<div><b style="color:#00e5ff">${i + 1}.</b> ${l.label} — ${(l.lengthM / 1000).toFixed(1)}km · 约 ${this.fmt(l.etaSec)}</div>`
    ).join('') || '<div style="color:#5b7a94">没有待配送订单</div>';
    this.totalEl.textContent = `预计总耗时 ${this.fmt(plan.totalEtaSec)}（游戏时间）`;
    if (plan.unreachable) this.totalEl.textContent += ` ⚠ ${plan.unreachable} 单无路可达`;
    this.navEl.textContent = `自动导航：${autoNav ? '开 ✓' : '关'}`;
  }
  close() { this.el.style.display = 'none'; }
}
