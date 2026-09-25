// scenario.js — plays a shoot / no-shoot scene and grades every shot.
// ---------------------------------------------------------------------------
// Flow: Space -> blank range for a random moment -> the scene appears and
// its timeline plays (people turn, reveal what's in their hands, surrender,
// walk). Each shot is judged against the person's pose AT THAT MOMENT:
//
//   hit on someone holding a gun        correct; after N hits they go down
//   hit on someone about to draw a gun  PREMATURE (they weren't a threat yet)
//   hit on someone who surrendered      SHOT AFTER SURRENDER
//   hit on anyone else                  NO-SHOOT HIT
//   shot before the scene appears       PREMATURE
//   armed person still up at the end    THREAT NOT STOPPED
//
// Any of those = FAIL. Reaction time = the gun appearing -> first hit on that
// person (the earliest one if there are several threats).

import { CONFIG } from './config.js';
import { SCENARIOS, dressActor } from './scenarios.js';
import { Runner, State, f2 } from './run.js';

export class ScenarioRunner extends Runner {
  constructor(range) {
    super();
    this.range = range;
    this.clearRun();
  }

  clearRun() {
    this.scene = null;
    this.template = null;
    this.actors = [];
    this.pending = [];
    this.sceneStart = 0;
    this.lastResolvedAt = null;
    this.penalties = [];
    this.shots = 0;
    this.threatHits = 0;
    this.misses = 0;
    this.reactions = [];
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    this.range.reset();
    const id = this.course.template;
    this.template = id ? SCENARIOS.find(s => s.id === id) : SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    this.scene = this.template.build();
    this.scene.duration = Math.min(this.scene.duration, CONFIG.scenario.maxDuration);
    const S = CONFIG.scenario;
    this.sceneStart = nowMs + (S.standbyMin + Math.random() * (S.standbyMax - S.standbyMin)) * 1000;
    this.state = State.Delay;
  }

  cancel() {
    super.cancel();
    this.range.reset();
    this.clearRun();
  }

  // Scene clock in seconds.
  t(nowMs) { return (nowMs - this.sceneStart) / 1000; }

