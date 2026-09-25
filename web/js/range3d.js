// range3d.js — photo-realistic 3D range bay for the fundamentals drills.
// ---------------------------------------------------------------------------
// An outdoor bay lit by a real HDRI (a quarry, which also shows as the
// backdrop above the berms): gravel floor and dirt berms with PBR textures,
// cardboard USPSA targets on pine stakes in wooden stands, sun shadows.
//
// Targets are drawn from the same geometry as the 2D ones (CONFIG.uspsa):
// the die-cut shape comes from an alpha map, and scoring maps the ray's hit
// point on the target back to centimetres and calls classifyUspsa(), so the
// 3D range scores exactly like the 2D one.
//
// Bullet holes are cut into the alpha map (you see the berm through them)
// with a grey bullet-wipe ring and torn fibres painted around each. A hit
// jolts the target and throws paper chips; the round carries on into the
// berm. Misses throw dirt and leave a strike mark.
//
// The camera is fixed (the projector/laser calibration depends on it).
// Distance to the targets is a user setting (yards).

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CONFIG } from './config.js';
import { classifyUspsa } from './uspsa.js';

const R = () => CONFIG.range3d;
const Ucfg = () => CONFIG.uspsa;
const ASSETS = 'assets/3d/range/';
const YARD = 0.9144;

