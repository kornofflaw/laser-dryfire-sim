// blood3d.js — wound stains, blood spray, mist and ground drops for 3D scenes.
// ---------------------------------------------------------------------------
// Wounds are small stain decals parented to the nearest bone, so they move
// with the animated body. The spray is a burst of droplets (instanced
// spheres) with gravity: most of it leaves out the back along the bullet's
// path, some back-spatters toward the shooter, and droplets that reach the
// ground leave drops on the asphalt. A short red mist puff sells the impact.
//
// Every effect has update(now) and a `done` flag, like the other 3D effects.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const B = () => CONFIG.knife3d.blood;

let stainTex = null, dropTex = null, mistTex = null;

// Irregular wet stain: dark core, uneven edge, a few satellite spots.
function makeStainTexture(seed, satellites) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rnd = mulberry(seed);
  const blob = (x, y, r, alpha) => {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (0.75 + rnd() * 0.45);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 1.1);
    grad.addColorStop(0, `rgba(95,6,8,${alpha})`);
    grad.addColorStop(0.6, `rgba(140,12,14,${alpha * 0.9})`);
    grad.addColorStop(1, 'rgba(120,10,12,0)');
    g.fillStyle = grad;
    g.fill();
  };
  blob(64, 64, 34, 1);
  for (let i = 0; i < satellites; i++) {
    const a = rnd() * Math.PI * 2, d = 36 + rnd() * 22;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + rnd() * 7, 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A wound stain on the body at `point`, facing `normal`, attached to `bone`.
export function addWound(bone, point, normal) {
  stainTex ??= makeStainTexture(9, 6);
  const mat = new THREE.MeshStandardMaterial({
    map: stainTex, transparent: true, depthWrite: false, roughness: 0.2, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  });
  const size = B().woundSize * (0.8 + Math.random() * 0.4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.position.copy(point).addScaledVector(normal, 0.012);
  m.lookAt(point.clone().add(normal));
  m.rotateZ(Math.random() * Math.PI * 2);
  bone.attach(m); // keep its world pose, then ride along with the bone
  const t0 = performance.now() / 1000;
  const base = m.scale.clone();
  // The stain spreads over the first moments.
  return {
    obj: m, done: false, persistent: true,
    update(now) {
      const k = Math.min(1, (now - t0) / B().woundSpread);
      m.scale.copy(base).multiplyScalar(0.45 + 0.55 * k);
    },
  };
}

// Droplet burst + mist. `dir` = bullet direction (normalized); ground drops
// are added to `groundDrops` (a GroundDrops instance).
export function addSpray(scene, point, dir, groundDrops) {
  const n = B().droplets;
  const geo = new THREE.SphereGeometry(1, 6, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#8c0a0e', roughness: 0.25, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const up = new THREE.Vector3(0, 1, 0);
  const parts = [];
  for (let i = 0; i < n; i++) {
    // 70% exit spray along the bullet path, 30% back-spatter toward the shooter.
    const back = Math.random() < B().backSpatter;
    const base = dir.clone().multiplyScalar(back ? -1 : 1);
    const spread = back ? 0.9 : 0.55;
    const v = base
      .add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 2).multiplyScalar(spread))
      .normalize()
      .multiplyScalar(B().speed[0] + Math.random() * (B().speed[1] - B().speed[0]) * (back ? 0.5 : 1))
      .addScaledVector(up, 0.4);
    const [r0, r1] = B().dropletSize;
    parts.push({ p: point.clone(), v, r: r0 + Math.random() * (r1 - r0), alive: true });
  }

  // Mist: a quick expanding red haze.
  mistTex ??= mistTexture();
  const mistMat = new THREE.SpriteMaterial({ map: mistTex, color: '#a0141a', transparent: true, depthWrite: false, opacity: 0.85 });
  const mist = new THREE.Sprite(mistMat);
  mist.position.copy(point).addScaledVector(dir, 0.05);
  scene.add(mist);

  const dummy = new THREE.Object3D();
  const t0 = performance.now() / 1000;
  let last = t0;
  const fx = {
    obj: mesh, done: false,
    update(now) {
      const dt = Math.min(0.05, now - last);
      last = now;
      const age = now - t0;
      let anyAlive = false;
      parts.forEach((q, i) => {
        if (q.alive) {
          q.v.y -= 9.81 * dt;
          q.v.multiplyScalar(1 - 1.5 * dt); // air drag on tiny droplets
          q.p.addScaledVector(q.v, dt);
          if (q.p.y <= 0.002) {
            q.alive = false;
            groundDrops?.add(q.p.x, q.p.z, q.r * (2.5 + Math.random() * 2));
          } else if (age > 2) {
            q.alive = false;
          }
        }
        dummy.position.copy(q.p);
        dummy.scale.setScalar(q.alive ? q.r : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        anyAlive ||= q.alive;
      });
      mesh.instanceMatrix.needsUpdate = true;
      const m = Math.min(1, age / 0.4);
      mist.scale.setScalar(0.1 + m * 0.6);
      mistMat.opacity = 0.85 * (1 - m);
      if (m >= 1 && mist.parent) scene.remove(mist);
      if (!anyAlive && m >= 1) {
        fx.done = true;
        geo.dispose();
        mat.dispose();
      }
    },
  };
  return fx;
}

// Blood drops on the ground: one instanced mesh of flat stains, reused in a ring.
export class GroundDrops {
  constructor(scene, max = 600) {
    dropTex ??= makeStainTexture(21, 3);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: dropTex, transparent: true, depthWrite: false, roughness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.max = max;
    this.next = 0;
    this.dummy = new THREE.Object3D();
  }

  add(x, z, size) {
    const d = this.dummy;
    d.position.set(x, 0.005, z);
    d.rotation.set(0, Math.random() * Math.PI * 2, 0);
    d.scale.setScalar(size);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.next, d.matrix);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
  }
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
