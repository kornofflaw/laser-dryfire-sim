// calibrate.js — guided 4-point calibration (replaces calibrate.py).
// ---------------------------------------------------------------------------
// Shows a black screen with one crosshair at a time, INSET from each corner.
// Shoot each one; the camera position of the dot is recorded, and a homography
// maps camera pixels -> those inset screen positions. Then shoot the centre
// crosshair to measure accuracy, and save.
//
// The page must fill the projected image (use Fullscreen) both while
// calibrating and while training, or the mapping will be off.
//
// Keys: B = redo previous corner, R = restart, Esc = cancel,
//       (validate) Enter/S = save, T = test again.

import { CONFIG } from './config.js';
import { computeHomography, applyHomography } from './homography.js';

const K = CONFIG.calibration;
const CORNERS = [
  ['TOP-LEFT', K.inset, K.inset],
  ['TOP-RIGHT', 1 - K.inset, K.inset],
  ['BOTTOM-RIGHT', 1 - K.inset, 1 - K.inset],
  ['BOTTOM-LEFT', K.inset, 1 - K.inset],
];

// Averages the dot over a few frames and refuses to re-arm until the image
// goes dark again, so one shot = one capture.
class Capturer {
  constructor() { this.reset(); }
  reset() { this.armed = false; this.dark = 0; this.acc = []; }
  feed(dot) {
    if (!this.armed) {
      if (!dot) { if (++this.dark >= K.cooldownFrames) this.armed = true; }
      else this.dark = 0;
      return null;
    }
    if (dot) {
      this.acc.push([dot.x, dot.y]);
      return this.acc.length >= K.accumFrames ? this.finalize() : null;
    }
    return this.acc.length ? this.finalize() : null;
  }
  finalize() {
    const n = this.acc.length;
    const x = this.acc.reduce((s, p) => s + p[0], 0) / n;
    const y = this.acc.reduce((s, p) => s + p[1], 0) / n;
    this.reset();
    return [x, y];
  }
}

export class Calibration {
  // onDone(H or null) is called when the user saves or cancels.
  constructor(camera, onDone) {
    this.camera = camera;
    this.onDone = onDone;
    this.el = document.getElementById('calib');
    this.canvas = this.el.querySelector('canvas');
    this.active = false;
    this.el.querySelector('[data-act="save"]').onclick = () => this.save();
    this.el.querySelector('[data-act="test"]').onclick = () => this.testAgain();
    this.el.querySelector('[data-act="restart"]').onclick = () => this.restart();
    this.el.querySelector('[data-act="cancel"]').onclick = () => this.cancel();
  }

  open() {
    this.active = true;
    this.el.hidden = false;
    this.camera.shotsEnabled = false;
    this.unsub = this.camera.onFrame(dot => this.feed(dot));
    this.restart();
    this.loop();
  }

  close(result) {
    this.active = false;
    this.el.hidden = true;
    this.camera.shotsEnabled = true;
    if (this.unsub) this.unsub();
    this.onDone(result);
  }

  restart() {
    this.state = 'capture';
    this.points = [];
    this.H = null;
    this.errPx = null;
    this.capturer = new Capturer();
    this.updateButtons();
  }

  redoPrevious() {
    if (this.state !== 'capture' || !this.points.length) return;
    this.points.pop();
    this.capturer.reset();
  }

  testAgain() {
    if (this.state !== 'validate') return;
    this.errPx = null;
    this.capturer.reset();
  }

  save() { if (this.state === 'validate' && this.H) this.close(this.H); }
  cancel() { this.close(null); }

  handleKey(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') this.cancel();
    else if (k === 'r') this.restart();
    else if (k === 'b') this.redoPrevious();
    else if (k === 't') this.testAgain();
    else if (k === 'enter' || k === 's') this.save();
    else return false;
    return true;
  }

  feed(dot) {
    const hit = this.capturer.feed(dot);
    if (!hit) return;
    if (this.state === 'capture') {
      this.points.push(hit);
      if (this.points.length === CORNERS.length) {
        this.H = computeHomography(this.points, CORNERS.map(c => [c[1], c[2]]));
        if (!this.H) { this.restart(); this.message = 'Calibration failed (shots too close together). Try again.'; return; }
        this.state = 'validate';
        this.updateButtons();
      }
    } else if (this.state === 'validate') {
      const p = applyHomography(this.H, hit[0], hit[1]);
      if (!p) return;
      const W = window.innerWidth, Hh = window.innerHeight;
      this.errPx = Math.hypot((p[0] - 0.5) * W, (p[1] - 0.5) * Hh);
      this.lastTest = p;
    }
  }

  updateButtons() {
    const v = this.state === 'validate';
    this.el.querySelector('[data-act="save"]').hidden = !v;
    this.el.querySelector('[data-act="test"]').hidden = !v;
    this.message = '';
  }

  loop() {
    if (!this.active) return;
    this.draw();
    requestAnimationFrame(() => this.loop());
  }

  draw() {
    const cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const pulse = (Math.sin(performance.now() / 180) + 1) / 2;

    let lines;
    if (this.state === 'capture') {
      const active = this.points.length;
      CORNERS.forEach(([, nx, ny], i) => {
        if (i < active) crosshair(g, nx * W, ny * H, '#3cdc3c', 22, 2);
        else if (i === active) crosshair(g, nx * W, ny * H, '#ffc83c', 26 + 8 * pulse, 3);
        else crosshair(g, nx * W, ny * H, '#5a5a5a', 18, 2);
      });
      lines = [
        `SHOOT THE HIGHLIGHTED CROSSHAIR  (${active}/4)`,
        `Active: ${CORNERS[active][0]}`,
        'B = redo previous    R = restart    Esc = cancel',
      ];
    } else {
      crosshair(g, W / 2, H / 2, '#ffc83c', 28, 3);
      lines = ['VALIDATE: shoot the CENTRE crosshair'];
      if (this.errPx != null) {
        const q = this.errPx < K.goodErrorPx ? 'great' : this.errPx < K.okErrorPx ? 'ok' : 'redo recommended';
        lines.push(`Error: ~${this.errPx.toFixed(0)} px  [${q}]`);
        if (this.lastTest) {
          g.fillStyle = '#ff5a5a';
          g.beginPath();
          g.arc(this.lastTest[0] * W, this.lastTest[1] * H, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
      lines.push('Enter = save    T = test again    R = restart    Esc = cancel');
    }
    if (this.message) lines.push(this.message);
    if (!this.camera.active) lines.push('Camera is not running. Cancel and start it in Setup.');

    g.textAlign = 'center';
    g.textBaseline = 'top';
    let y = H * 0.3;
    lines.forEach((t, i) => {
      g.font = i === 0 ? '600 28px system-ui, sans-serif' : '18px system-ui, sans-serif';
      g.fillStyle = i === 0 ? '#fff' : '#aaa';
      g.fillText(t, W / 2, y);
      y += i === 0 ? 44 : 30;
    });
  }
}

function crosshair(g, x, y, color, r, thick) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = thick;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(x - r - 8, y); g.lineTo(x - r + 4, y);
  g.moveTo(x + r - 4, y); g.lineTo(x + r + 8, y);
  g.moveTo(x, y - r - 8); g.lineTo(x, y - r + 4);
  g.moveTo(x, y + r - 4); g.lineTo(x, y + r + 8);
  g.stroke();
}
