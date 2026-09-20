// 知识锁（数据驱动）：真实单王经验 → 可解锁能力
// cond: { deliveries: N } 或 { event: '事件id' }（经历该事件后习得）
export const KNOWLEDGE = [
  { id: 'pre_order',       name: '提前取餐',   icon: '📞', desc: '取餐时该单时限 +20 秒（游戏时间）', cond: { deliveries: 5 } },
  { id: 'merge_orders',    name: '合并顺路单', icon: '🧲', desc: '60 秒内连续送达的第 2 单起 +15% 报酬', cond: { deliveries: 3 } },
  { id: 'peak_avoid',      name: '高峰避雷',   icon: '🗺', desc: '拥堵路段对你的减速惩罚减半', cond: { event: 'traffic_jam' } },
  { id: 'shortcut_master', name: '抄近路大师', icon: '🚀', desc: '车速上限 +8%', cond: { deliveries: 10 } },
  { id: 'battery_saver',   name: '续航管理',   icon: '🔋', desc: '加速耗电 -40%', cond: { event: 'battery_low' } },
  { id: 'cop_friend',      name: '交警熟人',   icon: '🤝', desc: '查车时间缩短到 1.5 秒', cond: { event: 'police_check' } },
  { id: 'customer_psych',  name: '顾客心理学', icon: '💬', desc: '小费概率 +15%、金额 ×1.5', cond: { event: 'tip' } },
];
