// knife3d.js — the parking-lot knife attack in real 3D (three.js / WebGL).
// ---------------------------------------------------------------------------
// Same rules as knife.js (distances, sprint physics, grading, stab distance);
// only the presentation changes. Knife3DRunner extends KnifeRunner and swaps
// the drawn 2D actor for a rigged, animated 3D man in a lit parking lot.
//
// Loaded on demand (main.js imports this module only when the 3D course is
// picked), because three.js and the assets are a few MB.
//
// Scene units are metres. The camera is the shooter's eyes at
// CONFIG.knife.eyeHeight, looking down the drive lane (-Z). The man's
// distance d from the runner maps to z = -d.
//
// Hit testing: a ray from the shot's screen point through the camera. The
// first thing it hits decides the shot: the man (zone from the nearest bone),
// a car, the building or the ground (a miss, with a dust puff or spark).
//
// Assets (web/assets/3d, see CREDITS.md): man.glb (Ready Player Me avatar),
// anims.glb (Mixamo idle/run clips, retargeted onto the avatar), car.glb,
// car_shadow.png, sky.hdr (Poly Haven, lighting and reflections only).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from './config.js';
import { KnifeRunner } from './knife.js';
import { addWound, addSpray, GroundDrops } from './blood3d.js';

const K = () => CONFIG.knife;
const V = () => CONFIG.knife3d;
const ASSETS = 'assets/3d/';

// Bone segments (parent -> child): scoring zone, and which hit reaction plays.
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

// Hit reactions: extra bone rotations (radians) layered on the animation.
// 'side' entries flip sign with the side of the body that was hit.
const REACTIONS = {
  head: [['Neck', 'x', -0.45], ['Head', 'x', -0.65]],                                  // snaps back
  chest: [['Spine2', 'x', -0.35], ['Spine1', 'x', -0.25], ['Spine1', 'y', 0.35, 'side'], ['Head', 'x', 0.3]], // knocked back, twisted
  gut: [['Spine', 'x', 0.5], ['Spine1', 'x', 0.35], ['Head', 'x', -0.15]],             // doubles over
  armL: [['LeftArm', 'x', -0.9], ['LeftForeArm', 'x', -0.6], ['Spine1', 'y', 0.2]],     // arm flung back
  armR: [['RightArm', 'x', -0.9], ['RightForeArm', 'x', -0.6], ['Spine1', 'y', -0.2]],
  legL: [['LeftUpLeg', 'x', -0.6], ['LeftLeg', 'x', 1.2], ['Spine', 'x', 0.25], ['Spine', 'z', 0.3, 'side']], // leg buckles
  legR: [['RightUpLeg', 'x', -0.6], ['RightLeg', 'x', 1.2], ['Spine', 'x', 0.25], ['Spine', 'z', 0.3, 'side']],
};

