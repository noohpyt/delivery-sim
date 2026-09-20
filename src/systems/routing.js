// 路网：网格路口节点 + 边，A* 寻路，ETA 估算；支持边封闭/减速（事件系统用）
import * as THREE from 'three';
import { MAP } from '../config/map.js';
import { BALANCE } from '../config/balance.js';

export class RoadNetwork {
  constructor() {
    const n = MAP.blocks + 1; // 节点每边数量
    const half = (MAP.blocks * MAP.blockSize) / 2;
    this.n = n;
    this.half = half;
    this.nodes = []; // {x, z, i, j}
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        this.nodes.push({ x: -half + i * MAP.blockSize, z: -half + j * MAP.blockSize, i, j });
    this.edgeState = new Map(); // "a-b" → {blocked, speedFactor}
  }

  idx(i, j) { return i * this.n + j; }
  edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

  neighbors(nodeIdx) {
    const { i, j } = this.nodes[nodeIdx];
    const out = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= this.n || nj >= this.n) continue;
      out.push(this.idx(ni, nj));
    }
    return out;
  }

  setEdge(i0, j0, i1, j1, state) {
    this.edgeState.set(this.edgeKey(this.idx(i0, j0), this.idx(i1, j1)), state);
  }
  getEdge(a, b) { return this.edgeState.get(this.edgeKey(a, b)) || null; }
  clearEdges() { this.edgeState.clear(); }

  nearestNode(pos) {
    const bs = MAP.blockSize;
    const i = Math.max(0, Math.min(this.n - 1, Math.round((pos.x + this.half) / bs)));
    const j = Math.max(0, Math.min(this.n - 1, Math.round((pos.z + this.half) / bs)));
    return this.idx(i, j);
  }

  // A*：节点索引序列；全部边封闭时返回 null（M6 无路兜底用）
  findNodePath(fromIdx, toIdx) {
    if (fromIdx === toIdx) return [fromIdx];
    const goal = this.nodes[toIdx];
    const open = new Map([[fromIdx, 0]]);
    const g = new Map([[fromIdx, 0]]);
    const came = new Map();
    const closed = new Set();
    while (open.size) {
      let cur = -1, best = Infinity;
      for (const [k, f] of open) if (f < best) { best = f; cur = k; }
      if (cur === toIdx) {
        const path = [cur];
        while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
        return path;
      }
      open.delete(cur);
      closed.add(cur);
      const cn = this.nodes[cur];
      for (const nb of this.neighbors(cur)) {
        if (closed.has(nb)) continue;
        const st = this.getEdge(cur, nb);
        if (st?.blocked) continue;
        const nn = this.nodes[nb];
        const len = Math.hypot(nn.x - cn.x, nn.z - cn.z) / (st?.speedFactor || 1);
        const ng = g.get(cur) + len;
        if (ng < (g.get(nb) ?? Infinity)) {
          g.set(nb, ng);
          came.set(nb, cur);
          open.set(nb, ng + Math.hypot(goal.x - nn.x, goal.z - nn.z));
        }
      }
    }
    return null;
  }

  // 世界坐标路径：起终点贴到最近节点，含首末接驳段
  findPath(fromPos, toPos) {
    const a = this.nearestNode(fromPos), b = this.nearestNode(toPos);
    const nodePath = this.findNodePath(a, b);
    if (!nodePath) return null;
    const pts = [new THREE.Vector3(fromPos.x, 0, fromPos.z)];
    for (const idx of nodePath) pts.push(new THREE.Vector3(this.nodes[idx].x, 0, this.nodes[idx].z));
    pts.push(new THREE.Vector3(toPos.x, 0, toPos.z));
    // 去掉重复点
    return pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 0.01);
  }

  pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    return L;
  }

  // ETA（游戏秒）：路径长 / 参考速度 × 时间倍率
  etaGameSec(fromPos, toPos) {
    const pts = this.findPath(fromPos, toPos);
    if (!pts) return null;
    return { sec: (this.pathLength(pts) / BALANCE.orders.refSpeed) * BALANCE.timeScale, pts, lengthM: this.pathLength(pts) };
  }
}
