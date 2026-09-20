// 叙事文案与产品经理开场的决策卡（数据驱动）
export const PM_DECISIONS = [
  {
    title: 'Q3 算法评审 · 第 1 项提案',
    desc: '数据组发现：骑手平均配送用时 32 分钟，比竞品慢 4 分钟。',
    options: [
      { label: '压缩到 28 分钟', perf: 18, stress: 0.25, note: '时限收紧，骑手开始小跑' },
      { label: '暂不调整', perf: 2, stress: 0, note: '保持现状' },
    ],
  },
  {
    title: 'Q3 算法评审 · 第 2 项提案',
    desc: '调度组提案：把等餐时间从配送时限里剔除，由骑手自己想办法。',
    options: [
      { label: '再压缩到 24 分钟', perf: 22, stress: 0.3, note: '等餐时间算骑手的' },
      { label: '给 2 分钟缓冲', perf: 5, stress: 0.05, note: '稍微人性化一点' },
    ],
  },
  {
    title: 'Q3 算法评审 · 第 3 项提案',
    desc: '老板拍板：看齐竞品极限，本季度必须上线"极速达"。',
    options: [
      { label: '压缩到 20 分钟', perf: 30, stress: 0.4, note: '全速冲刺，事故率上升' },
      { label: '顶回去一次', perf: -5, stress: 0, note: '你替骑手说了一次话' },
    ],
  },
];

export const PM_INTRO_LINES = [
  '你是「飞驰科技」外卖平台的产品经理。',
  '屏幕上移动的光点，是这座城市里奔跑的骑手。',
  '你的工作：让配送时限一缩再缩。',
];

export const LAYOFF_LINES = [
  '季度复盘会。',
  '「配送时长下降 21%，准时率上升 9%。干得漂亮。」',
  '「但是——用户增长不及预期，公司决定优化 15% 的岗位。」',
  '「你的 OKR 还差 0.3 分。很遗憾。」',
  '……',
  '第二天，你把工牌换成了一辆二手悬浮车。',
  '这一次，倒计时是为你自己跳的。',
];

export const RANKS = [
  { min: 0, name: '实习骑手' },
  { min: 60, name: '熟路骑手' },
  { min: 140, name: '片区单王' },
  { min: 260, name: '霓虹传说' },
];
