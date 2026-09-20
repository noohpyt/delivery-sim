// 全局数值平衡：改这里调游戏手感与难度
export const BALANCE = {
  // 时间：游戏内 1 小时 = 120 秒现实
  timeScale: 30,
  dayStartMinutes: 12 * 60,

  rider: {
    accel: 26,          // m/s^2
    brake: 34,
    maxSpeed: 24,       // m/s ≈ 86km/h（爽快优先）
    boostSpeed: 33,
    steerRate: 2.8,     // rad/s at full lock
    drag: 0.55,
    radius: 1.3,        // 碰撞半径
  },

  orders: {
    maxOffers: 3,          // 待接单池上限
    offerInterval: 8,      // 秒（现实）生成一个新单
    baseFee: 4,            // 起步价 ¥
    perKm: 6.5,            // 每公里 ¥
    onTimeBonus: 0.3,      // 准时奖励比例
    lateFactor: 0.45,      // 超时后只能拿到的比例
    refSpeed: 13,          // 估算标准用时的参考速度 m/s
    slack: 2.1,            // 时限宽松系数（难度系统会收紧它）
    minLimitSec: 60,       // 游戏内最短时限（秒，游戏时间）
    pickupRadius: 7,       // 交互半径 m
  },

  camera: { height: 62, dist: 62, lerp: 5 },
};
