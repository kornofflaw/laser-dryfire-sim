// char3d.js — reusable 3D people for scenario scenes (three.js).
// ---------------------------------------------------------------------------
// A Character wraps one cloned, rigged model with:
//   * motion-capture clips from its rig (people3d.js: idle, walk, run, phone ...)
//   * procedural poses layered on the clip, solved with a small two-bone arm
//     IK so they work on any rig: 'aim' (two-handed pistol at a point),
//     'handsUp', 'hostage' (arm around a hostage, pistol to their head),
//     'lying' (on the floor, wounded), 'offer' (right hand held out, e.g.
//     showing a wallet), 'reach' (left hand reaching up, e.g. a wounded man
//     asking for help)
//   * a pistol or rifle prop (addGun), and a body-armour plate carrier
//     (addVest) that follows the chest
//   * hit reactions by body area, falls, wound stains and blood spray
//   * an optional pistol prop that follows the right hand and points at the
//     aim target, with a muzzle flash
// Hit testing: every mesh carries userData.char = this; boneAt() turns a hit
// point into a scoring zone (Head / A / C / D) and a reaction.
//
// Bone names are normalized without the Mixamo prefix (Hips, Spine1, ...),
// so the same tables work for Ready Player Me and Mixamo rigs.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from './config.js';
import { addWound, addSpray } from './blood3d.js';

const C = () => CONFIG.office3d;
const norm = name => name.replace(/^mixamorig:?/, '');

// Bone segments: scoring zone and reaction kind.
const SEGMENTS = [
  ['Neck', 'Head', 'Head', 'head'], ['Head', 'HeadTop_End', 'Head', 'head'],
  ['Spine2', 'Neck', 'chest', 'chest'], ['Spine1', 'Spine2', 'chest', 'chest'],
  ['Spine', 'Spine1', 'C', 'gut'], ['Hips', 'Spine', 'C', 'gut'],
  ['LeftShoulder', 'LeftArm', 'C', 'armL'], ['RightShoulder', 'RightArm', 'C', 'armR'],
  ['LeftArm', 'LeftForeArm', 'D', 'armL'], ['LeftForeArm', 'LeftHand', 'D', 'armL'],
  ['RightArm', 'RightForeArm', 'D', 'armR'], ['RightForeArm', 'RightHand', 'D', 'armR'],
  ['LeftUpLeg', 'LeftLeg', 'D', 'legL'], ['LeftLeg', 'LeftFoot', 'D', 'legL'],
  ['RightUpLeg', 'RightLeg', 'D', 'legR'], ['RightLeg', 'RightFoot', 'D', 'legR'],
];

// Reactions as world-space tilts of the upper body / head (radians), so they
// don't depend on each rig's bone axes. back = away from the shooter.
const REACT = {
  head: { head: 0.7, chest: 0.15, twist: 0 },
  chest: { head: 0.2, chest: 0.4, twist: 0.35 },
  gut: { head: -0.2, chest: -0.45, twist: 0.1 },
  armL: { head: 0, chest: 0.1, twist: 0.4 },
  armR: { head: 0, chest: 0.1, twist: -0.4 },
  legL: { head: 0, chest: -0.15, twist: 0.2, dip: 0.14 },
  legR: { head: 0, chest: -0.15, twist: -0.2, dip: 0.14 },
};