export class Range3DView {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'range3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(this.canvas, document.getElementById('range'));
    this.ready = false;
    this.progress = 0;
    this.layoutName = null;
    this.targets = [];
    this.fx = [];
    this.marks = [];
    this.distanceYards = R().distanceYards;
  }

  async init({ distanceYards } = {}) {
    if (distanceYards) this.distanceYards = distanceYards;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R().maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = R().exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.raycaster = new THREE.Raycaster();

    const manager = new THREE.LoadingManager();
    manager.onProgress = (u, l, t) => { this.progress = l / t; };
    const tl = new THREE.TextureLoader(manager);
    const load = (f, srgb) => tl.loadAsync(ASSETS + f).then(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    const [sky, dirtC, dirtN, gravC, gravN, gravR, woodC, woodR, woodB] = await Promise.all([
      new HDRLoader(manager).loadAsync(ASSETS + 'range.hdr'),
      load('dirt_color.jpg', true), load('dirt_normal.jpg'),
      load('gravel_color.jpg', true), load('gravel_normal.jpg'), load('gravel_rough.jpg'),
      load('wood_color.jpg', true), load('wood_rough.jpg'), load('wood_bump.jpg'),
    ]);

    // Real outdoor light: the HDRI is both the sky you see and the light.
    sky.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromEquirectangular(sky).texture;
    pmrem.dispose();
    this.scene.background = sky;
    this.scene.backgroundIntensity = R().bgIntensity;
    this.scene.environmentIntensity = R().envIntensity;
    this.scene.backgroundRotation.y = R().skyRotation;
    this.scene.environmentRotation.y = R().skyRotation;
    // A little haze with distance.
    this.scene.fog = new THREE.Fog(R().hazeColor, R().hazeNear, R().hazeFar);

    const tint = rgb => new THREE.Color().setRGB(...rgb); // linear multipliers on the photo textures
    this.mats = {
      // Vertex colours add large patches of lighter/darker ground so the tiles don't repeat visibly.
      gravel: new THREE.MeshStandardMaterial({ map: gravC, normalMap: gravN, roughnessMap: gravR, roughness: 1, color: tint(R().gravelTint), vertexColors: true }),
      dirt: new THREE.MeshStandardMaterial({ map: dirtC, normalMap: dirtN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, color: tint(R().dirtTint), vertexColors: true }),
      wood: new THREE.MeshStandardMaterial({ map: woodC, roughnessMap: woodR, bumpMap: woodB, bumpScale: 0.6, roughness: 0.9, color: tint(R().woodTint) }),
    };
    this.tex = { gravC, gravN, gravR, dirtC, dirtN, woodC, woodR, woodB };

    this.solids = [];
    this.buildGround();
    this.buildBerms();
    this.buildWeeds();
    this.buildBrass();
    this.buildSun();
    this.cardboardNormal = cardboardNormalMap();
    this.resize(window.innerWidth, window.innerHeight);
    this.ready = true;
    if (this.layoutName) this.setLayout(this.layoutName, true);
  }

  // ---- environment --------------------------------------------------------------
  buildGround() {
    const size = 90, B = R().berm;
    const geo = new THREE.PlaneGeometry(size, size, 180, 180);
    // Tone: soft patches, and darker where the gravel meets the berms (less sky reaches it).
    const noise = valueNoise(5);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = -pos.getY(i) - size / 2 + 10; // world x, z
      const n = noise(x * 0.12, z * 0.12) * 0.6 + noise(x * 0.5, z * 0.5) * 0.4;
      const toe = Math.max(0, Math.min(-B.backZ - z, B.sideX - Math.abs(x)));
      const v = (0.8 + n * 0.28) * (1 - 0.3 * Math.exp(-toe / 0.7));
      col[i * 3] = v; col[i * 3 + 1] = v * 0.99; col[i * 3 + 2] = v * 0.97;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(geo, this.mats.gravel);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -size / 2 + 10;
    ground.receiveShadow = true;
    ground.userData.surface = 'ground';
    for (const t of [this.tex.gravC, this.tex.gravN, this.tex.gravR]) t.repeat.set(size / R().gravelTile, size / R().gravelTile);
    this.scene.add(ground);
    this.solids.push(ground);
  }

  // Back berm and two side berms: lumpy dirt slopes.
  buildBerms() {
    const B = R().berm;
    const repeat = s => { const t = [this.tex.dirtC, this.tex.dirtN]; t.forEach(x => x.repeat.set(s, s)); };
    repeat(1 / R().dirtTile);
    // Berm geometry: a strip `length` long; `across` goes from the toe (0) up the
    // slope to the crest (1) and a little over the top.
    const berm = (length, depth, height, seed) => {
      const g = new THREE.PlaneGeometry(length, depth, Math.ceil(length * 3), Math.ceil(depth * 4));
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      const noise = valueNoise(seed);
      // Height at (x along the berm, v = 0 at the toe .. 1 at the back).
      const heightAt = (x, v) => {
        const y = v * depth - depth / 2;
        const prof = v < 0.8 ? smooth(v / 0.8) : 1 - (v - 0.8) * 0.6;
        return Math.max(0, height * prof + (noise(x * 0.5, y * 0.5) - 0.5) * B.lumps + (noise(x * 2.1, y * 2.3) - 0.5) * B.lumps * 0.35);
      };
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const v = (y + depth / 2) / depth; // 0 at toe, 1 at back
        pos.setXYZ(i, x, heightAt(x, v), -v * depth);
        uv.setXY(i, x / 1, v * depth / 1); // metres; the material repeat sets the tile size
        // Patchy: damp dark streaks, drier lighter crest, darker at the toe.
        const n = noise(x * 0.35 + 40, y * 0.9) * 0.65 + noise(x * 1.3, y * 1.7 + 9) * 0.35;
        const k = (0.72 + n * 0.4) * (0.82 + 0.18 * smooth(v * 4)) * (1 + 0.1 * smooth((v - 0.6) * 3));
        col[i * 3] = k; col[i * 3 + 1] = k * 0.98; col[i * 3 + 2] = k * 0.95;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.dirt);
      m.userData.heightAt = heightAt;
      m.userData.size = [length, depth];
      m.receiveShadow = true;
      m.castShadow = true;
      m.userData.surface = 'dirt';
      return m;
    };
    const back = berm(B.width, B.depth, B.height, 3);
    back.position.set(0, 0, -B.backZ);
    this.scene.add(back);
    this.berms = [back];
    for (const side of [-1, 1]) {
      const s = berm(B.sideLength, B.depth * 0.8, B.height * 0.85, side > 0 ? 7 : 11);
      s.rotation.y = -side * Math.PI / 2; // slope rises outward, away from the lane
      s.position.set(side * B.sideX, 0, -B.sideLength / 2 + B.sideStartZ);
      this.scene.add(s);
      this.solids.push(s);
      this.berms.push(s);
    }
    this.solids.push(back);
  }

  // Dry grass and weeds: thick along the toe of each berm, thinning up the
  // slope, a few on the floor at the edges. Rounds pass through them (they
  // are not in `solids`), and they sway a little in the breeze.
  buildWeeds() {
    const W = R().weeds;
    const rnd = mulberry(23);
    const spots = [];
    const [h0, h1] = W.height;
    const onBerm = (m, n) => {
      m.updateMatrixWorld();
      const [length, depth] = m.userData.size;
      for (let i = 0; i < n; i++) {
        const x = (rnd() - 0.5) * length;
        const v = Math.pow(rnd(), 4) * 0.8 - 0.03; // mostly in a band along the toe
        const p = new THREE.Vector3(x, v < 0 ? 0 : m.userData.heightAt(x, v), -Math.max(0, v) * depth);
        spots.push({ p: m.localToWorld(p), h: h0 + (h1 - h0) * rnd() * (v < 0.15 ? 1 : 0.7) });
      }
    };
    onBerm(this.berms[0], W.back);
    onBerm(this.berms[1], W.side);
    onBerm(this.berms[2], W.side);
    const B = R().berm;
    for (let i = 0; i < W.floor; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (B.sideX - Math.pow(rnd(), 1.5) * 3.5);
      const z = B.sideStartZ - rnd() * (B.sideLength - 2);
      spots.push({ p: new THREE.Vector3(x, 0, z), h: h0 + (h1 - h0) * 0.6 * rnd() });
    }
    const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95 });
    this.wind = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uWind = this.wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        float bend = position.y * position.y * ${Number(W.wind).toFixed(2)};
        transformed.x += sin(uWind * 1.7 + ph) * 0.07 * bend;
        transformed.z += cos(uWind * 1.2 + ph * 0.7) * 0.04 * bend;`);
    };
    const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, spots.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      d.position.copy(s.p);
      d.rotation.set(0, rnd() * Math.PI, 0);
      d.scale.set(s.h * (1.6 + rnd() * 1.0), s.h, s.h * (1.6 + rnd() * 1.0));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      // Straw to olive, a little lighter or darker per tuft.
      const g = rnd();
      c.setRGB(0.85 + g * 0.1, 0.85 + g * 0.2 - rnd() * 0.1, 0.8 + rnd() * 0.1).multiplyScalar(0.62 + rnd() * 0.3);
      mesh.setColorAt(i, c);
    });
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // Spent 9 mm brass on the bay floor, where the camera can see it: small glints.
  buildBrass() {
    const n = R().brass;
    if (!n) return;
    const rnd = mulberry(31);
    const mat = new THREE.MeshStandardMaterial({ color: '#d9ae55', metalness: 1, roughness: 0.32 });
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0049, 0.0049, 0.019, 10), mat, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      d.position.set((rnd() - 0.35) * 3, 0.0049, -(3.2 + Math.pow(rnd(), 1.4) * 4));
      d.rotation.set(0, rnd() * Math.PI * 2, Math.PI / 2, 'YXZ');
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildSun() {
    const sun = new THREE.DirectionalLight('#fff3df', R().sunIntensity);
    const [x, y, z] = R().sunDir;
    sun.position.set(x, y, z).normalize().multiplyScalar(40);
    sun.target.position.set(0, 0, -12);
    sun.position.add(sun.target.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 22, bottom: -22, near: 1, far: 100 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2;
    this.scene.add(sun, sun.target);
  }

  // ---- targets ---------------------------------------------------------------------
  // layout: 'range3d-single' | 'range3d-bay'
  setLayout(layout, force = false) {
    if (this.layoutName === layout && !force) return;
    this.layoutName = layout;
    if (!this.ready) return;
    for (const t of this.targets) {
      t.group.removeFromParent();
      this.solids = this.solids.filter(o => !t.solids.includes(o));
    }
    this.targets = [];
    const xs = layout === 'range3d-bay' ? [-R().bayGap, 0, R().bayGap] : [0];
    xs.forEach((x, slot) => this.targets.push(this.makeTarget(x, slot)));
    this.placeTargets();
    this.clearMarks();
  }

  setDistance(yards) {
    this.distanceYards = yards;
    if (this.ready) { this.placeTargets(); this.resize(window.innerWidth, window.innerHeight); }
  }

  placeTargets() {
    const z = -this.distanceYards * YARD;
    for (const t of this.targets) t.group.position.set(t.x, 0, z);
  }

  makeTarget(x, slot) {
    const U = Ucfg();
    const W = U.width / 100, H = U.height / 100;
    const group = new THREE.Group();
    // Cardboard face.
    const color = cardboardCanvas();
    const alpha = alphaCanvas();
    const colorTex = new THREE.CanvasTexture(color.canvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = 8;
    const alphaTex = new THREE.CanvasTexture(alpha.canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: colorTex, alphaMap: alphaTex, alphaTest: 0.5, normalMap: this.cardboardNormal,
      normalScale: new THREE.Vector2(R().cardboardRelief, R().cardboardRelief), roughness: 0.92, side: THREE.DoubleSide,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    face.position.y = R().targetCenterY;
    face.castShadow = true;
    face.receiveShadow = true;
    face.userData.surface = 'target';
    // Face and stakes flex together from the stand when hit (or in the breeze).
    const pivot = new THREE.Group();
    pivot.position.y = 0.09;
    face.position.y -= 0.09;
    pivot.add(face);
    group.add(pivot);

    // Two 1x2 pine stakes behind the face, in a 2x4 stand.
    const solids = [];
    const stakeH = R().targetCenterY + H * 0.35;
    for (const sx of [-0.13, 0.13]) {
      // 1x2 furring strip (19 x 38 mm), wide face stapled flat to the back of the target.
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.038, stakeH, 0.019), this.mats.wood);
      stake.position.set(sx, stakeH / 2 - 0.09, -0.0115);
      stake.castShadow = stake.receiveShadow = true;
      stake.userData.surface = 'wood';
      pivot.add(stake);
      solids.push(stake);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.14), this.mats.wood);
    base.position.set(0, 0.045, -0.024);
    base.castShadow = base.receiveShadow = true;
    base.userData.surface = 'wood';
    group.add(base);
    solids.push(base);
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.55), this.mats.wood);
      foot.position.set(s * 0.22, 0.02, -0.024);
      foot.castShadow = foot.receiveShadow = true;
      group.add(foot);
    }
    // Soft contact shadow under the stand (sky light is blocked there too).
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.8), contactShadowMaterial());
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.002, -0.024);
    blob.renderOrder = 1;
    group.add(blob);
    this.scene.add(group);
    this.solids.push(...solids);
    const t = { x, slot, group, pivot, face, mat, color, alpha, colorTex, alphaTex, solids, jolt: null, phase: Math.random() * 6 };
    t.id = 'target3d-' + slot;
    return t;
  }

  // Clear holes and strike marks (a new run).
  resetTargets() {
    for (const t of this.targets) {
      t.color.reset();
      t.alpha.reset();
      t.colorTex.needsUpdate = true;
      t.alphaTex.needsUpdate = true;
      t.jolt = null;
    }
    this.clearMarks();
  }

  clearMarks() {
    this.marks.forEach(m => m.removeFromParent());
    this.marks = [];
    this.fx.forEach(f => f.obj.removeFromParent());
    this.fx = [];
  }

  // ---- camera / render -------------------------------------------------------------
  resize(W, H) {
    if (!this.renderer) return;
    this.renderer.setSize(W, H, false);
    const focal = CONFIG.knife.focalFrac * H;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / focal));
    this.camera.aspect = W / H;
    this.camera.position.set(0, CONFIG.knife.eyeHeight, 0);
    this.camera.lookAt(0, R().targetCenterY + 0.05, -this.distanceYards * YARD);
    this.camera.updateProjectionMatrix();
  }

  render(nowMs) {
    if (!this.ready) return;
    const now = nowMs / 1000;
    if (this.wind) this.wind.value = now;
    for (const t of this.targets) {
      // A light breeze, plus the jolt of a hit (a damped spring).
      let ry = Math.sin(now * 0.8 + t.phase) * 0.01, rx = Math.sin(now * 0.53 + t.phase * 2) * 0.0015;
      if (t.jolt) {
        const k = now - t.jolt.t0;
        const s = Math.exp(-k * 7) * Math.sin(k * 38);
        ry += t.jolt.ry * s;
        rx += t.jolt.rx * s;
        if (k > 1) t.jolt = null;
      }
      t.pivot.rotation.set(rx, ry, 0);
    }
    for (const f of this.fx) f.update(now);
    this.fx = this.fx.filter(f => { if (f.done) f.obj.removeFromParent(); return !f.done; });
    this.renderer.render(this.scene, this.camera);
  }

  // ---- shots ---------------------------------------------------------------------------
  hitTest(nx, ny) {
    const miss = { zone: 'Miss', points: 0, targetId: null, kind: null };
    if (!this.ready) return miss;
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const dir = this.raycaster.ray.direction.clone();
    const faces = this.targets.map(t => t.face);
    const hits = this.raycaster.intersectObjects([...faces, ...this.solids], false);
    const U = Ucfg();
    for (const h of hits) {
      if (h.object.userData.surface === 'target') {
        const t = this.targets.find(x => x.face === h.object);
        const cm = { x: (h.uv.x - 0.5) * U.width, y: (h.uv.y - 0.5) * U.height };
        const zone = classifyUspsa(cm.x, cm.y);
        if (!zone) continue; // outside the die-cut shape: the round goes past
        return { zone, points: CONFIG.points[zone], targetId: t.id, kind: 'uspsa', slot: t.slot, local: cm, point: h.point, dir, target: t, uv: h.uv };
      }
      return { ...miss, point: h.point, dir, surface: h.object.userData.surface, normal: h.face?.normal?.clone().transformDirection(h.object.matrixWorld) };
    }
    return { ...miss, dir };
  }

  onShot(score) {
    if (!this.ready || !score.point) return;
    const now = performance.now() / 1000;
    if (score.target) {
      const t = score.target;
      punchHole(t, score.uv);
      t.jolt = { t0: now, ry: (score.local.x > 0 ? -1 : 1) * 0.04, rx: -0.008 };
      this.fx.push(debris(this.scene, score.point, score.dir, '#c9a36b', 14, [0.6, 2.2], 0.01, 0.6));
      // The round carries on into the berm behind.
      const ray = new THREE.Raycaster(score.point.clone().addScaledVector(score.dir, 0.05), score.dir);
      const behind = ray.intersectObjects(this.solids, false)[0];
      if (behind) this.impact(behind.point, score.dir, behind.face?.normal?.clone().transformDirection(behind.object.matrixWorld), behind.object.userData.surface, now);
      return;
    }
    this.impact(score.point, score.dir, score.normal, score.surface, now);
  }

  impact(point, dir, normal, surface, now) {
    if (surface === 'wood') {
      this.fx.push(debris(this.scene, point, dir, '#d9b98a', 10, [0.8, 2.5], 0.008, 0.7));
      return;
    }
    const n = normal || new THREE.Vector3(0, 1, 0);
    // Dirt kicks up off the surface and back toward the shooter.
    const kick = n.clone().multiplyScalar(0.8).addScaledVector(dir, -0.4).normalize();
    this.fx.push(debris(this.scene, point, kick, '#6e5a44', 22, [1.0, 3.5], 0.012, 1.2));
    this.fx.push(dustPuff(this.scene, point, n));
    this.marks.push(strikeMark(this.scene, point, n));
    if (this.marks.length > 60) this.marks.shift().removeFromParent();
  }

  setVisible(on) { this.canvas.style.display = on ? 'block' : 'none'; }
}

// ---------------------------------------------------------------------------
// Target textures (drawn from CONFIG.uspsa, in centimetres)
// ---------------------------------------------------------------------------
const PX_PER_CM = 22; // 46 cm wide -> 1012 px

function cmToPx(x, y) {
  const U = Ucfg();
  return [(x + U.width / 2) * PX_PER_CM, (U.height / 2 - y) * PX_PER_CM];
}

function polyPath(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => { const [px, py] = cmToPx(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.closePath();
}

// Cardboard: tan with fibre streaks and blotches, the printed perforation
// lines and zone letters, and staples where it's fixed to the stakes.
function cardboardCanvas() {
  const U = Ucfg();
  const c = document.createElement('canvas');
  c.width = Math.round(U.width * PX_PER_CM);
  c.height = Math.round(U.height * PX_PER_CM);
  const g = c.getContext('2d');
  const rnd = mulberry(Math.floor(Math.random() * 1e6));
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#b8946a');
  grad.addColorStop(1, '#ab885f');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // Soft blotches.
  for (let i = 0; i < 60; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = 30 + rnd() * 120;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    b.addColorStop(0, dark ? 'rgba(120,85,45,0.07)' : 'rgba(240,215,170,0.07)');
    b.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibres.
  g.lineWidth = 1;
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, a = rnd() * Math.PI, l = 2 + rnd() * 7;
    g.strokeStyle = rnd() < 0.5 ? `rgba(95,65,35,${0.05 + rnd() * 0.12})` : `rgba(245,225,185,${0.05 + rnd() * 0.12})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Printed perforation lines (short slits).
  g.strokeStyle = 'rgba(70,45,20,0.75)';
  g.lineWidth = 2.2;
  g.setLineDash([9, 7]);
  polyPath(g, U.cZone);
  g.stroke();
  const a = U.aZone;
  polyPath(g, [[a.x0, a.y1], [a.x1, a.y1], [a.x1, a.y0], [a.x0, a.y0]]);
  g.stroke();
  const hd = U.head;
  g.beginPath();
  g.moveTo(...cmToPx(hd.x0, hd.y0));
  g.lineTo(...cmToPx(hd.x1, hd.y0));
  g.stroke();
  g.setLineDash([]);
  // Zone letters, small, as printed.
  g.fillStyle = 'rgba(70,45,20,0.75)';
  g.font = '600 34px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('A', ...cmToPx(0, a.y1 - 2));
  g.fillText('C', ...cmToPx(0, -23));
  g.fillText('D', ...cmToPx(0, -35));
  g.fillText('A', ...cmToPx(0, 35));
  // Staples at the stakes.
  g.strokeStyle = 'rgba(150,150,150,0.95)';
  g.lineWidth = 3;
  for (const sx of [-13, 13]) for (const sy of [20, -5, -28]) {
    const [px, py] = cmToPx(sx, sy);
    g.beginPath();
    g.moveTo(px, py - 10);
    g.lineTo(px, py + 10);
    g.stroke();
  }
  const pristine = document.createElement('canvas');
  pristine.width = c.width;
  pristine.height = c.height;
  pristine.getContext('2d').drawImage(c, 0, 0);
  return { canvas: c, g, reset: () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(pristine, 0, 0); } };
}

