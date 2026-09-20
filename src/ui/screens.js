// 全屏界面：班次选择 + 日结算（M4 会扩展叙事界面）
import { SHIFTS } from '../systems/workday.js';
import { KNOWLEDGE } from '../config/knowledge.js';
import { RANKS } from '../config/story.js';

const overlayStyle =
  'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
  'background:rgba(4,8,18,0.88);z-index:30;font-family:"Segoe UI","Microsoft YaHei",monospace;color:#cfeaff;';

export class ShiftSelect {
  constructor(root, onSelect) {
    this.el = document.createElement('div');
    this.el.style.cssText = overlayStyle;
    this.el.innerHTML = `
      <div style="text-align:center;max-width:640px;">
        <h1 style="color:#00e5ff;text-shadow:0 0 18px rgba(0,229,255,.8);font-size:34px;margin-bottom:6px;">霓虹骑手</h1>
        <div style="color:#7fb8d8;margin-bottom:26px;">选择今天的上岗时段（8 小时工作制）</div>
        <div style="display:flex;gap:16px;justify-content:center;">
          ${SHIFTS.map((s, i) => `
            <div class="shift-card" data-i="${i}" style="cursor:pointer;padding:20px 26px;border:1px solid rgba(0,229,255,.5);border-radius:10px;background:rgba(8,14,30,.85);min-width:150px;">
              <div style="font-size:40px;">${['🌅', '🔥', '🌃'][i]}</div>
              <div style="font-size:18px;color:#fff;margin:8px 0 4px;">${s.name}</div>
              <div style="color:#7fb8d8;font-size:13px;">${s.span}</div>
              <div style="color:#ffd166;font-size:12px;margin-top:8px;">[${i + 1}]</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:24px;color:#5b7a94;font-size:12px;">提示：11–13 点、18–20 点是饭点高峰，单更密、价更高</div>
      </div>`;
    root.appendChild(this.el);
    this.el.querySelectorAll('.shift-card').forEach((c) =>
      c.addEventListener('click', () => { this.hide(); onSelect(SHIFTS[+c.dataset.i]); }));
    this.onKey = (e) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) { this.hide(); onSelect(SHIFTS[i]); }
    };
    addEventListener('keydown', this.onKey);
  }
  hide() {
    this.el.style.display = 'none';
    removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}

export class DayEnd {
  constructor(root) {
    this.root = root;
    this.el = null;
  }
  show(summary, onNext) {
    this.hide();
    const { money, dayMoney, delivered, late, events, knowledgeIds, odoKm = 0 } = summary;
    const onTime = delivered ? Math.round(((delivered - late) / delivered) * 100) : 100;
    const rank = [...RANKS].reverse().find((r) => money >= r.min) || RANKS[0];
    const knowNames = KNOWLEDGE.filter((k) => knowledgeIds.includes(k.id));
    this.el = document.createElement('div');
    this.el.style.cssText = overlayStyle;
    this.el.innerHTML = `
      <div style="min-width:560px;max-width:680px;padding:28px 34px;border:1px solid rgba(0,229,255,.5);border-radius:12px;background:rgba(8,14,30,.92);">
        <h2 style="color:#00e5ff;margin:0 0 4px;">🏁 今日收工</h2>
        <div style="color:#ffd166;font-size:14px;margin-bottom:14px;">段位评定：<b>${rank.name}</b></div>
        <div style="display:flex;gap:26px;font-size:15px;line-height:2;">
          <div>
            <div>今日收入：<b style="color:#7dffb2">¥${dayMoney.toFixed(1)}</b></div>
            <div>累计余额：<b style="color:#7dffb2">¥${money.toFixed(1)}</b></div>
            <div>准时率：<b style="color:${onTime >= 80 ? '#7dffb2' : '#ff8fa3'}">${onTime}%</b>（${delivered - late}/${delivered}）</div>
            <div>行驶里程：<b style="color:#00e5ff">${odoKm.toFixed(1)} km</b></div>
            <div>知识：<b style="color:#ffd166">${knowledgeIds.length}/${KNOWLEDGE.length}</b>
              <div style="font-size:12px;color:#9fc6e0;">${knowNames.map((k) => `${k.icon}${k.name}`).join('　') || '尚未解锁'}</div>
            </div>
          </div>
          <div style="flex:1;max-height:200px;overflow:auto;">
            <div style="color:#7fb8d8;margin-bottom:4px;">今日遭遇</div>
            ${events.length ? events.map((e) => `<div>${e.icon} ${e.at} ${e.name}</div>`).join('') : '<div style="color:#5b7a94">风平浪静的一天</div>'}
          </div>
        </div>
        <div style="margin-top:18px;color:#9fc6e0;">按 <b>[R]</b> 开始新的一天</div>
      </div>`;
    this.root.appendChild(this.el);
    this.onKey = (e) => { if (e.code === 'KeyR') { this.hide(); onNext(); } };
    addEventListener('keydown', this.onKey);
  }
  hide() {
    if (this.el) { this.el.remove(); this.el = null; }
    if (this.onKey) removeEventListener('keydown', this.onKey);
  }
}
