// 昼夜光照（M1 先固定夜晚霓虹氛围，M3 接入时间驱动）
import * as THREE from 'three';

export function setupLighting(scene) {
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.Fog(0x0a0f22, 140, 560);

  const hemi = new THREE.HemisphereLight(0x3a4a8a, 0x0b0e1a, 0.75);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  moon.position.set(-120, 180, 60);
  scene.add(moon);

  return { hemi, moon };
}