// Alpha: white inside the die-cut outline, black outside (and in holes).
function alphaCanvas() {
  const U = Ucfg();
  const c = document.createElement('canvas');
  c.width = Math.round(U.width * PX_PER_CM);
  c.height = Math.round(U.height * PX_PER_CM);
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    polyPath(g, U.outline);
    g.fill();
  };
  draw();
  return { canvas: c, g, reset: draw };
}

// Cut a bullet hole at a uv point: see-through centre, grey wipe ring, torn fibres.
function punchHole(t, uv) {
  const x = uv.x * t.alpha.canvas.width, y = (1 - uv.y) * t.alpha.canvas.height;
  const r = R().holeRadiusCm * PX_PER_CM;
  const jag = (g, rad, n) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = rad * (0.85 + Math.random() * 0.3);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  };
  const cg = t.color.g;
  // Torn, lighter fibres just around the hole.
  cg.fillStyle = 'rgba(235,210,165,0.8)';
  jag(cg, r * 1.7, 14);
  cg.fill();
  // Bullet wipe: a grey-black ring where the bullet's lube and lead rub off.
  cg.strokeStyle = 'rgba(40,38,36,0.85)';
  cg.lineWidth = r * 0.45;
  cg.beginPath();
  cg.arc(x, y, r * 1.12, 0, Math.PI * 2);
  cg.stroke();
  t.colorTex.needsUpdate = true;
  // Through-hole.
  const ag = t.alpha.g;
  ag.fillStyle = '#000';
  jag(ag, r, 12);
  ag.fill();
  t.alphaTex.needsUpdate = true;
}

