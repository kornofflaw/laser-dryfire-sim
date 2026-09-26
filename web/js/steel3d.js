// steel3d.js — steel targets for the 3D range: plate rack, poppers, Texas Star.
// ---------------------------------------------------------------------------
// Painted steel on dark frames. A hit leaves a grey lead splash on the paint
// (on the face, where the round struck) and the target reacts:
//   PlateRack  six 8" plates on paddles hinged to a beam; a hit knocks the
//              plate back onto the stop bar.
//   Poppers    full-size USPSA poppers hinged at the base; a hit tips one
//              over backwards onto the ground.
//   StageSteel any mix of full-size poppers, mini poppers and plates on
//              stands, placed anywhere in the bay (stages).
//   FlipGrid3D the flip grid: a steel frame of square plates that spin on
//              vertical axles, mirroring the FlipBoard (fliptiles.js) that
//              the flip courses drive, faces drawn by the same code as 2D.
//   Star3D     the Texas Star. Its rotation comes from the same rigid-body
//              model as the 2D star (star.js, range.star), so both behave the
//              same; a plate that's hit comes off the arm with the arm's
//              velocity, tumbles and lands on the ground.
//
// Every set has the same shape for Range3DView:
//   group, solids (frame parts: stop rounds, spark), hittables() (standing
//   plates, mesh.userData.steel = index), hit(i, point, dir, nowSec),
//   update(dt, nowSec), reset(), standing, clearedAt.
// Steel state for the rack and poppers lives here; hits are scored by the
// single scoring path like any other shot (zone 'Steel').

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clack } from './audio.js';
import { drawPlate } from './fliptiles.js';

const S = () => CONFIG.range3d.steel;
const THICK = 0.0095; // 3/8" plate

export function steelMaterials() {
  return {
    paint: new THREE.MeshStandardMaterial({ color: S().paint, map: paintTexture(), roughness: 0.62, metalness: 0 }),
    frame: new THREE.MeshStandardMaterial({ color: S().frame, roughness: 0.7, metalness: 0.35 }),
  };
}

// ---- falling steel (plate rack, poppers) ----------------------------------------
// Each item: pivot (rotates about its x axis, 0 = upright), mesh (the hittable
// face), faceZ (local z of the painted face), k (gravity term 3g/2L), kick
// (rad/s a hit gives it), fallTo (angle where it stops).
class FallingSet {
  constructor(name) {
    this.name = name;
    this.group = new THREE.Group();
    this.solids = [];
    this.items = [];
    this.clearedAt = null;
  }

  get standing() { return this.items.filter(t => t.up).length; }
  get moving() { return this.items.some(t => !t.up && !t.resting); }
  hittables() { return this.items.filter(t => t.up).map(t => t.mesh); }

  hit(i, point, dir, nowSec) {
    const t = this.items[i];
    if (!t?.up) return;
    t.up = false;
    t.omega = t.kick;
    t.marks.push(addSplash(t.mesh, point, t.faceZ));
    if (!this.standing) this.clearedAt = nowSec;
  }

  update(dt) {
    const h = Math.min(dt, 0.05) / 4;
    for (const t of this.items) {
      if (t.up || t.resting) continue;
      for (let s = 0; s < 4; s++) {
        // An inverted pendulum about the hinge: gravity pulls it further over.
        t.omega += t.k * Math.sin(Math.max(t.theta, 0.03)) * h;
        t.theta += t.omega * h;
        if (t.theta >= t.fallTo) {
          t.theta = t.fallTo;
          if (t.omega > 0.9) {
            if (!t.clanked) { clack(); t.clanked = true; }
            t.omega = -t.omega * 0.25; // bounces off the stop
          } else {
            t.omega = 0;
            t.resting = true;
          }
        }
      }
      t.pivot.rotation.x = -t.theta; // falls away from the shooter
    }
  }

