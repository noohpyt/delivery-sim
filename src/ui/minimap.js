// 小地图 + 规划大地图共用的 Canvas 2D 绘制
import { MAP } from '../config/map.js';

const half = (MAP.blocks * MAP.blockSize) / 2;
const worldSize = half * 2 + MAP.blockSize;

export function drawMap(ctx, size, { net, rider, plan, pulse = 0 }) {
  const s = size / worldSize;
  const mx = (x) => (x + worldSize / 2) * s;
  const mz = (z) => (z + worldSize / 2) * s;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(6,10,24,0.92)';
  ctx.fillRect(0, 0, size, size);

  // 路网
  ctx.strokeStyle = 'rgba(0,229,255,0.28)';
  ctx.lineWidth = Math.max(1, MAP.roadWidth * s * 0.5);
  ctx.beginPath();
  for (let i = 0; i <= MAP.blocks; i++) {
    const c = mx(-half + i * MAP.blockSize);
    ctx.moveTo(c, mz(-half)); ctx.lineTo(c, mz(half));
    ctx.moveTo(mx(-half), c); ctx.lineTo(mx(half), c);
  }
  ctx.stroke();

  // 事件封路/拥堵（M3 起有数据）
  if (net) {
    for (const [key, st] of net.edgeState) {
      const [a, b] = key.split('-').map(Number);
      const na = net.nodes[a], nb = net.nodes[b];
      ctx.strokeStyle = st.blocked ? 'rgba(255,60,80,0.9)' : 'rgba(255,180,60,0.7)';
      ctx.lineWidth = Math.max(2, MAP.roadWidth * s * 0.6);
      ctx.beginPath();
      ctx.moveTo(mx(na.x), mz(na.z));
      ctx.lineTo(mx(nb.x), mz(nb.z));
      ctx.stroke();
    }
  }

  // 规划路线
  if (plan?.legs?.length) {
    ctx.strokeStyle = 'rgba(0,229,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    let started = false;
    for (const leg of plan.legs) {
      for (const p of leg.pts) {
        if (!started) { ctx.moveTo(mx(p.x), mz(p.z)); started = true; }
        else ctx.lineTo(mx(p.x), mz(p.z));
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 停靠点
    plan.stops.forEach((st, i) => {
      const x = mx(st.pos.x), y = mz(st.pos.z);
      ctx.fillStyle = st.kind === 'pickup' ? '#ffd166' : '#7dffb2';
      if (st.kind === 'pickup') ctx.fillRect(x - 4, y - 4, 8, 8);
      else { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); }
      if (i === 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 7 + pulse * 3, 0, 7);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.fillText(String(i + 1), x + 6, y - 5);
    });
  }

  // 骑手（三角箭头，按车头朝向旋转）
  if (rider) {
    const x = mx(rider.x), y = mz(rider.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - rider.heading); // 世界 heading → 画布朝向（z 向下为正）
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// HUD 常驻小地图
export class Minimap {
  constructor(parent) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 190;
    this.canvas.id = 'minimap';
    this.canvas.style.cssText =
      'position:absolute;bottom:76px;right:14px;border:1px solid rgba(0,229,255,.45);border-radius:8px;' +
      'box-shadow:0 0 12px rgba(0,229,255,.25);background:rgba(6,10,24,.9);';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.frame = 0;
  }
  update(net, rider, plan) {
    this.frame++;
    drawMap(this.ctx, 190, { net, rider, plan, pulse: (Math.sin(this.frame * 0.12) + 1) / 2 });
  }
}
