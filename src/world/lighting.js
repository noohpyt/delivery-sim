// 昼夜光照：关键帧插值驱动天空色/雾/太阳/环境光
import * as THREE from 'three';

// 关键帧：hour, 天空, 雾, 阳光色, 阳光强度, 半球强度
const KEYS = [
  { h: 0,  sky: 0x04060f, fog: 0x0a0f22, sun: 0x8fb4ff, sunI: 0.28, hemiI: 0.5 },
  { h: 5,  sky: 0x070a18, fog: 0x0d1226, sun: 0x8fb4ff, sunI: 0.28, hemiI: 0.5 },
  { h: 7,  sky: 0x3a2a4a, fog: 0x33224a, sun: 0xffb37d, sunI: 0.75, hemiI: 0.65 },
  { h: 9,  sky: 0x1c3a4a, fog: 0x1a3442, sun: 0xfff2d8, sunI: 1.0,  hemiI: 0.85 },
  { h: 12, sky: 0x2a4a5a, fog: 0x24404e, sun: 0xffffff, sunI: 1.15, hemiI: 0.95 },
  { h: 15, sky: 0x274556, fog: 0x213c4c, sun: 0xfff2d8, sunI: 1.05, hemiI: 0.9 },
  { h: 18, sky: 0x4a1f4d, fog: 0x3a1c42, sun: 0xff6a4d, sunI: 0.7,  hemiI: 0.62 },
  { h: 20, sky: 0x120a2a, fog: 0x140e30, sun: 0x9d7dff, sunI: 0.35, hemiI: 0.5 },
  { h: 22, sky: 0x04060f, fog: 0x0a0f22, sun: 0x8fb4ff, sunI: 0.28, hemiI: 0.5 },
  { h: 24, sky: 0x04060f, fog: 0x0a0f22, sun: 0x8fb4ff, sunI: 0.28, hemiI: 0.5 },
];

const cA = new THREE.Color(), cB = new THREE.Color();

function lerpKeyColor(a, b, t, out) {
  cA.setHex(a); cB.setHex(b);
  return out.copy(cA.lerp(cB, t));
}

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    scene.background = this.skyColor;
    scene.fog = new THREE.Fog(0x0a0f22, 140, 560);

    this.hemi = new THREE.HemisphereLight(0x3a4a8a, 0x0b0e1a, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0x8fb4ff, 0.4);
    scene.add(this.sun);
    this.update(12 * 60);
  }

  update(minutes) {
    const h = (minutes / 60) % 24;
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].h <= h) k++;
    const a = KEYS[k], b = KEYS[k + 1];
    const t = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));

    lerpKeyColor(a.sky, b.sky, t, this.skyColor);
    lerpKeyColor(a.fog, b.fog, t, this.fogColor);
    if (!this.fogOverridden) this.scene.fog.color.copy(this.fogColor);
    lerpKeyColor(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;

    // 太阳方位：6 点升、18 点落；夜间月光固定在高位
    const dayT = (h - 6) / 12;
    if (dayT >= 0 && dayT <= 1) {
      const ang = dayT * Math.PI;
      this.sun.position.set(Math.cos(ang) * 220, Math.sin(ang) * 160 + 30, 90);
    } else {
      this.sun.position.set(-120, 180, 60);
    }
  }
}
