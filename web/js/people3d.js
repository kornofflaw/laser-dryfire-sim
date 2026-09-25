// people3d.js — realistic people for the 3D scenarios.
// ---------------------------------------------------------------------------
// Microsoft Rocketbox avatars (MIT licence), converted by
// tools/rocketbox_to_glb.py: bones renamed to the names char3d.js uses, so a
// Character built from one of these gets the same poses, hit zones, reactions
// and blood as any other model. Motion-captured clips (idle, look around,
// nervous, angry, walk, run, phone call) come in one file per sex and play
// directly on every avatar of that sex (same skeleton, no retargeting).
//
// load() fetches the whole cast once (about 12 MB, cached by the browser
// afterwards); rig(id) then gives { scene, clips, facing } for new Character().

import * as THREE from 'three';

const ASSETS = 'assets/3d/people/';

// id: file, sex, and a short description (for scenario scripts).
export const CAST = {
  m04: { sex: 'm', look: 'dark jacket' },
  m05: { sex: 'm', look: 'casual jacket' },
  m06: { sex: 'm', look: 'red jacket' },
  m09: { sex: 'm', look: 'dark T-shirt' },
  m12: { sex: 'm', look: 'jacket, jeans' },
  m17: { sex: 'm', look: 'blue hoodie' },
  m18: { sex: 'm', look: 'grey hoodie' },
  bm02: { sex: 'm', look: 'business suit' },
  f04: { sex: 'f', look: 'brown jacket' },
  f07: { sex: 'f', look: 'dark top' },
  f13: { sex: 'f', look: 'grey top, jeans' },
  bf01: { sex: 'f', look: 'business suit' },
};

export class People {
  constructor(gltfLoader) {
    this.loader = gltfLoader;
    this.models = {};
    this.anims = {};
    this.rigs = {};
  }

  async load(ids = Object.keys(CAST)) {
    const need = new Set(ids.map(id => CAST[id].sex));
    await Promise.all([
      ...[...need].map(async s => { this.anims[s] ??= await this.loader.loadAsync(`${ASSETS}anims_${s}.glb`); }),
      ...ids.map(async id => { this.models[id] ??= await this.loader.loadAsync(`${ASSETS}${id}.glb`); }),
    ]);
  }

  // { scene, clips, facing } for new Character(rig).
  rig(id) {
    if (this.rigs[id]) return this.rigs[id];
    const scene = this.models[id].scene;
    scene.traverse(o => {
      if (o.name === 'Bip01_HeadNub') o.name = 'HeadTop_End'; // older conversions
      if (!o.isMesh) return;
      // Hair and eyelash cards: cut out, not blended (no sorting problems).
      if (/opacity/i.test(o.material.name)) {
        o.material.alphaTest = 0.5;
        o.material.transparent = false;
        o.material.side = THREE.DoubleSide;
      }
    });
    const clips = inPlaceClips(this.anims[CAST[id].sex], scene);
    this.rigs[id] = { scene, clips, facing: 0 };
    return this.rigs[id];
  }
}

// The avatar's clips: rotations for every body bone it has, and the hips'
// height relative to this avatar's own standing height, held in place
// (the scene moves people, not the clips).
function inPlaceClips(animGltf, scene) {
  const names = new Set();
  let hips = null;
  scene.traverse(o => { if (o.isBone) names.add(o.name); if (o.name === 'Hips') hips = o; }); // bones only
  let srcHips = null;
  animGltf.scene.traverse(o => { if (o.name === 'Hips') srcHips = o; });
  const clips = {};
  for (const a of animGltf.animations) {
    const c = a.clone();
    c.tracks = c.tracks.filter(t => {
      const [node, prop] = t.name.split('.');
      if (!names.has(node)) return false;
      if (prop === 'quaternion') return true;
      return node === 'Hips' && prop === 'position';
    });
    for (const t of c.tracks) {
      if (t.name !== 'Hips.position') continue;
      const v = t.values;
      const dy = hips.position.y - (srcHips?.position.y ?? v[1]);
      for (let i = 0; i < v.length; i += 3) {
        v[i] = hips.position.x;
        v[i + 1] += dy;
        v[i + 2] = hips.position.z;
      }
    }
    clips[a.name] = c;
  }
  return clips;
}
