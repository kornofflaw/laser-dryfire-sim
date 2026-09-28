// range3d.js — photo-realistic 3D range bay: paper, pop-ups and steel.
// ---------------------------------------------------------------------------
// An outdoor bay lit by a real HDRI (a quarry, which also shows as the
// backdrop above the berms): gravel floor and dirt berms with PBR textures,
// cardboard USPSA targets on pine stakes in wooden stands, sun shadows.
//
// Layouts (range.js RANGE3D_KIND gives each one's kind):
//   range3d-single / range3d-bay  paper on stands (1 or 3)
//   range3d-popup    pop-ups hinged behind a dirt mound. Their timing and
//                    state are the 2D PopupBank's (range.popups), so the pop-up
//                    drills run unchanged; this view only draws and ray-casts.
//   range3d-star     Texas Star; rotation from range.star (star.js physics)
//   range3d-plates   plate rack      } state and falling in steel3d.js
//   range3d-poppers  poppers         }
//   range3d-stage    a stage (courses.js): paper, no-shoots and steel, each at
//                    its own distance; the definition comes from init's stage()
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
// Distance to the targets is a user setting (yards), one per kind of target.

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CONFIG } from './config.js';
import { classifyUspsa } from './uspsa.js';
import { rainStreaks, moveRain } from './rain3d.js';
import { RANGE3D_KIND, DOT_POSITIONS, PAPER } from './range.js';
import { steelMaterials, PlateRack, Poppers, Star3D, StageSteel, FlipGrid3D, DuelingTree } from './steel3d.js';
import { stageTargets } from './courses.js';
import { footstep } from './audio.js';

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
    this.layoutGroup = null;
    this.layoutSolids = [];
    this.targets = [];   // paper targets on stands
    this.cards = [];     // every cardboard face (stands and pop-ups)
    this.steel = null;   // steel set for the layout (steel3d.js)
    this.fx = [];
    this.marks = [];
    this.autoReset = true; // free practice: stand the steel back up after it's cleared
    this.yards = { ...R().yards };
  }

  get kind() { return RANGE3D_KIND[this.layoutName] || 'paper'; }
  get distanceYards() { return this.kind === 'stage' ? 0 : this.yards[this.kind]; } // stage items place themselves
  get lookYards() { return this.kind === 'stage' ? R().stageLookYards : this.yards[this.kind]; }

  // yards: { kind: yards } overrides; star / popups: range.star, range.popups;
  // stage: () => the current stage definition (range.stageDef).
  async init({ yards, star, popups, flip, stage } = {}) {
    this.stageSource = stage || (() => null);
    Object.assign(this.yards, yards || {});
    this.star = star;
    this.flip = flip;
    this.bank = popups;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R().maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = R().exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows are redrawn only while something moves (see render()).
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
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
    this.skies = { day: { sky, env: this.scene.environment } };
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
    this.steelMats = steelMaterials();
    this.tex = { gravC, gravN, gravR, dirtC, dirtN, woodC, woodR, woodB };

    this.solids = [];
    this.buildGround();
    this.buildBerms();
    this.buildWeeds();
    this.buildMarkers();
    this.buildBrass();
    this.buildUprange();
    this.buildSun();
    this.cardboardNormal = cardboardNormalMap();
    this.resize(window.innerWidth, window.innerHeight);
    this.ready = true;
    if (this.layoutName) this.setLayout(this.layoutName, true);
  }

  // ---- environment --------------------------------------------------------------
  buildGround() {
    const size = 90, back = R().uprange.groundBack, depth = size - 10 + back, B = R().berm; // (uprange: back m behind the line)
    const cz = back - depth / 2; // world z of the plane's centre
    const geo = new THREE.PlaneGeometry(size, depth, 180, Math.round(depth * 2));
    // Tone: soft patches, and darker where the gravel meets the berms (less sky reaches it).
    const noise = valueNoise(5);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = -pos.getY(i) + cz; // world x, z
      const n = noise(x * 0.12, z * 0.12) * 0.6 + noise(x * 0.5, z * 0.5) * 0.4;
      const toe = Math.max(0, Math.min(-B.backZ - z, B.sideX - Math.abs(x)));
      const v = (0.8 + n * 0.28) * (1 - 0.3 * Math.exp(-toe / 0.7));
      col[i * 3] = v; col[i * 3 + 1] = v * 0.99; col[i * 3 + 2] = v * 0.97;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(geo, this.mats.gravel);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = cz;
    ground.receiveShadow = true;
    ground.userData.surface = 'ground';
    for (const t of [this.tex.gravC, this.tex.gravN, this.tex.gravR]) t.repeat.set(size / R().gravelTile, depth / R().gravelTile);
    this.scene.add(ground);
    this.solids.push(ground);
  }

  // Behind the firing line (seen when a drill turns you round): a steel shade
  // canopy with a table and a bench under it, and the range's back fence.
  buildUprange() {
    const U = R().uprange, C = U.canopy, g = new THREE.Group(), add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const post = this.steelMats.frame, roof = new THREE.MeshStandardMaterial({ color: U.roofColor, metalness: 0.5, roughness: 0.55 }), wood = this.mats.wood;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.08, C.h, 0.08), post, C.x + sx * (C.w / 2 - 0.1), C.h / 2, C.z + sz * (C.d / 2 - 0.1));
    add(new THREE.BoxGeometry(C.w + 0.4, 0.05, C.d + 0.4), roof, C.x, C.h + 0.03, C.z).rotation.x = -0.06; // sloped sheet roof
    // Table (plywood top on 2x4 legs) and a bench.
    const T = U.table;
    add(new THREE.BoxGeometry(T.w, 0.03, T.d), this.plywoodMaterial(), C.x - 0.8, T.h, C.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.06, T.h, 0.06), wood, C.x - 0.8 + sx * (T.w / 2 - 0.1), T.h / 2, C.z + sz * (T.d / 2 - 0.1));
    add(new THREE.BoxGeometry(1.8, 0.05, 0.3), wood, C.x + 1.4, 0.45, C.z + 0.6);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.45, 0.28), wood, C.x + 1.4 + sx * 0.8, 0.225, C.z + 0.6);
    // Back fence: posts and two rails.
    const F = U.fence;
    for (let x = -F.halfWidth; x <= F.halfWidth + 0.01; x += F.span) add(new THREE.BoxGeometry(0.1, F.h, 0.1), wood, x, F.h / 2, F.z);
    for (const y of [F.h * 0.45, F.h * 0.9]) add(new THREE.BoxGeometry(F.halfWidth * 2, 0.09, 0.04), wood, 0, y, F.z + 0.07);
    this.scene.add(g);
  }

  // Back berm and two side berms: lumpy dirt slopes.
  buildBerms() {
    const B = R().berm;
    const repeat = s => { const t = [this.tex.dirtC, this.tex.dirtN]; t.forEach(x => x.repeat.set(s, s)); };
    repeat(1 / R().dirtTile);
    // Berm geometry: a strip `length` long; `across` goes from the toe (0) up the
    // slope to the crest (1) and a little over the top.
    const berm = (length, depth, height, seed, lumps = B.lumps) => {
      const g = new THREE.PlaneGeometry(length, depth, Math.ceil(length * 3), Math.ceil(depth * 4));
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      const noise = valueNoise(seed);
      // Height at (x along the berm, v = 0 at the toe .. 1 at the back).
      const heightAt = (x, v) => {
        const y = v * depth - depth / 2;
        const prof = v < 0.8 ? smooth(v / 0.8) : 1 - (v - 0.8) * 0.6;
        return Math.max(0, height * prof + (noise(x * 0.5, y * 0.5) - 0.5) * lumps + (noise(x * 2.1, y * 2.3) - 0.5) * lumps * 0.35);
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
    this.makeBerm = berm; // also the pop-up mound
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
    this.gust = { value: R().winds[this.windKind || 'breezy'].grass };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uWind = this.wind;
      sh.uniforms.uGust = this.gust;
      sh.vertexShader = 'uniform float uWind;\nuniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        float bend = position.y * position.y * ${Number(W.wind).toFixed(2)} * uGust;
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

  // Yardage markers down both sides of the bay: a wooden stake with a white
  // sign, the distance painted in black, facing the firing line.
  buildMarkers() {
    const K = R().markers;
    if (!K?.yards?.length) return;
    const [sw, sh] = K.sign;
    const stakeGeo = new THREE.BoxGeometry(0.045, K.height, 0.045);
    const signGeo = new THREE.BoxGeometry(sw, sh, 0.012);
    for (const yd of K.yards) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = Math.round(256 * sh / sw);
      const g = c.getContext('2d');
      g.fillStyle = '#ecebe4';
      g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 900; i++) { // weathered paint
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,80,60' : '255,255,255'},${Math.random() * 0.08})`;
        g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 4, 1 + Math.random() * 2);
      }
      g.fillStyle = '#1b1b1b';
      g.font = `900 ${Math.round(c.height * 0.72)}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(yd), c.width / 2, c.height * 0.54);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const edge = new THREE.MeshStandardMaterial({ color: '#d9d7cf', roughness: 0.9 });
      for (const side of [-1, 1]) {
        const x = side * K.x, z = -yd * YARD;
        const stake = new THREE.Mesh(stakeGeo, this.mats.wood);
        stake.position.set(x, K.height / 2, z - 0.02);
        const sign = new THREE.Mesh(signGeo, [edge, edge, edge, edge, face, edge]);
        sign.position.set(x, K.height - sh / 2 + 0.03, z);
        sign.rotation.y = -side * K.turn; // turned a little toward the shooter
        for (const m of [stake, sign]) { m.castShadow = m.receiveShadow = true; m.userData.surface = 'wood'; this.scene.add(m); this.solids.push(m); }
      }
    }
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
    this.sun = sun;
    if (this.timeWanted) this.setTime(this.timeWanted);
  }

  // Time of day: 'day' (default), 'morning', 'evening' or 'night'. Swaps the
  // sky photo (loaded the first time), moves the sun to where it is in that
  // photo and sets its colour. Night: the day sky nearly black, no sun, a
  // floodlight on a pole behind you lighting the bay (made the first time
  // night is picked; off, and not casting shadows, otherwise). Only the look
  // changes; targets and scoring don't.
  async setTime(kind = 'day') {
    this.timeWanted = kind;
    if (!this.sun || this.time === kind) return;
    const T = kind === 'day' ? null : R().times[kind];
    if (kind !== 'day' && !T) return;
    if (T?.flood && !this.flood) this.buildFlood();
    if (this.flood) {
      this.flood.intensity = T?.flood ? T.flood.intensity : 0;
      this.flood.castShadow = !!T?.flood;
    }
    if (T && !T.hdr) this.skies[kind] = this.skies.day; // night: the day sky, dimmed
    if (T && !this.skies[kind]) {
      const sky = await new HDRLoader().loadAsync(ASSETS + T.hdr).catch(() => null);
      if (!sky) return;
      sky.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.skies[kind] = { sky, env: pmrem.fromEquirectangular(sky).texture };
      pmrem.dispose();
      if (this.timeWanted !== kind) return; // changed again while loading
    }
    const S = this.skies[kind];
    this.time = kind;
    this.scene.background = S.sky;
    this.scene.environment = S.env;
    this.scene.backgroundIntensity = T ? T.bg : R().bgIntensity;
    this.scene.environmentIntensity = T ? T.env : R().envIntensity;
    // Morning / evening: sunDir is in the photo's own frame; `rotate` turns
    // photo and sun together (to keep buildings etc. out of view).
    const rot = T ? (T.rotate || 0) : R().skyRotation;
    this.scene.backgroundRotation.y = rot;
    this.scene.environmentRotation.y = rot;
    this.renderer.toneMappingExposure = T ? T.exposure : R().exposure;
    this.scene.fog.color.set(T ? T.haze : R().hazeColor);
    const [x, y, z] = T ? T.sunDir : R().sunDir;
    this.sun.position.set(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), T ? rot : 0).normalize().multiplyScalar(40).add(this.sun.target.position);
    this.sun.color.set(T ? T.sunColor : '#fff3df');
    this.sun.intensity = T ? T.sun : R().sunIntensity;
    this.base = { sun: this.sun.intensity, env: this.scene.environmentIntensity, bg: this.scene.backgroundIntensity, haze: this.scene.fog.color.clone(), sky: this.scene.background };
    this.applyWeather();
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Weather (Setup): 'dry' or 'rain'. Rain: overcast (weaker sun and sky
  // light, grey haze closing in), darker wet ground, falling rain streaks.
  setWeather(kind) {
    this.weatherWanted = kind;
    if (this.base) this.applyWeather();
  }

  applyWeather() {
    const wet = this.weatherWanted === 'rain', W = R().rain, B = this.base;
    this.raining = wet;
    this.sun.intensity = B.sun * (wet ? W.sun : 1);
    this.scene.environmentIntensity = B.env * (wet ? W.env : 1);
    this.scene.backgroundIntensity = B.bg * (wet ? W.bg : 1);
    // An overcast sky: flat grey cloud, lighter toward the horizon.
    if (wet && !this.overcast) {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 256;
      const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
      W.sky.forEach((col, i) => grad.addColorStop(i / (W.sky.length - 1), col));
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
      this.overcast = new THREE.CanvasTexture(c);
      this.overcast.colorSpace = THREE.SRGBColorSpace;
    }
    this.scene.background = wet && this.time !== 'night' ? this.overcast : B.sky;
    this.scene.fog.color.copy(B.haze);
    if (wet) this.scene.fog.color.lerp(new THREE.Color(W.haze), W.hazeMix);
    this.scene.fog.near = wet ? W.hazeNear : R().hazeNear;
    this.scene.fog.far = wet ? W.hazeFar : R().hazeFar;
    this.gravelColor ??= this.mats.gravel.color.clone();
    this.mats.gravel.color.copy(this.gravelColor).multiplyScalar(wet ? W.darken : 1);
    if (wet && !this.rain) { this.rain = rainStreaks(W); this.scene.add(this.rain); }
    if (this.rain) this.rain.visible = wet;
    // Wet steel: darker paint with a sheen; puddles on the bay floor.
    const paint = this.steelMats.paint;
    this.paintBase ??= { color: paint.color.clone(), roughness: paint.roughness };
    paint.color.copy(this.paintBase.color).multiplyScalar(wet ? W.steelDarken : 1);
    paint.roughness = wet ? W.steelRoughness : this.paintBase.roughness;
    if (wet && !this.puddles) this.puddles = this.buildPuddles();
    if (this.puddles) this.puddles.visible = wet;
    this.wetCards();
    this.renderer.shadowMap.needsUpdate = true;
  }

  // Standing water on the bay floor: flat, glassy patches (random, fixed).
  buildPuddles() {
    const P = R().rain.puddles, rnd = mulberry(77);
    const mat = new THREE.MeshStandardMaterial({ color: P.color, roughness: P.roughness, metalness: 0, envMapIntensity: P.reflect, transparent: true, opacity: P.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const group = new THREE.Group();
    for (let i = 0; i < P.count; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(P.size[0] + rnd() * (P.size[1] - P.size[0]), P.size[0] + rnd() * (P.size[1] - P.size[0]) * 0.6, 1);
      m.position.set((rnd() - 0.5) * P.area[0], 0.004, -P.area[1] * (0.1 + rnd() * 0.9));
      m.receiveShadow = true;
      group.add(m);
    }
    this.scene.add(group);
    return group;
  }

  // Soaked cardboard is darker (and a little less matte) in the rain.
  wetCards() {
    const W = R().rain;
    for (const c of this.cards || []) {
      c.mat.color.setScalar(this.raining ? W.cardDarken : 1);
      c.mat.roughness = this.raining ? W.cardRoughness : 0.92;
    }
  }

  // Wind (Setup): 'calm', 'breezy' (default) or 'windy' - grass sway and how
  // much the paper targets twist and lean (looks only; scoring is unchanged).
  setWind(kind) {
    if (!R().winds[kind]) return;
    this.windKind = kind;
    if (this.gust) this.gust.value = R().winds[kind].grass;
  }

  // The night floodlight: a spot on a pole behind and above the shooter.
  buildFlood() {
    const F = R().times.night.flood;
    const flood = new THREE.SpotLight(F.color, 0, 0, F.angle, F.penumbra, 2);
    flood.position.set(...F.pos);
    flood.target.position.set(...F.aim);
    flood.shadow.mapSize.set(2048, 2048);
    flood.shadow.camera.near = 1;
    flood.shadow.camera.far = 80;
    flood.shadow.bias = -0.0004;
    flood.shadow.normalBias = 0.02;
    this.scene.add(flood, flood.target);
    this.flood = flood;
  }

  // ---- targets ---------------------------------------------------------------------
  // Everything for a layout sits in one group at the targets' distance.
  setLayout(layout, force = false) {
    const stage = RANGE3D_KIND[layout] === 'stage' ? this.stageSource() : null;
    if (this.layoutName === layout && stage === this.builtStage && !force) return false;
    this.layoutName = layout;
    this.builtStage = stage;
    if (!this.ready) return;
    if (this.layoutGroup) this.disposeLayout();
    this.solids = this.solids.filter(o => !this.layoutSolids.includes(o));
    this.layoutSolids = [];
    this.targets = [];
    this.cards = [];
    this.movers = [];
    this.swingers = [];
    this.turners = [];
    this.trolleys = [];
    this.bobbers = [];
    this.poppers = [];
    this.clamshells = [];
    this.steel = null;
    this.walk = this.inspecting = null;
    this.station = 0;
    this.sheet = null;
    this.layoutGroup = new THREE.Group();
    this.scene.add(this.layoutGroup);
    const kind = this.kind;
    if (kind === 'paper') {
      const xs = layout === 'range3d-bay' ? [-R().bayGap, 0, R().bayGap] : [0];
      // (staggered: each target further back than the last, CONFIG.range3d.bayStagger yd)
      const back = layout === 'range3d-bay' ? R().bayStagger : [0];
      xs.forEach((x, slot) => this.targets.push(this.makeTarget(x, slot, { z: -(back[slot] || 0) * YARD, pxPerCm: back[slot] > 5 ? R().farPxPerCm : undefined })));
    } else if (kind === 'popup') {
      this.buildPopups();
    } else if (kind === 'movers') {
      this.buildMovers();
    } else if (kind === 'stage') {
      if (stage) this.buildStage(stage);
    } else if (kind === 'dots') {
      this.buildDots();
    } else {
      const S = kind === 'star' ? new Star3D(this.star, this.steelMats)
        : kind === 'grid' ? new FlipGrid3D(this.flip, this.steelMats)
        : kind === 'plates' ? new PlateRack(this.steelMats)
        : kind === 'tree' ? new DuelingTree(this.steelMats) : new Poppers(this.steelMats);
      this.steel = S;
      this.layoutGroup.add(S.group);
      this.addSolids(S.solids);
    }
    this.placeTargets();
    this.wetCards();
    this.clearMarks();
    this.resize(window.innerWidth, window.innerHeight); // aim for the new kind
    this.shadowAt = 0; // redraw shadows now
    return true;
  }

  // Free the old layout's GPU memory: its geometries and each cardboard face's
  // own textures and material (shared materials stay).
  disposeLayout() {
    this.layoutGroup.removeFromParent();
    this.layoutGroup.traverse(o => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const c of this.cards) { c.colorTex.dispose(); c.alphaTex.dispose(); c.mat.dispose(); }
    this.clearMarks();
  }

  addSolids(list) {
    this.solids.push(...list);
    this.layoutSolids.push(...list);
  }

  setDistance(kind, yards) {
    this.yards[kind] = yards;
    if (this.walk) this.inspect(null, true);
    if (this.ready && kind === this.kind) { this.placeTargets(); this.resize(window.innerWidth, window.innerHeight); }
  }

  placeTargets() {
    this.layoutGroup?.position.set(0, 0, -this.distanceYards * YARD);
    this.shadowAt = 0;
  }

  // A cardboard USPSA face with its own colour and alpha canvases (for holes).
  makeCard(meta, pxPerCm = PX_PER_CM) {
    const U = Ucfg();
    const color = cardboardCanvas(pxPerCm, meta.kind === 'noshoot');
    if (meta.hard) {
      // Hard cover: that part of the target painted flat black (kept when
      // the target is pasted or renewed).
      const paint = () => paintHardCover(color.g, meta.hard, pxPerCm);
      const fresh = color.reset;
      color.reset = () => { fresh(); paint(); };
      paint();
    }
    const alpha = alphaCanvas(pxPerCm);
    const colorTex = new THREE.CanvasTexture(color.canvas);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.anisotropy = 8;
    const alphaTex = new THREE.CanvasTexture(alpha.canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: colorTex, alphaMap: alphaTex, alphaTest: 0.5, normalMap: this.cardboardNormal,
      normalScale: new THREE.Vector2(R().cardboardRelief, R().cardboardRelief), roughness: 0.92, side: THREE.DoubleSide,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(U.width / 100, U.height / 100), mat);
    face.castShadow = true;
    face.receiveShadow = true;
    face.userData.surface = 'target';
    const card = { face, mat, color, alpha, colorTex, alphaTex, pxPerCm, meta, jolt: null, phase: Math.random() * 6 };
    face.userData.card = card;
    this.cards.push(card);
    return card;
  }

  // Between runs: paste the holes (tan pasters, white on a no-shoot), as a
  // range does between shooters; a fresh target once it's covered in them
  // (CONFIG.range3d.paste), or always fresh with pasting off.
  resetCard(c) {
    const P = R().paste, holes = c.holes || [];
    c.jolt = null;
    if (!holes.length) return;
    if (P.on && (c.pasted || 0) + holes.length <= P.limit) {
      this.paste(c, holes);
    } else {
      c.color.reset();
      c.pasted = 0;
    }
    c.holes = [];
    c.alpha.reset(); // pasted over or fresh: no through-holes
    c.colorTex.needsUpdate = true;
    c.alphaTex.needsUpdate = true;
  }

  // Paste over these hole positions (canvas px): tan pasters, white on a
  // no-shoot, each at a slight angle with a hair of shadow at its edge.
  paste(c, holes) {
    const P = R().paste, g = c.color.g, s = P.sizeCm * c.pxPerCm, white = c.meta.kind === 'noshoot';
    for (const h of holes) {
      g.save();
      g.translate(h.x, h.y);
      g.rotate((Math.random() - 0.5) * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-s / 2 + 0.6, -s / 2 + 0.8, s, s);
      g.fillStyle = white ? '#eeeeea' : P.colors[Math.floor(Math.random() * P.colors.length)];
      g.fillRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
    c.pasted = (c.pasted || 0) + holes.length;
    c.colorTex.needsUpdate = true;
  }

  // A stage target as it's found at a match: pasted over where the shooters
  // before you hit it (mostly around the A zone; a few on a no-shoot).
  earlierShooters(c) {
    const P = R().paste, U = Ucfg(), k = c.pxPerCm, [lo, hi] = P.earlier;
    let n = Math.round(lo + Math.random() * (hi - lo));
    if (c.meta.kind === 'noshoot') n = Math.round(n * P.earlierNoShoot);
    const holes = [];
    for (let tries = 0; holes.length < n && tries < n * 20; tries++) {
      const x = gauss() * P.spreadCm[0], y = P.spreadCm[2] + gauss() * P.spreadCm[1];
      if (!classifyUspsa(x, y, 0) || inHardCover(c.meta.hard, { x, y })) continue; // off the cardboard, or not pasted
      holes.push({ x: (x + U.width / 2) * k, y: (U.height / 2 - y) * k });
    }
    this.paste(c, holes);
  }

  // A cardboard target on stakes in a stand. opts: z (m), id, noShoot, dy
  // (raise/lower the face, m), pxPerCm (texture detail; less for far ones).
  makeTarget(x, slot, opts = {}) {
    const U = Ucfg();
    const H = U.height / 100;
    const dy = opts.dy || 0;
    const group = new THREE.Group();
    const card = this.makeCard({ kind: opts.noShoot ? 'noshoot' : 'uspsa', slot, hard: opts.hard }, opts.pxPerCm);
    const face = card.face;
    face.position.y = R().targetCenterY + dy;
    // Face and stakes flex together from the stand when hit (or in the breeze).
    const pivot = new THREE.Group();
    pivot.position.y = 0.09;
    face.position.y -= 0.09;
    pivot.add(face);
    group.add(pivot);

    // Two 1x2 pine stakes behind the face, in a 2x4 stand.
    const solids = [];
    const stakeH = R().targetCenterY + dy + H * 0.35;
    for (const sx of [-0.13, 0.13]) {
      // 1x2 furring strip (19 x 38 mm), wide face stapled flat to the back of the target.
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.038, stakeH, 0.019), this.mats.wood);
      stake.position.set(sx, stakeH / 2 - 0.09, -0.0115);
      stake.castShadow = stake.receiveShadow = true;
      stake.userData.surface = 'wood';
      stake.userData.card = card; // a round through a stake rocks the target
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
    group.position.set(x, 0, opts.z || 0);
    this.layoutGroup.add(group);
    this.addSolids(solids);
    card.pivot = pivot;
    card.id = opts.id || 'target3d-' + slot;
    if (opts.swing) this.hangSwinger(group, card, base, opts.swing);
    if (opts.turn) this.mountTurner(group, card, opts.turn);
    if (opts.run) this.mountTrolley(group, card, opts.run);
    if (opts.bob) this.mountBobber(group, card, opts.bob);
    if (opts.pop) this.mountPopUp(card, opts.pop);
    return { x, slot, group, pivot, face, card, solids, id: card.id };
  }

  // A swinger (USPSA activated target): the paper hangs on a steel arm from
  // an overhead beam, held to one side (behind cover) until its activator
  // steel (swing.by, a stage steel id) is hit; then it swings back and forth
  // as a damped pendulum and comes to rest hanging straight down.
  // swing: { by, rest? (radians, + = held to the right) }.
  hangSwinger(group, card, base, swing) {
    const W = R().swinger, U = Ucfg();
    // No stand: drop the base, feet, stakes and contact shadow.
    group.children.filter(o => o !== card.pivot).forEach(o => o.removeFromParent());
    card.pivot.children.filter(o => o !== card.face).forEach(o => o.removeFromParent());
    this.solids = this.solids.filter(o => o.parent);
    this.layoutSolids = this.layoutSolids.filter(o => o.parent);
    const hub = new THREE.Group();
    hub.position.set(group.position.x, W.pivotY, group.position.z);
    const arm = new THREE.Group();
    hub.add(arm);
    group.position.set(0, -W.pivotY, 0);
    arm.add(group);
    const top = R().targetCenterY + U.height / 200;
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, W.pivotY - top + 0.05, 0.02), this.steelMats.frame);
    rod.position.set(0, -(W.pivotY - top + 0.05) / 2, -0.015);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W.beam, 0.08, 0.08), this.steelMats.frame);
    beam.position.set(0, 0.06, -0.05);
    hub.add(beam);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, W.pivotY + 0.1, 0.08), this.steelMats.frame);
      post.position.set(sx * W.beam / 2, -(W.pivotY - 0.1) / 2 + 0.05, -0.05);
      hub.add(post);
    }
    arm.add(rod);
    for (const m of [rod, beam, ...hub.children.filter(o => o.isMesh)]) { m.castShadow = m.receiveShadow = true; m.userData.surface = 'steel-frame'; }
    this.layoutGroup.add(hub);
    this.addSolids([rod, beam]);
    const s = { arm, by: swing.by, rest: swing.rest ?? W.rest, t0: null };
    arm.rotation.z = s.rest;
    this.swingers.push(s);
  }

  // A drop turner (USPSA activated target): the paper stands on a steel
  // shaft in a turner box, edge-on to the shooter (nothing to see or hit)
  // until its activator steel falls; then it turns to face you, stays
  // `show` s and turns away again: a disappearing target.
  // turn: { by, show? (s) }.
  mountTurner(group, card, turn) {
    const T = R().turner;
    group.children.filter(o => o !== card.pivot).forEach(o => o.removeFromParent());
    card.pivot.children.filter(o => o !== card.face).forEach(o => o.removeFromParent());
    this.solids = this.solids.filter(o => o.parent);
    this.layoutSolids = this.layoutSolids.filter(o => o.parent);
    const box = new THREE.Mesh(new THREE.BoxGeometry(T.box[0], T.box[1], T.box[2]), this.steelMats.frame);
    box.position.set(0, T.box[1] / 2, -0.03);
    group.add(box);
    // The shaft turns with the target (a 1x2 behind the face bolted to it).
    const y0 = T.box[1] - card.pivot.position.y, y1 = card.face.position.y + Ucfg().height / 200 * 0.6;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, y1 - y0, 0.02), this.steelMats.frame);
    shaft.position.set(0, (y0 + y1) / 2, -0.012);
    card.pivot.add(shaft);
    for (const m of [box, shaft]) { m.castShadow = m.receiveShadow = true; m.userData.surface = 'steel-frame'; }
    this.addSolids([box, shaft]);
    // Edge-on to the shooter (at the origin), not just turned 90 degrees:
    // off to one side, a quarter turn would still show a sliver.
    const w = group.getWorldPosition(new THREE.Vector3());
    const rest = Math.atan2(-w.z, w.x);
    card.yaw = rest;
    this.turners.push({ card, by: turn.by, rest, show: turn.show ?? T.show, t0: null });
  }

  // An activated mover: the target's stand rides a trolley along a timber
  // rail, parked behind cover until its activator steel falls; then it runs
  // across once (speeding up over `accel` s) to `to` (x, m) and stays there,
  // usually behind more cover: a disappearing target. run: { by, to, speed? }.
  mountTrolley(group, card, run) {
    const T = R().trolley, x0 = group.position.x, x1 = run.to;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.8, T.rail[0], T.rail[1]), this.mats.wood);
    rail.position.set((x0 + x1) / 2, T.rail[0] / 2, group.position.z + 0.12);
    rail.castShadow = rail.receiveShadow = true;
    rail.userData.surface = 'wood';
    this.layoutGroup.add(rail);
    this.addSolids([rail]);
    card.meta.hides = true; // not walked up to (it ends behind cover)
    this.trolleys.push({ group, by: run.by, x0, x1, speed: run.speed ?? T.speed, t0: null });
  }

  // Drop the released clamshells (render()): they fall flat toward the
  // shooter, speeding up like a falling board, with a small bounce.
  updateClamshells(now) {
    const C = R().props.clamshell;
    for (const s of this.clamshells) {
      const u = s.t0 == null ? 0 : Math.max(0, now - s.t0) / C.fall;
      const a = u < 1 ? u * u : 1 - C.bounce * Math.max(0, Math.sin(Math.PI * (u - 1) / 0.35)) * Math.exp(-3 * (u - 1)) * (u < 2.4 ? 1 : 0);
      s.hinge.rotation.x = (Math.PI / 2 - 0.02) * a;
    }
  }

  // A bobber (activated target): sunk out of sight behind low cover until its
  // activator steel falls; then it rises, stays up, sinks and waits, `times`
  // times, and ends hidden: a disappearing target. bob: { by, times? }.
  mountBobber(group, card, bob) {
    card.meta.hides = true;
    group.position.y = -R().bobber.drop;
    this.bobbers.push({ group, by: bob.by, times: bob.times ?? R().bobber.times, t0: null });
  }

  // An activated pop-up: the paper lies back flat on its hinge (nothing to
  // hit) until its activator steel falls, then springs up and stays up.
  // pop: { by }.
  mountPopUp(card, pop) {
    card.tilt = -R().popUp.down;
    this.poppers.push({ card, by: pop.by, t0: null });
  }

  updatePopUps(now) {
    const P = R().popUp;
    for (const s of this.poppers) {
      const u = s.t0 == null ? 0 : Math.max(0, now - s.t0) / P.rise;
      // Up fast, with a small overshoot as it hits its stop.
      const a = u < 1 ? u * u : 1 + P.bounce * Math.sin(Math.min(1, (u - 1) * 3) * Math.PI) * Math.exp(-(u - 1) * 4);
      s.card.tilt = -P.down * (1 - Math.min(1.05, a));
    }
  }

  // How far up a released bobber is, 0 (sunk) .. 1 (up), u s after release.
  bobberUp(u, times) {
    const B = R().bobber, period = 2 * B.rise + B.up + B.down;
    if (u < 0 || u >= times * period) return 0;
    const p = u % period;
    return p < B.rise ? smooth(p / B.rise)
      : p < B.rise + B.up ? 1
      : p < 2 * B.rise + B.up ? 1 - smooth((p - B.rise - B.up) / B.rise) : 0;
  }

  updateBobbers(now) {
    for (const s of this.bobbers) s.group.position.y = -R().bobber.drop * (1 - (s.t0 == null ? 0 : this.bobberUp(now - s.t0, s.times)));
  }

  // Run the released trolleys (render()).
  updateTrolleys(now) {
    const a = R().trolley.accel;
    for (const s of this.trolleys) {
      const u = s.t0 == null ? 0 : Math.max(0, now - s.t0), D = Math.abs(s.x1 - s.x0);
      const d = Math.min(D, u < a ? s.speed * u * u / (2 * a) : s.speed * (u - a / 2));
      s.group.position.x = s.x0 + Math.sign(s.x1 - s.x0) * d;
    }
  }

  // Turn the released turners (render()): face on, hold, edge-on again.
  updateTurners(now) {
    const T = R().turner;
    for (const s of this.turners) {
      const u = s.t0 == null ? -1 : now - s.t0;
      s.card.yaw = u < 0 ? s.rest
        : u < T.time ? s.rest * (1 - smooth(u / T.time))
        : u < T.time + s.show ? 0
        : s.rest * smooth((u - T.time - s.show) / T.time);
    }
  }

  // Swing the released swingers (render()).
  updateSwingers(now) {
    const W = R().swinger;
    for (const s of this.swingers) {
      if (s.t0 == null || now < s.t0) { s.arm.rotation.z = s.rest; continue; }
      const u = now - s.t0;
      s.arm.rotation.z = s.rest * Math.cos((2 * Math.PI * u) / W.period) * Math.exp(-W.damping * u);
    }
  }

  // Movers: a timber track across the bay, targets on stands sliding along it.
  buildMovers() {
    const M = R().movers, half = M.track / 2;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(M.track + 0.8, 0.06, 0.1), this.mats.wood);
    rail.position.set(0, 0.03, 0.2);
    rail.castShadow = rail.receiveShadow = true;
    rail.userData.surface = 'wood';
    this.layoutGroup.add(rail);
    for (const s of [-1, 1]) {
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.25), this.mats.wood);
      stop.position.set(s * (half + 0.45), 0.125, 0.2);
      stop.castShadow = stop.receiveShadow = true;
      stop.userData.surface = 'wood';
      this.layoutGroup.add(stop);
      this.addSolids([stop]);
    }
    this.addSolids([rail]);
    for (let i = 0; i < M.count; i++) {
      const t = this.makeTarget(0, i, { id: `mover-${i}` });
      t.card.meta.mover = i;
      const m = { t, i, round: 0 };
      this.movers.push(m);
      this.startMover(m, i === 0 ? -1 : 1, i === 0 ? 0.3 : -0.2);
      this.targets.push(t);
    }
  }

  // (Re)start a mover at a side of the track (side -1 left, +1 right), heading in.
  startMover(m, side, at = null) {
    const M = R().movers, half = M.track / 2;
    m.x = at != null ? at * half : side * half;
    m.v = -side * (M.speed[0] + Math.random() * (M.speed[1] - M.speed[0]));
    m.state = 'moving';
    m.round++;
    m.t.card.id = `mover-${m.i}-${m.round}`; // each appearance is a new target
    this.resetCard(m.t.card);
    m.t.group.position.x = m.x;
  }

  updateMovers(dt, now) {
    const M = R().movers, half = M.track / 2;
    for (const m of this.movers) {
      if (m.state === 'moving') {
        m.x += m.v * dt;
        if (m.x > half) { m.x = half; m.v = -Math.abs(m.v); }
        if (m.x < -half) { m.x = -half; m.v = Math.abs(m.v); }
      } else if (now - m.t0 > M.fallTime + M.respawn) {
        this.startMover(m, Math.random() < 0.5 ? -1 : 1);
      }
      m.t.group.position.x = m.x;
      // Tipped back on its hinge once hit.
      if (m.state === 'down') m.t.pivot.rotation.x = -1.45 * Math.min(1, (now - m.t0) / M.fallTime);
    }
  }

  // A stage: every item at its own spot. Paper and no-shoots on stands (far
  // ones with lighter textures), steel as one StageSteel set.
  buildStage(def) {
    const steel = [];
    let slot = 0;
    for (const it of stageTargets(def)) {
      const z = -it.yd * YARD;
      if (it.steel) { steel.push({ ...it, z }); continue; }
      const t = this.makeTarget(it.x, slot++, {
        z, id: it.id, noShoot: it.type === 'noshoot', dy: it.dy, hard: it.hard, swing: it.swing, turn: it.turn, run: it.run, bob: it.bob, pop: it.pop, pxPerCm: it.yd <= 7 ? PX_PER_CM : R().farPxPerCm,
      });
      if (it.face && !it.turn) t.card.yaw = THREE.MathUtils.degToRad(it.face); // turned to face across the bay
      if (R().paste.on) this.earlierShooters(t.card);
      this.targets.push(t);
    }
    if (steel.length) {
      this.steel = new StageSteel(steel, this.steelMats);
      this.layoutGroup.add(this.steel.group);
      this.addSolids(this.steel.solids);
    }
    for (const pr of def.props || []) this.addProp(pr);
    // Shooting boxes: a square of 2x4 boards on the ground at each position.
    const B = R().props.box;
    for (const P of def.positions || []) {
      for (const [x, z, w, d] of [[0, -B.size / 2, B.size, B.board[0]], [0, B.size / 2, B.size, B.board[0]], [-B.size / 2, 0, B.board[0], B.size], [B.size / 2, 0, B.board[0], B.size]]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(w, B.board[1], d), this.mats.wood);
        board.position.set((P.x || 0) + x, B.board[1] / 2, -(P.yd || 0) * YARD + z);
        board.castShadow = board.receiveShadow = true;
        this.layoutGroup.add(board);
      }
    }
  }

  // Plywood (walls, clamshells): the photo-like canvas, tiled per 4 x 8 ft sheet.
  plywoodMaterial() {
    if (!this.plywood) {
      const t = new THREE.CanvasTexture(plywoodCanvas());
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / 1.22, 1 / 2.44); // one 4 x 8 ft sheet per repeat (UVs are metres)
      t.anisotropy = 8;
      this.plywood = new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, color: new THREE.Color().setRGB(...R().props.wall.tint) });
    }
    return this.plywood;
  }

  // Dot Torture: the letter-size dot sheet stapled over the A zone of a
  // USPSA target (its backer: hits off the sheet are misses). Holes and the
  // ring round the dot to shoot are drawn on the sheet's own canvas.
  buildDots() {
    const t = this.makeTarget(0, 0);
    t.card.meta.kind = 'backer';
    this.targets.push(t);
    const D = R().dotSheet, H = 0.2794, W = H * PAPER.aspect;
    const c = document.createElement('canvas');
    c.width = Math.round(W * 100 * D.pxPerCm);
    c.height = Math.round(H * 100 * D.pxPerCm);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    sheet.position.copy(t.card.face.position);
    sheet.position.y += D.lift;
    sheet.position.z += 0.003;
    sheet.castShadow = sheet.receiveShadow = true;
    sheet.userData.surface = 'dotsheet';
    t.card.pivot.add(sheet);
    this.addSolids([sheet]);
    this.sheet = { mesh: sheet, canvas: c, tex, holes: [], highlight: null, card: t.card };
    this.drawSheet();
  }

  drawSheet() {
    const S = this.sheet, c = S.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    g.fillStyle = '#f4f3ee';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#555';
    g.font = `600 ${Math.round(h * 0.022)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('DOT TORTURE', w / 2, h * 0.978);
    const r = CONFIG.dots.radiusFrac * h;
    for (const [num, [fx, fy]] of Object.entries(DOT_POSITIONS)) {
      const x = fx * w, y = fy * h;
      if (S.highlight === Number(num)) {
        g.beginPath(); g.arc(x, y, r * 1.35, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(58,176,255,0.95)'; g.lineWidth = Math.max(2, r * 0.12); g.stroke();
      }
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#151515'; g.fill();
      g.fillStyle = '#222';
      g.font = `700 ${Math.round(r * 0.6)}px Arial, sans-serif`;
      g.textBaseline = 'middle';
      g.fillText(num, x - r * 1.7, y);
    }
    // Holes: torn paper-coloured edge (shows on the black dots), dark centre.
    const hr = R().holeRadiusCm * R().dotSheet.pxPerCm;
    for (const o of S.holes) {
      g.beginPath(); g.arc(o.x, o.y, hr * 1.6, 0, Math.PI * 2); g.fillStyle = 'rgba(205,196,176,0.9)'; g.fill();
      g.beginPath(); g.arc(o.x, o.y, hr, 0, Math.PI * 2); g.fillStyle = '#0c0b0a'; g.fill();
    }
    S.tex.needsUpdate = true;
  }

  setHighlightDot(num) {
    if (!this.sheet || this.sheet.highlight === (num ?? null)) return;
    this.sheet.highlight = num ?? null;
    this.drawSheet();
  }

  // Stage props (courses.js): a plywood 'wall' (optionally with a shooting
  // 'port' cut in it) on 2x4 legs, or a 55-gallon 'barrel'. They stop rounds.
  addProp(pr) {
    const z = -pr.yd * YARD, P = R().props;
    const group = new THREE.Group();
    group.position.set(pr.x, 0, z);
    const parts = [];
    if (pr.type === 'clamshell') {
      // Clamshell (drop-down cover): plywood on a hinge at its foot, in front
      // of a target; its activator steel (pr.by) drops it flat toward you.
      const C = P.clamshell, w = pr.w ?? C.w, h = pr.h ?? C.h;
      const hinge = new THREE.Group();
      hinge.position.set(0, C.lift, 0);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, P.wall.thick), this.plywoodMaterial());
      panel.position.set(0, h / 2, -P.wall.thick / 2);
      hinge.add(panel);
      panel.userData.surface = 'wood';
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.05, 0.05), this.steelMats.frame);
      bar.position.set(0, C.lift / 2, -0.03);
      bar.userData.surface = 'steel-frame';
      group.add(bar, hinge);
      for (const m of [panel, bar]) m.castShadow = m.receiveShadow = true;
      this.addSolids([panel, bar]); // (not in parts: those are re-parented to the group)
      this.clamshells.push({ hinge, by: pr.by, t0: null });
    } else if (pr.type === 'wall') {
      const w = pr.w ?? P.wall.w, h = pr.h ?? P.wall.h, lift = P.wall.lift;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.closePath();
      for (const port of pr.ports || (pr.port ? [pr.port] : [])) { // (a barricade has several)
        const [px, py, pw, ph] = [port.x ?? 0, port.y - lift, port.w, port.h];
        const hole = new THREE.Path();
        hole.moveTo(px - pw / 2, py - ph / 2); hole.lineTo(px + pw / 2, py - ph / 2); hole.lineTo(px + pw / 2, py + ph / 2); hole.lineTo(px - pw / 2, py + ph / 2); hole.closePath();
        shape.holes.push(hole);
      }
      const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: P.wall.thick, bevelEnabled: false }), this.plywoodMaterial());
      panel.position.set(0, lift, -P.wall.thick / 2);
      parts.push(panel);
      // 2x4 legs and braces behind it.
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.089, h + lift, 0.038), this.mats.wood);
        leg.position.set(sx * (w / 2 - 0.05), (h + lift) / 2, -P.wall.thick - 0.02);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.089, 0.038, 0.9), this.mats.wood);
        foot.position.set(sx * (w / 2 - 0.05), 0.02, -0.45);
        parts.push(leg, foot);
      }
    } else if (pr.type === 'barrel') {
      this.barrelMat ??= new THREE.MeshStandardMaterial({ color: P.barrel.color, roughness: 0.55 });
      const r = P.barrel.r, h = P.barrel.h;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), this.barrelMat);
      body.position.y = h / 2;
      parts.push(body);
      for (const y of [h * 0.33, h * 0.66, h - 0.015]) { // ribs and the lid's rim
        const rib = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 6, 28), this.barrelMat);
        rib.rotation.x = Math.PI / 2;
        rib.position.y = y;
        parts.push(rib);
      }
    }
    for (const m of parts) {
      m.castShadow = m.receiveShadow = true;
      m.userData.surface = 'wood';
      group.add(m);
    }
    group.rotation.y = pr.turn || 0;
    this.layoutGroup.add(group);
    group.updateMatrixWorld(true);
    this.addSolids(parts);
  }

  // Pop-ups: one hinged face per lane of the PopupBank, behind a low dirt
  // mound with a timber edge. Down = folded back past flat, out of sight.
  buildPopups() {
    const P = R().popup;
    const U = Ucfg();
    const lanes = CONFIG.popup.lanes;
    const len = P.spread + 3;
    const mound = this.makeBerm(len, P.moundDepth, P.moundHeight, 19, 0.1);
    mound.position.set(0, 0, P.crestAhead + 0.8 * P.moundDepth);
    this.layoutGroup.add(mound);
    // Old, grey railroad-tie timber along the toe.
    this.mats.timber ??= Object.assign(this.mats.wood.clone(), { color: new THREE.Color().setRGB(0.3, 0.42, 0.75) });
    const timber = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.15), this.mats.timber);
    timber.position.set(0, 0.075, P.crestAhead + 0.8 * P.moundDepth + 0.05);
    timber.castShadow = timber.receiveShadow = true;
    timber.userData.surface = 'wood';
    this.layoutGroup.add(timber);
    this.addSolids([mound, timber]);
    this.popups = lanes.map((f, lane) => {
      const card = this.makeCard({ kind: 'popup', lane }, P.pxPerCm);
      const pivot = new THREE.Group();
      pivot.position.set((f - 0.5) * P.spread, P.hingeY, 0);
      card.face.position.y = U.height / 200; // bottom edge on the hinge
      pivot.add(card.face);
      // Lifter arm behind the face.
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.02), this.steelMats.frame);
      arm.position.set(0, 0.2, -0.02);
      pivot.add(arm);
      pivot.rotation.x = -P.downAngle;
      this.layoutGroup.add(pivot);
      card.pivot = pivot;
      card.exposure = null;
      return card;
    });
  }

  // Clear holes, strike marks and stand the steel back up (a new run).
  resetTargets() {
    this.lean = this.leanNow = 0;
    if (this.station) this.moveTo(0, true); // back to the start position
    if (this.sheet) { this.sheet.holes = []; this.drawSheet(); }
    this.cards.forEach(c => this.resetCard(c));
    this.swingers?.forEach(s => { s.t0 = null; });
    this.turners?.forEach(s => { s.t0 = null; });
    this.trolleys?.forEach(s => { s.t0 = null; });
    this.bobbers?.forEach(s => { s.t0 = null; });
    this.poppers?.forEach(s => { s.t0 = null; });
    this.clamshells?.forEach(s => { s.t0 = null; });
    this.steel?.reset();
    this.movers?.forEach(m => { this.startMover(m, m.i === 0 ? -1 : 1, m.i === 0 ? 0.3 : -0.2); m.t.pivot.rotation.x = 0; });
    this.clearMarks();
    this.shadowAt = 0;
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
    // Life-size (Setup) sets fovOverride (vertical degrees); else the usual framing.
    const focal = this.fovOverride ? H / 2 / Math.tan(THREE.MathUtils.degToRad(this.fovOverride) / 2) : CONFIG.knife.focalFrac * H;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / focal));
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    if (!this.walk) this.homeCamera();
  }

  // The shooter's view from the firing line.
  // (a stage with shooting positions: from the one you're at)
  homeView() {
    const P = this.kind === 'stage' && this.builtStage?.positions?.[this.station || 0];
    if (P) {
      const lx = P.look?.x ?? P.x, lyd = P.look?.yd ?? (P.yd || 0) + this.lookYards;
      const S = R().stances[P.stance]; // kneeling / prone
      return { pos: new THREE.Vector3(P.x || 0, S ? S.eye : CONFIG.knife.eyeHeight, -(P.yd || 0) * YARD), look: new THREE.Vector3(lx, S ? S.lookY : R().aimY.stage, -lyd * YARD) };
    }
    const s = this.step; // shooting on the move: where the walk has got to
    const eye = R().stances[this.stance]?.eye ?? CONFIG.knife.eyeHeight; // a drill shot kneeling / prone
    if (s) return { pos: new THREE.Vector3(s.x, eye + s.bob, -s.yd * YARD), look: new THREE.Vector3(0, R().aimY[this.kind], -this.lookYards * YARD) };
    return { pos: new THREE.Vector3(0, eye, 0), look: new THREE.Vector3(0, R().aimY[this.kind], -this.lookYards * YARD) };
  }

  // Stage with shooting positions: move to position k (running there takes
  // distance / move.speed s; no shots count on the way), or jump (instant).
  moveTo(k, instant = false) {
    const prev = this.station || 0;
    this.station = k;
    this.lean = this.leanNow = 0;
    this.inspecting = null;
    const to = this.homeView();
    if (instant) { this.walk = null; this.homeCamera(); return; }
    const from = { pos: this.camera.position.clone(), look: (this.look || to.look).clone() };
    // (a position with onMove: you walk there shooting; shots count on the way)
    const M = R().move, Ps = this.builtStage?.positions || [], onMove = !!Ps[k]?.onMove;
    // Getting down to (or up from) kneeling / prone takes its own time.
    const S = R().stances, was = Ps[prev]?.stance, now = Ps[k]?.stance;
    const settle = was === now ? 0 : Math.max(S[was]?.time || 0, S[now]?.time || 0);
    const dist = Math.hypot(to.pos.x - from.pos.x, to.pos.z - from.pos.z), time = Math.max(M.min, settle, dist / (onMove ? M.shootSpeed : M.speed));
    const stride = dist < 0.3 ? 0 : onMove ? M.shootStride : M.stride; // (no footsteps just getting down)
    this.walk = { from, to, t0: performance.now() / 1000, back: true, time, shootable: onMove, stride, steps: 0 };
  }

  // Shooting on the move: stand at x m across, yd downrange of the line
  // (bob: head height m). null = back on the line.
  setStep(x, yd, bob = 0) {
    const s = this.step;
    if (x == null ? !s : s && s.x === x && s.yd === yd && s.bob === bob) return;
    this.step = x == null ? null : { x, yd, bob };
    if (!this.walk && !this.inspecting && !this.lean && !this.leanNow) this.homeCamera();
  }

  // Start facing uprange (El Presidente): back = true turns you round
  // (instant); back = false at the beep turns you to the targets over
  // turn.time s (no shots count while turning).
  setFacing(back) {
    if (!!this.facingBack === back) return;
    this.facingBack = back;
    if (back) { this.turn = null; if (!this.walk && !this.inspecting) this.faceCamera(1); }
    else this.turn = { t0: performance.now() / 1000 };
  }

  // Camera at home, turned `k` of the way round (1 = facing uprange).
  faceCamera(k) {
    const h = this.homeView(), dir = h.look.clone().sub(h.pos), yaw = Math.PI * k * (R().turnAround.side || 1);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.camera.position.copy(h.pos);
    this.look = h.pos.clone().add(dir);
    this.camera.lookAt(this.look);
    if (!k) this.look = h.look;
  }

  // A drill's stance ('kneel' / 'prone' / null = standing): the eyes drop.
  // (animate: get down / up over the stance's time; no shots count meanwhile)
  setStance(s, animate = false) {
    s ||= null;
    if (this.stance === s) return;
    const S = R().stances, time = Math.max(S[s]?.time || 0, S[this.stance]?.time || 0);
    const from = { pos: this.camera.position.clone(), look: (this.look || this.homeView().look).clone() };
    this.stance = s;
    if (animate && !this.walk && !this.inspecting) { this.lean = this.leanNow = 0; this.walk = { from, to: this.homeView(), t0: performance.now() / 1000, back: true, time }; return; }
    if (!this.walk && !this.inspecting && !this.lean && !this.leanNow) this.homeCamera();
  }

  // Lean out left (-1) or right (1) of cover, or stand upright (0). Shots
  // still count while leaning (the view you shoot from is the one you see).
  setLean(side) { this.lean = side; }

  // Ease the lean toward its target and place the camera (render()).
  updateLean(dt) {
    const L = R().lean, to = this.lean || 0, step = dt / L.time;
    this.leanNow ||= 0;
    this.leanNow = Math.abs(to - this.leanNow) <= step ? to : this.leanNow + Math.sign(to - this.leanNow) * step;
    const h = this.homeView(), u = smooth((Math.abs(this.leanNow))) * Math.sign(this.leanNow);
    const fwd = h.look.clone().sub(h.pos).setY(0).normalize(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.camera.position.copy(h.pos).addScaledVector(right, u * L.m);
    this.camera.position.y -= Math.abs(u) * L.drop;
    this.camera.lookAt(h.look);
    this.camera.rotateZ(-u * L.roll);
    this.look = h.look;
  }

  homeCamera() {
    const h = this.homeView();
    this.camera.position.copy(h.pos);
    this.camera.lookAt(h.look);
    this.look = h.look;
  }

  // ---- Walk the targets (after a run, I) ---------------------------------------
  // The camera walks up to each paper target in turn, square on and close
  // enough to see every hole (like going downrange to score), then back to
  // the firing line. Pop-ups and movers are skipped. No shots count while
  // away from the line (walking).
  inspectable() {
    return this.targets.filter(t => t.card?.face && t.card.meta.kind !== 'popup' && t.card.meta.mover == null && !t.card.meta.hides);
  }

  get walking() { return (!!this.walk && !this.walk.shootable) || !!this.turn; } // (walking while shooting doesn't count)

  // Walk to target i of inspectable() (null or past the last = back to the
  // line; instant = no walk). Returns { i, n, id, noShoot, zones } for the
  // target now in view, or null when heading back.
  inspect(i, instant = false) {
    if (!this.ready) return null;
    const list = this.inspectable(), now = performance.now() / 1000;
    const from = { pos: this.camera.position.clone(), look: (this.look || this.homeView().look).clone() };
    const t = i == null ? null : list[i];
    if (!t) {
      this.inspecting = null;
      if (!this.walk) return null;
      if (instant) { this.walk = null; this.homeCamera(); return null; }
      this.walk = { from, to: this.homeView(), t0: now, back: true };
      return null;
    }
    const face = t.card.face, c = face.getWorldPosition(new THREE.Vector3());
    const n = face.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const I = R().inspect, half = (Ucfg().height / 100) * I.frame / 2;
    const d = half / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    c.y += half * 2 * I.raise;
    const to = { pos: c.clone().addScaledVector(n, d), look: c };
    this.walk = instant ? { from: to, to, t0: now } : { from, to, t0: now };
    const noShoot = t.card.meta.kind === 'noshoot';
    this.inspecting = { i, n: list.length, id: t.card.id, noShoot, zones: this.holeZones(t.card) };
    return this.inspecting;
  }

  // What each hole in a card scored (hard cover = M, a no-shoot = NS).
  holeZones(card) {
    const U = Ucfg(), k = card.pxPerCm;
    return (card.holes || []).map(h => {
      const cm = { x: h.x / k - U.width / 2, y: U.height / 2 - h.y / k };
      if (inHardCover(card.meta.hard, cm)) return 'M';
      if (card.meta.kind === 'noshoot') return 'NS';
      const z = classifyUspsa(cm.x, cm.y);
      return z === 'Head' ? 'A' : z || 'M';
    });
  }

  // Move the camera along the walk (render()).
  updateWalk(now) {
    const w = this.walk, u = smooth((now - w.t0) / (w.time ?? R().inspect.time));
    this.camera.position.lerpVectors(w.from.pos, w.to.pos, u);
    this.look = new THREE.Vector3().lerpVectors(w.from.look, w.to.look, u);
    this.camera.lookAt(this.look);
    if (w.stride && u < 1) { // moving between positions: footsteps
      const n = Math.floor((now - w.t0) / w.stride);
      if (n > w.steps) { w.steps = n; footstep(R().move.step); }
    }
    if (w.back && u >= 1) { this.walk = null; this.homeCamera(); }
  }

  render(nowMs) {
    if (!this.ready) return;
    const now = nowMs / 1000;
    const dt = Math.max(0, Math.min(0.1, now - (this.lastT ?? now)));
    this.lastT = now;
    this.adaptResolution(dt);
    if (this.wind) this.wind.value = now;
    for (const t of this.targets) {
      // A light breeze, plus the jolt of a hit (a damped spring).
      const c = t.card;
      // Wind (Setup): the cardboard twists and leans more in gusts.
      const Wd = R().winds[this.windKind || 'breezy'], gust = 0.6 + 0.4 * Math.sin(now * 0.37 + c.phase * 0.5);
      let ry = (Math.sin(now * 0.8 + c.phase) * 0.01 + Math.sin(now * 3.3 + c.phase * 3) * 0.004 * gust) * Wd.flutter,
        rx = (Math.sin(now * 0.53 + c.phase * 2) * 0.0015 - 0.002 * gust) * Wd.flutter;
      if (c.jolt) {
        const k = now - c.jolt.t0, s = joltAt(k);
        ry += c.jolt.ry * s;
        rx += c.jolt.rx * s;
        if (k > 1.2) c.jolt = null;
      }
      t.pivot.rotation.set(rx + (c.tilt || 0), ry + (c.yaw || 0), 0);
    }
    if (this.movers?.length) this.updateMovers(dt, now);
    if (this.swingers?.length) this.updateSwingers(now);
    if (this.turners?.length) this.updateTurners(now);
    if (this.trolleys?.length) this.updateTrolleys(now);
    if (this.bobbers?.length) this.updateBobbers(now);
    if (this.poppers?.length) this.updatePopUps(now);
    if (this.clamshells?.length) this.updateClamshells(now);
    if (this.turn) { // turning round from uprange at the beep
      const u = smooth((now - this.turn.t0) / R().turnAround.time);
      this.faceCamera(1 - u);
      if (u >= 1) this.turn = null;
    } else if (this.walk) this.updateWalk(now);
    else if (!this.inspecting && (this.lean || this.leanNow)) this.updateLean(dt);
    if (this.raining && this.rain) moveRain(this.rain, R().rain, dt, this.camera.position.x, this.camera.position.z);
    if (this.flashAt != null && this.time !== 'night') this.flashAt = null;
    if (this.flashAt != null) {
      // Night: the muzzle flash lights everything for a moment.
      const F = R().times.night, k = Math.exp(-(now - this.flashAt) / F.flashTime);
      this.scene.environmentIntensity = F.env + F.flash * k;
      if (k < 0.01) { this.flashAt = null; this.scene.environmentIntensity = F.env; }
    }
    if (this.kind === 'popup' && this.bank) {
      // Follow the PopupBank: a = 0 folded down, 1 upright.
      for (const c of this.popups || []) {
        const L = this.bank.lanes[c.meta.lane];
        if (!L) continue;
        if (L.exposure && L.exposure !== c.exposure) this.resetCard(c); // fresh target each time it comes up
        c.exposure = L.exposure;
        c.pivot.rotation.x = -(1 - L.a) * R().popup.downAngle;
      }
    }
    if (this.steel) {
      this.steel.update(dt, now);
      if (this.autoReset && this.steel.clearedAt != null && now - this.steel.clearedAt > R().steel.resetDelay) this.resetTargets();
    }
    for (const f of this.fx) f.update(now);
    this.fx = this.fx.filter(f => { if (f.done) f.obj.removeFromParent(); return !f.done; });
    // Shadows: every frame while something moves, otherwise now and then
    // (the targets' breeze sway is too small to need more).
    if (this.moving || now - (this.shadowAt || 0) > R().shadowIdleInterval) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowAt = now;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---- shots ---------------------------------------------------------------------------
  hitTest(nx, ny) {
    const miss = { zone: 'Miss', points: 0, targetId: null, kind: null };
    if (!this.ready) return miss;
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const dir = this.raycaster.ray.direction.clone();
    const faces = this.cards.map(c => c.face);
    const steel = this.steel ? this.steel.hittables() : [];
    const hits = this.raycaster.intersectObjects([...faces, ...steel, ...this.solids], false);
    const U = Ucfg();
    for (const h of hits) {
      const o = h.object;
      if (o.userData.surface === 'dotsheet') {
        // Dot Torture: which dot (a hole touching the edge counts), from where on the sheet.
        const fx = h.uv.x, fy = 1 - h.uv.y, reach = CONFIG.dots.radiusFrac + R().holeRadiusCm / 27.94;
        const hit = Object.entries(DOT_POSITIONS).find(([, [dx, dy]]) => Math.hypot((fx - dx) * PAPER.aspect, fy - dy) <= reach);
        const base = { point: h.point, dir, sheetUv: { fx, fy } };
        return hit ? { zone: 'Dot', points: CONFIG.points.Dot, targetId: `dot-${hit[0]}`, kind: 'dot', dot: Number(hit[0]), ...base } : { ...miss, ...base };
      }
      if (o.userData.surface === 'target') {
        const card = o.userData.card;
        const cm = { x: (h.uv.x - 0.5) * U.width, y: (h.uv.y - 0.5) * U.height };
        const zone = classifyUspsa(cm.x, cm.y);
        if (!zone) continue; // outside the die-cut shape: the round goes past
        // A turner nearly edge-on: the round slips past the cardboard's edge.
        if ((card.yaw || card.tilt) && Math.abs(o.getWorldDirection(new THREE.Vector3()).dot(dir)) < R().turner.edge) continue;
        // Hard cover stops the round: it can't score (a hole in the paint, a miss).
        if (card.meta.kind === 'backer') return { ...miss, point: h.point, dir, card, uv: h.uv, local: cm }; // off the dot sheet
        if (inHardCover(card.meta.hard, cm)) return { ...miss, point: h.point, dir, card, uv: h.uv, local: cm, hardCover: true };
        const base = { zone, points: CONFIG.points[zone], local: cm, point: h.point, dir, card, uv: h.uv };
        if (card.meta.kind === 'popup') {
          // Same rule as the 2D pop-ups: only a target on its way up or up
          // counts (a falling one is already down).
          const L = this.bank?.lanes[card.meta.lane];
          if (!L || L.state === 'down' || L.state === 'falling' || Math.sin(L.a * Math.PI / 2) < CONFIG.popup.hittableAbove) continue;
          return { ...base, targetId: `popup-${card.meta.lane}`, kind: 'popup', lane: card.meta.lane };
        }
        if (card.meta.mover != null && this.movers[card.meta.mover]?.state !== 'moving') continue; // already down
        if (card.meta.kind === 'noshoot') return { ...base, zone: 'NS', points: CONFIG.points.NS, targetId: card.id, kind: 'noshoot' };
        return { ...base, targetId: card.id, kind: 'uspsa', slot: card.meta.slot };
      }
      if (o.userData.tile != null && this.steel?.tileHit) {
        // Flip grid: only the painted face counts, and only if the plate is
        // face-on enough (edge-on plates let the round past).
        if (h.face?.materialIndex !== 4) return { ...miss, frame: true, point: h.point, dir, surface: 'steel' };
        const r = this.steel.tileHit(o.userData.tile, h.uv, performance.now() / 1000);
        if (!r) continue;
        const zone = r.face === 'blank' ? 'Miss' : 'Tile';
        return { zone, points: CONFIG.points[zone], targetId: `tile-${r.tile}`, kind: 'tile', ...r, point: h.point, dir, size: R().flipGrid.plate, dist: h.distance };
      }
      if (o.userData.steel != null && this.steel) {
        const i = o.userData.steel;
        const id = this.steel.idOf ? this.steel.idOf(i) : `${this.steel.name}-${i}`;
        const size = this.steel.items?.[i]?.size ?? 2 * CONFIG.star.plateRadius; // for the ring's pitch
        const s = { zone: 'Steel', points: CONFIG.points.Steel, targetId: id, kind: 'steel', steel: i, point: h.point, dir, size, dist: h.distance };
        // Too low on a popper: it rings but doesn't go down - a miss.
        if (this.steel.holdsLow?.(i, h.point)) return { ...s, zone: 'Miss', points: 0, noFall: true };
        // Dueling tree: a paddle already over swings back (doesn't count).
        if (this.steel.backHit?.(i)) return { ...s, zone: 'Miss', points: 0, noFall: true, back: true };
        if (this.steel.clears?.(i)) s.clears = true;
        if (this.kind === 'star') s.plate = i; // range.js knocks it off the star's physics
        return s;
      }
      const normal = h.face?.normal?.clone().transformDirection(o.matrixWorld);
      if (o.userData.surface === 'steel-frame') return { ...miss, frame: true, point: h.point, dir, surface: 'steel', normal };
      return { ...miss, point: h.point, dir, surface: o.userData.surface, normal, object: o };
    }
    return { ...miss, dir };
  }

  onShot(score) {
    if (!this.ready) return;
    if (this.time === 'night') this.flashAt = performance.now() / 1000; // your muzzle flash lights the bay
    if (!score.point) return;
    const now = performance.now() / 1000;
    if (score.tile != null) {
      // Flip-grid plate: the board draws the lead splash; a spray of lead.
      this.fx.push(debris(this.scene, score.point, score.dir.clone().negate(), '#8a8c8f', 12, [1.5, 4], 0.006, 0.5));
      return;
    }
    if (score.steel != null && this.steel) {
      if (score.noFall) this.steel.nudge(score.steel, score.point, now);
      else {
        this.steel.hit(score.steel, score.point, score.dir, now);
        // An activator: releases its swinger.
        // (released by a cable as it falls: activateDelay s later)
        for (const s of [...(this.swingers || []), ...(this.turners || []), ...(this.trolleys || []), ...(this.clamshells || []), ...(this.bobbers || []), ...(this.poppers || [])]) if (s.t0 == null && s.by === score.targetId) s.t0 = now + R().activateDelay;
      }
      // Lead and paint spray off the face, mostly sideways and down.
      this.fx.push(debris(this.scene, score.point, score.dir.clone().negate(), '#8a8c8f', 16, [1.5, 4], 0.006, 0.6));
      this.fx.push(dustPuff(this.scene, score.point, score.dir.clone().negate(), '#b9b9b4', 0.5));
      return;
    }
    if (score.sheetUv && this.sheet) {
      const S = this.sheet;
      S.holes.push({ x: score.sheetUv.fx * S.canvas.width, y: score.sheetUv.fy * S.canvas.height });
      this.drawSheet();
      rock(S.card, now, 0, -R().jolt.push);
      return;
    }
    if (score.card) {
      const t = score.card;
      punchHole(t, score.uv);
      if (t.meta.kind !== 'popup') {
        // Rocks by where it was hit: off-centre twists it, high pushes the top back.
        const J = R().jolt, U = Ucfg();
        const side = Math.max(-1, Math.min(1, score.local.x / (U.width / 2)));
        const up = Math.max(-1, Math.min(1, score.local.y / (U.height / 2)));
        rock(t, now, side * J.twist, -(J.push + up * J.tilt));
      }
      const mv = this.movers?.[t.meta.mover];
      if (mv && mv.state === 'moving') { mv.state = 'down'; mv.t0 = now; t.jolt = null; } // movers drop when hit
      this.fx.push(debris(this.scene, score.point, score.dir, '#c9a36b', 14, [0.6, 2.2], 0.01, 0.6));
      // The round carries on into the berm behind.
      const ray = new THREE.Raycaster(score.point.clone().addScaledVector(score.dir, 0.05), score.dir);
      const behind = ray.intersectObjects(this.solids, false)[0];
      if (behind) this.impact(behind.point, score.dir, behind.face?.normal?.clone().transformDirection(behind.object.matrixWorld), behind.object.userData.surface, now);
      return;
    }
    const staked = score.object?.userData.card;
    if (staked && staked.meta.kind !== 'popup' && staked.meta.mover == null) {
      // Through a stake: the whole target rocks, twisting toward that side.
      const J = R().jolt;
      rock(staked, now, (staked.pivot.worldToLocal(score.point.clone()).x > 0 ? 1 : -1) * J.stake, -J.push);
    }
    this.impact(score.point, score.dir, score.normal, score.surface, now);
  }

  impact(point, dir, normal, surface, now) {
    if (surface === 'steel') {
      // Frame hit: a splash of lead fragments, no dirt.
      this.fx.push(debris(this.scene, point, dir.clone().negate(), '#9a9c9f', 12, [1.5, 4], 0.005, 0.5));
      this.fx.push(dustPuff(this.scene, point, dir.clone().negate(), '#c4c4bf', 0.35));
      return;
    }
    if (surface === 'wood') {
      this.fx.push(debris(this.scene, point, dir, '#d9b98a', 10, [0.8, 2.5], 0.008, 0.7));
      return;
    }
    const n = normal || new THREE.Vector3(0, 1, 0);
    // Dirt kicks up off the surface and back toward the shooter.
    const kick = n.clone().multiplyScalar(0.8).addScaledVector(dir, -0.4).normalize();
    if (this.raining) {
      // Wet ground: mud and a splash of water droplets, no dust.
      const Sp = R().rain.splash;
      this.fx.push(debris(this.scene, point, kick, '#3f352b', 14, [1.0, 3.0], 0.01, 0.9));
      this.fx.push(debris(this.scene, point, n, Sp.color, Sp.drops, Sp.speed, Sp.size, Sp.life));
      this.fx.push(dustPuff(this.scene, point, n, Sp.mist, Sp.mistSize));
    } else {
      this.fx.push(debris(this.scene, point, kick, '#6e5a44', 22, [1.0, 3.5], 0.012, 1.2));
      this.fx.push(dustPuff(this.scene, point, n));
    }
    this.marks.push(strikeMark(this.scene, point, n));
    if (this.marks.length > 60) this.marks.shift().removeFromParent();
  }

  setVisible(on) {
    if (this.visible === on) return;
    this.visible = on;
    this.canvas.style.display = on ? 'block' : 'none';
  }

  // Is anything moving whose shadow would change?
  get moving() {
    return this.fx.length > 0 || this.targets.some(t => t.card.jolt) || !!this.steel?.moving || this.movers?.length > 0 ||
      this.swingers?.some(s => s.t0 != null) || this.turners?.some(s => s.t0 != null && performance.now() / 1000 - s.t0 < 2 * R().turner.time + s.show) ||
      this.trolleys?.some(s => s.t0 != null && Math.abs(s.group.position.x - s.x1) > 1e-4) ||
      this.bobbers?.some(s => s.t0 != null && s.group.position.y > -R().bobber.drop + 1e-4) ||
      this.poppers?.some(s => s.t0 != null && performance.now() / 1000 - s.t0 < 3 * R().popUp.rise) ||
      this.clamshells?.some(s => s.t0 != null && performance.now() / 1000 - s.t0 < 3 * R().props.clamshell.fall) ||
      (this.kind === 'popup' && !!this.bank?.lanes.some(L => L.state === 'rising' || L.state === 'falling'));
  }

  // Frame-rate guard: if frames are slow, render at a lower resolution
  // (steps down only, never back up until the page reloads).
  adaptResolution(dt) {
    const A = R().adapt;
    if (dt <= 0 || dt > 0.25) return; // paused or hidden
    this.frameSum = (this.frameSum || 0) + dt;
    this.frameCount = (this.frameCount || 0) + 1;
    if (this.frameCount < A.frames) return;
    const avgMs = (this.frameSum / this.frameCount) * 1000;
    this.frameSum = this.frameCount = 0;
    const pr = this.renderer.getPixelRatio();
    if (avgMs > A.slowMs && pr > A.minPixelRatio) {
      this.renderer.setPixelRatio(Math.max(A.minPixelRatio, pr - A.step));
      this.resize(window.innerWidth, window.innerHeight);
    }
  }
}

// ---------------------------------------------------------------------------
// Target textures (drawn from CONFIG.uspsa, in centimetres)
// ---------------------------------------------------------------------------
// Texture detail for close targets. 12 px/cm makes a 552 x 912 face: even at
// 3 yards a target is only ~330 px tall on a 1080p screen, so more is wasted
// memory and upload time on every hit. Far targets use CONFIG farPxPerCm.
const PX_PER_CM = 12;

function cmToPx(x, y, k) {
  const U = Ucfg();
  return [(x + U.width / 2) * k, (U.height / 2 - y) * k];
}

// A 4 x 8 ft sheet of weathered plywood: pale veneer with long soft grain,
// a few patches (football plugs), grime toward the bottom, the sheet's
// edges dark (seams where sheets meet).
function plywoodCanvas() {
  const W = 256, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = mulberry(77);
  g.fillStyle = '#cdb28a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { // grain: long wavy streaks
    let x = rnd() * W;
    g.strokeStyle = `rgba(${rnd() < 0.6 ? '120,85,50' : '235,215,180'},${0.04 + rnd() * 0.08})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 24) { x += (rnd() - 0.5) * 3; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 5; i++) { // patches
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = 'rgba(214,190,150,0.55)';
    g.beginPath(); g.ellipse(x, y, 7, 16, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(110,80,50,0.35)'; g.lineWidth = 1; g.stroke();
  }
  const grime = g.createLinearGradient(0, H, 0, H * 0.75);
  grime.addColorStop(0, 'rgba(95,75,55,0.3)'); grime.addColorStop(1, 'rgba(95,75,55,0)');
  g.fillStyle = grime; g.fillRect(0, H * 0.75, W, H * 0.25);
  g.fillStyle = 'rgba(60,45,30,0.55)'; // sheet edges
  g.fillRect(0, 0, 2, H); g.fillRect(0, 0, W, 2);
  return c;
}

// Hard cover on a target: { side: 'left' | 'right' | 'top' | 'bottom', cm }
// = that many centimetres in from that edge.
function inHardCover(hard, cm) {
  if (!hard) return false;
  const U = Ucfg(), w = U.width / 2, h = U.height / 2;
  return { left: cm.x < -w + hard.cm, right: cm.x > w - hard.cm, top: cm.y > h - hard.cm, bottom: cm.y < -h + hard.cm }[hard.side];
}
function paintHardCover(g, hard, k) {
  const U = Ucfg(), w = U.width / 2, h = U.height / 2;
  const box = { left: [-w, -h, hard.cm, U.height], right: [w - hard.cm, -h, hard.cm, U.height], top: [-w, h - hard.cm, U.width, hard.cm], bottom: [-w, -h, U.width, hard.cm] }[hard.side];
  const [x0, y0] = cmToPx(box[0], box[1] + box[3], k), [x1, y1] = cmToPx(box[0] + box[2], box[1], k);
  g.save();
  polyPath(g, U.outline, k);
  g.clip();
  g.fillStyle = '#161616';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Brushed paint: a little sheen and a few thin spots.
  g.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < 0.5 ? '#fff' : '#6b5a44'; g.fillRect(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), 2 + Math.random() * 20, 1 + Math.random() * 3); }
  g.restore();
}

function polyPath(g, pts, k) {
  g.beginPath();
  pts.forEach(([x, y], i) => { const [px, py] = cmToPx(x, y, k); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.closePath();
}

// Cardboard: tan with fibre streaks and blotches, the printed perforation
// lines and zone letters, and staples where it's fixed to the stakes.
// k = pixels per cm; sizes below are for k = PX_PER_CM and scale with it.
function cardboardCanvas(k = PX_PER_CM, noShoot = false) {
  const U = Ucfg();
  const sc = k / PX_PER_CM;
  const P = (x, y) => cmToPx(x, y, k);
  const c = document.createElement('canvas');
  c.width = Math.round(U.width * k);
  c.height = Math.round(U.height * k);
  const g = c.getContext('2d');
  const rnd = mulberry(Math.floor(Math.random() * 1e6));
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#b8946a');
  grad.addColorStop(1, '#ab885f');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // Soft blotches.
  for (let i = 0; i < 60; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = (30 + rnd() * 120) * sc;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    b.addColorStop(0, dark ? 'rgba(120,85,45,0.07)' : 'rgba(240,215,170,0.07)');
    b.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibres: short dark and light strokes, drawn in a few batches (one path
  // per colour and strength) rather than one stroke call each.
  g.lineWidth = 1;
  const fibres = c.width * c.height * 0.0053;
  for (const col of ['95,65,35', '245,225,185']) for (const alpha of [0.07, 0.12, 0.16]) {
    g.strokeStyle = `rgba(${col},${alpha})`;
    g.beginPath();
    for (let i = 0; i < fibres / 6; i++) {
      const x = rnd() * c.width, y = rnd() * c.height, a = rnd() * Math.PI, l = (2 + rnd() * 7) * sc;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.stroke();
  }
  // Printed perforation lines (short slits).
  g.strokeStyle = 'rgba(70,45,20,0.75)';
  g.lineWidth = Math.max(1, 2.2 * sc);
  g.setLineDash([9 * sc, 7 * sc]);
  polyPath(g, U.cZone, k);
  g.stroke();
  const a = U.aZone;
  polyPath(g, [[a.x0, a.y1], [a.x1, a.y1], [a.x1, a.y0], [a.x0, a.y0]], k);
  g.stroke();
  const hd = U.head;
  g.beginPath();
  g.moveTo(...P(hd.x0, hd.y0));
  g.lineTo(...P(hd.x1, hd.y0));
  g.stroke();
  g.setLineDash([]);
  // Zone letters, small, as printed.
  g.fillStyle = 'rgba(70,45,20,0.75)';
  g.font = `600 ${Math.round(34 * sc)}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('A', ...P(0, a.y1 - 2));
  g.fillText('C', ...P(0, -23));
  g.fillText('D', ...P(0, -35));
  g.fillText('A', ...P(0, 35));
  // Staples at the stakes.
  g.strokeStyle = 'rgba(150,150,150,0.95)';
  g.lineWidth = 3 * sc;
  for (const sx of [-13, 13]) for (const sy of [20, -5, -28]) {
    const [px, py] = P(sx, sy);
    g.beginPath();
    g.moveTo(px, py - 10 * sc);
    g.lineTo(px, py + 10 * sc);
    g.stroke();
  }
  // No-shoots are painted white over the cardboard.
  if (noShoot) {
    g.fillStyle = 'rgba(236,234,226,0.9)';
    g.fillRect(0, 0, c.width, c.height);
  }
  const pristine = document.createElement('canvas');
  pristine.width = c.width;
  pristine.height = c.height;
  pristine.getContext('2d').drawImage(c, 0, 0);
  return { canvas: c, g, reset: () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(pristine, 0, 0); } };
}

