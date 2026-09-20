# 霓虹骑手 NEON RIDER —— 送外卖模拟器（Demo）

赛博朋克城市里的机器人骑手模拟器。你曾是设计派单算法的产品经理，被裁员后成为骑手，亲身体验被你压缩到极限的配送时限。

**技术栈**：three.js + Vite + 原生 JS（ES Modules），无重型框架。美术全部程序化生成（低多边形 + 霓虹），音效由 WebAudio 实时合成，零外部素材。

## 运行

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
```

## 构建与部署

```bash
npm run build      # 产出 dist/ 静态文件
npm run preview    # 本地预览 dist（http://localhost:4173）
```

`dist/` 目录可直接托管到任意静态服务器（相对路径构建，支持子路径部署）。

## 测试

```bash
node test/e2e.mjs        # dev 模式全流程回归（需先 npm run dev 空闲端口 5173，脚本会自起服务）
node test/e2e.mjs m6 dist # 对构建产物跑同一套全流程（vite preview + Playwright 无头）
```

## 操作

| 按键 | 作用 |
| --- | --- |
| W / S | 加速 / 刹车·倒车 |
| A / D | 转向 |
| Shift | 冲刺（耗电） |
| Enter | 接单 / 确认出发 |
| E | 取餐 / 送达 |
| N | 自动导航开关（规划界面） |
| X | 放弃不可达订单（规划界面） |
| Esc | 暂停菜单 |

## 玩法

- 一天 8 小时（约 16 分钟），自选早班/高峰班/夜班；饭点高峰单多价高。
- 接单后先进入**送前暂停规划**：大地图看路线、每段 ETA 和总耗时，再出发。
- 随机事件好坏参半：封路、查车、堵车、电池告警，也有小费、顺路单、无人机指路。
- 夸张通行：工地斜坡飞墙抄近路；堵车骑上人行道（限速但不吃拥堵）。
- 知识锁：送得越多，解锁单王技巧（提前取餐、合并顺路单、高峰避雷……）。
- 你送得越快，平台时限越紧——就像你当产品经理时干的那样。

## 改数值

全部数值/配置在 `src/config/`：

- `balance.js` — 手感、报酬、时限、时间倍率
- `map.js` — 城市规模、商家
- `events.js` — 随机事件（权重/冷却/时长）
- `knowledge.js` — 知识锁条件
- `story.js` — 开场决策卡与文案

## 代码结构

```
src/
  core/      游戏主控、输入、音效、随机数
  world/     程序化城市、昼夜光照
  entities/  骑手（驾驶/电池/跳跃）
  systems/   订单、路网寻路、工作日、事件、知识、难度、PM开场
  ui/        HUD、小地图、规划界面、全屏界面
  fx/        粒子
  config/    全部数值与数据
test/e2e.mjs Playwright 全流程回归（驾驶/接单/规划/事件/日结/异常）
docs/        design.md / plan.md / decisions.md / progress.md（里程碑验收）
```