// Corrugated board: faint vertical flutes under the liner, plus fibre noise.
function cardboardNormalMap() {
  const U = Ucfg();
  const W = 512, H = Math.round(512 * U.height / U.width);
  const pxPerCm = W / U.width;
  const flute = 0.8 * pxPerCm;
  const h = new Float32Array(W * H);
  const rnd = mulberry(17);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    h[y * W + x] = Math.sin((x / flute) * Math.PI * 2) * 0.25 + (rnd() - 0.5) * 0.35;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)];
    const dy = h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x];
    const nx = -dx * 0.6, ny = dy * 0.6, nz = 1, l = Math.hypot(nx, ny, nz);
    img.data[i * 4] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Scenery helpers
// ---------------------------------------------------------------------------
// A grass tuft: blades fanning from the root, straw with some olive green.
function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rnd = mulberry(41);
  const cols = ['#c9b27a', '#b89d62', '#d6c48f', '#8f8a4a', '#6f7438', '#a48a55'];
  // Blades fan out from a narrow root: tall ones near upright, short ones splayed.
  for (let i = 0; i < 46; i++) {
    const bx = 128 + (rnd() - 0.5) * 26, up = rnd();
    const len = 70 + up * 170, lean = (rnd() - 0.5) * (2.4 - up * 1.6), w = 1.4 + rnd() * 2.2;
    const tx = bx + lean * len * 0.55, ty = 256 - len * (1 - Math.abs(lean) * 0.18);
    const mx = bx + lean * len * 0.12, my = 256 - len * 0.55;
    g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    g.beginPath();
    g.moveTo(bx - w, 256);
    g.quadraticCurveTo(mx - w * 0.6, my, tx, ty);
    g.quadraticCurveTo(mx + w * 0.6, my, bx + w, 256);
    g.closePath();
    g.fill();
  }
  // A few seed heads.
  g.fillStyle = '#d8c89a';
  for (let i = 0; i < 6; i++) {
    const x = 128 + (rnd() - 0.5) * 150, y = 20 + rnd() * 70;
    g.beginPath();
    g.ellipse(x, y, 3, 11, (rnd() - 0.5) * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  // Transparent pixels keep a grass colour (a canvas would make them black),
  // so distant, mipmapped tufts don't turn into dark squares.
  const src = g.getImageData(0, 0, 256, 256).data;
  const data = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, o = ((255 - y) * 256 + x) * 4; // flip: row 0 is the bottom
    const a = src[i + 3];
    data[o] = a ? src[i] : 176; data[o + 1] = a ? src[i + 1] : 158; data[o + 2] = a ? src[i + 2] : 100;
    data[o + 3] = a;
  }
  const t = new THREE.DataTexture(data, 256, 256);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mipmaps = coverageMips(data, 256, 0.45);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Mip levels for an alpha-tested texture. Plain averaging turns thin blades
// into a solid block far away; here each level's alpha is scaled so the same
// share of it passes the alpha test as at full size.
function coverageMips(data, size, cutoff) {
  const cut = cutoff * 255;
  const cover = (d, k) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] * k > cut) n++; return n / (d.length / 4); };
  const c0 = cover(data, 1);
  const levels = [{ data, width: size, height: size }];
  let src = data, s = size;
  while (s > 1) {
    const n = s >> 1, d = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 4; c++) {
      const a = ((y * 2) * s + x * 2) * 4 + c, b = a + s * 4;
      d[(y * n + x) * 4 + c] = (src[a] + src[a + 4] + src[b] + src[b + 4]) / 4;
    }
    let lo = 1, hi = 4;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (cover(d, m) < c0) lo = m; else hi = m; }
    const out = d.slice();
    for (let i = 3; i < out.length; i += 4) out[i] = Math.min(255, d[i] * hi);
    levels.push({ data: out, width: n, height: n });
    src = d;
    s = n;
  }
  return levels;
}

