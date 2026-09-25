// office3d.js — "Active Shooter: Office Building", a 3D judgment scenario.
// ---------------------------------------------------------------------------
// 1. Outside an office building. A radio call: shots fired, armed suspects inside.
// 2. You walk in (the camera moves on a path): glass doors slide open, a
//    wounded man lies in the lobby (a no-shoot), down a hallway, into an open
//    office of cubicles with private offices along the back wall.
// 3. In the office, gunmen pop up from cubicles or step out of offices and
//    aim at you; if one stays up for `fireDelay` he fires and you're hit.
//    Office workers may pop up with their hands up (no-shoots).
// 4. Finally a gunman walks out of an office holding a hostage, pistol to
//    her head. Stop him without hitting her before `hostageTime` runs out.
//
// Everything is randomized per run: which cubicles/offices, how many
// gunmen, who appears when. Grading is the same as the other judgment
// scenarios: any no-shoot hit, being shot, or the hostage being killed = FAIL.
//
// Units are metres. The building front is at z = 0; you walk toward -Z.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { People } from './people3d.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Post } from './post3d.js';
import { makeMaterials, tiled, door, workstation, plant, whiteboard, wallClock, exitSign, troffer, extinguisher, copier, blinds, outsideView } from './interior3d.js';
import { CONFIG } from './config.js';
import { Runner, State, f2 } from './run.js';
import { Character } from './char3d.js';
import { GroundDrops } from './blood3d.js';
import { say, radioStatic, enemyShot, penaltyBuzz } from './audio.js';

