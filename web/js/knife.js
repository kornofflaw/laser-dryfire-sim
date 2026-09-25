// knife.js — parking-lot knife attack (a Tueller-style drill with judgment).
// ---------------------------------------------------------------------------
// A man with a knife stands ~30 ft away. After a random wait he charges,
// accelerating to a sprint. Stop him before he reaches you or you're
// stabbed. Distances and speeds are real-world (config.knife), and he's drawn
// with true perspective, so he grows the way a charging person does.
//
//   Shooting (or hitting him) before he charges: PREMATURE -> fail.
//   A head hit stops him at once; otherwise it takes `stopHits` body hits.
//   Once stopped, momentum carries him a little before he goes down.
//   Reaching `reach` metres while not stopped: STABBED -> fail.

import { CONFIG } from './config.js';
import { Runner, State, f2 } from './run.js';
import { dressActor } from './scenarios.js';
import { footstep, penaltyBuzz } from './audio.js';

const K = () => CONFIG.knife;
const rand = ([a, b]) => a + Math.random() * (b - a);
const FT = 3.28084;

export class KnifeRunner extends Runner {
  constructor(range) {
    super();
    this.range = range;
    this.clearRun();
  }

  clearRun() {
    this.man = null;
    this.phase = 'idle';   // standing | charging | stopping | down | stabbed
    this.d = 0;            // metres from the shooter
    this.v = 0;
    this.x0 = 0;           // lateral offset at the start (metres)
    this.shots = 0;
    this.hits = 0;
    this.premature = 0;
    this.chargeAt = 0;
    this.firstShot = null;
    this.stopAt = null;
    this.stopDist = null;
    this.stabAt = null;
    this.endAt = null;
    this.lastMs = 0;
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    this.range.reset();
    const k = K();
    this.d = rand(k.startFeet) / FT;
    this.d0 = this.d;
    this.x0 = (Math.random() - 0.5) * 1.6;
    this.accel = rand(k.accel);
    this.top = rand(k.topSpeed);
    this.chargeAt = nowMs + rand(k.waitTime) * 1000;
    this.man = this.range.addActor(dressActor({ x: 0.5, pose: 'knife' }));
    this.man.stride = 0;
    this.phase = 'standing';
    this.lastMs = nowMs;
    this.place();
    this.state = State.Running;
  }

  cancel() {
    super.cancel();
    this.range.reset();
    this.clearRun();
  }

  // Perspective: size and position from distance.
  place() {
    const k = K();
    const W = this.range.width, H = this.range.height;
    const f = k.focalFrac * H;
    const d = Math.max(0.35, this.d);
    const hPx = (f * k.personHeight) / d;
    const feet = k.horizonY * H + (f * k.eyeHeight) / d;
    const lateral = this.x0 * (this.d / this.d0); // he closes on you, not on a line
    this.man.heightPx = hPx;
    this.man.cx = 0.5 + (f * lateral) / d / W;
    this.man.cy = (feet - hPx / 2) / H;
  }

