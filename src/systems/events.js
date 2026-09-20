// 事件系统：定时掷骰 → 应用效果 → 到时结束；送达钩子（小费）；事件日志供日结算回顾
import { EVENTS, EVENT_TIMING, TIP } from '../config/events.js';
import { mulberry32, range, pick } from '../core/rng.js';

export class EventSystem {
  constructor(game, seed = 7) {
    this.game = game;
    this.rng = mulberry32(seed);
    this.active = [];      // {def, remainSec, data}
    this.log = [];         // {id, name, icon, kind, at}
    this.cooldowns = new Map();
    this.timer = EVENT_TIMING.firstAt;
    this.onToast = null;   // (text, color) => void
  }

  byId(id) { return EVENTS.find((e) => e.id === id); }

  toast(text, color) { this.onToast?.(text, color); }

  // —— 各事件效果 ——
  applyHandlers = {
    road_closure: (inst) => {
      const net = this.game.net;
      for (let tries = 0; tries < 20; tries++) {
        const i = Math.floor(this.rng() * (net.n - 1));
        const j = Math.floor(this.rng() * (net.n - 1));
        const horiz = this.rng() < 0.5;
        const [i1, j1] = horiz ? [i + 1, j] : [i, j + 1];
        if (!net.getEdge(net.idx(i, j), net.idx(i1, j1))?.blocked) {
          net.setEdge(i, j, i1, j1, { blocked: true });
          inst.data = { edge: [i, j, i1, j1] };
          this.game.replan();
          return;
        }
      }
    },
    police_check: (inst) => {
      inst.durSec = this.game.mods.policeDurSec ?? 6;
      inst.remainSec = inst.durSec;
      this.game.rider.frozen = true;
    },
    order_transfer: () => {
      const o = this.game.orders.spawnOffer();
      if (o) {
        o.reward = Math.round(o.reward * 1.8 * 10) / 10;
        o.limitSec = Math.max(45, o.limitSec * 0.62);
        o.remainSec = o.limitSec;
        o.tag = '⚡转让';
      }
    },
    bonus_order: () => {
      const g = this.game;
      const o = g.orders.spawnOffer();
      if (o && g.plan.stops.length) {
        // 送达点放到当前路线最后一站附近
        const last = g.plan.stops[g.plan.stops.length - 1].pos;
        const near = g.city.customerSpots
          .slice()
          .sort((a, b) => a.distanceTo(last) - b.distanceTo(last))[0];
        if (near) o.deliverPos.copy(near);
        o.reward = Math.round(o.reward * 1.2 * 10) / 10;
        o.tag = '🎁顺路';
      }
    },
    rain: (inst) => {
      const g = this.game;
      inst.data = { fogNear: g.scene.fog.near, fogFar: g.scene.fog.far };
      g.scene.fog.near = 50;
      g.scene.fog.far = 260;
      g.rider.grip = 0.55;
      g.mods.subsidy = 1.15;
    },
    traffic_jam: (inst) => {
      const net = this.game.net;
      inst.data = { edges: [] };
      const nSeg = 2 + Math.floor(this.rng() * 2);
      for (let k = 0; k < nSeg; k++) {
        const i = Math.floor(this.rng() * (net.n - 1));
        const j = Math.floor(this.rng() * (net.n - 1));
        const horiz = this.rng() < 0.5;
        const [i1, j1] = horiz ? [i + 1, j] : [i, j + 1];
        net.setEdge(i, j, i1, j1, { speedFactor: 0.35 });
        inst.data.edges.push([i, j, i1, j1]);
      }
      this.game.replan();
    },
    battery_low: () => { this.game.rider.battery = 10; },
    drone_guide: () => { this.game.mods.speedFactorEvent = 1.12; },
  };

