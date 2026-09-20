// 订单系统：报价池 → 接单 → 取餐 → 送达 → 结算；含多停留点路线规划（贪心最近邻 + 先取后送约束）
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { mulberry32, pick } from '../core/rng.js';

const O = BALANCE.orders;

function makeMarker(color, big = true) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(big ? 1.6 : 0.9, big ? 3.2 : 1.8, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: big ? 0.85 : 0.4 })
  );
  cone.rotation.x = Math.PI;
  cone.position.y = big ? 8 : 5;
  g.add(cone);
  if (big) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(O.pickupRadius, 0.25, 6, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
  }
  return g;
}

export class OrderSystem {
  constructor(scene, city, seed = 42) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.offers = [];
    this.active = [];
    this.spawnT = 0;
    this.seq = 1;
    this.marker = makeMarker(0xffd166);       // 下一停靠点主标记
    this.marker.visible = false;
    scene.add(this.marker);
    this.ghosts = [];                          // 后续停靠点幽灵标记
    for (let i = 0; i < 4; i++) {
      const g = makeMarker(0x00e5ff, false);
      g.visible = false;
      scene.add(g);
      this.ghosts.push(g);
    }
    this.stats = { delivered: 0, late: 0, failed: 0, earned: 0 };
    this.slackScale = 1; // M3 难度系统会改它
  }

  spawnOffer() {
    if (this.offers.length >= O.maxOffers) return null;
    const rest = pick(this.rng, this.city.restaurants);
    const cust = pick(this.rng, this.city.customerSpots);
    const distM = Math.max(120, rest.pos.distanceTo(cust) * 1.35); // 估算绕路系数，兜底最小距离
    const reward = Math.round((O.baseFee + (distM / 1000) * O.perKm) * 10) / 10;
    const limitSec = Math.max(O.minLimitSec, (distM / O.refSpeed) * O.slack * this.slackScale * BALANCE.timeScale);
    const offer = {
      id: this.seq++,
      restaurant: rest.name,
      pickupPos: rest.pos.clone(),
      deliverPos: cust.clone(),
      distM: Math.round(distM),
      reward,
      limitSec,
    };
    this.offers.push(offer);
    return offer;
  }

  update(dtReal, dtGameSec) {
    this.spawnT -= dtReal;
    if (this.spawnT <= 0) {
      this.spawnT = O.offerInterval;
      this.spawnOffer();
    }
    for (const o of this.active) o.remainSec -= dtGameSec;
    const t = performance.now() / 1000;
    if (this.marker.visible) {
      this.marker.children[0].position.y = 8 + Math.sin(t * 3) * 0.8;
      this.marker.children[0].rotation.y = t * 1.5;
    }
  }

  accept(index) {
    const o = this.offers.splice(index, 1)[0];
    if (!o) return null;
    o.phase = 'pickup';
    o.remainSec = o.limitSec;
    this.active.push(o);
    return o;
  }

  // 规划：从 fromPos 出发访问所有停留点的顺序与分段 ETA
  planStops(net, fromPos) {
    const simPhase = new Map(this.active.map((o) => [o, o.phase]));
    const remaining = new Set(this.active);
    const stops = [];
    const legs = [];
    let total = 0;
    let cur = fromPos.clone();
    while (remaining.size) {
      let best = null; // {order, kind, pos, pts, len}
      for (const o of remaining) {
        const kind = simPhase.get(o) === 'pickup' ? 'pickup' : 'deliver';
        const pos = kind === 'pickup' ? o.pickupPos : o.deliverPos;
        const pts = net.findPath(cur, pos);
        if (!pts) continue;
        const len = net.pathLength(pts);
        if (!best || len < best.len) best = { order: o, kind, pos, pts, len };
      }
      if (!best) return { stops, legs, totalEtaSec: total, unreachable: remaining.size };
      stops.push({ order: best.order, kind: best.kind, pos: best.pos });
      const etaSec = (best.len / O.refSpeed) * BALANCE.timeScale;
      legs.push({
        pts: best.pts, lengthM: best.len, etaSec,
        label: best.kind === 'pickup' ? `取餐【${best.order.restaurant}】` : `送达 #${best.order.id}`,
      });
      total += etaSec;
      cur = best.pos.clone();
      if (best.kind === 'pickup') simPhase.set(best.order, 'deliver');
      else remaining.delete(best.order);
    }
    return { stops, legs, totalEtaSec: total, unreachable: 0 };
  }

  // 返回交互结果描述，未在交互范围返回 null
  tryInteract(pos, audio) {
    for (const o of this.active) {
      const target = o.phase === 'pickup' ? o.pickupPos : o.deliverPos;
      if (pos.distanceTo(target) > O.pickupRadius) continue;
      if (o.phase === 'pickup') {
        o.phase = 'deliver';
        audio?.pickup();
        return { kind: 'pickup', order: o };
      }
      const onTime = o.remainSec > 0;
      const pay = onTime ? o.reward * (1 + O.onTimeBonus) : o.reward * O.lateFactor;
      const rounded = Math.round(pay * 10) / 10;
      this.stats.delivered++;
      if (!onTime) this.stats.late++;
      this.stats.earned += rounded;
      this.active.splice(this.active.indexOf(o), 1);
      audio?.deliver();
      return { kind: 'deliver', order: o, pay: rounded, onTime };
    }
    return null;
  }

  interactHint(pos) {
    for (const o of this.active) {
      const target = o.phase === 'pickup' ? o.pickupPos : o.deliverPos;
      if (pos.distanceTo(target) <= O.pickupRadius) {
        return o.phase === 'pickup' ? `按 E 取餐【${o.restaurant}】` : '按 E 送达';
      }
    }
    return null;
  }

  // 根据当前规划刷新主标记 + 幽灵标记
  refreshMarkers(plan) {
    if (!plan || !plan.stops.length) {
      this.marker.visible = false;
      for (const g of this.ghosts) g.visible = false;
      return;
    }
    const first = plan.stops[0];
    this.marker.children[0].material.color.set(first.kind === 'pickup' ? 0xffd166 : 0x7dffb2);
    this.marker.children[1].material.color.set(first.kind === 'pickup' ? 0xffd166 : 0x7dffb2);
    this.marker.position.copy(first.pos);
    this.marker.visible = true;
    for (let i = 0; i < this.ghosts.length; i++) {
      const s = plan.stops[i + 1];
      this.ghosts[i].visible = !!s;
      if (s) this.ghosts[i].position.copy(s.pos);
    }
  }
}