  update(nowMs) {
    if (this.state !== State.Running) return;
    const k = K();
    const dt = Math.min(0.05, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const m = this.man;

    if (this.phase === 'standing') {
      m.stride = Math.sin(nowMs / 700) * 0.15; // shifting weight
      if (nowMs >= this.chargeAt) {
        this.phase = 'charging';
        m.pose = 'charge';
        this.chargeAt = nowMs;
      }
    } else if (this.phase === 'charging') {
      this.v = Math.min(this.top, this.v + this.accel * dt);
      this.d -= this.v * dt;
      const before = m.stride;
      m.stride += (dt * Math.PI) / k.strideTime * Math.max(0.35, this.v / this.top);
      if (Math.floor(m.stride / Math.PI) !== Math.floor(before / Math.PI)) footstep(Math.min(1, 2.5 / this.d));
      if (this.d <= k.reach) {
        this.phase = 'stabbed';
        this.stabAt = nowMs;
        penaltyBuzz();
        this.endAt = nowMs + 1500;
      }
    } else if (this.phase === 'stopping') {
      this.v = Math.max(0, this.v - k.stumbleDecel * dt);
      this.d = Math.max(0.5, this.d - this.v * dt);
      m.stride += dt * 4 * (this.v / this.top);
      if (this.v <= 0.2 && m.downAt == null) {
        m.downAt = nowMs / 1000;
        this.phase = 'down';
        this.endAt = nowMs + 1200;
      }
    }
    this.place();
    if (this.endAt && nowMs >= this.endAt) this.finish();
  }

  onShot(score) {
    if (this.state !== State.Running) return;
    this.shots++;
    if (this.phase === 'standing') {
      this.premature++;
      return;
    }
    if (this.phase !== 'charging') return;
    if (this.firstShot == null) this.firstShot = (score.t - this.chargeAt) / 1000;
    if (score.kind !== 'actor' || !score.threat) return;
    this.hits++;
    if (score.bodyZone === 'Head' || this.hits >= K().stopHits) {
      this.phase = 'stopping';
      this.man.stopped = true;
      this.stopAt = (score.t - this.chargeAt) / 1000;
      this.stopDist = this.d;
    }
  }

  finish() {
    const reasons = [];
    if (this.premature) reasons.push(`premature: fired ${this.premature}x before he charged`);
    if (this.stabAt) reasons.push(`stabbed (he closed ${((this.d0 - this.d) * FT).toFixed(0)} ft)`);
    this.result = {
      datetime: new Date(),
      course: this.course.name,
      type: 'knife',
      complete: true,
      time: this.stopAt,
      reaction: this.firstShot,
      shots: this.shots,
      hits: this.hits,
      points: 0,
      counts: { NS: this.premature },
      startFt: this.d0 * FT,
      stopFt: this.stopDist == null ? null : this.stopDist * FT,
      passed: reasons.length === 0 && this.stopAt != null,
      reasons,
      splits: [],
      early: 0,
      notes: reasons.join('; ') || `stopped at ${(this.stopDist * FT).toFixed(1)} ft`,
    };
    this.state = State.Done;
    this.emit();
  }

  // Red flash when stabbed.
  drawOverlay(g, W, H, nowMs) {
    if (!this.stabAt) return;
    const k = Math.max(0, 1 - (nowMs - this.stabAt) / 1500);
    if (k <= 0 && this.state === State.Done) return;
    g.fillStyle = `rgba(160,0,0,${0.55 * Math.max(k, 0.25)})`;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = `800 ${Math.round(H * 0.09)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STABBED', W / 2, H * 0.45);
  }

  timerHTML(now) {
    const head = `<b class="title">KNIFE ATTACK</b>`;
    if (this.state === State.Running) {
      const ft = (this.d * FT).toFixed(0);
      if (this.phase === 'standing') return head + `<span class="wait">CONTACT</span>\nDistance: ${ft} ft\nHe's holding a knife.`;
      return head + `<span class="bad">CHARGING</span>\nDistance: ${ft} ft\n` +
        `Speed: ${(this.v * 2.237).toFixed(0)} mph\nFirst shot: ${this.firstShot == null ? '--' : f2(this.firstShot) + 's'}`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      return head + (r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>') +
        `\nFirst shot: ${r.reaction == null ? '--' : f2(r.reaction) + 's'}\n` +
        `Stopped at: ${r.stopFt == null ? '--' : r.stopFt.toFixed(1) + ' ft'}\n<span class="muted small">[Space] again</span>`;
    }
    return head + `Press [Space] to start`;
  }

  panelHTML() {
    const head = `<b class="title">JUDGMENT</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (this.state === State.Done) {
      const r = this.result;
      const lines = [`<b>${this.course.name}</b> — ${r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>'}`];
      if (r.passed) lines.push(`Stopped him at ${r.stopFt.toFixed(1)} ft (started at ${r.startFt.toFixed(0)} ft).`);
      for (const x of r.reasons) lines.push(`<span class="bad">✗ ${x}</span>`);
      lines.push(`Charge → first shot: ${f2(r.reaction)}s   → stopped: ${f2(r.time)}s`);
      lines.push(`Rounds: ${r.shots}   Hits: ${r.hits}`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${this.course.name}</b>\n<span class="muted">${this.course.desc}</span>\n` +
      `Don't fire until he charges. A head hit or ${K().stopHits} body hits stop him.\n` + footer;
  }
}
