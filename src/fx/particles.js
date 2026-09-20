// 粒子系统：单 Points 池（尾焰/火花/送达彩带/雨丝），零逐帧分配
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.7, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.head = 0;
    this._c = new THREE.Color();
  }

  spawn(x, y, z, { count = 10, color = 0x00e5ff, speed = 6, up = 4, life = 0.7, spread = 1 }) {
    this._c.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random() * 0.7) * speed;
      this.vel[i * 3] = Math.cos(a) * v;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = Math.sin(a) * v;
      this.col[i * 3] = this._c.r;
      this.col[i * 3 + 1] = this._c.g;
      this.col[i * 3 + 2] = this._c.b;
      this.life[i] = life * (0.5 + Math.random() * 0.7);
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      alive++;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 12 * dt;
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  count() { return this.alive || 0; }
}
