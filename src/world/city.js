// 程序化城市：网格路网 + 低多边形霓虹街区
import * as THREE from 'three';
import { MAP, RESTAURANT_NAMES } from '../config/map.js';
import { mulberry32, range, pick } from '../core/rng.js';

const NEON = [0x00e5ff, 0xff2d95, 0x9d4dff, 0xffd166, 0x7dffb2];

// 地面：Canvas 程序化纹理（沥青 + 人行道 + 车道线）
function makeGroundTexture(worldSize) {
  const px = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  const s = px / worldSize; // world → px
  const half = (MAP.blocks * MAP.blockSize) / 2;
  const w2c = (v) => (v + worldSize / 2) * s;

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, px, px);

  const rw = MAP.roadWidth * s;
  const sw = (MAP.roadWidth + MAP.sidewalk * 2) * s;
  for (let i = 0; i <= MAP.blocks; i++) {
    const c0 = w2c(-half + i * MAP.blockSize);
    // 人行道带
    ctx.fillStyle = '#1d2540';
    ctx.fillRect(c0 - sw / 2, 0, sw, px);
    ctx.fillRect(0, c0 - sw / 2, px, sw);
    // 车行道
    ctx.fillStyle = '#121829';
    ctx.fillRect(c0 - rw / 2, 0, rw, px);
    ctx.fillRect(0, c0 - rw / 2, px, rw);
    // 车道虚线
    ctx.fillStyle = 'rgba(0,229,255,.5)';
    for (let d = 0; d < px; d += 24) {
      ctx.fillRect(c0 - 1, d, 2, 12);
      ctx.fillRect(d, c0 - 1, 12, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(MAP.seed);
  const group = new THREE.Group();
  const colliders = [];
  const customerSpots = [];
  const restaurants = [];

  const bs = MAP.blockSize;
  const half = (MAP.blocks * bs) / 2;
  const worldSize = half * 2 + bs; // 四周多留一个街区
  const innerHalf = (bs - MAP.roadWidth) / 2 - MAP.sidewalk;

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldSize, worldSize),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(worldSize), roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // 共享材质
  const bodyMats = [0x141a2e, 0x1a2138, 0x101527, 0x1d2440].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.25 })
  );
  const edgeMats = NEON.map((c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
  const signMats = NEON.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x0f2a1e, roughness: 1 });
  const siteMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 1 });

  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  towerGeo.translate(0, 0.5, 0);

  const restaurantBlocks = new Set();
  while (restaurantBlocks.size < MAP.restaurants) {
    restaurantBlocks.add(Math.floor(rng() * MAP.blocks * MAP.blocks));
  }

  for (let bi = 0; bi < MAP.blocks; bi++) {
    for (let bj = 0; bj < MAP.blocks; bj++) {
      const cx = -half + (bi + 0.5) * bs;
      const cz = -half + (bj + 0.5) * bs;
      const blockIdx = bi * MAP.blocks + bj;
      const roll = rng();
      const isRestaurant = restaurantBlocks.has(blockIdx);

      if (roll < 0.1 && !isRestaurant) {
        // 公园
        const park = new THREE.Mesh(new THREE.BoxGeometry(innerHalf * 2, 0.6, innerHalf * 2), parkMat);
        park.position.set(cx, 0.3, cz);
        group.add(park);
      } else if (roll < 0.2 && !isRestaurant) {
        // 工地（M5 会加跳坡）
        const site = new THREE.Mesh(new THREE.BoxGeometry(innerHalf * 2, 0.5, innerHalf * 2), siteMat);
        site.position.set(cx, 0.25, cz);
        group.add(site);
        const crane = new THREE.Mesh(towerGeo, bodyMats[2]);
        crane.scale.set(3, 26, 3);
        crane.position.set(cx - innerHalf / 2, 0, cz - innerHalf / 2);
        group.add(crane);
        colliders.push({ minX: crane.position.x - 1.5, maxX: crane.position.x + 1.5, minZ: crane.position.z - 1.5, maxZ: crane.position.z + 1.5 });
      } else {
        // 2x2 槽位塔楼
        for (let si = 0; si < 2; si++) {
          for (let sj = 0; sj < 2; sj++) {
            if (rng() < 0.18) continue; // 留空
            const w = range(rng, 9, 15);
            const d = range(rng, 9, 15);
            const h = range(rng, MAP.minH, MAP.maxH) * (isRestaurant ? 0.5 : 1);
            const sx = cx + (si - 0.5) * innerHalf + range(rng, -2.5, 2.5);
            const sz = cz + (sj - 0.5) * innerHalf + range(rng, -2.5, 2.5);
            const tower = new THREE.Mesh(towerGeo, pick(rng, bodyMats));
            tower.scale.set(w, h, d);
            tower.position.set(sx, 0, sz);
            group.add(tower);
            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)),
              pick(rng, edgeMats)
            );
            edges.position.copy(tower.position);
            group.add(edges);
            colliders.push({ minX: sx - w / 2, maxX: sx + w / 2, minZ: sz - d / 2, maxZ: sz + d / 2 });
            if (rng() < 0.3) {
              const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 1.2, 0.4), pick(rng, signMats));
              sign.position.set(sx, h + 1, sz);
              group.add(sign);
            }
          }
        }
      }

      // 顾客送达点：街区边缘、朝路
      const edge = Math.floor(rng() * 4);
      const off = range(rng, -innerHalf * 0.6, innerHalf * 0.6);
      const spot = [
        new THREE.Vector3(cx + off, 0, cz - bs / 2),
        new THREE.Vector3(cx + off, 0, cz + bs / 2),
        new THREE.Vector3(cx - bs / 2, 0, cz + off),
        new THREE.Vector3(cx + bs / 2, 0, cz + off),
      ][edge];
      customerSpots.push(spot);

      if (isRestaurant) {
        const pos = new THREE.Vector3(cx, 0, cz + bs / 2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), bodyMats[1]);
        pole.position.set(cx, 4.5, cz + innerHalf + 1);
        group.add(pole);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.5), pick(rng, signMats));
        panel.position.set(cx, 8.4, cz + innerHalf + 1);
        group.add(panel);
        restaurants.push({ name: RESTAURANT_NAMES[restaurants.length % RESTAURANT_NAMES.length], pos });
      }
    }
  }

  // 路口霓虹桩（InstancedMesh，一次 draw call）
  const bollard = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 1.6, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
    (MAP.blocks + 1) * (MAP.blocks + 1)
  );
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i <= MAP.blocks; i++) {
    for (let j = 0; j <= MAP.blocks; j++) {
      m4.setPosition(-half + i * bs + MAP.roadWidth / 2 + 1, 0.8, -half + j * bs + MAP.roadWidth / 2 + 1);
      bollard.setMatrixAt(k++, m4);
    }
  }
  group.add(bollard);

  scene.add(group);
  return { group, colliders, customerSpots, restaurants, bounds: half + bs / 2 - 4, worldSize };
}