// Two crossed quads, root at y = 0. Normals point up so the tuft is lit like the ground.
function tuftGeometry() {
  const g = new THREE.BufferGeometry();
  const P = [], U = [], N = [], I = [];
  [[1, 0], [0, 1]].forEach(([ax, az], q) => {
    const b = q * 4;
    for (const [s, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      P.push(s * ax, y, s * az);
      U.push(s + 0.5, y);
      N.push(0, 1, 0);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

let contactMat = null;
function contactShadowMaterial() {
  if (contactMat) return contactMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  contactMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: '#000' });
  return contactMat;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
// Bits thrown from an impact: paper chips, wood splinters, dirt clods.
function debris(scene, point, dir, color, n, speed, size, life) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const v = dir.clone().multiplyScalar(0.3)
      .add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5))
      .normalize().multiplyScalar(speed[0] + Math.random() * (speed[1] - speed[0]));
    parts.push({ p: point.clone(), v, s: size * (0.4 + Math.random()), r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0), w: (Math.random() - 0.5) * 20 });
  }
  const d = new THREE.Object3D();
  const t0 = performance.now() / 1000;
  let last = t0;
  const fx = { obj: mesh, done: false, update(now) {
    const dt = Math.min(0.05, now - last);
    last = now;
    const age = now - t0;
    parts.forEach((q, i) => {
      if (q.p.y > 0.003) {
        q.v.y -= 9.81 * dt;
        q.p.addScaledVector(q.v, dt);
        q.r.x += q.w * dt;
        q.r.y += q.w * dt * 0.7;
      } else q.p.y = 0.003;
      d.position.copy(q.p);
      d.rotation.copy(q.r);
      d.scale.set(q.s, q.s * 0.25, q.s * 0.8);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (age > life) { fx.done = true; geo.dispose(); mat.dispose(); }
  } };
  return fx;
}

let puffTex = null;
function dustPuff(scene, point, normal) {
  if (!puffTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    puffTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.SpriteMaterial({ map: puffTex, color: '#a58f73', transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.position.copy(point).addScaledVector(normal, 0.05);
  scene.add(s);
  const t0 = performance.now() / 1000;
  const fx = { obj: s, done: false, update(now) {
    const k = (now - t0) / 1.4;
    if (k >= 1) { fx.done = true; return; }
    s.scale.setScalar(0.15 + k * 0.9);
    s.position.y += 0.002;
    mat.opacity = 0.75 * (1 - k) * (1 - k);
  } };
  return fx;
}

// A darker, scuffed spot where a round went into the dirt.
function strikeMark(scene, point, normal) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(25,18,12,0.9)');
  gr.addColorStop(0.35, 'rgba(45,32,22,0.6)');
  gr.addColorStop(1, 'rgba(60,45,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), mat);
  m.position.copy(point).addScaledVector(normal, 0.004);
  m.lookAt(point.clone().add(normal));
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------
function smooth(x) { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); }

function valueNoise(seed) {
  const rnd = mulberry(seed);
  const N = 64;
  const v = Array.from({ length: N * N }, () => rnd());
  const at = (i, j) => v[((j % N + N) % N) * N + ((i % N + N) % N)];
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
