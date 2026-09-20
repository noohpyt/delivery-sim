// 随机事件定义（数据驱动）。handler 在 systems/events.js 中按 id 实现
export const EVENTS = [
  { id: 'road_closure',  name: '道路施工',   icon: '🚧', kind: 'bad',  weight: 3, cooldown: 70,  durSec: 50, desc: '一段道路被施工封闭，需要重新规划路线' },
  { id: 'police_check',  name: '交警查车',   icon: '👮', kind: 'bad',  weight: 2, cooldown: 120, durSec: 6,  desc: '被交警拦停检查，动弹不得' },
  { id: 'order_transfer',name: '订单转让',   icon: '⚡', kind: 'risk', weight: 2, cooldown: 90,  durSec: 0,  desc: '附近有骑手转让订单：报酬丰厚但时限紧张' },
  { id: 'bonus_order',   name: '顺路加单',   icon: '🎁', kind: 'good', weight: 3, cooldown: 80,  durSec: 0,  desc: '平台推送一单顺路好单' },
  { id: 'rain',          name: '霓虹酸雨',   icon: '🌧', kind: 'bad',  weight: 2, cooldown: 150, durSec: 45, desc: '路面打滑、能见度下降，配送补贴 +15%' },
  { id: 'traffic_jam',   name: '路段拥堵',   icon: '🚗', kind: 'bad',  weight: 3, cooldown: 90,  durSec: 55, desc: '主干道堵死，考虑绕行或上人行道' },
  { id: 'battery_low',   name: '电池告警',   icon: '🪫', kind: 'bad',  weight: 2, cooldown: 150, durSec: 0,  desc: '电量骤降至 10%，去充电点闪充！' },
  { id: 'drone_guide',   name: '无人机指路', icon: '🛸', kind: 'good', weight: 2, cooldown: 120, durSec: 30, desc: '配送无人机为你领航：车速 +12%' },
  { id: 'tip',           name: '好心顾客',   icon: '💝', kind: 'good', weight: 0, cooldown: 0,   durSec: 0,  desc: '顾客额外给了小费' }, // 仅由送达钩子触发
];

// 触发节奏（现实秒）
export const EVENT_TIMING = { firstAt: 18, intervalMin: 22, intervalMax: 42 };

// 小费
export const TIP = { chance: 0.22, min: 2, max: 8 };