  endHandlers = {
    road_closure: (inst) => {
      const [i, j, i1, j1] = inst.data.edge;
      this.game.net.setEdge(i, j, i1, j1, null);
      this.game.net.edgeState.delete(this.game.net.edgeKey(this.game.net.idx(i, j), this.game.net.idx(i1, j1)));
      this.game.replan();
    },
    police_check: () => { this.game.rider.frozen = false; },
    rain: (inst) => {
      const g = this.game;
      g.scene.fog.near = inst.data.fogNear;
      g.scene.fog.far = inst.data.fogFar;
      g.rider.grip = 1;
      g.mods.subsidy = 1;
    },
    traffic_jam: (inst) => {
      const net = this.game.net;
      for (const [i, j, i1, j1] of inst.data.edges) net.edgeState.delete(net.edgeKey(net.idx(i, j), net.idx(i1, j1)));
      this.game.replan();
    },
    drone_guide: () => { this.game.mods.speedFactorEvent = 1; },
  };

  eligible(def) {
    if (def.weight <= 0) return false;
    if ((this.cooldowns.get(def.id) || 0) > 0) return false;
    if (this.active.some((a) => a.def.id === def.id)) return false;
    if (def.id === 'order_transfer' || def.id === 'bonus_order') {
      return this.game.orders.offers.length < 3;
    }
    return true;
  }

  fire(id) {
    const def = this.byId(id);
    if (!def) return null;
    const inst = { def, remainSec: def.durSec, data: {} };
    this.applyHandlers[id]?.(inst);
    if (inst.remainSec > 0) this.active.push(inst);
    this.cooldowns.set(id, def.cooldown);
    this.log.push({ id, name: def.name, icon: def.icon, kind: def.kind, at: this.game.workday.hhmm });
    this.game.knowledge.check(this.game); // 经历事件可能解锁知识
    this.toast(`${def.icon} ${def.name}：${def.desc}`, def.kind === 'good' ? '#7dffb2' : def.kind === 'risk' ? '#ffd166' : '#ff8fa3');
    this.game.audio.tone(def.kind === 'good' ? 980 : 320, 0.18, def.kind === 'good' ? 'triangle' : 'sawtooth', 0.4);
    return inst;
  }

  // 送达钩子：小费
  onDelivery() {
    const g = this.game;
    const chance = TIP.chance + (g.mods.tipChanceBonus || 0);
    if (this.rng() < chance) {
      const amount = Math.round(range(this.rng, TIP.min, TIP.max) * (g.mods.tipAmountFactor || 1) * 10) / 10;
      this.log.push({ id: 'tip', name: '好心顾客', icon: '💝', kind: 'good', at: g.workday.hhmm });
      g.knowledge.check(g);
      this.toast(`💝 好心顾客给了 ¥${amount.toFixed(1)} 小费！`, '#7dffb2');
      return amount;
    }
    return 0;
  }

  update(dtReal) {
    // 冷却与掷骰
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dtReal);
    this.timer -= dtReal;
    if (this.timer <= 0) {
      this.timer = range(this.rng, EVENT_TIMING.intervalMin, EVENT_TIMING.intervalMax);
      const pool = EVENTS.filter((d) => this.eligible(d));
      if (pool.length) {
        const totalW = pool.reduce((a, d) => a + d.weight, 0);
        let r = this.rng() * totalW;
        for (const d of pool) { r -= d.weight; if (r <= 0) { this.fire(d.id); break; } }
      }
    }
    // 进行中事件
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i];
      inst.remainSec -= dtReal;
      if (inst.remainSec <= 0) {
        this.endHandlers[inst.def.id]?.(inst);
        this.active.splice(i, 1);
      }
    }
  }

  // 拥堵减速系数（骑手位置附近有无拥堵边）
  jamFactorAt(pos) {
    const net = this.game.net;
    for (const inst of this.active) {
      if (inst.def.id !== 'traffic_jam') continue;
      for (const [i, j, i1, j1] of inst.data.edges) {
        const a = net.nodes[net.idx(i, j)], b = net.nodes[net.idx(i1, j1)];
        // 点到线段距离
        const vx = b.x - a.x, vz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * vx + (pos.z - a.z) * vz) / (vx * vx + vz * vz)));
        const dx = pos.x - (a.x + vx * t), dz = pos.z - (a.z + vz * t);
        if (dx * dx + dz * dz < 12 * 12) return 0.45 * (this.game.mods.jamFactor === 0.5 ? 1.6 : 1); // 高峰避雷减半惩罚
      }
    }
    return 1;
  }
}