  reset() {
    for (const t of this.items) {
      Object.assign(t, { up: true, theta: 0, omega: 0, resting: false, clanked: false });
      t.pivot.rotation.x = 0;
      t.marks.forEach(m => m.removeFromParent());
      t.marks = [];
    }
    this.clearedAt = null;
  }

  addItem(pivot, mesh, faceZ, length, kick, fallTo) {
    const i = this.items.length;
    mesh.userData.steel = i;
    this.items.push({ pivot, mesh, faceZ, k: (3 * 9.81) / (2 * length), kick, fallTo, up: true, theta: 0, omega: 0, resting: false, marks: [] });
  }
}

// Six 8" plates on 12" centres, on paddles hinged to the top of a beam.
export class PlateRack extends FallingSet {
  constructor(mats) {
    super('plate');
    const R = S().rack;
    const n = R.plates, r = R.plateRadius;
    const width = (n - 1) * R.spacing + 0.4;
    const frame = (w, h, d, x, y, z) => {
      const m = box(w, h, d, mats.frame);
      m.position.set(x, y, z);
      m.userData.surface = 'steel-frame';
      this.group.add(m);
      this.solids.push(m);
      return m;
    };
    frame(width, 0.05, 0.05, 0, R.beamY, -0.03);              // front beam
    frame(width, 0.04, 0.04, 0, R.beamY - 0.04, -0.34);       // stop bar the plates fall onto
    for (const sx of [-1, 1]) {
      const x = sx * (width / 2 - 0.02);
      frame(0.05, R.beamY, 0.05, x, R.beamY / 2, -0.03);      // legs
      frame(0.05, R.beamY - 0.04, 0.05, x, (R.beamY - 0.04) / 2, -0.34);
      frame(0.05, 0.05, 0.36, x, R.beamY - 0.04, -0.185);     // side rails
      frame(0.08, 0.03, 0.8, x, 0.015, -0.18);                // feet
    }
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.position.set((i - (n - 1) / 2) * R.spacing, R.beamY + 0.025, -0.01);
      const paddle = box(0.035, R.paddle, 0.012, mats.frame);
      paddle.position.set(0, R.paddle / 2, -0.012);
      paddle.userData.surface = 'steel-frame';
      const disc = plateDisc(r, mats.paint);
      disc.position.y = R.paddle;
      pivot.add(paddle, disc);
      this.group.add(pivot);
      this.solids.push(paddle);
      this.addItem(pivot, disc, THICK / 2, R.paddle + r, R.kick, R.fallTo);
    }
    castShadows(this.group);
  }
}

// USPSA full-size ("classic") poppers on hinged base plates.
export class Poppers extends FallingSet {
  constructor(mats) {
    super('popper');
    const P = S().popper;
    for (let i = 0; i < P.count; i++) addPopper(this, mats, (i - (P.count - 1) / 2) * P.spacing, 0, P.height);
    castShadows(this.group);
  }
}

// Mixed steel for a stage (courses.js stage items with world x, z):
// { type: 'popper' | 'mini' | 'plate', x, z, id, h? }. Item i's target id is its
// stage id (S1, S2 ...), so the stage runner can tell them apart.
export class StageSteel extends FallingSet {
  constructor(items, mats) {
    super('S');
    for (const it of items) {
      if (it.type === 'plate') addPlateStand(this, mats, it.x, it.z, it.h ?? S().plateStand.height);
      else addPopper(this, mats, it.x, it.z, it.type === 'mini' ? S().mini.height : S().popper.height);
      this.items[this.items.length - 1].id = it.id;
    }
    castShadows(this.group);
  }
  idOf(i) { return this.items[i].id; }
}

