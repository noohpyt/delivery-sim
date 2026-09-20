// 游戏主控制器：渲染循环 + 模块编排 + 调试句柄（e2e 测试用）
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { buildCity } from '../world/city.js';
import { setupLighting } from '../world/lighting.js';
import { Rider } from '../entities/rider.js';
import { OrderSystem } from '../systems/orders.js';
import { Workday } from '../systems/workday.js';
import { HUD } from '../ui/hud.js';

export class Game {
  constructor(container, hudRoot) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);
    this.camOffset = new THREE.Vector3(0, BALANCE.camera.height, BALANCE.camera.dist);

    this.lighting = setupLighting(this.scene);
    this.city = buildCity(this.scene);
    this.rider = new Rider(this.scene);
    this.orders = new OrderSystem(this.scene, this.city);
    this.workday = new Workday();
    this.input = new Input();
    this.audio = new GameAudio();
    this.hud = new HUD(hudRoot);

    this.money = 0;
    this.clock = new THREE.Clock();
    this.fps = { frames: 0, t: 0, value: 0 };

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.installDebug();
  }

  update(dt) {
    this.workday.update(dt);
    const dtGameSec = dt * this.workday.timeScale;

    if (this.input.justPressed('Enter') && this.orders.offers.length) {
      this.orders.accept(0);
      this.audio.accept();
    }
    if (this.input.justPressed('KeyE')) {
      const res = this.orders.tryInteract(this.rider.pos, this.audio);
      if (res?.kind === 'deliver') {
        this.money += res.pay;
        this.hud.toast(`+¥${res.pay.toFixed(1)} ${res.onTime ? '准时送达！' : '超时…'}`);
      }
    }

    this.rider.update(dt, this.input, this.city.colliders, this.city.bounds, this.audio);
    this.orders.update(dt, dtGameSec);

    // 俯视跟随相机
    const target = this.rider.pos.clone().add(this.camOffset);
    this.camera.position.lerp(target, 1 - Math.exp(-BALANCE.camera.lerp * dt));
    this.camera.lookAt(this.rider.pos.x, 0, this.rider.pos.z);

    this.hud.update(this);
    this.hud.prompt(this.orders.interactHint(this.rider.pos));
    this.input.endFrame();
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.fps.frames++; this.fps.t += dt;
      if (this.fps.t >= 1) { this.fps.value = this.fps.frames / this.fps.t; this.fps.frames = 0; this.fps.t = 0; }
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  installDebug() {
    const g = this;
    window.__game = {
      version: 'M1',
      ready: true,
      money: () => g.money,
      time: () => g.workday.hhmm,
      minutes: () => g.workday.minutes,
      fps: () => g.fps.value,
      rider: () => ({ x: g.rider.pos.x, z: g.rider.pos.z, heading: g.rider.heading, speed: g.rider.speed }),
      offers: () => g.orders.offers.map((o) => ({ id: o.id, reward: o.reward, limitSec: o.limitSec })),
      active: () => g.orders.active.map((o) => ({ id: o.id, phase: o.phase, remainSec: o.remainSec, reward: o.reward })),
      stats: () => ({ ...g.orders.stats }),
      spawnOffer: () => !!g.orders.spawnOffer(),
      accept: (i = 0) => !!g.orders.accept(i),
      teleport: (x, z, heading) => g.rider.teleport(x, z, heading),
      targetPos: () => { const t = g.orders.currentTarget(); return t ? { x: t.pos.x, z: t.pos.z, phase: t.phase } : null; },
      setTimeScale: (k) => { g.workday.timeScale = k; },
    };
  }
}
