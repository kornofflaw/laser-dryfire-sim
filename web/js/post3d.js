// post3d.js — screen-space effects that make 3D interiors look real.
// ---------------------------------------------------------------------------
// Ambient occlusion (GTAO: soft contact shadows in corners, under desks, where
// people stand), a faint bloom on bright light sources, then tone mapping and
// SMAA anti-aliasing. Settings are in CONFIG.post.
//
//   const post = new Post(renderer, scene, camera);
//   post.setSize(w, h);  post.render();     // instead of renderer.render(...)
//
// If frames get slow (average over CONFIG.post.checkFrames above slowMs) it
// drops the ambient occlusion, then everything, and just renders plainly.

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
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.level = P().enabled ? 2 : 0; // 2 = AO + bloom, 1 = bloom only, 0 = plain
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
    this.frames = 0;
    this.sum = 0;
    this.last = 0;
    this.apply();
  }

  apply() {
    this.ao.enabled = this.level >= 2;
    this.bloom.enabled = this.level >= 1;
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render() {
    const now = performance.now();
    if (this.last) {
      const dt = now - this.last;
      if (dt < 250) { this.sum += dt; this.frames++; }
      if (this.frames >= P().checkFrames) {
        if (this.sum / this.frames > P().slowMs && this.level > 0) { this.level--; this.apply(); }
        this.frames = this.sum = 0;
      }
    }
    this.last = now;
    if (this.level === 0) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }
}