export class Character {
  // rig: { scene (gltf.scene template), clips, facing (radians), tints: { materialName: color } }
  constructor(rig, { role = 'bystander', tints = {}, hide = [] } = {}) {
    this.role = role;
    this.obj = new THREE.Group();
    this.model = SkeletonUtils.clone(rig.scene);
    this.model.rotation.y = rig.facing || 0;
    this.obj.add(this.model);
    this.meshes = [];
    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone) this.bones[norm(o.name)] = o;
      if (!o.isMesh) return;
      if (hide.includes(o.material?.name)) { o.visible = false; return; }
      const tint = tints[o.material?.name] ?? rig.tints?.[o.material?.name];
      if (tint) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(tint);
      }
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.userData.char = this;
      if (!this.skinned && o.isSkinnedMesh) this.skinned = o;
      this.meshes.push(o);
    });
    this.mixer = new THREE.AnimationMixer(this.skinned);
    this.actions = {};
    for (const [k, clip] of Object.entries(rig.clips)) this.actions[k] = this.mixer.clipAction(clip);
    this.current = null;
    this.play('idle', 0);
    this.mixer.update(Math.random() * 2); // don't all breathe in sync

    this.pose = null;          // 'aim' | 'handsUp' | 'hostage' | 'lying' | null
    this.aimAt = new THREE.Vector3();
    this.hostage = null;       // Character held (for 'hostage')
    this.poseWeight = 0;       // eases poses in/out
    this.impulses = [];
    this.fall = null;
    this.hits = 0;
    this.down = false;         // no longer hittable
    this.effects = [];
    this.gun = null;
  }

  play(name, fade = 0.25) {
    if (this.current === name || !this.actions[name]) return;
    const next = this.actions[name].reset().play();
    if (this.current && fade > 0) this.actions[this.current].crossFadeTo(next, fade, false);
    else if (this.current) this.actions[this.current].stop();
    this.current = name;
  }

  // kind: 'pistol' | 'rifle'. The prop follows the right hand (update()).
  addGun(kind = 'pistol') {
    this.weapon = kind;
    this.gun = kind === 'rifle' ? makeRifle() : makePistol();
    this.gun.traverse(o => { if (o.isMesh) { o.userData.char = this; o.castShadow = true; this.meshes.push(o); } });
    this.flash = makeMuzzleFlash();
    if (kind === 'rifle') this.flash.position.set(0, 0.05, 0.8); // at the muzzle
    this.gun.add(this.flash);
    return this.gun;
  }

  // A plate carrier (front and back plates, shoulder straps) that follows
  // the chest. Returns the group (add it to the scene); isArmored() tells
  // whether a hit point lands on it.
  addVest() {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: '#3a3f33', roughness: 0.9 });
    const strap = new THREE.MeshStandardMaterial({ color: '#2c3027', roughness: 0.9 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    box(0.32, 0.34, 0.05, cloth, 0, -0.05, 0.12);     // front plate
    box(0.32, 0.36, 0.05, cloth, 0, -0.04, -0.13);    // back plate
    for (const s of [-1, 1]) {
      box(0.06, 0.03, 0.27, strap, s * 0.11, 0.13, 0);  // shoulder straps
      box(0.05, 0.22, 0.2, strap, s * 0.18, -0.1, 0);   // cummerbund sides
    }
    for (const x of [-0.08, 0, 0.08]) box(0.07, 0.1, 0.04, strap, x, -0.12, 0.165); // mag pouches
    g.traverse(o => { if (o.isMesh) { o.userData.char = this; o.userData.armor = true; this.meshes.push(o); } });
    this.vest = g;
    return g;
  }

  // Is a world point on the armour (the plates cover chest and upper belly)?
  isArmored(bone) {
    return !!this.vest && ['Spine', 'Spine1', 'Spine2'].includes(bone?.name);
  }

  // Fire: muzzle flash for a moment.
  fire(now) { this.flashT = now; }

  update(dt, now) {
    // A new 'aim' starts a draw from the hip holster.
    if (this.pose === 'aim' && this.lastPose !== 'aim') this.drawT = now;
    this.lastPose = this.pose;
    this.now = now;
    // Undo last frame's IK and tilts: the mixer only writes a bone whose
    // animated value changed, so a bone held still by the clip would keep them.
    for (const [b, q] of this.animQ || []) b.quaternion.copy(q);
    this.mixer.update(dt);
    this.animQ ??= IK_BONES.map(n => this.bones[n]).filter(Boolean).map(b => [b, new THREE.Quaternion()]);
    for (const [b, q] of this.animQ) q.copy(b.quaternion);
    this.obj.updateMatrixWorld(true);

    // Procedural pose, eased in.
    const wantW = this.pose && !this.fall ? 1 : 0;
    this.poseWeight += (wantW - this.poseWeight) * Math.min(1, dt * 8);
    if (this.pose && this.poseWeight > 0.01) this.applyPose(this.poseWeight);

    // Hit reactions (world-space tilts, snap then recover).
    const R = CONFIG.knife3d.react;
    this.impulses = this.impulses.filter(i => now - i.t0 < R.duration);
    let dip = 0;
    for (const imp of this.impulses) {
      const t = now - imp.t0;
      const k = (1 - Math.exp(-t * R.snap)) * Math.exp(-t * R.recover) * imp.scale;
      const r = REACT[imp.kind];
      this.tiltBone('Spine1', r.chest * k, r.twist * k * imp.side);
      this.tiltBone('Head', r.head * k, 0);
      dip += (r.dip || 0) * k;
    }

    // Fall: 'drop' sinks straight down (behind a cubicle wall), 'back' topples
    // away from the shooter, 'forward' toward them.
    if (this.fall) {
      const t = Math.min(1, (now - this.fall.t0) / C().fallTime);
      const e = t * t * (3 - 2 * t);
      const f = this.fall;
      if (f.style === 'drop') this.obj.position.y = f.y0 - e * 1.1;
      else {
        this.obj.position.y = f.y0 - e * 0.1;
        this.obj.rotation.x = (f.style === 'back' ? -1 : 1) * e * 1.45;
      }
      if (this.current) this.actions[this.current].timeScale = 1 - t;
    }
    this.model.position.y = -dip;

    // The vest rides on the chest, turned with the body.
    if (this.vest) {
      this.vest.visible = this.obj.visible;
      this.bones.Spine2?.getWorldPosition(this.vest.position);
      this.obj.getWorldQuaternion(this.vest.quaternion);
    }
    // Pistol follows the right hand and points at the aim target.
    if (this.gun) this.gun.visible = this.obj.visible;
    if (this.gun && this.obj.visible) {
      const hand = this.bones.RightHand;
      if (hand) {
        hand.getWorldPosition(this.gun.position);
        const target = this.pose === 'hostage' && this.hostage ? this.hostageHead() : this.aimAt;
        // Mid-draw the muzzle comes up from pointing at the ground.
        const e = this.pose === 'aim' && this.weapon !== 'rifle' ? this.drawProgress() : 1;
        if (e < 1) {
          const down = this.gun.position.clone().add(new THREE.Vector3(0, -1, 0));
          this.gun.lookAt(down.lerp(target, smooth((e - 0.3) / 0.7)));
        } else this.gun.lookAt(target);
      }
      const ft = this.flashT != null ? now - this.flashT : 9;
      this.flash.visible = ft < 0.06;
    }
    for (const fx of this.effects) fx.update(now);
    this.effects = this.effects.filter(fx => { if (fx.done && !fx.persistent) fx.obj.removeFromParent(); return !fx.done || fx.persistent; });
  }

  // 0 -> 1 through a pistol draw (1 = on target).
  drawProgress() {
    if (this.drawT == null || this.now == null) return 1;
    return Math.min(1, Math.max(0, (this.now - this.drawT) / C().drawTime));
  }

  hostageHead() {
    const p = new THREE.Vector3();
    this.hostage.bones.Head.getWorldPosition(p);
    // Muzzle against the side of the head nearest the gun hand.
    return p.add(new THREE.Vector3(0, 0.02, 0));
  }

  // --- poses ---------------------------------------------------------------
  applyPose(w) {
    const B = this.bones;
    const P = name => B[name].getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.obj.getWorldQuaternion(new THREE.Quaternion()));
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize(); // his right, in world

    if (this.pose === 'aim' && this.weapon === 'rifle') {
      // Rifle at the shoulder: firing hand at the grip just ahead of the
      // shoulder, support hand out on the handguard.
      const sR = P('RightArm');
      const dir = this.aimAt.clone().sub(sR).normalize();
      const grip = sR.clone().addScaledVector(dir, 0.2).addScaledVector(up, -0.05).addScaledVector(right, 0.08);
      this.solveArm('Right', grip, up.clone().multiplyScalar(-1).addScaledVector(right, -0.8), w);
      this.solveArm('Left', grip.clone().addScaledVector(dir, 0.33).addScaledVector(up, -0.02), up.clone().multiplyScalar(-1).addScaledVector(right, 0.4), w);
    } else if (this.pose === 'aim') {
      const sR = P('RightArm');
      const dir = this.aimAt.clone().sub(sR).normalize();
      const grip = sR.clone().addScaledVector(dir, 0.58);
      // Draw: hand to the holster on the right hip, then up and out to the
      // target; the support hand meets the gun near the end.
      const e = this.drawProgress();
      let hand = grip, wR = w;
      if (e < 1) {
        const holster = P('RightUpLeg').addScaledVector(right, 0.09).addScaledVector(up, 0.03).addScaledVector(fwd, -0.02);
        hand = e < 0.35 ? holster : holster.lerp(grip, smooth((e - 0.35) / 0.65));
        wR = w * Math.min(1, e / 0.25);
      }
      this.solveArm('Right', hand, up.clone().multiplyScalar(-1).addScaledVector(right, 0.5), wR);
      const wL = w * smooth((e - 0.55) / 0.45);
      if (wL > 0) this.solveArm('Left', grip.clone().addScaledVector(right, 0.03), up.clone().multiplyScalar(-1).addScaledVector(right, -0.5), wL);
    } else if (this.pose === 'reach') {
      // Lying on his back, reaching up toward whoever comes in.
      const sh = P('LeftArm');
      const sway = Math.sin(performance.now() / 700) * 0.08;
      const hand = sh.clone().add(new THREE.Vector3(sway, 0.5, 0.15));
      this.solveArm('Left', hand, new THREE.Vector3(-1, 0, 0), w);
    } else if (this.pose === 'handsUp') {
      for (const [side, s] of [['Left', 1], ['Right', -1]]) {
        const sh = P(side + 'Arm');
        const hand = sh.clone().addScaledVector(up, 0.42).addScaledVector(right, s * 0.28).addScaledVector(fwd, 0.08);
        this.solveArm(side, hand, right.clone().multiplyScalar(s).addScaledVector(up, -0.5), w);
      }
    } else if (this.pose === 'offer') {
      const sh = P('RightArm');
      const hand = sh.clone().addScaledVector(fwd, 0.42).addScaledVector(up, -0.22).addScaledVector(right, 0.1);
      this.solveArm('Right', hand, up.clone().multiplyScalar(-1).addScaledVector(right, -0.6), w);
    } else if (this.pose === 'hostage' && this.hostage) {
      const head = this.hostageHead();
      // Gun hand just beside the hostage's head.
      this.solveArm('Right', head.clone().addScaledVector(right, 0.07).addScaledVector(fwd, -0.02), up.clone().multiplyScalar(-1).addScaledVector(right, -0.6), w);
      // Other arm across the hostage's chest.
      const chest = this.hostage.bones.Spine2.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.08).addScaledVector(right, -0.12);
      this.solveArm('Left', chest, up.clone().multiplyScalar(-1).addScaledVector(right, 0.6), w);
    }
  }

  // Two-bone IK: put `side` hand at `target`, elbow toward `pole`.
  solveArm(side, target, pole, w = 1) {
    const B = this.bones;
    const up = B[side + 'Arm'], fore = B[side + 'ForeArm'], hand = B[side + 'Hand'];
    if (!up || !fore || !hand) return;
    const S = up.getWorldPosition(new THREE.Vector3());
    const E0 = fore.getWorldPosition(new THREE.Vector3());
    const H0 = hand.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E0), b = E0.distanceTo(H0);
    const toT = target.clone().sub(S);
    const d = Math.min(toT.length(), (a + b) * 0.999);
    const n = toT.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const u = pole.clone().sub(n.clone().multiplyScalar(pole.dot(n)));
    if (u.lengthSq() < 1e-6) u.set(0, -1, 0);
    u.normalize();
    const E = S.clone().addScaledVector(n, a * cosA).addScaledVector(u, a * Math.sqrt(1 - cosA * cosA));
    const T = S.clone().addScaledVector(n, d);
    pointBone(up, fore, E.clone().sub(S).normalize(), w);
    pointBone(fore, hand, T.clone().sub(E).normalize(), w);
  }

  // Tilt a bone back (away from the shooter) and twist, in world space.
  tiltBone(name, back, twist) {
    const b = this.bones[name];
    if (!b || (!back && !twist)) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.obj.getWorldQuaternion(new THREE.Quaternion()));
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, -back)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist));
    rotateWorld(b, q);
  }

  // --- hits ------------------------------------------------------------------
  boneAt(p) {
    const a = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
    let best = null, bestD = Infinity;
    for (const seg of SEGMENTS) {
      const A = this.bones[seg[0]], Bn = this.bones[seg[1]];
      if (!A || !Bn) continue;
      A.getWorldPosition(a);
      Bn.getWorldPosition(c);
      new THREE.Line3(a, c).closestPointToPoint(p, true, q);
      const dd = q.distanceTo(p);
      if (dd < bestD) { bestD = dd; best = { seg, closest: q.clone() }; }
    }
    const [from, , zk, kind] = best.seg;
    const zone = zk === 'chest' ? (bestD <= CONFIG.knife3d.aZoneRadius ? 'A' : 'C') : zk;
    const normal = p.clone().sub(best.closest);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    normal.normalize();
    const local = this.obj.worldToLocal(p.clone());
    return { zone, kind, bone: this.bones[from], normal, side: local.x >= 0 ? 1 : -1 };
  }

  // A round hit this character: reaction, blood. Returns the hit info.
  hit(point, dir, now, scene, groundDrops, blood) {
    const h = this.boneAt(point);
    this.impulses.push({ kind: h.kind, t0: now, side: h.side, scale: 0.8 + Math.random() * 0.4 });
    if (blood) {
      this.effects.push(addWound(h.bone, point, h.normal));
      this.effects.push(addSpray(scene, point, dir, groundDrops));
    }
    return h;
  }

  goDown(now, style) {
    if (this.fall) return;
    this.down = true;
    this.fall = { t0: now, style, y0: this.obj.position.y };
    this.pose = null;
  }
}