// A popper on its hinged base plate at (x, z).
function addPopper(set, mats, x, z, height) {
  const P = S().popper;
  const k = height / P.height;
  const base = box(0.36 * k, 0.03, 0.34 * k, mats.frame);
  base.position.set(x, 0.015, z - 0.1 * k);
  const hinge = box(0.2 * k, 0.035, 0.04, mats.frame);
  hinge.position.set(x, 0.045, z - 0.012);
  for (const m of [base, hinge]) { m.userData.surface = 'steel-frame'; set.group.add(m); set.solids.push(m); }
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.05, z);
  const mesh = new THREE.Mesh(popperGeometry(height), mats.paint);
  pivot.add(mesh);
  set.group.add(pivot);
  set.addItem(pivot, mesh, THICK / 2, height, P.kick, P.fallTo);
}

// A single 8" plate on a paddle hinged to the top of a post (a "plate stand").
function addPlateStand(set, mats, x, z, height) {
  const P = S().plateStand, r = S().rack.plateRadius;
  const post = box(0.05, height, 0.05, mats.frame);
  post.position.set(x, height / 2, z - 0.04);
  const foot = box(0.4, 0.03, 0.4, mats.frame);
  foot.position.set(x, 0.015, z - 0.04);
  for (const m of [post, foot]) { m.userData.surface = 'steel-frame'; set.group.add(m); set.solids.push(m); }
  const pivot = new THREE.Group();
  pivot.position.set(x, height, z);
  const paddle = box(0.035, P.paddle, 0.012, mats.frame);
  paddle.position.set(0, P.paddle / 2, -0.012);
  paddle.userData.surface = 'steel-frame';
  const disc = plateDisc(r, mats.paint);
  disc.position.y = P.paddle;
  pivot.add(paddle, disc);
  set.group.add(pivot);
  set.solids.push(paddle);
  set.addItem(pivot, disc, THICK / 2, P.paddle + r, S().rack.kick, P.fallTo);
}

