// 产品经理开场：俯视角看 AI 骑手跑单，做 3 轮"压缩时限"决策
import * as THREE from 'three';
import { PM_DECISIONS, PM_INTRO_LINES } from '../config/story.js';
import { mulberry32, pick } from '../core/rng.js';

class AIRider {
  constructor(scene, net, rng) {
    this.net = net;
    this.rng = rng;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    scene.add(this.mesh);
    this.from = Math.floor(rng() * net.nodes.length);
    this.to = pick(rng, net.neighbors(this.from));
    this.t = rng();
    this.stressFlash = 0;
  }
  update(dt, speed) {
    this.t += dt * speed / 64; // 边长 64m
    if (this.t >= 1) {
      this.t = 0;
      this.from = this.to;
      const nbs = this.net.neighbors(this.from);
      this.to = pick(this.rng, nbs);
    }
    const a = this.net.nodes[this.from], b = this.net.nodes[this.to];
    const x = a.x + (b.x - a.x) * this.t;
    const z = a.z + (b.z - a.z) * this.t;
    this.mesh.position.set(x, 1.2, z);
    this.mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    // 压力越高颜色越红
    if (this.stressFlash > 0) {
      this.stressFlash -= dt;
      this.mesh.material.color.setHex(0xff4d6d);
    }
  }
}

export class PMPhase {
  constructor(game) {
    this.game = game;
    this.rng = mulberry32(99);
    this.riders = [];
    this.perf = 50;
    this.stress = 0.2;
    this.avgLimit = 32;
    this.round = 0;
    this.speedLevel = 6;
    this.done = false;
    this.onDone = null;
    this.introT = 0;

    for (let i = 0; i < 9; i++) this.riders.push(new AIRider(game.scene, game.net, this.rng));
    this.buildUI();
  }

  buildUI() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;z-index:25;pointer-events:none;font-family:"Segoe UI","Microsoft YaHei",monospace;color:#cfeaff;';
    this.el.innerHTML = `
      <div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);text-align:center;">
        <div id="pm-intro" style="font-size:17px;color:#9fc6e0;line-height:1.9;text-shadow:0 0 8px #000;"></div>
      </div>
      <div style="position:absolute;top:18px;right:18px;padding:14px 18px;background:rgba(8,14,30,.85);border:1px solid rgba(0,229,255,.45);border-radius:10px;font-size:14px;line-height:2;">
        <div style="color:#00e5ff;font-weight:700;">飞驰科技 · 算法优化台</div>
        <div>本季绩效：<b id="pm-perf" style="color:#7dffb2;">50</b></div>
        <div>平均配送时限：<b id="pm-limit" style="color:#ffd166;">32 分钟</b></div>
        <div>骑手压力：<span style="display:inline-block;width:100px;height:8px;background:#12203a;border-radius:4px;vertical-align:middle;"><span id="pm-stress" style="display:block;height:100%;width:20%;background:#7dffb2;border-radius:4px;"></span></span></div>
      </div>
      <div id="pm-card" style="position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:520px;padding:20px 24px;background:rgba(8,14,30,.92);border:1px solid rgba(255,209,102,.6);border-radius:12px;display:none;pointer-events:auto;">
        <div id="pm-card-title" style="color:#ffd166;font-weight:700;margin-bottom:6px;"></div>
        <div id="pm-card-desc" style="font-size:14px;color:#9fc6e0;margin-bottom:14px;"></div>
        <div id="pm-card-opts" style="display:flex;gap:12px;"></div>
      </div>`;
    document.getElementById('overlay').appendChild(this.el);
    this.introEl = this.el.querySelector('#pm-intro');
    this.cardEl = this.el.querySelector('#pm-card');
  }

  start(onDone) {
    this.onDone = onDone;
  }

  decide(i) {
    const d = PM_DECISIONS[this.round];
    if (!d) return;
    const opt = d.options[i] || d.options[0];
    this.perf += opt.perf;
    this.stress = Math.min(1, this.stress + opt.stress);
    if (opt.perf >= 15) this.avgLimit = [28, 24, 20][this.round] ?? this.avgLimit;
    this.speedLevel += opt.stress * 22;
    this.round++;
    this.cardEl.style.display = 'none';
    if (this.round >= PM_DECISIONS.length) {
      this.done = true;
      setTimeout(() => this.finish(), 2600);
    }
  }

  showCard() {
    const d = PM_DECISIONS[this.round];
    if (!d) return;
    this.el.querySelector('#pm-card-title').textContent = d.title;
    this.el.querySelector('#pm-card-desc').textContent = d.desc;
    const opts = this.el.querySelector('#pm-card-opts');
    opts.innerHTML = '';
    d.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.style.cssText = 'flex:1;padding:12px;background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.5);border-radius:8px;color:#cfeaff;font-size:14px;cursor:pointer;';
      b.innerHTML = `<b>[${i + 1}]</b> ${o.label}<br><span style="font-size:12px;color:#7fb8d8;">${o.note}</span>`;
      b.onclick = () => this.decide(i);
      opts.appendChild(b);
    });
    this.cardEl.style.display = 'block';
  }

  update(dt) {
    this.introT += dt;
    // 开场文案逐行浮现，然后出第一张决策卡
    const shown = Math.min(PM_INTRO_LINES.length, Math.floor(this.introT / 2.2));
    this.introEl.innerHTML = PM_INTRO_LINES.slice(0, shown).join('<br>');
    if (this.introT > PM_INTRO_LINES.length * 2.2 + 1 && this.round === 0 && this.cardEl.style.display === 'none' && !this._cardShown0) {
      this._cardShown0 = true;
      this.showCard();
    }
    if (this.round > 0 && this.round < PM_DECISIONS.length && this.cardEl.style.display === 'none') {
      this._nextCardT = (this._nextCardT || 0) + dt;
      if (this._nextCardT > 4) { this._nextCardT = 0; this.showCard(); }
    }
    // AI 骑手
    for (const r of this.riders) {
      r.update(dt, this.speedLevel);
      if (this.stress > 0.55 && this.rng() < dt * this.stress * 0.35) r.stressFlash = 1.2; // 高压下事故闪烁
    }
    // 面板
    this.el.querySelector('#pm-perf').textContent = this.perf;
    this.el.querySelector('#pm-limit').textContent = `${this.avgLimit} 分钟`;
    const sb = this.el.querySelector('#pm-stress');
    sb.style.width = `${this.stress * 100}%`;
    sb.style.background = this.stress > 0.6 ? '#ff4d6d' : this.stress > 0.35 ? '#ffd166' : '#7dffb2';
  }

  finish() {
    for (const r of this.riders) this.game.scene.remove(r.mesh);
    this.el.remove();
    this.onDone?.();
  }

  dispose() {
    if (!this.done) { for (const r of this.riders) this.game.scene.remove(r.mesh); this.el.remove(); }
  }
}