  update(nowMs) {
    if (this.state === State.Delay && nowMs >= this.sceneStart) {
      // Scene appears.
      this.actors = this.scene.actors.map(spec => {
        const a = this.range.addActor(dressActor(spec));
        a.revealAt = spec.pose === 'gun' ? this.sceneStart : null; // ms when they became a threat
        a.surrendered = false;
        a.everThreat = spec.pose === 'gun';
        return a;
      });
      this.pending = [...this.scene.events].sort((a, b) => a.t - b.t);
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;

    const t = this.t(nowMs);
    while (this.pending.length && this.pending[0].t <= t) {
      const ev = this.pending.shift();
      const a = this.actors[ev.actor];
      if (!a || a.downAt != null || !a.alive) continue;
      const wasThreat = a.pose === 'gun';
      a.pose = ev.pose;
      if (ev.pose === 'gun' && !wasThreat) {
        a.revealAt = this.sceneStart + ev.t * 1000; // the scheduled moment, not the frame
        a.everThreat = true;
      }
      if (ev.pose === 'surrender' && wasThreat) a.surrendered = true;
    }

    // End when the script is done and nobody armed is still up, after a short
    // hold, or at the scene's duration.
    const threatsUp = this.actors.some(a => a.alive && a.downAt == null && a.pose === 'gun');
    if (!this.pending.length && !threatsUp) {
      if (this.lastResolvedAt == null) this.lastResolvedAt = nowMs;
      if ((nowMs - this.lastResolvedAt) / 1000 >= CONFIG.scenario.endGrace) return this.finish(nowMs);
    } else {
      this.lastResolvedAt = null;
    }
    if (t >= this.scene.duration) this.finish(nowMs);
  }

  onShot(score) {
    if (this.state === State.Delay) {
      this.shots++;
      this.penalties.push('premature: fired before the scene started');
      return;
    }
    if (this.state !== State.Running) return;
    this.shots++;
    if (score.kind !== 'actor') { this.misses++; return; }

    const a = this.actors.find(x => x.id === score.targetId);
    if (!a) return;
    if (score.threat) {
      this.threatHits++;
      a.hits++;
      if (a.hits === 1 && a.revealAt != null) this.reactions.push((score.t - a.revealAt) / 1000);
      if (a.hits >= CONFIG.scenario.neutralizeHits) a.downAt = score.t / 1000;
      return;
    }
    const willDraw = this.pending.some(e => e.actor === this.actors.indexOf(a) && e.pose === 'gun');
    if (a.surrendered) this.penalties.push('shot after surrender');
    else if (willDraw) this.penalties.push('premature: shot before a gun appeared');
    else this.penalties.push(`no-shoot hit (${poseLabel(a.pose)})`);
  }

  finish() {
    const stillUp = this.actors.filter(a => a.pose === 'gun' && a.downAt == null).length;
    const reasons = [...this.penalties];
    if (stillUp) reasons.push(`threat not stopped (${stillUp})`);
    const anyThreat = this.actors.some(a => a.everThreat);
    const reaction = this.reactions.length ? Math.min(...this.reactions) : null;

    this.result = {
      datetime: new Date(),
      course: this.course.template ? this.course.name : `${this.course.name}: ${this.template.name}`,
      scene: this.template.name,
      type: 'scenario',
      complete: true,
      time: null,
      reaction,
      shots: this.shots,
      hits: this.threatHits,
      points: 0,
      counts: { NS: this.penalties.length, Miss: this.misses },
      passed: reasons.length === 0,
      anyThreat,
      reasons,
      splits: [],
      early: 0,
      notes: reasons.join('; ') || (anyThreat ? 'threat stopped' : 'correctly held fire'),
    };
    this.state = State.Done;
    this.emit();
  }

  timerHTML(now) {
    const head = `<b class="title">SCENARIO</b>`;
    if (this.state === State.Delay) return head + `<span class="wait">STAND BY…</span>\nwatch the range`;
    if (this.state === State.Running) {
      return head + `<span class="go">LIVE</span>\nTime: ${Math.max(0, this.t(now)).toFixed(1)}s\n` +
        `Shots: ${this.shots}` + (this.penalties.length ? `\n<span class="bad">Penalties: ${this.penalties.length}</span>` : '');
    }
    if (this.state === State.Done) {
      const r = this.result;
      return head + (r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>') +
        `\nReaction: ${r.reaction == null ? '--' : f2(r.reaction) + 's'}\nShots: ${r.shots}\n` +
        `<span class="muted small">[Space] next scene</span>`;
    }
    return head + `Press [Space] to start\nShoot only a visible gun.`;
  }

  panelHTML() {
    const head = `<b class="title">JUDGMENT</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (this.busy) {
      return head + `<span class="go">${this.template.name}</span>\n<span class="muted">${this.template.desc}</span>`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      const lines = [`<b>${r.scene}</b> — ${r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>'}`];
      if (r.passed) lines.push(r.anyThreat ? 'Threat stopped. No penalties.' : 'No threat. Correctly held fire.');
      for (const x of r.reasons) lines.push(`<span class="bad">✗ ${x}</span>`);
      if (r.reaction != null) lines.push(`Reaction: ${f2(r.reaction)}s (gun seen → first hit)`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${this.course.name}</b>\n<span class="muted">${this.course.desc}</span>\n` +
      `A threat is someone showing a gun. ${CONFIG.scenario.neutralizeHits} hits stop them.\n` + footer;
  }
}

function poseLabel(pose) {
  return { back: 'turned away', empty: 'empty hands', phone: 'phone', wallet: 'wallet', surrender: 'hands up' }[pose] || pose;
}
