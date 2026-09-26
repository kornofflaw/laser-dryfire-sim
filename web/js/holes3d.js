// holes3d.js — bullet holes that stay where rounds hit walls, desks and cars.
// ---------------------------------------------------------------------------
// A small decal on the surface the round struck, facing out along the
// surface normal, parented to the object that was hit (so a hole in a door
// swings with the door). Looks by kind of surface:
//   plaster  dark hole, ring of crushed pale drywall
//   wood     dark hole, splintered light ring
//   metal    dark hole, ring of bright bare metal (car bodies, steel)
//   glass    a small hole with thin radiating cracks (windows that don't shatter)
//   ground   a dark scuff
// Textures are drawn in code once; every hole shares its kind's material.
// The oldest holes are recycled past CONFIG.holes.max. clear() for a new run.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const H = () => CONFIG.holes;
const LOOKS = {
  plaster: { ring: 'rgba(236,232,224,0.95)', ringR: 0.62, chips: 7 },
  wood: { ring: 'rgba(214,180,128,0.95)', ringR: 0.55, chips: 9 },
  metal: { ring: 'rgba(205,210,214,0.95)', ringR: 0.42, chips: 0 },
  ground: { ring: 'rgba(40,36,32,0.55)', ringR: 0.8, chips: 5 },
  glass: { ring: null, cracks: 11 },
};

let geo = null;
const mats = {};

function holeMaterial(kind) {
  if (mats[kind]) return mats[kind];
  const L = LOOKS[kind] || LOOKS.plaster;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const R = 32;
  if (L.cracks) {
    // Radial cracks with a few rings: light lines on the glass.
    g.strokeStyle = 'rgba(235,242,245,0.85)';
    g.lineWidth = 1.2;
    for (let i = 0; i < L.cracks; i++) {
      const a = (i / L.cracks) * Math.PI * 2 + Math.random() * 0.4, r1 = R * (0.55 + Math.random() * 0.43);
      g.beginPath(); g.moveTo(R, R);
      for (let r = 4; r < r1; r += 5) g.lineTo(R + Math.cos(a + (Math.random() - 0.5) * 0.15) * r, R + Math.sin(a + (Math.random() - 0.5) * 0.15) * r);
      g.stroke();
    }
    for (const rr of [0.25, 0.42]) { g.beginPath(); g.arc(R, R, R * rr * (0.9 + Math.random() * 0.2), 0, Math.PI * 2); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1; }
  } else {
  // Ring of damaged surface, ragged.
  g.fillStyle = L.ring;
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = R * L.ringR * (0.8 + Math.random() * 0.35);
    g.lineTo(R + Math.cos(a) * r, R + Math.sin(a) * r);
  }
  g.fill();
  // Chips / splinters flung outward.
  for (let i = 0; i < L.chips; i++) {
    const a = Math.random() * Math.PI * 2, r0 = R * L.ringR * 0.8, r1 = R * (0.75 + Math.random() * 0.22);
    g.strokeStyle = L.ring;
    g.lineWidth = 1.5 + Math.random() * 2;
    g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke();
  }
  }
  // The hole: near-black centre with a soft edge.
  const hr = L.cracks ? 0.12 : 0.3;
  const hole = g.createRadialGradient(R, R, 0, R, R, R * hr);
  hole.addColorStop(0, 'rgba(8,8,8,1)');
  hole.addColorStop(0.7, 'rgba(20,18,16,0.95)');
  hole.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = hole;
  g.beginPath(); g.arc(R, R, R * hr, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: at a distance they average the round hole into a pale square.
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  mats[kind] = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthWrite: false, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  return mats[kind];
}

export class BulletHoles {
  constructor() {
    this.holes = [];
  }

  // point, normal: world space; object: the mesh that was hit (the hole rides
  // on it); kind: 'plaster' | 'wood' | 'metal' | 'ground'.
  add(point, normal, object, kind = 'plaster') {
    if (!point || !normal || !object) return;
    geo ??= new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(geo, holeMaterial(kind));
    const size = (H().sizeCm / 100) * (kind === 'ground' ? 2.5 : kind === 'glass' ? 4 : 1) * (0.85 + Math.random() * 0.3);
    m.scale.set(size, size, 1);
    m.position.copy(point).addScaledVector(normal, 0.002);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.renderOrder = 2;
    object.attach(m); // keep the world pose, then move with the object
    this.holes.push(m);
    if (this.holes.length > H().max) this.holes.shift().removeFromParent();
  }

  clear() {
    for (const m of this.holes) m.removeFromParent();
    this.holes = [];
  }
}

// What a hit mesh is made of, from its material (for the hole's look).
export function surfaceKind(object, fallback = 'plaster') {
  const m = [].concat(object?.material)[0];
  if (!m) return fallback;
  if (m.transparent || m.transmission > 0) return 'glass';
  if (m.metalness >= 0.4) return 'metal';
  return fallback;
}
