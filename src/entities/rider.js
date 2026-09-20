// 机器人骑手 + 悬浮车：街机式驾驶手感；电池、冻结、雨天打滑、修饰器
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';

const R = BALANCE.rider;

function buildModel() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3352, roughness: 0.5, metalness: 0.7 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0xff2d95 });

  const bike = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 3.2), bodyMat);
  bike.position.y = 0.7;
  g.add(bike);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 2.6), neonMat);
  strip.position.y = 0.55;
  g.add(strip);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.6 }));
  box.position.set(0, 1.45, -1.0);
  g.add(box);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), bodyMat);
  torso.position.set(0, 1.6, 0.3);
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), bodyMat);
  head.position.set(0, 2.35, 0.3);
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), visorMat);
  visor.position.set(0, 2.38, 0.58);
  g.add(visor);
  return g;
}

export class Rider {
  constructor(scene) {
    this.group = buildModel();
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = Math.PI;   // 面向 -Z（屏幕上方）
    this.moveAngle = Math.PI; // 实际位移方向（打滑时滞后于车头）
    this.speed = 0;
    this.boosting = false;
    this.battery = 100;
    this.frozen = false;      // 交警查车等
    this.grip = 1;            // 雨天 < 1
    this.crashCooldown = 0;
    this.syncMesh();
  }

  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  update(dt, ctx) {
    const { input, colliders, bounds, audio, mods } = ctx;

    if (this.frozen) {
      this.speed = Math.max(0, this.speed - R.brake * dt);
      this.audioIdle(audio);
      this.syncMesh();
      return;
    }

    const up = input.down('KeyW', 'ArrowUp');
    const down = input.down('KeyS', 'ArrowDown');
    const left = input.down('KeyA', 'ArrowLeft');
    const right = input.down('KeyD', 'ArrowRight');
    this.boosting = input.down('ShiftLeft', 'ShiftRight') && up && this.battery > 15;

    const speedCap = (this.boosting ? R.boostSpeed : R.maxSpeed)
      * (mods.maxSpeedFactor || 1) * (mods.speedFactorEvent || 1) * (mods.jamNow || 1)
      * (this.battery <= 15 ? 0.5 : 1);

    if (up) this.speed += R.accel * dt;
    else if (down) this.speed -= (this.speed > 0.5 ? R.brake : R.accel * 0.5) * dt;
    else this.speed -= this.speed * R.drag * dt;
    this.speed = Math.max(-8, Math.min(speedCap, this.speed));
    if (Math.abs(this.speed) < 0.05 && !up && !down) this.speed = 0;

    // 电池
    if (this.boosting) this.battery -= 3 * (mods.boostDrainFactor || 1) * dt;
    else if (Math.abs(this.speed) > 1) this.battery -= 0.22 * dt;
    else this.battery += 1.6 * dt;
    this.battery = Math.max(0, Math.min(100, this.battery));

    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 7);
    this.heading += steer * R.steerRate * dt * steerAuthority * Math.sign(this.speed || 1);

    // 打滑：位移方向以 grip 速率追随车头方向
    let diff = this.heading - this.moveAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.moveAngle += diff * Math.min(1, this.grip * 10 * dt);

    const dir = new THREE.Vector3(Math.sin(this.moveAngle), 0, Math.cos(this.moveAngle));
    const next = this.pos.clone().addScaledVector(dir, this.speed * dt);

    next.x = Math.max(-bounds, Math.min(bounds, next.x));
    next.z = Math.max(-bounds, Math.min(bounds, next.z));

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
    const lean = -steer * steerAuthority * 0.35;
    this.group.rotation.z += (lean - this.group.rotation.z) * Math.min(1, dt * 8);
    this.syncMesh();
    audio?.engine(Math.abs(this.speed) / R.boostSpeed);
  }

  audioIdle(audio) { audio?.engine(0); }

  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.moveAngle = heading;
    this.speed = 0;
    this.syncMesh();
  }
}