// Alpha: white inside the die-cut outline, black outside (and in holes).
function alphaCanvas(k = PX_PER_CM) {
  const U = Ucfg();
  const c = document.createElement('canvas');
  c.width = Math.round(U.width * k);
  c.height = Math.round(U.height * k);
  const g = c.getContext('2d');
  const draw = () => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    polyPath(g, U.outline, k);
    g.fill();
  };
  draw();
  return { canvas: c, g, reset: draw };
}

// Cut a bullet hole at a uv point: see-through centre, grey wipe ring, torn fibres.
// Damped-spring displacement k seconds after a hit (1 at the kick, rings down).
function joltAt(k) {
  const J = R().jolt;
  return Math.exp(-k * J.damping) * Math.sin(k * J.freq);
}
// Start a hit's rock on a card; a hit while it is still moving adds to what is left.
function rock(c, now, ry, rx) {
  if (c.jolt) {
    const left = Math.exp(-(now - c.jolt.t0) * R().jolt.damping);
    ry += c.jolt.ry * left;
    rx += c.jolt.rx * left;
  }
  c.jolt = { t0: now, ry, rx };
}

function punchHole(t, uv) {
  const x = uv.x * t.alpha.canvas.width, y = (1 - uv.y) * t.alpha.canvas.height;
  const r = Math.max(1.5, R().holeRadiusCm * t.pxPerCm);
  (t.holes ||= []).push({ x, y }); // pasted over between runs (resetCard)
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
function dustPuff(scene, point, normal, color = '#a58f73', size = 1) {
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
  const mat = new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.position.copy(point).addScaledVector(normal, 0.05);
  scene.add(s);
  const t0 = performance.now() / 1000;
  const fx = { obj: s, done: false, update(now) {
    const k = (now - t0) / 1.4;
    if (k >= 1) { fx.done = true; return; }
    s.scale.setScalar((0.15 + k * 0.9) * size);
    s.position.y += 0.002;
    mat.opacity = 0.75 * (1 - k) * (1 - k);
  } };
  return fx;
}

// A darker, scuffed spot where a round went into the dirt (one shared
// texture, material and quad for all of them).
let strike = null;
function strikeMark(scene, point, normal) {
  if (!strike) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(25,18,12,0.9)');
    gr.addColorStop(0.35, 'rgba(45,32,22,0.6)');
    gr.addColorStop(1, 'rgba(60,45,30,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    strike = {
      mat: new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
      geo: new THREE.PlaneGeometry(0.12, 0.12),
    };
  }
  const m = new THREE.Mesh(strike.geo, strike.mat);
  m.position.copy(point).addScaledVector(normal, 0.004);
  m.lookAt(point.clone().add(normal));
  m.rotateZ(Math.random() * Math.PI * 2);
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------
function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); }

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