const O = () => CONFIG.office3d;
const ASSETS = 'assets/3d/';
// Realistic people (people3d.js) by role: casual clothes for the gunmen,
// office clothes for the staff, the hostage and the wounded man.
const ROLE_CAST = {
  gunman: ['m04', 'm05', 'm06', 'm09', 'm12', 'm17', 'm18'],
  victim: ['bm02', 'm05', 'm12'],
  innocent: ['bm02', 'bf01', 'f04', 'f07', 'f13'],
  hostage: ['bm02', 'bf01', 'f07', 'f13'],
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Camera path: [x, z, lookX, lookY, lookZ, seconds to get here]
const PATH = [
  [0, 14.0, 0, 3.4, 0, 0],
  [0, 1.4, 0, 1.6, -10, 5.2],
  [0.2, -3.4, 1.4, 0.4, -4.6, 2.4],   // glance down at the wounded man
  [0, -9.6, 0, 1.5, -20, 2.6],
  [0, -21.0, 0, 1.5, -30, 5.0],
  [0, -23.2, 0, 1.3, -34, 1.6],
];

// Places people can appear in the office.
const PODS = [-8.6, -5.0, 5.0, 8.6].flatMap(x => [-27.2, -31.6].map(z => ({ type: 'pod', x, z })));
const OFFICES = [-9, -3, 3, 9].map(x => ({ type: 'office', x, z: -38.2, doorX: x + 1.6 }));

export class OfficeView {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'range3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(this.canvas, document.getElementById('range'));
    this.ready = false;
    this.progress = 0;
    this.people = [];
    this.fx = [];
    this.blood = true;
  }

  async init({ onProgress = () => {} } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.knife3d.maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = O().exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 300);
    this.raycaster = new THREE.Raycaster();

    const manager = new THREE.LoadingManager();
    manager.onProgress = (u, l, t) => { this.progress = l / t; onProgress(this.progress); };
    const gltf = new GLTFLoader(manager);
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath('vendor/three/addons/libs/draco/gltf/'); // the people are Draco-compressed
    gltf.setDRACOLoader(draco);
    this.cast = new People(gltf);
    const [sky] = await Promise.all([
      new HDRLoader(manager).loadAsync(ASSETS + 'city.hdr'),
      this.cast.load([...new Set(Object.values(ROLE_CAST).flat())]),
    ]);
    // Reflections and fill light: the city sky outside, a neutral lit room
    // inside (render() switches when you walk in).
    const pmrem = new THREE.PMREMGenerator(renderer);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.envOutside = pmrem.fromEquirectangular(sky).texture;
    this.envInside = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envOutside;
    this.scene.environmentIntensity = O().envIntensity;
    sky.dispose();
    pmrem.dispose();
    this.M = makeMaterials();

    this.usedCast = [];

    this.solids = [];
    this.buildOutside();
    this.buildLobby();
    this.buildHall();
    this.buildOffice();
    this.buildLights();
    this.drops = new GroundDrops(this.scene);
    this.post = new Post(renderer, this.scene, this.camera);
    this.resize(window.innerWidth, window.innerHeight);
    this.placeCamera(0, 0);
    this.ready = true;
  }

  // ---- environment ---------------------------------------------------------------
  box(w, h, d, mat, x, y, z, { solid = true, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.scene.add(m);
    if (solid) this.solids.push(m);
    return m;
  }

  buildOutside() {
    const S = this.scene;
    // Daytime sky dome.
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5d86b8') }, bottom: { value: new THREE.Color('#dfe7ee') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.5, max(vP.y,0.0))), 1.0); }',
    });
    S.add(new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), skyMat));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: tex(concrete(), 30), roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    ground.receiveShadow = true;
    S.add(ground);
    this.solids.push(ground);

    // Glass curtain wall with mullions, leaving the entrance open.
    const glass = new THREE.MeshPhysicalMaterial({ color: '#56707f', metalness: 0.2, roughness: 0.05, envMapIntensity: 1.4, clearcoat: 1 });
    const mull = new THREE.MeshStandardMaterial({ color: '#2d3237', metalness: 0.7, roughness: 0.4 });
    const H = 14;
    this.box(18.6, H, 0.2, glass, -10.9, H / 2, 0);
    this.box(18.6, H, 0.2, glass, 10.9, H / 2, 0);
    this.box(3.2, H - 3.2, 0.2, glass, 0, 3.2 + (H - 3.2) / 2, 0);
    for (let x = -20; x <= 20; x += 1.6) if (Math.abs(x) > 1.7) this.box(0.08, H, 0.3, mull, x, H / 2, 0.05, { solid: false });
    for (let y = 3.2; y <= H; y += 3.5) this.box(40, 0.12, 0.32, mull, 0, y, 0.05, { solid: false });
    // Canopy and sign.
    this.box(6, 0.2, 2.4, mull, 0, 3.3, 1.2, { solid: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), new THREE.MeshStandardMaterial({ map: signTexture('NORTHGATE OFFICE CENTER'), emissive: '#ffffff', emissiveIntensity: 0.3 }));
    sign.position.set(0, 4.7, 0.12);
    S.add(sign);
    // Sliding glass doors.
    const doorGlass = new THREE.MeshPhysicalMaterial({ color: '#9fb3bd', metalness: 0, roughness: 0.02, transmission: 0.7, thickness: 0.02, transparent: true, opacity: 0.55 });
    this.doors = [-0.8, 0.8].map(x => this.box(1.6, 3.0, 0.05, doorGlass, x, 1.5, 0.02));
    // Planters.
    const planter = new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#3f5f34', roughness: 0.9 });
    for (const x of [-4.5, 4.5]) {
      this.box(1.4, 0.7, 1.4, planter, x, 0.35, 2.5);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), leaf);
      bush.position.set(x, 1.1, 2.5);
      bush.castShadow = true;
      S.add(bush);
    }
  }

  // Lobby: polished stone tiles, reception desk, seating, plants.
  buildLobby() {
    const M = this.M;
    const floor = new THREE.MeshStandardMaterial({ map: tex(tiles('#d9d4c9', '#c9c2b4', 8), 6), roughness: 0.18, metalness: 0 });
    const f = this.box(12, 0.02, 10, floor, 0, 0, -5, { shadow: false });
    f.receiveShadow = true;
    this.box(12, 0.1, 10, tiled(M.ceiling, 12, 10, 0.6), 0, 3.35, -5, { shadow: false });
    this.box(0.2, 3.3, 10, M.wall, -6, 1.65, -5);
    this.box(0.2, 3.3, 10, M.accentWall, 6, 1.65, -5);
    this.box(4.8, 3.3, 0.2, M.wall, -3.6, 1.65, -10);
    this.box(4.8, 3.3, 0.2, M.wall, 3.6, 1.65, -10);
    this.box(2.4, 0.6, 0.2, M.wall, 0, 3.0, -10);
    this.baseboards([[-6, -5, 'z', 10], [6, -5, 'z', 10], [-3.6, -10, 'x', 4.8], [3.6, -10, 'x', 4.8]], 0.11);
    // Reception desk: veneer front, stone top, a monitor for the receptionist.
    this.box(3.2, 1.1, 0.7, M.veneer, -3.4, 0.55, -6.2);
    this.box(3.4, 0.04, 0.95, new THREE.MeshStandardMaterial({ color: '#2d2d2f', roughness: 0.2 }), -3.4, 1.12, -6.1);
    const desk = workstation(M, { w: 1.6, d: 0.6, seed: 90, chair: true });
    desk.position.set(-3.4, 0, -6.95);
    desk.rotation.y = Math.PI;
    this.add(desk);
    // Seating and plants.
    const fabric = new THREE.MeshStandardMaterial({ color: '#46505c', roughness: 0.95, normalMap: M.fabric.normalMap });
    this.box(2.2, 0.45, 0.9, fabric, 4.6, 0.25, -7.2);
    this.box(2.2, 0.5, 0.2, fabric, 4.6, 0.7, -7.6);
    for (const [x, z, s] of [[-5.3, -1.2, 1.2], [5.3, -1.2, 1.2], [5.3, -9.2, 1], [-5.3, -9.2, 1]]) this.add(plant(M, s), x, 0, z);
    const clock = wallClock(M);
    clock.rotation.y = -Math.PI / 2;
    this.add(clock, 5.88, 2.4, -5);
    this.troffers([[-3, -3], [3, -3], [-3, -7.5], [3, -7.5]], 3.3);
  }

  // Hallway to the office: closed office doors on both sides, exit sign.
  buildHall() {
    const M = this.M;
    const floor = new THREE.MeshStandardMaterial({ map: tex(tiles('#b9b4ab', '#aaa498', 4), 2), roughness: 0.3 });
    this.box(2.4, 0.02, 12, floor, 0, 0, -16, { shadow: false });
    this.box(2.4, 0.1, 12, tiled(M.ceiling, 2.4, 12, 0.6), 0, 2.9, -16, { shadow: false });
    this.box(0.15, 2.85, 12, M.wall, -1.2, 1.425, -16);
    this.box(0.15, 2.85, 12, M.wall, 1.2, 1.425, -16);
    this.baseboards([[-1.2, -16, 'z', 12], [1.2, -16, 'z', 12]], 0.085);
    for (const [x, z] of [[-1, -13], [-1, -18.2], [1, -14.6], [1, -19.8]]) {
      const d = door(M, { wall: 0.06, hinge: x < 0 ? 'left' : 'right' });
      d.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.add(d, x * 1.1, 0, z);
      this.solids.push(...d.userData.solids);
    }
    const ex = exitSign(M);
    this.add(ex, 0, 2.62, -10.3);
    this.add(extinguisher(M), 1.05, 0.25, -21.2);
    this.troffers([[0, -12.5], [0, -16], [0, -19.5]], 2.84, 0.6);
  }

  // The open office: carpet tiles, acoustic ceiling with troffers, cubicle
  // pods with real workstations, private offices with glass fronts and
  // doors along the back, windows with blinds on the right.
  buildOffice() {
    const M = this.M;
    const f = this.box(24, 0.02, 18, tiled(M.carpet, 24, 18, 1), 0, 0, -31, { shadow: false });
    f.receiveShadow = true;
    this.box(24, 0.1, 18, tiled(M.ceiling, 24, 18, 0.6), 0, 3.1, -31, { shadow: false });
    this.box(10.8, 3.05, 0.2, M.wall, -6.6, 1.525, -22);
    this.box(10.8, 3.05, 0.2, M.wall, 6.6, 1.525, -22);
    this.box(0.2, 3.05, 18, M.accentWall, -12, 1.525, -31);
    this.box(24, 3.05, 0.2, M.wall, 0, 1.525, -40);
    this.baseboards([[-6.6, -22.1, 'x', 10.8], [6.6, -22.1, 'x', 10.8], [-11.9, -31, 'z', 18]], 0.11);

    // Right wall: window bays with mullions, blinds, and the city outside.
    this.box(0.2, 0.9, 18, M.wall, 12, 0.45, -31);
    this.box(0.2, 0.35, 18, M.wall, 12, 2.875, -31);
    const mull = M.doorFrame;
    for (let z = -22; z >= -40; z -= 1.5) this.box(0.12, 1.8, 0.06, mull, 11.95, 1.8, z, { solid: false });
    this.box(0.14, 0.06, 18, mull, 11.95, 0.93, -31, { solid: false });
    this.box(0.14, 0.06, 18, mull, 11.95, 2.68, -31, { solid: false });
    for (let z = -22.75, i = 0; z > -40; z -= 1.5, i++) {
      const bl = blinds(M, 1.42, 1.8, [0.35, 0.6, 0.45, 0.8, 0.3][i % 5]);
      bl.rotation.y = -Math.PI / 2;
      this.add(bl, 11.8, 1.8, z);
    }
    const out = outsideView(M, 60, 20);
    out.rotation.y = -Math.PI / 2;
    this.add(out, 30, 4, -31);

    // Left wall: whiteboard, copier, extinguisher, plant; clock over the entry.
    const wb = whiteboard(M);
    wb.rotation.y = Math.PI / 2;
    this.add(wb, -11.88, 1.55, -30);
    const cp = copier(M);
    cp.rotation.y = Math.PI / 2;
    this.add(cp, -11.5, 0, -24.2);
    this.add(extinguisher(M), -11.85, 0.25, -35.5);
    this.add(plant(M, 1.3), -11.3, 0, -38.8);
    this.add(plant(M, 1.3), 11.3, 0, -23.2);
    const clock = wallClock(M);
    clock.rotation.y = Math.PI;
    this.add(clock, -3, 2.45, -22.12);

    // Private offices along the back wall.
    this.officeDoors = new Map();
    for (const o of OFFICES) {
      const z = -36.6;
      // Glass sidelight with a frosted privacy band, framed.
      this.box(3.85, 2.95, 0.02, M.glass, o.x - 0.825, 1.5, z, { shadow: false, solid: false });
      this.box(3.85, 0.25, 0.022, M.frosted, o.x - 0.825, 1.25, z, { shadow: false, solid: false });
      for (const x of [o.x - 2.75, o.x - 0.8]) this.box(0.06, 3.05, 0.1, M.doorFrame, x, 1.525, z);
      this.box(3.85, 0.06, 0.1, M.doorFrame, o.x - 0.825, 0.03, z);
      // The door (hinged on the left, swings into the office) with a glass transom.
      const d = door(M, { width: 0.92, wall: 0.1, hinge: 'left' });
      this.add(d, o.doorX, 0, z);
      this.solids.push(...d.userData.solids);
      this.officeDoors.set(o, d);
      this.box(1.0, 0.8, 0.02, M.glass, o.doorX, 2.63, z, { shadow: false, solid: false });
      this.box(1.0, 0.06, 0.1, M.doorFrame, o.doorX, 3.02, z);
      // Solid strip and the side wall between offices.
      this.box(0.65, 3.05, 0.12, M.wall, o.x + 2.425, 1.525, z);
      this.box(0.12, 3.05, 3.4, M.wall, o.x + 2.75, 1.525, -38.3);
      // Inside: executive desk, workstation, a plant.
      const ws = workstation(M, { w: 1.8, d: 0.8, seed: Math.round(o.x * 10) + 50 });
      ws.position.set(o.x - 1, 0, -39.1);
      this.add(ws);
      this.add(plant(M, 1.1), o.x - 2.3, 0, -39.4);
    }

    // Cubicle pods: fabric panels with aluminium caps, a workstation each.
    const PH = O().partitionHeight;
    for (const [i, p] of PODS.entries()) {
      const hw = 1.3;
      this.box(2.6, PH, 0.06, M.fabric, p.x, PH / 2, p.z + hw);
      this.box(2.6, PH, 0.06, M.fabric, p.x, PH / 2, p.z - hw);
      this.box(0.06, PH, 2.6, M.fabric, p.x + (p.x > 0 ? hw : -hw), PH / 2, p.z);
      for (const [w, d, x, z] of [[2.62, 0.08, p.x, p.z + hw], [2.62, 0.08, p.x, p.z - hw], [0.08, 2.62, p.x + (p.x > 0 ? hw : -hw), p.z]]) {
        this.box(w, 0.03, d, M.panelTrim, x, PH + 0.015, z, { solid: false });
      }
      const ws = workstation(M, { w: 2.2, d: 0.75, seed: i + 1 });
      ws.position.set(p.x, 0, p.z - 0.8);
      this.add(ws);
    }
    const spots = [];
    for (let x = -9; x <= 9; x += 3) for (const z of [-24.4, -27.4, -30.4, -33.4]) spots.push([x, z]);
    this.troffers(spots, 3.05);
  }

  // Add a group (or mesh) to the scene at a position; its solids stop rounds.
  add(obj, x, y, z) {
    if (x !== undefined) obj.position.set(x, y, z);
    obj.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
    this.scene.add(obj);
    if (obj.userData?.solids) this.solids.push(...obj.userData.solids);
    return obj;
  }

  // Dark rubber baseboards: [x, z, along 'x'|'z', length].
  baseboards(list, t) {
    for (const [x, z, axis, len] of list) {
      if (axis === 'x') this.box(len, 0.1, 0.012, this.M.baseboard, x, 0.05, z + (z > -22.05 ? -t : t), { solid: false, shadow: false });
      else this.box(0.012, 0.1, len, this.M.baseboard, x + (x > 0 ? -t : t), 0.05, z, { solid: false, shadow: false });
    }
  }

  troffers(spots, y, size = 1) {
    for (const [x, z] of spots) {
      const t = troffer(this.M);
      t.scale.setScalar(size);
      this.add(t, x, y, z);
    }
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#f2f4f7', '#b3aea5', O().hemiIntensity));
    const sun = new THREE.DirectionalLight('#fff4e0', O().sunIntensity);
    sun.position.set(12, 30, 20);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 30, bottom: -30, near: 5, far: 90 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    // Indoor light: soft point lights under the troffers.
    for (const [x, y, z, i] of [[0, 3.0, -5, 1], [0, 2.7, -16, 0.7], [-6, 2.9, -26, 1], [6, 2.9, -26, 1], [-6, 2.9, -32, 1], [6, 2.9, -32, 1], [0, 2.9, -38, 0.8]]) {
      const l = new THREE.PointLight('#fff5e6', O().roomLight * i, 16, 1.6);
      l.position.set(x, y, z);
      this.scene.add(l);
    }
    // Daylight through the windows (from the right), casting soft shadows.
    const day = new THREE.DirectionalLight('#eef4ff', O().windowLight);
    day.position.set(30, 6, -30);
    day.target.position.set(0, 0, -31);
    this.scene.add(day, day.target);
    // Interior shadow caster straight down, so people are grounded indoors.
    const top = new THREE.DirectionalLight('#ffffff', O().ceilingShadowLight);
    top.position.set(0.5, 20, -28);
    top.target.position.set(0, 0, -30);
    top.castShadow = true;
    top.shadow.mapSize.set(2048, 2048);
    Object.assign(top.shadow.camera, { left: -13, right: 13, top: 20, bottom: -20, near: 5, far: 30 });
    top.shadow.bias = -0.0005;
    top.shadow.radius = 4;
    this.scene.add(top, top.target);
  }

  // Swing an office door open (or shut); render() eases it.
  openDoor(office, open = true) {
    const d = this.officeDoors?.get(office);
    if (d) d.userData.target = open ? O().doorOpenAngle : 0;
  }

  // ---- people ----------------------------------------------------------------------
  // A realistic person for the role; nobody appears twice in a run.
  addPerson(rigName, role, opts = {}) {
    const pool = ROLE_CAST[role] || ROLE_CAST.innocent;
    const free = pool.filter(id => !this.usedCast.includes(id));
    const id = pick(free.length ? free : pool);
    this.usedCast.push(id);
    const p = new Character(this.cast.rig(id), { role });
    this.scene.add(p.obj);
    if (opts.gun) this.scene.add(p.addGun());
    this.people.push(p);
    return p;
  }

  clearPeople() {
    this.usedCast = [];
    for (const d of this.officeDoors?.values() || []) { d.userData.target = d.userData.open = 0; d.userData.pivot.rotation.y = 0; }
    for (const p of this.people) {
      p.obj.removeFromParent();
      p.gun?.removeFromParent();
      p.effects.forEach(e => e.obj.removeFromParent());
    }
    this.people = [];
    this.fx.forEach(e => e.obj.removeFromParent());
    this.fx = [];
    this.drops.clear();
    this.victimPool?.removeFromParent();
  }

  // ---- camera ------------------------------------------------------------------------
  resize(W, H) {
    if (!this.renderer) return;
    this.renderer.setSize(W, H, false);
    const focal = CONFIG.knife.focalFrac * H;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / 2 / focal));
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(W, H);
  }

  // Position the camera `t` seconds along the path, plus look-around yaw.
  placeCamera(t, lookYaw) {
    let acc = 0;
    let i = 1;
    for (; i < PATH.length; i++) {
      if (t <= acc + PATH[i][5]) break;
      acc += PATH[i][5];
    }
    let pos, look, moving = false;
    if (i >= PATH.length) {
      const e = PATH[PATH.length - 1];
      pos = new THREE.Vector3(e[0], 0, e[1]);
      look = new THREE.Vector3(e[2], e[3], e[4]);
    } else {
      const a = PATH[i - 1], b = PATH[i];
      const k = THREE.MathUtils.smootherstep((t - acc) / b[5], 0, 1);
      pos = new THREE.Vector3(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k);
      look = new THREE.Vector3(a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] + (b[4] - a[4]) * k);
      moving = t > 0;
    }
    // Walking head-bob.
    const bob = moving ? Math.sin(t * 9) * 0.025 : 0;
    pos.y = CONFIG.knife.eyeHeight + bob;
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.camera.rotateY(lookYaw);
    if (moving) this.camera.rotateZ(Math.sin(t * 4.5) * 0.006);
    this.walkZ = pos.z;
    return i >= PATH.length; // arrived
  }

  get pathDuration() { return PATH.reduce((s, p) => s + p[5], 0); }

  render(nowMs) {
    if (!this.ready) return;
    const now = nowMs / 1000;
    const dt = Math.min(0.05, this.lastT ? now - this.lastT : 0.016);
    this.lastT = now;
    // Doors slide open as you approach.
    const open = THREE.MathUtils.clamp((5 - this.walkZ) / 2.5, 0, 1);
    this.doors[0].position.x = -0.8 - open * 1.5;
    this.doors[1].position.x = 0.8 + open * 1.5;
    // Office doors swing toward their target angle.
    for (const d of this.officeDoors?.values() || []) {
      const u = d.userData;
      u.open += (u.target - u.open) * Math.min(1, dt * O().doorSpeed);
      u.pivot.rotation.y = u.open;
    }
    const inside = this.walkZ < -1;
    this.scene.environment = inside ? this.envInside : this.envOutside;
    this.scene.environmentIntensity = inside ? O().envInside : O().envIntensity;
    for (const p of this.people) p.update(dt, now);
    for (const f of this.fx) f.update(now);
    this.fx = this.fx.filter(f => { if (f.done) f.obj.removeFromParent(); return !f.done; });
    this.post.render();
  }

  // Ray-cast a shot. Returns a score object for Range/Game.
  hitTest(nx, ny) {
    const miss = { zone: 'Miss', points: 0, targetId: null, kind: null };
    if (!this.ready) return miss;
    for (const p of this.people) for (const m of p.meshes) if (m.isSkinnedMesh) m.computeBoundingSphere();
    this.raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), this.camera);
    const targets = [...this.people.filter(p => p.obj.visible).flatMap(p => p.meshes.filter(m => m.visible)), ...this.solids];
    const h = this.raycaster.intersectObjects(targets, false)[0];
    const dir = this.raycaster.ray.direction.clone();
    if (!h) return { ...miss, dir };
    const person = h.object.userData.char;
    if (person && !person.down) {
      const info = person.boneAt(h.point);
      const threat = person.role === 'gunman' && person.live;
      const zone = threat ? info.zone : 'NS';
      return { zone, points: CONFIG.points[zone], targetId: person.id, kind: 'actor', bodyZone: info.zone, threat, point: h.point, dir, person };
    }
    return { ...miss, point: h.point, dir, surface: 'wall' };
  }

  // Reaction (called by Range.onShot): blood/reaction on people, dust on walls.
  onShot(score) {
    if (!this.ready || !score.point) return;
    const now = performance.now() / 1000;
    if (score.person) score.person.hit(score.point, score.dir, now, this.scene, this.drops, this.blood);
    else this.fx.push(dust(this.scene, score.point));
  }

  setVisible(on) {
    if (this.visible === on) return; // called every frame; only touch the DOM on change
    this.visible = on;
    this.canvas.style.display = on ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
export class OfficeRunner extends Runner {
  constructor(range, view) {
    super();
    this.range = range;
    this.view = view;
    this.clearRun();
  }

  clearRun() {
    this.phase = 'idle';      // call | approach | room | done
    this.t0 = 0;
    this.roomT0 = 0;
    this.events = [];
    this.gunmen = [];
    this.penalties = [];
    this.reactions = [];
    this.shots = 0;
    this.threatHits = 0;
    this.shotAt = null;       // when you were shot
    this.hostageKilledAt = null;
    this.endAt = null;
    this.lastMs = 0;
    this.caption = '';
  }

  start(nowMs) {
    if (this.busy || !this.view.ready) return;
    this.clearRun();
    this.result = null;
    this.view.clearPeople();
    this.setup();
    this.t0 = nowMs;
    this.lastMs = nowMs;
    this.phase = 'call';
    this.state = State.Running;
    radioStatic();
    this.caption = 'Dispatch: “All units, shots fired at Northgate Office Center, 400 Main. Multiple armed suspects inside. Respond code 3.”';
    setTimeout(() => say('All units, shots fired at Northgate Office Center. Multiple armed suspects inside. Respond code 3.'), 450);
  }

  cancel() {
    super.cancel();
    this.view.clearPeople();
    this.clearRun();
  }

  // Build the cast for this run.
  setup() {
    const v = this.view;
    const O3 = O();
    // Wounded man in the lobby.
    const victim = v.addPerson('man', 'victim');
    victim.obj.position.set(1.5, 0.12, -4.6);
    victim.obj.rotation.set(-Math.PI / 2, 0, 0.5);
    victim.actions.idle.timeScale = 0.15;
    victim.id = 'victim';
    v.victimPool = bloodPool(v.scene, 1.55, -4.45);

    const spots = shuffle([...PODS, ...OFFICES]);
    const nGunmen = Math.random() < 0.5 ? 2 : 3;
    const nInnocent = Math.random() < 0.6 ? 1 : 2;
    const hostageOffice = pick(OFFICES.filter(o => !spots.slice(0, nGunmen + nInnocent).includes(o)));
    let t = rand(1.2, 2.5);
    for (let i = 0; i < nGunmen; i++) {
      const spot = spots.shift();
      if (spot === hostageOffice) { i--; continue; }
      const g = v.addPerson('man', 'gunman', { gun: true });
      this.hide(g, spot);
      g.id = 'gunman' + i;
      this.events.push({ t, person: g, spot, kind: 'gunman' });
      this.gunmen.push(g);
      t += rand(O3.gunmanGap[0], O3.gunmanGap[1]);
    }
    for (let i = 0; i < nInnocent; i++) {
      const spot = spots.find(s => s.type === 'pod' && s !== hostageOffice);
      spots.splice(spots.indexOf(spot), 1);
      const w = v.addPerson('man', 'innocent');
      this.hide(w, spot);
      w.id = 'innocent' + i;
      this.events.push({ t: rand(0.6, t), person: w, spot, kind: 'innocent' });
    }
    // Hostage pair, hidden in their office until their cue.
    const hostage = v.addPerson('man', 'hostage');
    const taker = v.addPerson('man', 'gunman', { gun: true });
    taker.id = 'taker';
    hostage.id = 'hostage';
    taker.hostage = hostage;
    taker.pose = 'hostage';
    for (const p of [hostage, taker]) { p.obj.position.set(hostageOffice.x - 1, 0, -39); p.obj.visible = false; }
    this.hostagePair = { hostage, taker, office: hostageOffice };
    this.gunmen.push(taker);
  }

  hide(p, spot) {
    p.spot = spot;
    if (spot.type === 'pod') p.obj.position.set(spot.x + rand(-0.3, 0.3), -1.2, spot.z + 0.2);
    else p.obj.position.set(spot.x - 0.3, 0, -38.6);
    p.obj.visible = false;
  }

  // Bring someone into view: rise from behind the cubicle wall, or step out of
  // the office door.
  reveal(ev, nowS) {
    const p = ev.person;
    p.obj.visible = true;
    p.revealT = nowS;
    p.from = p.obj.position.clone();
    p.to = ev.spot.type === 'pod'
      ? new THREE.Vector3(p.from.x, 0, p.from.z)
      : new THREE.Vector3(ev.spot.doorX, 0, -35.6 + rand(-0.3, 0.4));
    if (ev.spot.type === 'office') {
      // The door swings open first, then they step out.
      this.view.openDoor(ev.spot);
      p.obj.position.set(ev.spot.doorX, 0, -38.2);
      p.from = p.obj.position.clone();
      p.play('walk');
      p.revealT = nowS + O().doorLead;
    }
    p.moveTime = ev.spot.type === 'pod' ? O().riseTime : O().stepOutTime;
    if (p.role === 'gunman') {
      p.live = true;
      // Time to react counts from when he's fully in view with the gun up.
      p.fireAt = p.revealT + p.moveTime + rand(...O().fireDelay);
      p.aimAt.copy(this.view.camera.position);
      p.pose = 'aim';
    } else {
      p.pose = 'handsUp';
    }
  }

  update(nowMs) {
    if (this.state !== State.Running) return;
    const v = this.view;
    const dt = Math.min(0.05, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const t = (nowMs - this.t0) / 1000;
    const nowS = nowMs / 1000;
    const callT = O().callTime;

    // Camera: hold outside during the call, then walk in, then look around.
    let yaw = 0;
    if (this.phase === 'call' && t >= callT) this.phase = 'approach';
    const walkT = Math.max(0, t - callT);
    if (this.phase === 'room') {
      const rt = nowS - this.roomT0;
      yaw = Math.sin(rt * 0.45) * O().lookAround;
    }
    const arrived = v.placeCamera(this.phase === 'call' ? 0 : walkT, yaw);
    if (this.phase === 'approach' && arrived) {
      this.phase = 'room';
      this.roomT0 = nowS;
      this.caption = 'Clear the room. Engage only armed suspects.';
    }

    // Moving people into position.
    for (const p of v.people) {
      if (p.revealT == null || !p.to) continue;
      const k = Math.min(1, (nowS - p.revealT) / p.moveTime);
      if (!p.fall) {
        p.obj.position.lerpVectors(p.from, p.to, THREE.MathUtils.smoothstep(k, 0, 1));
        p.obj.position.y -= p.sag || 0; // hostage sagging in the gunman's grip
      }
      if (k >= 1 && p.current === 'walk') p.play('idle');
      // Face the shooter.
      p.obj.rotation.y = Math.atan2(v.camera.position.x - p.obj.position.x, v.camera.position.z - p.obj.position.z);
      if (p.role === 'gunman') p.aimAt.copy(v.camera.position).add(new THREE.Vector3(0, -0.25, 0));
    }

    if (this.phase === 'room') {
      const rt = nowS - this.roomT0;
      for (const ev of this.events) if (!ev.done && rt >= ev.t) { ev.done = true; this.reveal(ev, nowS); }

      // Armed men who stay up fire.
      for (const g of this.gunmen) {
        if (!g.live || g.down || g === this.hostagePair.taker) continue;
        if (nowS >= g.fireAt && !this.shotAt) {
          g.fire(nowS);
          enemyShot();
          this.shotAt = nowMs;
          this.penalties.push('you were shot');
          this.endAt = nowMs + 1500;
        }
      }

      // Hostage scene once the other gunmen are down (or after a while).
      const hp = this.hostagePair;
      const othersDown = this.gunmen.every(g => g === hp.taker || g.down);
      if (!hp.started && ((othersDown && this.events.every(e => e.done)) || rt > O().hostageLatest)) {
        hp.started = true;
        hp.cueAt = nowS + rand(1.0, 2.0);
      }
      if (hp.started && !hp.out && nowS >= hp.cueAt) {
        hp.out = true;
        this.caption = 'Hostage! Take the shot only if you can make it.';
        // They walk out of the office into the centre aisle, facing you. The
        // gunman is behind and a little to the side, so about half his head shows.
        const aisleX = Math.sign(hp.office.x) * O().hostageAisleX;
        const walk = Math.hypot(hp.office.doorX - aisleX, 38.0 - 34.0) / O().walkSpeed;
        v.openDoor(hp.office);
        for (const [p, dx, dz] of [[hp.hostage, 0, 0], [hp.taker, O().takerOffset, -0.32]]) {
          p.obj.visible = true;
          p.revealT = nowS + O().doorLead;
          p.from = new THREE.Vector3(hp.office.doorX + dx, 0, -38.0 + dz);
          p.to = new THREE.Vector3(aisleX + dx, 0, -34.0 + dz);
          p.moveTime = walk;
          p.play('walk');
        }
        hp.taker.live = true;
        hp.hostage.sag = O().hostageSag;
        hp.deadline = nowS + O().doorLead + walk + O().hostageTime;
      }
      if (hp.out && !hp.taker.down && !this.hostageKilledAt && nowS >= hp.deadline && !this.shotAt) {
        hp.taker.fire(nowS);
        enemyShot();
        this.hostageKilledAt = nowMs;
        hp.hostage.goDown(nowS, 'forward');
        this.penalties.push('hostage killed');
        this.endAt = nowMs + 1800;
      }

      // Done when every gunman is down.
      if (!this.endAt && this.gunmen.every(g => g.down)) this.endAt = nowMs + 2000;
    }

    if (this.endAt && nowMs >= this.endAt) this.finish();
  }

  onShot(score) {
    if (this.state !== State.Running) return;
    this.shots++;
    const p = score.person;
    if (!p) return;
    const nowS = score.t / 1000;
    if (p.role !== 'gunman' || !p.live) {
      const what = { victim: 'the wounded man', innocent: 'an office worker', hostage: 'the hostage' }[p.role] || 'a bystander';
      this.penalties.push(`no-shoot: hit ${what}`);
      if (p.role === 'hostage' && !p.down) { p.goDown(nowS, 'forward'); }
      return;
    }
    this.threatHits++;
    p.hits = (p.hits || 0) + 1;
    if (p.hits === 1) this.reactions.push(nowS - p.revealT);
    if (score.bodyZone === 'Head' || p.hits >= O().stopHits) {
      p.live = false;
      p.goDown(nowS, p.spot?.type === 'pod' ? 'drop' : 'back');
      if (p === this.hostagePair.taker) {
        const h = this.hostagePair.hostage;
        h.pose = 'handsUp';
        h.sag = 0;
        this.caption = 'Suspect down. Hostage safe.';
      }
    }
  }

  finish() {
    const reasons = [...new Set(this.penalties)];
    const stillUp = this.gunmen.filter(g => !g.down && g.obj.visible).length;
    if (stillUp && !reasons.includes('you were shot')) reasons.push(`suspects still up (${stillUp})`);
    const reaction = this.reactions.length ? this.reactions.reduce((a, b) => a + b, 0) / this.reactions.length : null;
    this.result = {
      datetime: new Date(),
      course: this.course.name,
      type: 'office3d',
      complete: true,
      time: null,
      reaction,
      shots: this.shots,
      hits: this.threatHits,
      points: 0,
      counts: { NS: this.penalties.filter(x => x.startsWith('no-shoot')).length },
      passed: reasons.length === 0,
      reasons,
      gunmen: this.gunmen.length,
      splits: [],
      early: 0,
      notes: reasons.join('; ') || `all ${this.gunmen.length} suspects stopped`,
    };
    this.state = State.Done;
    this.phase = 'done';
    this.emit();
  }

  drawOverlay(g, W, H, nowMs) {
    const flash = (at, text) => {
      const k = Math.max(0, 1 - (nowMs - at) / 1500);
      g.fillStyle = `rgba(160,0,0,${0.55 * Math.max(k, 0.2)})`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      g.font = `800 ${Math.round(H * 0.08)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, H * 0.45);
    };
    if (this.shotAt && this.state === State.Running) flash(this.shotAt, "YOU'VE BEEN SHOT");
    else if (this.hostageKilledAt && this.state === State.Running) flash(this.hostageKilledAt, 'HOSTAGE KILLED');
  }

  timerHTML(now) {
    const head = `<b class="title">ACTIVE SHOOTER · 3D</b>`;
    if (!this.view.ready) return head + `Loading 3D scene… ${Math.round(this.view.progress * 100)}%`;
    if (this.state === State.Running) {
      const label = { call: '<span class="wait">CALL</span>', approach: '<span class="wait">ENTERING</span>', room: '<span class="bad">ROOM</span>' }[this.phase] || '';
      const down = this.gunmen.filter(g => g.down).length;
      return head + `${label}\nSuspects down: ${down}\nRounds: ${this.shots}` +
        (this.penalties.length ? `\n<span class="bad">Penalties: ${this.penalties.length}</span>` : '');
    }
    if (this.state === State.Done) {
      const r = this.result;
      return head + (r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>') +
        `\nAvg reaction: ${r.reaction == null ? '--' : f2(r.reaction) + 's'}\nRounds: ${r.shots}\n<span class="muted small">[Space] again</span>`;
    }
    return head + 'Press [Space] to start';
  }

  panelHTML() {
    const head = `<b class="title">JUDGMENT · 3D</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (!this.view.ready) return head + `<b>${this.course.name}</b>\nLoading 3D scene… ${Math.round(this.view.progress * 100)}%`;
    if (this.state === State.Running) return head + `<b>${this.course.name}</b>\n<span class="muted">${this.caption}</span>`;
    if (this.state === State.Done) {
      const r = this.result;
      const lines = [`<b>${this.course.name}</b> — ${r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>'}`];
      if (r.passed) lines.push(`All ${r.gunmen} suspects stopped, no penalties.`);
      for (const x of r.reasons) lines.push(`<span class="bad">✗ ${x}</span>`);
      if (r.reaction != null) lines.push(`Avg reaction (appear → first hit): ${f2(r.reaction)}s`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${this.course.name}</b>\n<span class="muted">${this.course.desc}</span>\n` +
      `Armed suspects fire if left up ~2 s. ${O().stopHits} body hits or a head hit stops them.\n` + footer;
  }
}

// ---------------------------------------------------------------------------
// Small effects and procedural textures
// ---------------------------------------------------------------------------
function dust(scene, point) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(230,225,215,0.9)');
  gr.addColorStop(1, 'rgba(230,225,215,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.position.copy(point);
  scene.add(s);
  const t0 = performance.now() / 1000;
  const fx = { obj: s, done: false, update(now) {
    const k = (now - t0) / 0.5;
    if (k >= 1) { fx.done = true; return; }
    s.scale.setScalar(0.05 + k * 0.3);
    mat.opacity = 1 - k;
  } };
  return fx;
}

function bloodPool(scene, x, z) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const blob = (cx, cy, r) => {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = r * (0.8 + Math.sin(i * 1.7) * 0.08 + Math.random() * 0.12);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
  };
  g.fillStyle = 'rgba(92,6,8,0.95)';
  blob(128, 128, 90);
  blob(190, 150, 40);
  const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.map.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.015, z);
  scene.add(m);
  return m;
}

function tex(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function canvasOf(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function noise(g, size, alpha, n = 4000) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * alpha})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

const concrete = () => canvasOf(256, (g, s) => { g.fillStyle = '#a7a39b'; g.fillRect(0, 0, s, s); noise(g, s, 0.12, 9000); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s); });
const tiles = (a, b, n) => canvasOf(256, (g, s) => { const k = s / n * 2; for (let y = 0; y < s; y += k) for (let x = 0; x < s; x += k) { g.fillStyle = (x + y) / k % 2 ? a : b; g.fillRect(x, y, k, k); } noise(g, s, 0.05); g.strokeStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i <= s; i += k) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } });
// Acoustic ceiling tiles; a little emissive stands in for light bouncing off the floor.
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 144;
  const g = c.getContext('2d');
  g.fillStyle = '#23282e';
  g.fillRect(0, 0, 1024, 144);
  g.fillStyle = '#e8eef3';
  g.font = '700 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
