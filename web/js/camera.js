// camera.js — finds the IR laser dot in the webcam feed (replaces the Python detector).
// ---------------------------------------------------------------------------
// With an IR-pass filter the frame is nearly black except for the laser flash,
// so "find the shot" = "find the brightest spot above the threshold".
//
// Each frame produces a `dot` in CAMERA PIXELS ({x, y, area, peak}) or null.
// Frame listeners get every dot (calibration uses that). In detect mode a
// rising edge (no dot -> dot) is ONE shot: it's mapped through the calibration
// homography to normalized screen coords and handed to onShot(nx, ny, tMs).
//
// Timestamps use the camera frame's capture time when the browser provides it
// (requestVideoFrameCallback), which is on the same performance.now() clock as
// everything else in the app.

import { CONFIG } from './config.js';
import { applyHomography } from './homography.js';

export class LaserCamera {
  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.work = document.createElement('canvas');
    this.wctx = this.work.getContext('2d', { willReadFrequently: true });

    this.stream = null;
    this.running = false;
    this.threshold = CONFIG.camera.threshold;
    this.H = null;            // calibration homography (camera px -> normalized screen)
    this.shotsEnabled = true; // turned off during calibration
    this.onShot = null;       // (nx, ny, tMs) => void
    this.frameListeners = new Set();
    this.preview = null;      // optional canvas to draw a debug view into
    this.inShot = false;
    this.lastDot = null;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsWindowStart = performance.now();
    this.error = '';
  }

  get active() { return this.running; }
  get calibrated() { return !!this.H; }

  onFrame(fn) { this.frameListeners.add(fn); return () => this.frameListeners.delete(fn); }

  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  static async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'videoinput');
  }

  async start(deviceId) {
    this.stop();
    this.error = '';
    const C = CONFIG.camera;
    const video = {
      width: { ideal: C.width },
      height: { ideal: C.height },
      frameRate: { ideal: C.fps },
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      this.error = e.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access for this site in the browser, then try again.'
        : `Could not open the camera (${e.name || e.message}).`;
      throw e;
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.inShot = false;
    this.scheduleFrame();
  }

  stop() {
    this.running = false;
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.lastDot = null;
    this.fps = 0;
  }

  get deviceId() {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId || '';
  }

  scheduleFrame() {
    if (!this.running) return;
    if ('requestVideoFrameCallback' in this.video) {
      this.video.requestVideoFrameCallback((now, meta) => {
        this.processFrame(meta.captureTime ?? meta.expectedDisplayTime ?? now);
        this.scheduleFrame();
      });
    } else {
      requestAnimationFrame(() => {
        this.processFrame(performance.now());
        this.scheduleFrame();
      });
    }
  }

  processFrame(tMs) {
    const v = this.video;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return;
    if (this.work.width !== w || this.work.height !== h) {
      this.work.width = w;
      this.work.height = h;
    }
    this.wctx.drawImage(v, 0, 0, w, h);
    const img = this.wctx.getImageData(0, 0, w, h);
    const dot = this.detect(img);
    this.lastDot = dot;

    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = (this.frameCount * 1000) / (now - this.fpsWindowStart);
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }

    for (const fn of this.frameListeners) fn(dot, tMs);

    // Rising edge = one shot.
    if (dot) {
      if (!this.inShot && this.shotsEnabled && this.H && this.onShot) {
        const p = applyHomography(this.H, dot.x, dot.y);
        if (p && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) this.onShot(p[0], p[1], tMs);
      }
      this.inShot = true;
    } else {
      this.inShot = false;
    }

    if (this.preview) this.drawPreview(img, dot);
  }

  // Brightest pixel, then a brightness-weighted centroid of above-threshold
  // pixels around it. Rejects specks (too small) and splashes (too big).
  detect(img) {
    const { data, width, height } = img;
    const thr = this.threshold;
    const C = CONFIG.camera;
    let maxL = -1, maxI = 0, brightCount = 0;
    const lum = this.lum && this.lum.length === width * height
      ? this.lum : (this.lum = new Uint8Array(width * height));
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      const L = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      lum[i] = L;
      if (L >= thr) brightCount++;
      if (L > maxL) { maxL = L; maxI = i; }
    }
    if (maxL < thr || brightCount > C.maxBlobArea) return null;

    const mx = maxI % width, my = (maxI / width) | 0;
    const r = C.blobRadius;
    let sw = 0, sx = 0, sy = 0, area = 0;
    for (let y = Math.max(0, my - r); y <= Math.min(height - 1, my + r); y++) {
      for (let x = Math.max(0, mx - r); x <= Math.min(width - 1, mx + r); x++) {
        const L = lum[y * width + x];
        if (L < thr) continue;
        const wgt = L - thr + 1;
        sw += wgt; sx += x * wgt; sy += y * wgt; area++;
      }
    }
    if (area < C.minBlobArea) return null;
    return { x: sx / sw, y: sy / sw, area, peak: maxL };
  }

  // Debug view: grayscale camera image, above-threshold pixels in red, and the
  // detected dot circled. When NOT shooting, it should be almost all dark.
  drawPreview(img, dot) {
    const cv = this.preview;
    const { width, height } = img;
    if (cv.width !== width || cv.height !== height) { cv.width = width; cv.height = height; }
    const g = cv.getContext('2d');
    const out = g.createImageData(width, height);
    const o = out.data, lum = this.lum, thr = this.threshold;
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      const L = lum[i];
      if (L >= thr) { o[p] = 255; o[p + 1] = 40; o[p + 2] = 40; }
      else { o[p] = o[p + 1] = o[p + 2] = L; }
      o[p + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    if (dot) {
      g.strokeStyle = '#3cf';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(dot.x, dot.y, 12, 0, Math.PI * 2);
      g.stroke();
    }
  }
}