// ---- Texas Star ---------------------------------------------------------------------
const N = 5;
// ---- flip grid ---------------------------------------------------------------------
// The board (fliptiles.js FlipBoard) holds every plate's face, spin and hit
// marks; this draws it. A plate turns on its axle through 180 degrees; at the
// half-way point the other face comes round, so the plate is shown with the
// face the board says is visible, turned by up to +/- 90 degrees.
export class FlipGrid3D {
  constructor(board, mats) {
    this.name = 'tile';
    this.board = board;
    this.group = new THREE.Group();
    this.solids = [];
    this.plates = [];
    this.textures = new Map();
    this.clearedAt = null;
    const { cols, rows } = CONFIG.flip;
    const G = CONFIG.range3d.flipGrid, s = G.plate, gap = s * 0.18, pad = s * 0.35;
    const W = s * (cols + (cols - 1) * 0.18 + 0.7), H = s * (rows + (rows - 1) * 0.18 + 0.7);
    const bar = (w, h, x, y) => {
      const m = box(w, h, 0.05, mats.frame);
      m.position.set(x, y, -0.03);
      m.userData.surface = 'steel-frame';
      this.group.add(m);
      this.solids.push(m);
    };
    const cy = G.centerY;
    // Border, the bars between openings, legs and feet.
    bar(W, pad, 0, cy + H / 2 - pad / 2);
    bar(W, pad, 0, cy - H / 2 + pad / 2);
    bar(pad, H, -W / 2 + pad / 2, cy);
    bar(pad, H, W / 2 - pad / 2, cy);
    const cx = c => -W / 2 + pad + c * (s + gap) + s / 2;
    const ry = r => cy + H / 2 - pad - r * (s + gap) - s / 2;
    for (let c = 1; c < cols; c++) bar(gap, H - 2 * pad, cx(c) - s / 2 - gap / 2, cy);
    for (let r = 1; r < rows; r++) bar(W - 2 * pad, gap, 0, ry(r) + s / 2 + gap / 2);
    for (const sx of [-0.3, 0.3]) {
      const leg = box(0.06, cy - H / 2, 0.06, mats.frame);
      leg.position.set(sx * W, (cy - H / 2) / 2, -0.03);
      leg.userData.surface = 'steel-frame';
      const foot = box(0.08, 0.04, 0.6, mats.frame);
      foot.position.set(sx * W, 0.02, -0.03);
      this.group.add(leg, foot);
      this.solids.push(leg);
    }
    // Plates: a thin steel square, the painted face on the front.
    const edge = mats.frame;
    const back = new THREE.MeshStandardMaterial({ color: S().frame, roughness: 0.6, metalness: 0.4 });
    this.splashMat = new THREE.MeshStandardMaterial({ color: '#77797c', roughness: 0.5, metalness: 0.3 });
    this.splashGeo = new THREE.CircleGeometry(s * 0.045, 9);
    for (let i = 0; i < cols * rows; i++) {
      const face = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, 0.012), [edge, edge, edge, edge, face, back]);
      mesh.position.set(cx(i % cols), ry(Math.floor(i / cols)), 0.01);
      mesh.userData.tile = i;
      const axle = box(0.012, s + gap, 0.012, mats.frame);
      axle.position.set(mesh.position.x, mesh.position.y, -0.002);
      this.group.add(mesh, axle);
      this.plates.push({ mesh, face, marks: [], key: null });
    }
    this.size = s;
    castShadows(this.group);
  }

  // A face texture (cached per face: blank, target, each number, each shape).
  texture(face, num) {
    const key = face + ':' + (num ?? '');
    if (!this.textures.has(key)) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.translate(128, 128);
      drawPlate(g, 256, face, num, []);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.textures.set(key, t);
    }
    return this.textures.get(key);
  }

  get moving() { return this.board.tiles.some(t => t.anim); }

  hittables() { return this.plates.map(p => p.mesh); }

  // A round hit plate i at texture coords uv: which face it hit, where on it
  // (u, v as fractions of the plate from its centre, v down, like 2D), or
  // null if the plate is too edge-on to be hit (the round goes past).
  tileHit(i, uv, nowSec) {
    const t = this.board.tiles[i];
    const v = this.board.view(t, nowSec);
    if (v.k < CONFIG.flip.hittableAbove) return null;
    return { tile: i, face: v.face, num: v.num, u: uv.x - 0.5, v: 0.5 - uv.y };
  }

  update(dt, nowSec) {
    const s = this.size;
    this.board.tiles.forEach((t, i) => {
      const p = this.plates[i];
      const v = this.board.view(t, nowSec);
      const key = v.face + ':' + (v.num ?? '');
      if (p.key !== key) { p.key = key; p.face.map = this.texture(v.face, v.num); p.face.needsUpdate = true; }
      p.mesh.rotation.y = t.anim ? (v.p < 0.5 ? v.p : v.p - 1) * Math.PI : 0;
      // Hit flash (green = right plate, red = wrong) and lead splashes.
      p.face.emissive.set(t.flashGood ? '#3cff78' : '#ff3c3c');
      p.face.emissiveIntensity = t.anim ? 0 : t.flash * 0.6;
      const marks = t.anim ? [] : t.marks;
      if (marks.length !== p.marks.length) {
        p.marks.forEach(m => m.removeFromParent());
        p.marks = marks.map(([u, w]) => {
          const m = new THREE.Mesh(this.splashGeo, this.splashMat);
          m.position.set(u * s, -w * s, 0.0065);
          p.mesh.add(m);
          return m;
        });
      }
    });
  }

  hit() {}      // the board and runner handle plate hits
  reset() {}    // the board resets with the range
}

