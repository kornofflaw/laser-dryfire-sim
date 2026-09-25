// run.js — shot timer + drills (was ShotTimer.cs + DrillRunner.cs).
// ---------------------------------------------------------------------------
// Range-style timer: random delay -> start beep -> par beep. The selected drill
// decides how many rounds complete the run and what counts as a pass.
//
//   * Shots during the random delay are counted as EARLY (jumped the beep)
//     rather than silently dropped.
//   * A drill with requiredShots > 0 ends when that many rounds are fired, or
//     incompleteGrace seconds after par if they never are (counted as a fail).
//   * requiredShots 0 (Free Run) ends at the par beep.

import { CONFIG } from './config.js';
import { startBeep, parBeep } from './audio.js';

export const State = { Idle: 'Idle', Delay: 'Delay', Running: 'Running', Done: 'Done' };

export class RunController {
  constructor(game) {
    this.state = State.Idle;
    this.drillIndex = 0;
    this.result = null;
    this.listeners = new Set();
    this.clearRun();
    game.on(score => this.onShot(score));
  }

  onComplete(fn) { this.listeners.add(fn); }

  get drill() { return CONFIG.drills[this.drillIndex]; }
  get usesCriteria() {
    const d = this.drill;
    return (d.minAHits || 0) > 0 || (d.minBodyHits || 0) > 0 || (d.minHeadHits || 0) > 0;
  }
  get busy() { return this.state === State.Delay || this.state === State.Running; }

  cycleDrill(step = 1) {
    if (this.busy) return; // can't swap mid-attempt
    const n = CONFIG.drills.length;
    this.drillIndex = (this.drillIndex + step + n) % n;
    this.result = null;
    this.state = State.Idle;
  }

  clearRun() {
    this.beepAt = 0;
    this.runStart = 0;
    this.parPlayed = false;
    this.shotTimes = [];     // seconds from the beep
    this.early = 0;
    this.points = 0;
    this.counts = { A: 0, C: 0, D: 0, Head: 0, Miss: 0 };
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    const T = CONFIG.timer;
    const delay = T.minDelay + Math.random() * (T.maxDelay - T.minDelay);
    this.beepAt = nowMs + delay * 1000;
    this.state = State.Delay;
  }

  cancel() {
    if (!this.busy) return;
    this.state = State.Idle;
    this.clearRun();
  }

  // Called every animation frame.
  update(nowMs) {
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;

    const elapsed = this.elapsed(nowMs);
    const d = this.drill;
    if (!this.parPlayed && elapsed >= d.parTime) {
      this.parPlayed = true;
      parBeep();
      if (d.requiredShots === 0) this.finish(true);
    }
    if (this.state === State.Running && d.requiredShots > 0 &&
        elapsed >= d.parTime + CONFIG.timer.incompleteGrace) {
      this.finish(false);
    }
  }

  elapsed(nowMs) { return (nowMs - this.runStart) / 1000; }
  parRemaining(nowMs) {
    return this.state === State.Running ? Math.max(0, this.drill.parTime - this.elapsed(nowMs)) : 0;
  }

  onShot(score) {
    if (this.state === State.Delay) { this.early++; return; }
    if (this.state !== State.Running) return;

    // A camera frame can be captured a hair before the beep frame; clamp to 0.
    this.shotTimes.push(Math.max(0, (score.t - this.runStart) / 1000));
    this.points += score.points;
    this.counts[score.zone]++;

    const d = this.drill;
    if (d.requiredShots > 0 && this.shotTimes.length >= d.requiredShots) this.finish(true);
  }

  get shots() { return this.shotTimes.length; }
  get hits() { return this.shots - this.counts.Miss; }
  get bodyHits() { return this.counts.A + this.counts.C + this.counts.D; }
  get firstShot() { return this.shotTimes.length ? this.shotTimes[0] : null; }
  get lastSplit() {
    const s = this.shotTimes;
    return s.length >= 2 ? s[s.length - 1] - s[s.length - 2] : null;
  }

  finish(complete) {
    const d = this.drill;
    const s = this.shotTimes;
    // Drill time = beep -> last shot. Free Run uses the same measure.
    const time = s.length ? s[s.length - 1] : 0;
    const splits = s.slice(1).map((t, i) => t - s[i]);
    const hasCriteria = this.usesCriteria;
    const passedCriteria =
      this.counts.A >= (d.minAHits || 0) &&
      this.bodyHits >= (d.minBodyHits || 0) &&
      this.counts.Head >= (d.minHeadHits || 0);
    const madePar = complete && s.length > 0 && time <= d.parTime;

    this.result = {
      datetime: new Date(),
      drill: d.name,
      requiredShots: d.requiredShots,
      parTime: d.parTime,
      complete,
      time,
      firstShot: this.firstShot,
      splits,
      shots: s.length,
      hits: this.hits,
      points: this.points,
      counts: { ...this.counts },
      bodyHits: this.bodyHits,
      hitFactor: time > 0.0001 ? this.points / time : 0,
      madePar,
      hasCriteria,
      passedCriteria,
      // Free Run has no pass/fail; drills need par (+ criteria if defined).
      passed: d.requiredShots === 0 ? null : complete && madePar && passedCriteria,
      early: this.early,
    };
    this.state = State.Done;
    for (const fn of this.listeners) fn(this.result);
  }
}
