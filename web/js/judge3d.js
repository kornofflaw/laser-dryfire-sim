// judge3d.js — the shoot / no-shoot scenarios with realistic 3D people.
// ---------------------------------------------------------------------------
// The scenario scripts (scenarios.js) and grading (scenario.js, ScenarioRunner)
// are the same as the 2D version: the runner puts actors on the Range and
// changes their pose on a timeline. This view mirrors every actor as a
// motion-captured Rocketbox person (people3d.js) standing in the 3D parking
// lot (knife3d.js Lot3DView, without the knife man), and ray-casts shots.
//
// Pose -> what you see:
//   back       turned away, idle
//   empty      facing you, idle (each person their own: neutral / looking
//              around / nervous)
//   gun        facing you, pistol up in both hands, aimed at you
//   phone      facing you, on a phone call (phone in hand)
//   wallet     facing you, holding a wallet out
//   surrender  hands up; a gun they had drops to the ground
//   walking    (vx) walks across; turns to you when they reveal something
//   hit        reacts by body area, bleeds; down after the runner's hit count
//
// Only a person showing a gun is a threat (same rule as 2D).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Lot3DView } from './knife3d.js';
import { Character } from './char3d.js';
import { People, CAST, attachProp } from './people3d.js';

const J = () => CONFIG.judge3d;
const IDLES = ['idle', 'look', 'nervous'];

