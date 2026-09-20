// 机器人骑手 + 悬浮车：街机式驾驶手感
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';

const R = BALANCE.rider;

function buildModel() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3352, roughness: 0.5, metalness: 0.7 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0xff2d95 });

  // 悬浮车
  const bike = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 3.2), bodyMat);
  bike.position.y = 0.7;
  g.add(bike);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 2.6), neonMat);
  strip.position.y = 0.55;
  g.add(strip);
  // 外卖箱
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.6 }));
  box.position.set(0, 1.45, -1.0);
  g.add(box);
  // 机器人骑手
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), bodyMat);
  torso.position.set(0, 1.6, 0.3);
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), bodyMat);
  head.position.set(0, 2.35, 0.3);
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), visorMat);
  visor.position.set(0, 2.38, 0.58);
  g.add(visor);

  g.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return g;
}

export class Rider {
  constructor(scene) {
    this.group = buildModel();
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = Math.PI; // 面向 -Z（屏幕上方）
    this.speed = 0;
    this.boosting = false;
    this.lastCrash = 0;
    this.crashCooldown = 0;
    this.syncMesh();
  }

  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  update(dt, input, colliders, bounds, audio) {
    const up = input.down('KeyW', 'ArrowUp');
    const down = input.down('KeyS', 'ArrowDown');
    const left = input.down('KeyA', 'ArrowLeft');
    const right = input.down('KeyD', 'ArrowRight');
    this.boosting = input.down('ShiftLeft', 'ShiftRight') && up;

    const maxSpd = this.boosting ? R.boostSpeed : R.maxSpeed;
    if (up) this.speed += R.accel * dt;
    else if (down) this.speed -= (this.speed > 0.5 ? R.brake : R.accel * 0.5) * dt;
    else this.speed -= this.speed * R.drag * dt;
    this.speed = Math.max(-8, Math.min(maxSpd, this.speed));
    if (Math.abs(this.speed) < 0.05 && !up && !down) this.speed = 0;

    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 7);
    this.heading += steer * R.steerRate * dt * steerAuthority * Math.sign(this.speed || 1);

    const dir = this.forward();
    const next = this.pos.clone().addScaledVector(dir, this.speed * dt);

    // 边界
    next.x = Math.max(-bounds, Math.min(bounds, next.x));
    next.z = Math.max(-bounds, Math.min(bounds, next.z));

    // 建筑碰撞：圆 vs AABB，推出并减速
    this.crashCooldown -= dt;
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(next.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(next.z, c.maxZ));
      const dx = next.x - cx, dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < R.radius * R.radius) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (R.radius - d) / d;
        next.x += dx * push;
        next.z += dz * push;
        if (this.crashCooldown <= 0 && Math.abs(this.speed) > 6) {
          audio?.bump();
          this.crashCooldown = 0.4;
        }
        this.speed *= 0.35;
      }
    }

    this.pos.copy(next);
    // 倾斜压弯
    const lean = -steer * steerAuthority * 0.35;
    this.group.rotation.z += (lean - this.group.rotation.z) * Math.min(1, dt * 8);
    this.syncMesh();
    audio?.engine(Math.abs(this.speed) / R.boostSpeed);
  }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.syncMesh();
  }
}