// ---------------------------------------------------------------------------
// The 3D view: scene, camera, assets, man, hit testing, effects.
// ---------------------------------------------------------------------------
export class Lot3DView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.progress = 0;
    this.effects = [];
  }

  async init({ cars = V().defaultCars, onProgress = () => {} } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, V().maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = V().exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(V().fogColor, V().fogDensity);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.raycaster = new THREE.Raycaster();

    // Load everything, reporting progress.
    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => { this.progress = loaded / total; onProgress(this.progress); };
    const gltf = new GLTFLoader(manager);
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath('vendor/three/addons/libs/draco/gltf/'); // the car is Draco-compressed
    gltf.setDRACOLoader(draco);
    const [manG, animG, carG, sky, carShadow] = await Promise.all([
      gltf.loadAsync(ASSETS + 'man.glb'),
      gltf.loadAsync(ASSETS + 'anims.glb'),
      gltf.loadAsync(ASSETS + 'car.glb'),
      new HDRLoader(manager).loadAsync(ASSETS + 'sky.hdr'),
      new THREE.TextureLoader(manager).loadAsync(ASSETS + 'car_shadow.png'),
    ]);

    // Image-based lighting from a real dusk sky (reflections on cars, soft fill).
    const pmrem = new THREE.PMREMGenerator(renderer);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(sky).texture;
    scene.environmentIntensity = V().envIntensity;
    sky.dispose();
    pmrem.dispose();

    this.buildSky();
    this.buildLights();
    this.buildGround(renderer);
    this.buildStore();
    this.buildPoles();
    this.buildCars(carG.scene, carShadow);
    this.setCarCount(cars);
    this.buildMan(manG, animG);
    this.groundDrops = new GroundDrops(scene);
    this.blood = true; // Setup can turn blood effects off
    this.resize(window.innerWidth, window.innerHeight);
    this.ready = true;
  }

  // ---- Scene building ---------------------------------------------------------

  buildSky() {
    // Dusk gradient dome; fog blends the ground into it at the horizon.
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#1b2640') },
        mid: { value: new THREE.Color('#5d5f7a') },
        horizon: { value: new THREE.Color('#d8956a') },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = max(vP.y, 0.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight('#8f97b8', '#2e2823', V().hemiIntensity);
    this.scene.add(hemi);
    // Last light of the day from behind the store, casting long soft shadows.
    const sun = new THREE.DirectionalLight('#ffb27a', V().sunIntensity);
    sun.position.set(-18, 14, -60);
    sun.target.position.set(0, 0, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -16; c.right = 16; c.top = 30; c.bottom = -30; c.near = 10; c.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
  }

  buildGround(renderer) {
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const { map, rough, normal } = asphaltTextures();
    for (const t of [map, rough, normal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(60, 60);
      t.anisotropy = aniso;
    }
    map.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ map, roughnessMap: rough, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.surface = 'ground';
    this.scene.add(ground);
    this.ground = ground;

    // Worn white stall lines and lane edges (thin quads just above the asphalt).
    const paint = new THREE.MeshStandardMaterial({ color: '#e9e6d8', roughness: 0.85, alphaMap: wearTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const line = (x0, z0, x1, z1, w = 0.1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), paint);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
      m.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    for (const side of [-1, 1]) {
      for (const [a, b] of [[3.2, 8.2], [8.8, 13.8]]) {
        for (let d = 3; d < 50; d += 2.7) line(side * a, -d, side * b, -d);
      }
      line(side * 3.2, -1, side * 3.2, -50, 0.12);
    }
    // Concrete wheel stops at the head of each far stall row.
    const stopMat = new THREE.MeshStandardMaterial({ color: '#9c9990', roughness: 0.95 });
    for (const side of [-1, 1]) {
      for (let d = 4.35; d < 50; d += 2.7) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.6), stopMat);
        s.position.set(side * 13.4, 0.06, -d);
        s.castShadow = s.receiveShadow = true;
        this.scene.add(s);
      }
    }
  }

  buildStore() {
    const tex = storeFacadeTexture();
    tex.colorSpace = THREE.SRGBColorSpace;
    const emissive = storeFacadeTexture(true);
    emissive.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: '#8f8474', roughness: 0.95 });
    const store = new THREE.Mesh(new THREE.BoxGeometry(48, 7.5, 16), [side, side, side, side, front, side]);
    store.position.set(0, 3.75, -58);
    store.castShadow = store.receiveShadow = true;
    store.userData.surface = 'building';
    this.scene.add(store);
    this.solids = [store];
    // Sidewalk in front of the store.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(52, 0.15, 4), new THREE.MeshStandardMaterial({ color: '#8c8a84', roughness: 0.95 }));
    walk.position.set(0, 0.075, -48);
    walk.receiveShadow = true;
    this.scene.add(walk);
    // Tree line behind, lost in the fog.
    // Tree line: dark silhouettes against the dusk sky (fog off so they stay dark).
    const treeMat = new THREE.MeshBasicMaterial({ color: '#10140f', fog: false });
    for (let i = 0; i < 70; i++) {
      const r = 2.5 + Math.random() * 2.5;
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), treeMat);
      t.scale.set(1, 1.25, 1);
      t.position.set(-110 + i * 3.2 + Math.random() * 2, 4 + Math.random() * 3, -80 - Math.random() * 14);
      t.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(t);
    }
  }

  buildPoles() {
    const poleMat = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.6, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe2a8', emissiveIntensity: 6 });
    const glowTex = glowTexture();
    const poles = [[-3.9, -36], [3.9, -36], [-9.4, -22], [9.4, -22], [-9.4, -6], [9.4, -6]];
    for (const [x, z] of poles) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 8, 12), poleMat);
      pole.position.set(x, 4, z);
      pole.castShadow = true;
      this.scene.add(pole);
      const dir = x < 0 ? 1 : -1;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat);
      arm.position.set(x + dir * 0.7, 7.95, z);
      this.scene.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.35), lampMat);
      head.position.set(x + dir * 1.3, 7.88, z);
      this.scene.add(head);
      const spot = new THREE.SpotLight('#ffd9a0', V().lampIntensity, 30, 0.95, 0.7, 1.6);
      spot.position.copy(head.position);
      spot.target.position.set(head.position.x, 0, z);
      spot.castShadow = false; // the low sun casts the scene's shadows
      this.scene.add(spot, spot.target);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd9a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      glow.position.copy(head.position).add(new THREE.Vector3(0, -0.15, 0));
      glow.scale.set(2.2, 2.2, 1);
      this.scene.add(glow);
    }
  }

  // Parked cars. For frame rate: cars don't cast real-time shadows (each has a
  // baked contact-shadow plane, as games do), and cars beyond `carDetailDist`
  // drop interior/brake parts you can't see from the shooter's position.
  // Parked cars. The car model is very detailed, so for frame rate: cars
  // don't cast real-time shadows (each has a baked contact-shadow plane, as
  // games do), cars beyond `carDetailDist` drop interior/brake parts you can't
  // see from the shooter's position, and the user picks how many (0 = none).
  buildCars(carScene, shadowTex) {
    const hidden = /steering|interior|leather|carpet|carbon|brake|nuts|centre|leds|wipers/i;
    const lite = carScene.clone(true);
    const drop = [];
    lite.traverse(o => { if (o.isMesh && (hidden.test(o.name) || hidden.test(o.material?.name || ''))) drop.push(o); });
    drop.forEach(o => o.removeFromParent());
    this.carModels = { full: carScene, lite };
    this.carShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true });

    // Fixed stall order so the same count always parks the same cars: alternate
    // sides, every other stall first, starting in the visible middle distance.
    const rnd = mulberry(5);
    const stalls = side => Array.from({ length: 16 }, (_, i) => 4.35 + i * 2.7)
      .filter(d => d >= 9)
      .map(d => ({ side, d, x: rnd() < 0.55 ? 5.7 : 11.3, flip: rnd() < 0.5, skew: (rnd() - 0.5) * 0.06, dz: (rnd() - 0.5) * 0.3 }));
    const order = list => list.filter((_, i) => i % 2 === 0).concat(list.filter((_, i) => i % 2 === 1));
    const L = order(stalls(-1)), R = order(stalls(1));
    this.carSpots = [];
    for (let i = 0; i < Math.max(L.length, R.length); i++) {
      if (R[i]) this.carSpots.push(R[i]);
      if (L[i]) this.carSpots.push(L[i]);
    }
    this.cars = [];
  }

  // Park n cars (0 = empty lot).
  setCarCount(n) {
    if (!this.carModels) return;
    for (const car of this.cars) this.scene.remove(car);
    this.solids = this.solids.filter(o => !this.cars.includes(o));
    this.cars = [];
    const colors = ['#5b0f12', '#1d2b45', '#b9bcc0', '#111214', '#e8e8e6', '#26382b', '#4a4d52', '#6b1d16'];
    this.carSpots.slice(0, Math.max(0, n)).forEach((spot, i) => {
      const car = (spot.d > V().carDetailDist ? this.carModels.lite : this.carModels.full).clone(true);
      const color = new THREE.Color(colors[i % colors.length]);
      car.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = true;
        if (o.material?.name === 'Body_Color') {
          o.material = o.material.clone();
          o.material.color = color;
        }
        o.userData.surface = 'car';
      });
      car.rotation.y = spot.side * Math.PI / 2 + (spot.flip ? Math.PI : 0) + spot.skew; // nose in or out
      car.position.set(spot.side * spot.x, 0, -spot.d - spot.dz);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4), this.carShadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.renderOrder = 2;
      sh.position.y = 0.006;
      car.add(sh);
      this.scene.add(car);
      this.solids.push(car);
      this.cars.push(car);
    });
  }

  buildMan(manG, animG) {
    const man = manG.scene;
    this.man = man;
    this.manMeshes = [];
    man.traverse(o => {
      // Street clothes: no top hat, and a dark jacket instead of the suit colour.
      if (o.isMesh && o.material?.name === 'Wolf3D_Headwear') o.visible = false;
      if (o.isMesh && o.material?.name === 'Wolf3D_Outfit_Top') {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(V().jacketTint);
      }
      if (o.isMesh && o.material?.name === 'Wolf3D_Outfit_Bottom') {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(V().pantsTint);
      }
      if (o.isMesh && o.visible) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.userData.surface = 'man';
        this.manMeshes.push(o);
      }
    });
    this.bones = {};
    man.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
    this.scene.add(man);

    // Retarget the Mixamo clips (Soldier rig) onto the avatar's skeleton.
    const target = this.manMeshes.find(m => m.isSkinnedMesh);
    let source = null;
    animG.scene.traverse(o => { if (o.isSkinnedMesh && !source) source = o; });
    animG.scene.updateMatrixWorld(true);
    man.updateMatrixWorld(true);
    // Only keep tracks for bones the source rig actually has (the clips carry a
    // few finger bones the Soldier mesh lacks, which would just log warnings).
    const sourceBones = new Set(source.skeleton.bones.map(b => b.name));
    const clip = name => {
      const c = animG.animations.find(a => a.name === name).clone();
      c.tracks = c.tracks.filter(t => sourceBones.has(t.name.split('.')[0]));
      return SkeletonUtils.retargetClip(target, source, c, {
        // GLTFLoader strips the ':' from Mixamo names (mixamorig:Hips -> mixamorigHips).
        hip: 'mixamorigHips',
        getBoneName: bone => 'mixamorig' + bone.name,
        hipInfluence: new THREE.Vector3(0, 1, 0), // keep the vertical bob, drop drift
      });
    };
    // Retargeted tracks address `.bones[name]`, so the mixer runs on the skinned mesh.
    this.mixer = new THREE.AnimationMixer(target);
    this.actions = {
      idle: this.mixer.clipAction(clip('Idle')),
      run: this.mixer.clipAction(clip('Run')),
    };
    this.actions.idle.play();
    this.current = 'idle';
    man.position.set(0, 0, -9.1); // waiting at ~30 ft until a run starts
    man.rotation.set(0, V().facingOffset, 0);

    // A fixed-blade knife in his right hand.
    const knife = makeKnife();
    this.bones.RightHand.add(knife);
    knife.position.set(0, 0.09, 0.02);
    knife.rotation.set(Math.PI / 2, 0, 0);
    knife.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.surface = 'man'; this.manMeshes.push(o); } });
    this.knife = knife;

    this.fall = null;       // { t0 } once he's going down
    this.impulses = [];     // active hit reactions
  }

  // ---- Runner interface ---------------------------------------------------------

  // Put the man at distance d (m), lateral x (m), with the runner's state.
  setMan({ d, x, pose, speed, stopped }) {
    if (!this.ready) return;
    const man = this.man;
    man.visible = true;
    man.position.set(x, 0, -d);
    // Face the shooter (the retargeted clips carry the source rig's facing,
    // corrected by facingOffset).
    man.rotation.set(0, Math.atan2(-x, d) + V().facingOffset, 0);
    const want = pose === 'charge' ? 'run' : 'idle';
    if (want !== this.current && !this.fall) {
      this.actions[want].reset().play();
      this.actions[this.current].crossFadeTo(this.actions[want], 0.25, false);
      this.current = want;
    }
    if (this.current === 'run') this.actions.run.timeScale = Math.max(0.6, speed / V().runClipSpeed);
    if (stopped && !this.fall) this.fall = { t0: performance.now() / 1000 };
  }

  resetMan() {
    if (!this.ready) return;
    this.fall = null;
    this.impulses = [];
    this.groundDrops?.clear();
    this.mixer.stopAllAction();
    this.actions.idle.reset().play();
    this.current = 'idle';
    this.man.rotation.set(0, V().facingOffset, 0);
    this.man.position.set(0, 0, -9.1);
    this.effects.forEach(e => e.obj.removeFromParent());
    this.effects = [];
  }

  resize(W, H) {
    if (!this.renderer) return;
    this.renderer.setSize(W, H, false);
    const k = K();
    // Same framing as the 2D version: focal length and horizon from config.
    const focal = k.focalFrac * H;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / focal));
    this.camera.aspect = W / H;
    this.camera.position.set(0, k.eyeHeight, 0);
    this.camera.rotation.set(-Math.atan(((0.5 - k.horizonY) * H) / focal), 0, 0);
    this.camera.updateProjectionMatrix();
    this.W = W;
    this.H = H;
  }

  render(nowMs) {
    if (!this.ready) return;
    const now = nowMs / 1000;
    const dt = Math.min(0.05, this.lastT ? now - this.lastT : 0.016);
    this.lastT = now;
    this.mixer.update(dt);

    // Hit reactions: each is a quick snap then recovery, layered on the clip.
    const R = V().react;
    this.impulses = this.impulses.filter(imp => now - imp.t0 < R.duration);
    for (const imp of this.impulses) {
      const t = now - imp.t0;
      const k = (1 - Math.exp(-t * R.snap)) * Math.exp(-t * R.recover);
      for (const [bone, axis, amp, side] of REACTIONS[imp.kind]) {
        const b = this.bones[bone];
        if (b) b.rotation[axis] += amp * k * imp.scale * (side ? imp.side : 1);
      }
      // A leg hit also drops his hips as the leg gives.
      if (!this.fall && (imp.kind === 'legL' || imp.kind === 'legR')) this.man.position.y -= R.legDip * k;
    }
    // Going down: knees buckle, then he pitches forward toward the shooter.
    if (this.fall) {
      const F = V().fall;
      const t = now - this.fall.t0;
      const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
      const kneel = ease(t / F.kneelTime);
      const pitch = ease((t - F.kneelTime * 0.6) / F.pitchTime);
      for (const side of ['Left', 'Right']) {
        const up = this.bones[side + 'UpLeg'], knee = this.bones[side + 'Leg'];
        if (up) up.rotation.x += F.thigh * kneel;
        if (knee) knee.rotation.x += F.knee * kneel;
      }
      const sp = this.bones.Spine1;
      if (sp) sp.rotation.x += F.slump * kneel;
      this.man.position.y = -F.drop * kneel;
      this.man.rotation.x = pitch * F.pitch;
      this.actions[this.current].timeScale = Math.max(0, 1 - t / 0.4) * 0.6;
    }
    for (const fx of this.effects) fx.update(now);
    this.effects = this.effects.filter(fx => {
      if (fx.done) fx.obj.removeFromParent();
      return !fx.done;
    });
    this.renderer.render(this.scene, this.camera);
  }

  // Ray from a normalized screen point. Returns a score-like object.
  hitTest(nx, ny, threat) {
    if (!this.ready) return { zone: 'Miss', points: 0, targetId: null, kind: null };
    for (const m of this.manMeshes) if (m.isSkinnedMesh) m.computeBoundingSphere();
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const hits = this.raycaster.intersectObjects([...this.manMeshes, ...this.solids, this.ground], true);
    const h = hits.find(x => x.object.visible !== false && x.object.material?.visible !== false);
    if (!h) return { zone: 'Miss', points: 0, targetId: null, kind: null };
    let o = h.object;
    let surface = o.userData.surface;
    while (!surface && o.parent) { o = o.parent; surface = o.userData.surface; }
    const dir = this.raycaster.ray.direction.clone();
    if (surface === 'man' && !this.fall) {
      const info = this.boneAt(h.point);
      const zone = threat ? info.zone : 'NS';
      return { zone, points: CONFIG.points[zone], targetId: 'man', kind: 'actor', bodyZone: info.zone, threat, point: h.point, dir, hit: info };
    }
    return { zone: 'Miss', points: 0, targetId: null, kind: null, surface, point: h.point, dir };
  }

  // Nearest bone segment to a world point: zone (Head / A / C / D), the
  // reaction to play, the bone to attach a wound to, and the surface normal
  // (from the bone line out to the hit point).
  boneAt(p) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    let best = null, bestD = Infinity;
    for (const seg of SEGMENTS) {
      const A = this.bones[seg[0]], Bn = this.bones[seg[1]];
      if (!A || !Bn) continue;
      A.getWorldPosition(a);
      Bn.getWorldPosition(b);
      new THREE.Line3(a, b).closestPointToPoint(p, true, q);
      const d = q.distanceTo(p);
      if (d < bestD) { bestD = d; best = { seg, closest: q.clone() }; }
    }
    if (!best) return { zone: 'D', kind: 'chest', bone: this.bones.Spine1, normal: new THREE.Vector3(0, 0, 1) };
    const [from, , zoneKind, kind] = best.seg;
    const zone = zoneKind === 'chest' ? (bestD <= V().aZoneRadius ? 'A' : 'C') : zoneKind;
    const normal = p.clone().sub(best.closest);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    normal.normalize();
    // Which side of his body (his left/right) the hit was on.
    const local = this.man.worldToLocal(p.clone());
    return { zone, kind, bone: this.bones[from], normal, side: local.x >= 0 ? 1 : -1 };
  }

  // Reaction to a shot: body reaction + blood on the man, dust on the ground,
  // sparks on metal.
  onShot(score) {
    if (!this.ready || !score.point) return;
    if (score.kind === 'actor' && score.hit) {
      const h = score.hit;
      this.impulses.push({ kind: h.kind, t0: performance.now() / 1000, side: h.side, scale: 0.8 + Math.random() * 0.4 });
      if (this.blood) {
        this.effects.push(addWound(h.bone, score.point, h.normal));
        this.effects.push(addSpray(this.scene, score.point, score.dir, this.groundDrops));
      }
    } else if (score.surface === 'car' || score.surface === 'building') {
      this.effects.push(puff(this.scene, score.point, '#ffcf8a', 0.15, 0.12, true));
    } else if (score.surface === 'ground') {
      this.effects.push(puff(this.scene, score.point, '#7d776c', 0.35, 0.6));
    }
  }

  // Debug/test helper: play a reaction without a shot.
  react(kind, side = 1) { this.impulses.push({ kind, t0: performance.now() / 1000, side, scale: 1 }); }

  setVisible(on) {
    if (this.visible === on) return; // called every frame; only touch the DOM on change
    this.visible = on;
    this.canvas.style.display = on ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------------------
// Runner: KnifeRunner rules, 3D presentation.
// ---------------------------------------------------------------------------
export class Knife3DRunner extends KnifeRunner {
  constructor(range, view) {
    super(range);
    this.view = view;
  }

  // A plain state object the 3D view reads; nothing is added to the 2D range.
  makeMan() {
    this.view.resetMan();
    const man = { pose: 'knife', stride: 0, stopped: false, downAt: null };
    this.view.runnerMan = man; // range.scoreShot reads it to know if he's a threat
    return man;
  }

  place() {
    const lateral = this.x0 * (this.d / this.d0);
    this.view.setMan({ d: Math.max(0.35, this.d), x: lateral, pose: this.man.pose, speed: this.v, stopped: this.man.stopped });
  }

  start(nowMs) {
    if (!this.view.ready) return;
    super.start(nowMs);
  }

  // A hit that doesn't stop him still costs him speed (legs most of all).
  onShot(score) {
    const before = this.hits;
    super.onShot(score);
    if (this.hits > before && this.phase === 'charging') {
      const leg = score.hit?.kind === 'legL' || score.hit?.kind === 'legR';
      this.v *= leg ? V().legHitSlow : V().hitSlow;
    }
  }

  panelHTML(now) {
    if (!this.view.ready) {
      return `<b class="title">JUDGMENT · 3D</b><b>${this.course.name}</b>\nLoading 3D scene… ${Math.round(this.view.progress * 100)}%`;
    }
    return super.panelHTML(now).replace('<b class="title">JUDGMENT</b>', '<b class="title">JUDGMENT · 3D</b>');
  }
}

// ---------------------------------------------------------------------------
// Procedural textures and small props
// ---------------------------------------------------------------------------

function canvas2d(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Asphalt: aggregate speckle colour, matching roughness, and a normal map
// derived from the same height field so the stones catch the light.
function asphaltTextures() {
  const N = 512;
  const height = new Float32Array(N * N);
  // Layered value noise + sharp aggregate stones.
  const rnd = mulberry(7);
  const grid = (cell) => {
    const g = Math.ceil(N / cell) + 1;
    const v = new Float32Array(g * g).map(() => rnd());
    return (x, y) => {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const at = (i, j) => v[((j % (g - 1)) * g) + (i % (g - 1))];
      const s = t => t * t * (3 - 2 * t);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(fx);
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(fx);
      return a + (b - a) * s(fy);
    };
  };
  const n1 = grid(64), n2 = grid(16), n3 = grid(4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    height[y * N + x] = n1(x, y) * 0.3 + n2(x, y) * 0.3 + n3(x, y) * 0.25 + (rnd() < 0.08 ? rnd() * 0.5 : 0);
  }
  const [mc, m] = canvas2d(N), [rc, r] = canvas2d(N), [nc, nn] = canvas2d(N);
  const mi = m.createImageData(N, N), ri = r.createImageData(N, N), ni = nn.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, p = i * 4;
    const h = height[i];
    const base = 46 + h * 42 + (rnd() - 0.5) * 10;
    mi.data[p] = base; mi.data[p + 1] = base; mi.data[p + 2] = base * 1.03; mi.data[p + 3] = 255;
    const rv = 200 + (1 - h) * 40;
    ri.data[p] = ri.data[p + 1] = ri.data[p + 2] = rv; ri.data[p + 3] = 255;
    const hx = height[y * N + ((x + 1) % N)] - height[y * N + ((x - 1 + N) % N)];
    const hy = height[((y + 1) % N) * N + x] - height[((y - 1 + N) % N) * N + x];
    const nx = -hx * 2.5, ny = -hy * 2.5, nz = 1, l = Math.hypot(nx, ny, nz);
    ni.data[p] = (nx / l * 0.5 + 0.5) * 255;
    ni.data[p + 1] = (ny / l * 0.5 + 0.5) * 255;
    ni.data[p + 2] = (nz / l * 0.5 + 0.5) * 255;
    ni.data[p + 3] = 255;
  }
  m.putImageData(mi, 0, 0);
  r.putImageData(ri, 0, 0);
  nn.putImageData(ni, 0, 0);
  return { map: new THREE.CanvasTexture(mc), rough: new THREE.CanvasTexture(rc), normal: new THREE.CanvasTexture(nc) };
}

// Alpha mask for worn paint.
function wearTexture() {
  const [c, g] = canvas2d(256);
  const img = g.createImageData(256, 256);
  const rnd = mulberry(3);
  for (let i = 0; i < 256 * 256; i++) {
    const v = rnd() < 0.18 ? 60 + rnd() * 80 : 200 + rnd() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Store front: stucco, a red fascia with the sign, big lit windows. With
// `emissive` true, only the parts that glow (windows, sign letters).
function storeFacadeTexture(emissive = false) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 320;
  const g = c.getContext('2d');
  const rnd = mulberry(11);
  g.fillStyle = emissive ? '#000' : '#b3a58c';
  g.fillRect(0, 0, 2048, 320);
  if (!emissive) {
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      g.fillRect(rnd() * 2048, rnd() * 320, 2, 2);
    }
    g.fillStyle = '#7e2a22';
    g.fillRect(0, 0, 2048, 64);
  }
  g.fillStyle = emissive ? '#ffe9c2' : '#fff1d0';
  g.font = '800 46px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('M A R K E T', 1024, 34);
  for (let i = 0; i < 11; i++) {
    const x = 60 + i * 180;
    if (i === 5) { // doors
      g.fillStyle = emissive ? '#6b5a3a' : '#cdb98f';
      g.fillRect(x, 150, 120, 170);
      continue;
    }
    const grad = g.createLinearGradient(0, 110, 0, 300);
    grad.addColorStop(0, emissive ? '#e6c98a' : '#f4e3b6');
    grad.addColorStop(1, emissive ? '#a4824a' : '#c9a86a');
    g.fillStyle = grad;
    g.fillRect(x, 110, 140, 190);
    if (!emissive) {
      g.fillStyle = 'rgba(40,30,20,0.35)';
      for (let s = 0; s < 4; s++) g.fillRect(x + 8 + s * 34, 180, 22, 120); // shelving silhouettes
      g.strokeStyle = '#6d6252';
      g.lineWidth = 6;
      g.strokeRect(x, 110, 140, 190);
    }
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function glowTexture() {
  const [c, g] = canvas2d(128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,210,0.5)');
  grad.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeKnife() {
  const knife = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#d4d8dc', metalness: 1, roughness: 0.22 });
  const grip = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.014, 0);
  shape.lineTo(0.014, 0);
  shape.lineTo(0.012, 0.13);
  shape.quadraticCurveTo(0.004, 0.17, -0.014, 0.19);
  shape.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 }), steel);
  blade.position.set(0, 0.012, -0.0015);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.012), steel);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.11, 10), grip);
  handle.position.y = -0.058;
  knife.add(blade, guard, handle);
  // Knife's local +Y is the blade direction; the grip sits in the palm.
  const holder = new THREE.Group();
  holder.add(knife);
  knife.position.y = 0.05;
  return holder;
}

// A short-lived puff (dust, sparks, fabric) at a point.
function puff(scene, point, color, size, life, additive = false) {
  const mat = new THREE.SpriteMaterial({ map: puff.tex || (puff.tex = glowTexture()), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const s = new THREE.Sprite(mat);
  s.position.copy(point);
  scene.add(s);
  const t0 = performance.now() / 1000;
  const fx = {
    obj: s, done: false,
    update(now) {
      const k = (now - t0) / life;
      if (k >= 1) { fx.done = true; return; }
      const sc = size * (0.4 + k * 1.6);
      s.scale.set(sc, sc, 1);
      s.position.y = point.y + k * size * 0.8;
      mat.opacity = (1 - k) * 0.9;
    },
  };
  return fx;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