export class Star3D {
  // star: the TexasStar physics object (star.js) shared with the 2D view.
  constructor(star, mats) {
    this.name = 'star';
    this.star = star;
    this.group = new THREE.Group();
    this.solids = [];
    const C = CONFIG.star, hubY = S().star.hubY, arm = C.armLength, r = C.plateRadius;
    const frame = (m, parent = this.group) => {
      m.userData.surface = 'steel-frame';
      parent.add(m);
      this.solids.push(m);
      return m;
    };
    // Post on an A-frame stand, behind the wheel.
    const post = frame(box(0.07, hubY, 0.07, mats.frame));
    post.position.set(0, hubY / 2, -0.09);
    const foot = frame(box(1.1, 0.05, 0.08, mats.frame));
    foot.position.set(0, 0.025, -0.09);
    const back = frame(box(0.08, 0.05, 0.9, mats.frame));
    back.position.set(0, 0.025, -0.5);
    for (const sx of [-1, 1]) {
      const brace = frame(box(0.04, 0.9, 0.04, mats.frame));
      brace.position.set(sx * 0.25, 0.42, -0.09);
      brace.rotation.z = sx * 0.55;
    }
    const strut = frame(box(0.04, 1.1, 0.04, mats.frame));
    strut.position.set(0, 0.5, -0.45);
    strut.rotation.x = -0.72;
    // The wheel: hub, five arms, a plate on each.
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, hubY, 0);
    this.group.add(this.wheel);
    const hub = frame(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 28).rotateX(Math.PI / 2), mats.frame), this.wheel);
    hub.position.z = -0.03;
    this.plates = [];
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      const len = arm - r * 0.6;
      const bar = frame(box(0.045, len, 0.016, mats.frame), this.wheel);
      bar.position.set(Math.sin(a) * len / 2, Math.cos(a) * len / 2, -0.02);
      bar.rotation.z = -a;
      // Plate holder at the arm tip: local +y points out along the arm.
      const holder = new THREE.Group();
      holder.position.set(Math.sin(a) * arm, Math.cos(a) * arm, 0);
      holder.rotation.z = -a;
      const disc = plateDisc(r, mats.paint);
      disc.userData.steel = i;
      const tab = box(0.05, r * 0.9, 0.01, mats.frame);
      tab.position.set(0, -r * 0.75, -0.01);
      holder.add(disc, tab);
      this.wheel.add(holder);
      this.plates.push({ holder, disc, home: { p: holder.position.clone(), q: holder.quaternion.clone() }, free: null, marks: [] });
    }
    castShadows(this.group);
  }

  get standing() { return this.star.platesLeft; }
  get moving() { return Math.abs(this.star.omega) > 1e-3 || this.plates.some(p => p.free && !(p.free.settle?.k >= 1)); }
  get clearedAt() { return null; } // the free-practice reset is done by range.js for the star

  hittables() { return this.plates.filter((p, i) => this.star.plates[i].on && !p.free).map(p => p.disc); }

  // Called after range.star.knockOff(i): the plate leaves the arm.
  hit(i, point, dir) {
    const p = this.plates[i];
    if (!p || p.free) return;
    p.marks.push(addSplash(p.disc, point, THICK / 2));
    this.wheel.updateMatrixWorld(true);
    const w = new THREE.Vector3();
    p.holder.getWorldPosition(w);
    const hub = new THREE.Vector3();
    this.wheel.getWorldPosition(hub);
    const rx = w.x - hub.x, ry = w.y - hub.y;
    const om = this.star.omega; // clockwise as you look at it = about -z
    this.group.attach(p.holder);
    const v = new THREE.Vector3(om * ry, -om * rx, 0).addScaledVector(dir, 1.4);
    v.x += (Math.random() - 0.5) * 0.5;
    v.y += 0.4 + Math.random() * 0.4;
    p.free = { v, spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, -om + (Math.random() - 0.5) * 6), bounces: 0, settle: null };
  }

  update(dt) {
    this.wheel.rotation.z = -this.star.angle;
    // range.js rebuilt the star (free practice): put the plates back.
    if (this.plates.some(p => p.free) && this.star.plates.every(q => q.on)) this.reset();
    const h = Math.min(dt, 0.05);
    for (const p of this.plates) {
      const f = p.free;
      if (!f) continue;
      const o = p.holder;
      if (f.settle) {
        f.settle.k = Math.min(1, f.settle.k + h / 0.18);
        o.quaternion.slerpQuaternions(f.settle.from, f.settle.to, f.settle.k);
        o.position.y += (0.006 - o.position.y) * f.settle.k;
        continue;
      }
      f.v.y -= 9.81 * h;
      o.position.addScaledVector(f.v, h);
      o.rotation.x += f.spin.x * h;
      o.rotation.y += f.spin.y * h;
      o.rotation.z += f.spin.z * h;
      if (o.position.y < 0.09 && f.v.y < 0) {
        f.bounces++;
        if (f.bounces === 1) clack();
        f.v.set(f.v.x * 0.45, -f.v.y * 0.3, f.v.z * 0.45);
        f.spin.multiplyScalar(0.4);
        o.position.y = 0.09;
        if (f.bounces >= 2 || Math.abs(f.v.y) < 0.6) {
          // Lie flat, painted face up, where it landed.
          const to = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.random() * Math.PI * 2, 'XYZ'));
          f.settle = { from: o.quaternion.clone(), to, k: 0 };
        }
      }
    }
  }

  reset() {
    for (const p of this.plates) {
      if (p.free) {
        this.wheel.add(p.holder);
        p.holder.position.copy(p.home.p);
        p.holder.quaternion.copy(p.home.q);
        p.free = null;
      }
      p.marks.forEach(m => m.removeFromParent());
      p.marks = [];
    }
  }
}

