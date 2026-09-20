// 游戏主控制器：渲染循环 + 模块编排 + 调试句柄（e2e 测试用）
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { buildCity } from '../world/city.js';
import { setupLighting } from '../world/lighting.js';
import { Rider } from '../entities/rider.js';
import { OrderSystem } from '../systems/orders.js';
import { RoadNetwork } from '../systems/routing.js';
import { Workday } from '../systems/workday.js';
import { HUD } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import { PlanView } from '../ui/planview.js';

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
    this.net = new RoadNetwork();
    this.rider = new Rider(this.scene);
    this.orders = new OrderSystem(this.scene, this.city);
    this.workday = new Workday();
    this.input = new Input();
    this.audio = new GameAudio();
    this.hud = new HUD(hudRoot);
    this.minimap = new Minimap(hudRoot);
    this.planView = new PlanView(document.getElementById('overlay'));

    this.state = 'ride'; // ride | plan
    this.plan = { stops: [], legs: [], totalEtaSec: 0, unreachable: 0 };
    this.autoNav = true;
    this.money = 0;
    this.clock = new THREE.Clock();
    this.fps = { frames: 0, t: 0, value: 0 };
    this.lastReplanPos = new THREE.Vector3();
    this.routeMesh = null;

    // 导航箭头（悬浮在骑手上空指向下一途径点）
    this.navArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2.2, 4),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 })
    );
    this.navArrow.rotation.order = 'YXZ';
    this.navArrow.visible = false;
    this.scene.add(this.navArrow);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    this.installDebug();
  }

  replan() {
    this.plan = this.orders.planStops(this.net, this.rider.pos);
    this.orders.refreshMarkers(this.plan);
    this.lastReplanPos.copy(this.rider.pos);
    this.updateRibbon();
  }

  updateRibbon() {
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh = null;
    }
    if (!this.autoNav || !this.plan.legs.length) return;
    const pts = [];
    for (const leg of this.plan.legs)
      for (const p of leg.pts)
        if (!pts.length || p.distanceToSquared(pts[pts.length - 1]) > 0.01) pts.push(new THREE.Vector3(p.x, 0.9, p.z));
    if (pts.length < 2) return;
    const path = new THREE.CurvePath();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    const geo = new THREE.TubeGeometry(path, pts.length * 6, 0.4, 5, false);
    this.routeMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 }));
    this.scene.add(this.routeMesh);
  }

  enterPlan() {
    this.state = 'plan';
    this.replan();
    this.planView.open(this.net, this.rider, this.plan, this.autoNav);
    this.audio.accept();
  }

  confirmPlan() {
    this.state = 'ride';
    this.planView.close();
  }

  update(dt) {
    if (this.state === 'plan') {
      if (this.input.justPressed('Enter', 'Space')) this.confirmPlan();
      if (this.input.justPressed('KeyN')) {
        this.autoNav = !this.autoNav;
        this.updateRibbon();
        this.planView.render(this.net, this.rider, this.plan, this.autoNav);
      }
      this.input.endFrame();
      return; // 世界冻结
    }

    this.workday.update(dt);
    const dtGameSec = dt * this.workday.timeScale;

    if (this.input.justPressed('Enter') && this.orders.offers.length) this.enterPlanIfAccepted();
    if (this.input.justPressed('KeyE')) {
      const res = this.orders.tryInteract(this.rider.pos, this.audio);
      if (res) {
        if (res.kind === 'deliver') {
          this.money += res.pay;
          this.hud.toast(`+¥${res.pay.toFixed(1)} ${res.onTime ? '准时送达！' : '超时…'}`);
        }
        this.replan();
      }
    }

    this.rider.update(dt, this.input, this.city.colliders, this.city.bounds, this.audio);
    this.orders.update(dt, dtGameSec);

    // 偏离路线较远时自动重规划
    if (this.plan.stops.length && this.rider.pos.distanceTo(this.lastReplanPos) > 18) this.replan();

    // 导航箭头
    if (this.autoNav && this.plan.legs.length) {
      const next = this.plan.legs[0].pts[1] || this.plan.legs[0].pts[0];
      const ang = Math.atan2(next.x - this.rider.pos.x, next.z - this.rider.pos.z);
      this.navArrow.visible = true;
      this.navArrow.position.set(this.rider.pos.x, 5.5, this.rider.pos.z);
      this.navArrow.rotation.set(Math.PI / 2, ang, 0);
    } else this.navArrow.visible = false;

    // 俯视跟随相机
    const target = this.rider.pos.clone().add(this.camOffset);
    this.camera.position.lerp(target, 1 - Math.exp(-BALANCE.camera.lerp * dt));
    this.camera.lookAt(this.rider.pos.x, 0, this.rider.pos.z);

    this.hud.update(this);
    this.hud.prompt(this.orders.interactHint(this.rider.pos));
    this.minimap.update(this.net, this.rider, this.plan);
    this.input.endFrame();
  }

  enterPlanIfAccepted() {
    if (this.orders.accept(0)) this.enterPlan();
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
      version: 'M2',
      ready: true,
      money: () => g.money,
      time: () => g.workday.hhmm,
      minutes: () => g.workday.minutes,
      fps: () => g.fps.value,
      state: () => g.state,
      rider: () => ({ x: g.rider.pos.x, z: g.rider.pos.z, heading: g.rider.heading, speed: g.rider.speed }),
      offers: () => g.orders.offers.map((o) => ({ id: o.id, reward: o.reward, limitSec: o.limitSec })),
      active: () => g.orders.active.map((o) => ({ id: o.id, phase: o.phase, remainSec: o.remainSec, reward: o.reward })),
      stats: () => ({ ...g.orders.stats }),
      spawnOffer: () => !!g.orders.spawnOffer(),
      accept: (i = 0) => { const o = g.orders.accept(i); if (o) g.enterPlan(); return !!o; },
      teleport: (x, z, heading) => { g.rider.teleport(x, z, heading); if (g.plan.stops.length) g.replan(); },
      targetPos: () => { const s = g.plan.stops[0]; return s ? { x: s.pos.x, z: s.pos.z, phase: s.kind } : null; },
      setTimeScale: (k) => { g.workday.timeScale = k; },
      // M2
      planInfo: () => ({ totalEtaSec: g.plan.totalEtaSec, legs: g.plan.legs.length, stops: g.plan.stops.length, unreachable: g.plan.unreachable }),
      confirmPlan: () => g.confirmPlan(),
      setAutoNav: (b) => { g.autoNav = b; g.updateRibbon(); },
      autoNav: () => g.autoNav,
      routeVisible: () => !!g.routeMesh,
      replan: () => g.replan(),
    };
  }
}