export class Judge3DView extends Lot3DView {
  constructor(range) {
    const canvas = document.createElement('canvas');
    canvas.className = 'range3d';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.getElementById('range'));
    super(canvas);
    this.range = range;
    this.people = new Map(); // actor -> { char, idle, phone, wallet, yaw }
  }

  async init(opts = {}) {
    await super.init({ ...opts, man: false });
    this.ready = false; // not until the people are in
    this.cast = new People(this.gltf);
    await this.cast.load();
    this.ready = true;
  }

  // The Range calls these like the 3D range view's (main.js range.onReset).
  setLayout() { return false; }
  resetTargets() {
    for (const p of this.people.values()) this.removePerson(p);
    this.people.clear();
    this.groundDrops?.clear();
    this.effects.forEach(e => e.obj.removeFromParent());
    this.effects = [];
    this.used = [];
  }

  // ---- people ------------------------------------------------------------------
  spawn(a, index, actors) {
    // A different person for everyone in the scene.
    const ids = Object.keys(CAST).filter(id => !(this.used || []).includes(id));
    const id = ids[Math.floor(Math.random() * ids.length)];
    (this.used ??= []).push(id);
    const char = new Character(this.cast.rig(id), { role: 'person' });
    char.actor = a;
    char.viewer = this.camera.position; // eyes follow you
    // Someone standing where an earlier person stands is in front of them
    // (the 2D scripts put the bystander in front by drawing order).
    let z = -J().distance;
    for (let k = 0; k < index; k++) if (Math.abs(actors[k].cx - a.cx) < 0.12) z += J().frontStep;
    char.obj.position.set(this.worldX(a), 0, z);
    char.aimAt.set((Math.random() - 0.5) * J().aimJitter, CONFIG.knife.eyeHeight - 0.1, 0);
    this.scene.add(char.obj);
    this.scene.add(char.addGun());
    // Phone and wallet in the right hand, along the fingers (hidden until used).
    const phone = box(0.07, 0.145, 0.009, '#15161a', 0.3);
    const wallet = box(0.09, 0.11, 0.02, '#3b2417', 0.7);
    char.update(0, 0); // bind the pose so the hand's direction is known
    for (const prop of [phone, wallet]) {
      prop.visible = false;
      prop.traverse(o => { if (o.isMesh) { o.userData.char = char; char.meshes.push(o); } });
      if (char.bones.RightHand) attachProp(char.bones.RightHand, prop, { toward: char.bones.RightHandMiddle1, along: 0.07 });
    }
    const p = { a, char, idle: IDLES[Math.floor(Math.random() * IDLES.length)], phone, wallet, yaw: null, z };
    this.people.set(a, p);
    return p;
  }

  removePerson(p) {
    p.char.obj.removeFromParent();
    p.char.gun?.removeFromParent();
    p.droppedGun?.removeFromParent();
  }

  worldX(a) { return (a.cx - 0.5) * J().spread; }

  // Mirror the Range's actors: spawn new ones, move walkers, play poses.
  sync(now, dt) {
    const actors = this.range.targets.filter(t => t.kind === 'actor');
    actors.forEach((a, i) => { if (!this.people.has(a)) this.spawn(a, i, actors); });
    for (const [a, p] of this.people) {
      // Walked out of the scene (a downed person stays where they fell).
      if (!actors.includes(a) && !p.char.down) { this.removePerson(p); this.people.delete(a); continue; }
      this.pose(p, now, dt);
    }
  }

  pose(p, now, dt) {
    const { a, char } = p;
    const o = char.obj;
    if (!char.down) o.position.x = this.worldX(a);
    const walking = !!a.vx && a.downAt == null;
    // Facing: turned away, along the walk, or at the shooter.
    const toYou = Math.atan2(-o.position.x, -o.position.z);
    let yaw = toYou;
    if (a.pose === 'back') yaw = toYou + Math.PI;
    else if (walking && a.pose === 'empty') yaw = a.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (p.yaw == null) p.yaw = yaw;
    const d = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
    p.yaw += Math.sign(d) * Math.min(Math.abs(d), J().turnRate * dt);
    if (!char.down) o.rotation.y = p.yaw;

    // Motion and hands.
    char.play(walking ? 'walk' : a.pose === 'phone' ? 'phone' : p.idle);
    char.pose = { gun: 'aim', surrender: 'handsUp', wallet: 'offer' }[a.pose] || null;
    if (a.pose === 'surrender' && p.hadGun && !p.droppedGun) this.dropGun(p);
    if (a.pose === 'gun') p.hadGun = true;
    if (a.downAt != null && !char.fall) char.goDown(now, 'back');

    char.update(dt, now);
    char.gun.visible = a.pose === 'gun' && !char.down;
    p.phone.visible = a.pose === 'phone';
    p.wallet.visible = a.pose === 'wallet';
  }

  // Surrendering: the pistol falls at their feet.
  dropGun(p) {
    // clone() copies userData through JSON, and the gun's meshes point back at
    // their Character (circular): clear it for the copy.
    const saved = [];
    p.char.gun.traverse(o => { saved.push([o, o.userData]); o.userData = {}; });
    const g = p.char.gun.clone();
    for (const [o, u] of saved) o.userData = u;
    g.traverse(m => { if (m.isMesh) m.userData = { surface: 'ground' }; });
    g.children.filter(c => c.isSprite).forEach(c => c.removeFromParent()); // no muzzle flash
    const o = p.char.obj.position;
    g.position.set(o.x + 0.25, 0.02, o.z + 0.3);
    g.rotation.set(Math.PI / 2, 0, Math.random() * 6);
    this.scene.add(g);
    p.droppedGun = g;
  }

  // ---- frame ----------------------------------------------------------------------
  render(nowMs) {
    if (!this.ready) return;
    const now = nowMs / 1000;
    const dt = Math.min(0.05, this.lastT ? Math.max(0, now - this.lastT) : 0.016);
    this.lastT = now;
    this.sync(now, dt);
    for (const fx of this.effects) fx.update(now);
    this.effects = this.effects.filter(fx => { if (fx.done) fx.obj.removeFromParent(); return !fx.done; });
    this.renderer.render(this.scene, this.camera);
  }

  // ---- shots ------------------------------------------------------------------------
  // Same result shape as the 2D Range.scoreShot for actors.
  hitTest(nx, ny) {
    const miss = { zone: 'Miss', points: 0, targetId: null, kind: null };
    if (!this.ready) return miss;
    const meshes = [];
    for (const p of this.people.values()) {
      if (p.char.down) continue;
      for (const m of p.char.meshes) {
        if (m.isSkinnedMesh) m.computeBoundingSphere();
        meshes.push(m);
      }
    }
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const dir = this.raycaster.ray.direction.clone();
    const hits = this.raycaster.intersectObjects([...meshes, ...this.solids, this.ground], true);
    const h = hits.find(x => x.object.visible !== false && isShown(x.object));
    if (!h) return { ...miss, dir };
    const char = h.object.userData.char;
    if (char && !char.down) {
      const a = char.actor;
      const info = char.boneAt(h.point);
      const threat = a.pose === 'gun';
      const zone = threat ? info.zone : 'NS';
      return { zone, points: CONFIG.points[zone], targetId: a.id, kind: 'actor', bodyZone: info.zone, threat, point: h.point, dir, char };
    }
    let o = h.object, surface = o.userData.surface;
    while (!surface && o.parent) { o = o.parent; surface = o.userData.surface; }
    return { ...miss, surface, point: h.point, dir };
  }

  onShot(score) {
    if (!this.ready || !score.point) return;
    if (score.char) {
      score.char.hit(score.point, score.dir, performance.now() / 1000, this.scene, this.groundDrops, this.blood);
      return;
    }
    super.onShot(score); // dust on the ground, sparks off cars and walls
  }
}

function box(w, h, d, color, roughness) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1 }));
  m.castShadow = true;
  return m;
}

// Hidden props (a phone not in use) must not stop rounds.
function isShown(o) {
  for (let x = o; x; x = x.parent) if (x.visible === false) return false;
  return true;
}
