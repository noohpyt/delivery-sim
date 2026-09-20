// 游戏主控制器：渲染循环 + 模块编排 + 调试句柄（e2e 测试用）
// 状态机：pm(产品经理开场) → layoff(被裁转场) → shift(选班) → ride/plan ⇄ dayend(日结算)
import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { LAYOFF_LINES } from '../config/story.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { buildCity } from '../world/city.js';
import { DayNight } from '../world/lighting.js';
import { Rider } from '../entities/rider.js';
import { OrderSystem } from '../systems/orders.js';
import { RoadNetwork } from '../systems/routing.js';
import { Workday, SHIFTS } from '../systems/workday.js';
import { EventSystem } from '../systems/events.js';
import { KnowledgeSystem } from '../systems/knowledge.js';
import { DifficultySystem } from '../systems/difficulty.js';
import { PMPhase } from '../systems/pmPhase.js';
import { HUD } from '../ui/hud.js';
import { Minimap } from '../ui/minimap.js';
import { PlanView } from '../ui/planview.js';
import { ShiftSelect, DayEnd } from '../ui/screens.js';
import { LayoffView } from '../ui/story.js';

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

    this.lighting = new DayNight(this.scene);
    this.city = buildCity(this.scene);
    this.net = new RoadNetwork();
    this.rider = new Rider(this.scene);
    this.orders = new OrderSystem(this.scene, this.city);
    this.workday = new Workday();
    this.input = new Input();
    this.audio = new GameAudio();
    this.hud = new HUD(hudRoot);
    this.minimap = new Minimap(hudRoot);
    this.overlayRoot = document.getElementById('overlay');
    this.planView = new PlanView(this.overlayRoot);
    this.dayEnd = new DayEnd(this.overlayRoot);

    // 系统层
    this.mods = {};
    this.knowledge = new KnowledgeSystem();
    this.knowledge.onUnlock = (k) => {
      this.hud.toast(`🧠 习得知识【${k.name}】${k.desc}`, '#ffd166');
      this.audio.tone(1240, 0.3, 'triangle', 0.5);
    };
    this.events = new EventSystem(this);
    this.events.onToast = (t, c) => this.hud.toast(t, c);
    this.difficulty = new DifficultySystem();
    this.knowledge.applyMods(this);

    // 充电点（两个路口）
    const h = this.net.half, bs = 64;
    this.chargers = [
      { x: -h + 2 * bs, z: -h + 2 * bs },
      { x: h - 2 * bs, z: h - 2 * bs },
    ];
    for (const c of this.chargers) {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 5, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dffb2 })
      );
      pylon.position.set(c.x + 8, 2.5, c.z + 8);
      this.scene.add(pylon);
      c.px = c.x + 8; c.pz = c.z + 8;
    }

    this.plan = { stops: [], legs: [], totalEtaSec: 0, unreachable: 0 };
    this.autoNav = true;
    this.money = 0;
    this.dayStartMoney = 0;
    this.dayNumber = 1;
    this.shift = SHIFTS[1];
    this.clock = new THREE.Clock();
    this.fps = { frames: 0, t: 0, value: 0 };
    this.lastReplanPos = new THREE.Vector3();
    this.routeMesh = null;
    this.camBlend = 0; // 0=俯视 1=近肩
    this.odoDayM = 0;

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

    // 开场：产品经理阶段
    this.state = 'pm';
    this.camera.position.set(0, 330, 80);
    this.camera.lookAt(0, 0, 0);
    this.pmPhase = new PMPhase(this);
    this.pmPhase.start(() => this.enterLayoff());

    this.installDebug();
  }

  enterLayoff() {
    this.state = 'layoff';
    this.layoff = new LayoffView(this.overlayRoot, LAYOFF_LINES, () => {
      this.state = 'shift';
      new ShiftSelect(this.overlayRoot, (s) => this.startDay(s));
    });
  }

  startDay(shift) {
    this.shift = shift;
    this.workday.startShift(shift.start);
    this.dayStartMoney = this.money;
    this.odoDayM = 0;
    this.state = 'ride';
    this.hud.toast(`🛵 ${shift.name}开工！`, '#00e5ff');
  }

  endDay() {
    this.state = 'dayend';
    this.orders.active.length = 0;
    this.orders.offers.length = 0;
    this.replan();
    this.dayEnd.show({
      money: this.money,
      dayMoney: this.money - this.dayStartMoney,
      delivered: this.orders.stats.delivered,
      late: this.orders.stats.late,
      events: this.events.log,
      knowledgeIds: [...this.knowledge.unlocked],
      odoKm: this.odoDayM / 1000,
    }, () => {
      this.orders.stats.delivered = 0;
      this.orders.stats.late = 0;
      this.events = new EventSystem(this);
      this.events.onToast = (t, c) => this.hud.toast(t, c);
      this.net.clearEdges();
      this.rider.teleport(0, 0, Math.PI);
      this.rider.battery = 100;
      this.dayNumber++;
      new ShiftSelect(this.overlayRoot, (s) => this.startDay(s));
      this.state = 'shift';
    });
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
    const color = this.mods.speedFactorEvent > 1 ? 0x7dffb2 : 0x00e5ff;
    this.routeMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
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

  updateCamera(dt) {
    // 接近下一停靠点时平滑推近到近肩视角，远离后回到俯视（不生硬切换）
    const firstStop = this.plan.stops[0];
    const distStop = firstStop ? this.rider.pos.distanceTo(firstStop.pos) : 999;
    const wantNear = distStop < 20 ? 1 : 0;
    this.camBlend += (wantNear - this.camBlend) * Math.min(1, dt * 1.6);

    const h = this.rider.heading;
    const overX = 0, overY = BALANCE.camera.height, overZ = BALANCE.camera.dist;
    const nearX = -Math.sin(h) * 9, nearY = 5, nearZ = -Math.cos(h) * 9;
    const b = this.camBlend;
    const ox = overX + (nearX - overX) * b;
    const oy = overY + (nearY - overY) * b;
    const oz = overZ + (nearZ - overZ) * b;

    const target = new THREE.Vector3(this.rider.pos.x + ox, oy, this.rider.pos.z + oz);
    this.camera.position.lerp(target, 1 - Math.exp(-BALANCE.camera.lerp * dt));
    const lookX = this.rider.pos.x + Math.sin(h) * 14 * b;
    const lookZ = this.rider.pos.z + Math.cos(h) * 14 * b;
    this.camera.lookAt(lookX, 2 * b, lookZ);
  }

  update(dt) {
    if (this.state === 'pm') {
      this.pmPhase.update(dt);
      if (this.input.justPressed('Digit1')) this.pmPhase.decide(0);
      if (this.input.justPressed('Digit2')) this.pmPhase.decide(1);
      this.input.endFrame();
      return;
    }
    if (this.state === 'layoff') {
      this.layoff.update(dt);
      this.input.endFrame();
      return;
    }
    if (this.state === 'shift' || this.state === 'dayend') {
      this.input.endFrame();
      return;
    }
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
    if (this.workday.isOver) { this.endDay(); this.input.endFrame(); return; }
    const dtGameSec = dt * this.workday.timeScale;
    this.lighting.update(this.workday.minutes);

    this.mods.jamNow = this.events.jamFactorAt(this.rider.pos);
    this.events.update(dt);

    if (this.input.justPressed('Enter') && this.orders.offers.length) this.enterPlanIfAccepted();
    if (this.input.justPressed('KeyE')) {
      const res = this.orders.tryInteract(this.rider.pos, this.audio, { mods: this.mods, workdayMin: this.workday.minutes });
      if (res) {
        if (res.kind === 'deliver') {
          const tip = this.events.onDelivery();
          this.money += res.pay + tip;
          this.hud.toast(`+¥${(res.pay + tip).toFixed(1)} ${res.onTime ? '准时送达！' : '超时…'}${res.combo ? ' 🧲连击' : ''}`);
          this.difficulty.record((res.order.limitSec - Math.max(0, res.order.remainSec)) / res.order.limitSec);
          this.orders.slackScale = this.difficulty.slackScale;
          this.knowledge.check(this);
        }
        this.replan();
      }
    }

    let charging = false;
    for (const c of this.chargers) {
      if (Math.hypot(this.rider.pos.x - c.px, this.rider.pos.z - c.pz) < 8) {
        this.rider.battery = Math.min(100, this.rider.battery + 28 * dt);
        charging = true;
      }
    }

    const odo0 = this.rider.odoM;
    this.rider.update(dt, {
      input: this.input, colliders: this.city.colliders, bounds: this.city.bounds,
      audio: this.audio, mods: this.mods,
    });
    this.odoDayM += this.rider.odoM - odo0;
    this.orders.update(dt, dtGameSec, this.workday.isPeak);

    if (this.plan.stops.length && this.rider.pos.distanceTo(this.lastReplanPos) > 18) this.replan();

    if (this.autoNav && this.plan.legs.length) {
      const next = this.plan.legs[0].pts[1] || this.plan.legs[0].pts[0];
      const ang = Math.atan2(next.x - this.rider.pos.x, next.z - this.rider.pos.z);
      this.navArrow.visible = true;
      this.navArrow.position.set(this.rider.pos.x, 5.5, this.rider.pos.z);
      this.navArrow.rotation.set(Math.PI / 2, ang, 0);
      const s = 1 - this.camBlend * 0.75; // 近肩视角下缩小箭头防遮挡
      this.navArrow.scale.set(s, s, s);
      this.navArrow.material.opacity = 0.8 * (1 - this.camBlend * 0.6);
    } else this.navArrow.visible = false;

    this.updateCamera(dt);

    this.hud.update(this);
    this.hud.prompt(charging ? '⚡ 闪充中…' : this.orders.interactHint(this.rider.pos));
    this.minimap.update(this.net, this.rider, this.plan, this.chargers);
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
      version: 'M4',
      ready: true,
      money: () => g.money,
      time: () => g.workday.hhmm,
      minutes: () => g.workday.minutes,
      fps: () => g.fps.value,
      state: () => g.state,
      rider: () => ({ x: g.rider.pos.x, z: g.rider.pos.z, heading: g.rider.heading, speed: g.rider.speed, battery: g.rider.battery, frozen: g.rider.frozen }),
      offers: () => g.orders.offers.map((o) => ({ id: o.id, reward: o.reward, limitSec: o.limitSec, tag: o.tag })),
      active: () => g.orders.active.map((o) => ({ id: o.id, phase: o.phase, remainSec: o.remainSec, reward: o.reward })),
      stats: () => ({ ...g.orders.stats }),
      spawnOffer: () => !!g.orders.spawnOffer(),
      accept: (i = 0) => { const o = g.orders.accept(i); if (o) g.enterPlan(); return !!o; },
      teleport: (x, z, heading) => { g.rider.teleport(x, z, heading); if (g.plan.stops.length) g.replan(); },
      targetPos: () => { const s = g.plan.stops[0]; return s ? { x: s.pos.x, z: s.pos.z, phase: s.kind } : null; },
      setTimeScale: (k) => { g.workday.timeScale = k; },
      planInfo: () => ({ totalEtaSec: g.plan.totalEtaSec, legs: g.plan.legs.length, stops: g.plan.stops.length, unreachable: g.plan.unreachable }),
      confirmPlan: () => g.confirmPlan(),
      setAutoNav: (b) => { g.autoNav = b; g.updateRibbon(); },
      autoNav: () => g.autoNav,
      routeVisible: () => !!g.routeMesh,
      replan: () => g.replan(),
      // M3
      selectShift: (i) => { document.querySelectorAll('.shift-card')[i]?.click(); return g.state; },
      setMinutes: (m) => { g.workday.minutes = m; },
      isPeak: () => g.workday.isPeak,
      lighting: () => ({ sky: '#' + g.lighting.skyColor.getHexString(), sunI: +g.lighting.sun.intensity.toFixed(2), hemiI: +g.lighting.hemi.intensity.toFixed(2) }),
      forceEvent: (id) => !!g.events.fire(id),
      eventsActive: () => g.events.active.map((a) => a.def.id),
      eventLog: () => g.events.log.map((e) => e.id),
      jamNow: () => g.mods.jamNow,
      blockedEdges: () => [...g.net.edgeState.entries()].map(([k, v]) => ({ k, blocked: !!v.blocked })),
      slackScale: () => +g.orders.slackScale.toFixed(3),
      recordDelivery: (ratio) => { g.difficulty.record(ratio); g.orders.slackScale = g.difficulty.slackScale; },
      knowledge: () => [...g.knowledge.unlocked],
      charge: (pct) => { g.rider.battery = pct; },
      eventsTimer: (v) => { g.events.timer = v; },
      setDelivered: (n) => { g.orders.stats.delivered = n; g.knowledge.check(g); },
      // M4
      decide: (i) => g.pmPhase?.decide(i),
      pmInfo: () => g.pmPhase ? { round: g.pmPhase.round, perf: g.pmPhase.perf, stress: g.pmPhase.stress, avgLimit: g.pmPhase.avgLimit } : null,
      camBlend: () => +g.camBlend.toFixed(2),
      odoKm: () => +(g.odoDayM / 1000).toFixed(2),
      skipLayoff: () => g.layoff?.advance() ?? undefined,
    };
  }
}
