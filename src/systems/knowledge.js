// 知识锁系统：条件检测 + 解锁 + 效果汇总到 mods
import { KNOWLEDGE } from '../config/knowledge.js';

export class KnowledgeSystem {
  constructor() {
    this.unlocked = new Set();
    this.onUnlock = null; // (def) => void
  }
  has(id) { return this.unlocked.has(id); }

  // 在送达/事件发生后调用
  check(game) {
    for (const k of KNOWLEDGE) {
      if (this.unlocked.has(k.id)) continue;
      let ok = false;
      if (k.cond.deliveries != null) ok = game.orders.stats.delivered >= k.cond.deliveries;
      else if (k.cond.event) ok = game.events.log.some((e) => e.id === k.cond.event);
      if (ok) {
        this.unlocked.add(k.id);
        this.applyMods(game);
        this.onUnlock?.(k);
      }
    }
  }

  // 把已解锁知识折算成修饰器，挂在 game.mods 上供各系统读取
  applyMods(game) {
    const m = game.mods;
    m.pickupBonusSec = this.has('pre_order') ? 20 : 0;
    m.comboBonus = this.has('merge_orders') ? 0.15 : 0;
    m.jamFactor = this.has('peak_avoid') ? 0.5 : 1;    // 乘在拥堵减速上
    m.maxSpeedFactor = this.has('shortcut_master') ? 1.08 : 1;
    m.boostDrainFactor = this.has('battery_saver') ? 0.6 : 1;
    m.policeDurSec = this.has('cop_friend') ? 1.5 : 6;
    m.tipChanceBonus = this.has('customer_psych') ? 0.15 : 0;
    m.tipAmountFactor = this.has('customer_psych') ? 1.5 : 1;
  }
}
