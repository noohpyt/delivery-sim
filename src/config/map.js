// 城市地图配置：网格路网 + 程序化街区
export const MAP = {
  blocks: 8,          // 8x8 街区 → 9x9 路口
  blockSize: 64,      // 路中心线间距（米）
  roadWidth: 14,      // 车行道宽
  sidewalk: 5,        // 人行道宽
  minH: 8, maxH: 44,  // 建筑高度范围
  seed: 20260921,     // 固定种子，测试可复现
  restaurants: 6,     // 商家数量
};

export const RESTAURANT_NAMES = [
  '霓虹面馆', '合成肉煲仔饭', '电力奶茶', '赛博烧烤', '云端粥铺', '像素披萨',
];
