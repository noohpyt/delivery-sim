// 订单系统：报价池 → 接单 → 取餐 → 送达 → 结算
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { mulberry32, pick } from '../core/rng.js';

const O = BALANCE.orders;

function makeMarker(color) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 3.2, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  cone.rotation.x = Math.PI;
  cone.position.y = 8;
  g.add(cone);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(O.pickupRadius, 0.25, 6, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  g.add(ring);
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
    this.markerPickup = makeMarker(0xffd166);
    this.markerDeliver = makeMarker(0x7dffb2);
    this.markerPickup.visible = this.markerDeliver.visible = false;
    scene.add(this.markerPickup, this.markerDeliver);
    this.stats = { delivered: 0, late: 0, failed: 0, earned: 0 };
    this.slackScale = 1; // M3 难度系统会改它
  }

  spawnOffer() {
    if (this.offers.length >= O.maxOffers) return null;
    const rest = pick(this.rng, this.city.restaurants);
    const cust = pick(this.rng, this.city.customerSpots);
    const distM = rest.pos.distanceTo(cust) * 1.35; // 估算绕路系数
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
    // 进行中订单倒计时（游戏时间）
    for (const o of this.active) o.remainSec -= dtGameSec;
    // 超时判定在取餐后也继续计时；送达时结算
    const t = performance.now() / 1000;
    for (const m of [this.markerPickup, this.markerDeliver]) {
      if (m.visible) {
        m.children[0].position.y = 8 + Math.sin(t * 3) * 0.8;
        m.children[0].rotation.y = t * 1.5;
      }
    }
    this.refreshMarkers();
  }

  accept(index) {
    const o = this.offers.splice(index, 1)[0];
    if (!o) return null;
    o.phase = 'pickup';
    o.remainSec = o.limitSec;
    this.active.push(o);
    this.refreshMarkers();
    return o;
  }

  currentTarget() {
    const o = this.active.find((a) => a.phase === 'pickup') || this.active[0];
    if (!o) return null;
    return { order: o, pos: o.phase === 'pickup' ? o.pickupPos : o.deliverPos, phase: o.phase };
  }

  // 返回交互结果描述，未在交互范围返回 null
  tryInteract(pos, audio) {
    for (const o of this.active) {
      const target = o.phase === 'pickup' ? o.pickupPos : o.deliverPos;
      if (pos.distanceTo(target) > O.pickupRadius) continue;
      if (o.phase === 'pickup') {
        o.phase = 'deliver';
        audio?.pickup();
        this.refreshMarkers();
        return { kind: 'pickup', order: o };
      }
      // 送达结算
      const onTime = o.remainSec > 0;
      const pay = onTime ? o.reward * (1 + O.onTimeBonus) : o.reward * O.lateFactor;
      const rounded = Math.round(pay * 10) / 10;
      this.stats.delivered++;
      if (!onTime) this.stats.late++;
      this.stats.earned += rounded;
      this.active.splice(this.active.indexOf(o), 1);
      audio?.deliver();
      this.refreshMarkers();
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

  refreshMarkers() {
    const t = this.currentTarget();
    this.markerPickup.visible = false;
    this.markerDeliver.visible = false;
    if (!t) return;
    if (t.phase === 'pickup') {
      this.markerPickup.position.copy(t.pos);
      this.markerPickup.visible = true;
    } else {
      this.markerDeliver.position.copy(t.pos);
      this.markerDeliver.visible = true;
    }
  }
}