// ---- pieces ----------------------------------------------------------------------------
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }

// A round plate, painted face toward +z.
function plateDisc(r, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, THICK, 40).rotateX(Math.PI / 2), mat);
}

function castShadows(group) {
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

// Classic popper outline: 8" head on a neck, body widening to 12", tapering
// to the base. Hinge at y = 0; painted face toward +z.
const popperGeos = new Map();
function popperGeometry(height) {
  if (!popperGeos.has(height)) {
    const g = makePopperGeometry(height);
    g.userData.shared = true; // kept when a layout is torn down
    popperGeos.set(height, g);
  }
  return popperGeos.get(height);
}
function makePopperGeometry(height) {
  const k = height / 1.07;
  const headR = 0.1016 * k, cy = height - headR, nx = 0.05 * k;
  const neckY = cy - Math.sqrt(headR * headR - nx * nx);
  const s = new THREE.Shape();
  s.moveTo(-0.075 * k, 0);
  s.lineTo(-0.1525 * k, 0.68 * k);
  s.lineTo(-nx, neckY);
  s.absarc(0, cy, headR, Math.atan2(neckY - cy, -nx), Math.atan2(neckY - cy, nx), true);
  s.lineTo(0.1525 * k, 0.68 * k);
  s.lineTo(0.075 * k, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: THICK, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -THICK / 2);
  return g;
}

// A grey lead splash on the paint where a round struck.
let splashMat = null;
function addSplash(mesh, point, faceZ) {
  if (!splashMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    for (let j = 0; j < 22; j++) {
      const a = (j / 22) * Math.PI * 2 + Math.random() * 0.2, len = 22 + Math.random() * 38;
      g.strokeStyle = `rgba(92,94,97,${0.5 + Math.random() * 0.4})`;
      g.lineWidth = 2 + Math.random() * 3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    gr.addColorStop(0, 'rgba(70,72,75,1)');
    gr.addColorStop(0.6, 'rgba(95,97,100,0.9)');
    gr.addColorStop(1, 'rgba(110,112,115,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 26, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    splashMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  mesh.updateWorldMatrix(true, false);
  const local = mesh.worldToLocal(point.clone());
  const size = S().splashCm / 100;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), splashMat);
  m.position.set(local.x, local.y, faceZ + 0.0008);
  m.rotation.z = Math.random() * Math.PI * 2;
  mesh.add(m);
  return m;
}

// Off-white target paint with faint grey ghosts of old hits under it.
function paintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 4 + Math.random() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(150,150,145,0.22)');
    gr.addColorStop(1, 'rgba(150,150,145,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