// Rotate bone `child`-ward so its direction to `child` becomes `dir` (world),
// blended by w. Keeps the rest of the chain attached.
function pointBone(bone, child, dir, w = 1) {
  bone.updateWorldMatrix(true, true);
  const A = bone.getWorldPosition(new THREE.Vector3());
  const Bp = child.getWorldPosition(new THREE.Vector3());
  const cur = Bp.sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir);
  if (w < 1) q.slerp(new THREE.Quaternion(), 1 - w);
  rotateWorld(bone, q);
}

// Bones the procedural poses and hit reactions rotate.
const IK_BONES = ['Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

// Apply a world-space rotation q to a bone (pre-multiply its world rotation).
function rotateWorld(bone, q) {
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = q.clone().multiply(worldQ);
  bone.quaternion.copy(parentQ.invert().multiply(newWorld));
  bone.updateWorldMatrix(false, true);
}

// Carbine: grip at the origin, barrel along +Z (lookAt aims it), stock back
// toward the shoulder.
function makeRifle() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.5, metalness: 0.5 });
  const poly = new THREE.MeshStandardMaterial({ color: '#232427', roughness: 0.8 });
  const part = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); };
  part(0.05, 0.07, 0.36, black, 0, 0.05, 0.08);       // receiver
  part(0.045, 0.05, 0.3, poly, 0, 0.05, 0.4);         // handguard
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 8), black);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.05, 0.66);
  g.add(barrel);
  part(0.03, 0.1, 0.045, poly, 0, -0.03, 0.02, 0.35);  // pistol grip
  part(0.03, 0.14, 0.06, black, 0, -0.03, 0.14, -0.15); // magazine
  part(0.04, 0.07, 0.24, poly, 0, 0.03, -0.2);         // stock
  part(0.02, 0.04, 0.12, black, 0, 0.1, 0.12);         // optic rail/sight
  return g;
}

// Compact semi-auto pistol; barrel along +Z so lookAt() aims it.
function makePistol() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#18191b', roughness: 0.45, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.19), black);
  slide.position.set(0, 0.025, 0.06);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.02, 0.15), black);
  frame.position.set(0, 0.0, 0.04);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.11, 0.045), grip);
  handle.position.set(0, -0.045, -0.01);
  handle.rotation.x = 0.25;
  g.add(slide, frame, handle);
  return g;
}

function makeMuzzleFlash() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.3, 'rgba(255,190,80,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(0, 0.025, 0.2);
  s.scale.set(0.25, 0.25, 1);
  const light = new THREE.PointLight('#ffb050', 30, 6, 2);
  s.add(light);
  s.visible = false;
  return s;
}
