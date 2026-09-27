// post3d.js — screen-space effects that make 3D interiors look real.
// ---------------------------------------------------------------------------
// Ambient occlusion (GTAO: soft contact shadows in corners, under desks, where
// people stand), a faint bloom on bright light sources, then tone mapping and
// SMAA anti-aliasing. Settings are in CONFIG.post.
//
//   const post = new Post(renderer, scene, camera, { shadowLights, onResize });
//   post.setSize(w, h);  post.render();     // instead of renderer.render(...)
//
// Quality (Setup -> 3D graphics, CONFIG.post.quality): CONFIG.post.steps lists the
// levels from best to fastest (ambient occlusion, bloom, resolution cap,
// shadow map size). 'high' / 'medium' / 'low' pick one; 'auto' starts at the
// best and steps down whenever frames average slower than slowMs.
// Every level renders through the same composer, so switching never changes
// the scene's shaders (rendering straight to the screen instead would
// recompile every material: a freeze of a second or more mid-run).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { CONFIG } from './config.js';

const P = () => CONFIG.post;

export class Post {
  constructor(renderer, scene, camera, { shadowLights = [], onResize = null } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.shadowLights = shadowLights;
    this.onResize = onResize; // called after a resolution change
    const size = renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    this.ao.updateGtaoMaterial({ radius: P().aoRadius, distanceExponent: 2, thickness: 1, scale: 1, samples: 16 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
    this.ao.blendIntensity = P().aoIntensity;
    // The AO pass draws the scene's depth and normals with every visible
    // object as solid, so see-through things (smoke and dust sprites, bullet
    // hole and blood decals, glass) came out as dark squares. Hide them from
    // it, like it already hides points and lines.
    this.ao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse(o => {
        if (!o.visible) return;
        const m = o.material;
        const seeThrough = o.isSprite || o.isPoints || o.isLine || o.isLine2 ||
          (m && !Array.isArray(m) && m.transparent && m.depthWrite === false);
        if (seeThrough) { o.visible = false; cache.push(o); }
      });
    };
    composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(size, P().bloomStrength, 0.4, P().bloomThreshold);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.smaa = new SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
    composer.addPass(this.smaa);
    this.composer = composer;
    this.reset();
  }

  // Back to the level the chosen quality starts at.
  reset() {
    this.step = P().enabled ? (P().modes[P().quality] ?? 0) : P().steps.length - 1;
    this.frames = this.sum = this.last = 0;
    this.apply();
  }

  apply() {
    const s = P().steps[this.step];
    this.ao.enabled = s.ao;
    this.bloom.enabled = s.bloom;
    const dpr = Math.min(window.devicePixelRatio || 1, s.dpr);
    if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
      this.renderer.setPixelRatio(dpr);
      const size = this.renderer.getSize(new THREE.Vector2());
      this.setSize(size.x, size.y);
      this.onResize?.();
    }
    for (const l of this.shadowLights) {
      if (l.shadow.mapSize.x === s.shadow) continue;
      l.shadow.mapSize.set(s.shadow, s.shadow);
      l.shadow.map?.dispose();
      l.shadow.map = null; // made again at the new size (no shader change)
      l.shadow.needsUpdate = true;
    }
    this.levelName = s.name;
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  // Auto: step down to the next level that actually saves something.
  slower() {
    const steps = P().steps, cur = steps[this.step], dprNow = this.renderer.getPixelRatio();
    for (let i = this.step + 1; i < steps.length; i++) {
      const s = steps[i];
      if (s.ao !== cur.ao || s.bloom !== cur.bloom || s.shadow !== cur.shadow || Math.min(window.devicePixelRatio || 1, s.dpr) < dprNow - 0.01) {
        this.step = i;
        this.apply();
        return;
      }
    }
    this.step = steps.length - 1;
  }

  render() {
    const now = performance.now();
    if (this.last && P().quality === 'auto') {
      const dt = now - this.last;
      if (dt < 250) { this.sum += dt; this.frames++; }
      if (this.frames >= P().checkFrames) {
        if (this.sum / this.frames > P().slowMs && this.step < P().steps.length - 1) this.slower();
        this.frames = this.sum = 0;
      }
    }
    this.last = now;
    this.composer.render();
  }
}
