// game.js — session stats and the SINGLE scoring path (was GameManager.cs).
// ---------------------------------------------------------------------------
// registerScoredShot() is the only place points are added. Everything else
// (timer, drills, HUD, log) listens for the 'shot' event.
//
// ONE CLOCK: every timestamp in the app is performance.now() in milliseconds
// (the camera's frame capture time is on the same clock), so splits and
// first-shot times can be subtracted directly.

export class Game {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  reset() {
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.lastSplit = 0;
    this.lastShotT = null;
    this.sessionStart = null; // set on the first shot
  }

  get accuracy() { return this.shots > 0 ? (this.hits / this.shots) * 100 : 0; }
  get misses() { return this.shots - this.hits; }
  sessionTime(nowMs) { return this.sessionStart == null ? 0 : (nowMs - this.sessionStart) / 1000; }

  // score = { zone, points, targetId, local, nx, ny, t (ms), source }
  registerScoredShot(score) {
    if (this.sessionStart == null) this.sessionStart = score.t;
    this.shots++;
    if (score.zone !== 'Miss') this.hits++;
    this.score += score.points;
    if (this.lastShotT != null) this.lastSplit = (score.t - this.lastShotT) / 1000;
    this.lastShotT = score.t;
    for (const fn of this.listeners) fn(score);
  }
}
