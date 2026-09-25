// popdrill.js — pop-up reaction drills.
// ---------------------------------------------------------------------------
// After a short stand-by, targets flip up one exposure at a time (one or two
// targets at once, in random lanes). Each has a limited time up. Hit it and
// it drops; be too slow and it drops on its own (a miss). Reaction time is
// target starts rising -> hit.
//
// Course fields (courses.js):
//   exposures   how many exposures
//   together    targets up at once per exposure (1 or 2)
//   upTime      seconds up; or [first, last] to shrink it over the drill
//   gap         [min, max] seconds between exposures
//   passPct     percent of targets that must be hit to pass

import { Runner, State, f2 } from './run.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class PopupRunner extends Runner {
  constructor(range) {
    super();
    this.range = range;
    this.clearRun();
  }

  clearRun() {
    this.done = 0;          // exposures started
    this.current = [];      // exposure records currently up
    this.records = [];
    this.nextAt = 0;
    this.shots = 0;
    this.misses = 0;
    this.points = 0;
    this.startT = 0;
    this.lastT = 0;
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    this.range.reset();
    this.startT = nowMs;
    this.nextAt = nowMs / 1000 + rand(1.5, 3.0);
    this.state = State.Running;
  }

  cancel() {
    super.cancel();
    this.range.reset();
  }

  upTimeFor(i) {
    const u = this.course.upTime;
    if (!Array.isArray(u)) return u;
    const k = this.course.exposures > 1 ? i / (this.course.exposures - 1) : 0;
    return u[0] + (u[1] - u[0]) * k;
  }

  update(nowMs) {
    if (this.state !== State.Running) return;
    const now = nowMs / 1000;
    const bank = this.range.popups;
    const c = this.course;

    // Current exposure resolved (every target hit or dropped)?
    if (this.current.length && this.current.every(r => r.hitAt != null || r.expired)) {
      this.current = [];
      if (this.done >= c.exposures) {
        this.lastT = nowMs;
        return this.finish();
      }
      this.nextAt = now + rand(...c.gap);
    }

    if (!this.current.length && now >= this.nextAt && this.done < c.exposures && !bank.anyUp) {
      const lanes = bank.downLanes().sort(() => Math.random() - 0.5).slice(0, c.together);
      const upTime = this.upTimeFor(this.done);
      this.current = lanes.map(l => bank.raise(l, upTime, now)).filter(Boolean);
      this.records.push(...this.current);
      this.done++;
    }
  }

  onShot(score) {
    if (this.state !== State.Running) return;
    this.shots++;
    this.points += score.points;
    if (score.kind !== 'popup') this.misses++;
  }

  finish() {
    const recs = this.records;
    const hits = recs.filter(r => r.hitAt != null);
    const reactions = hits.map(r => r.reaction);
    const avg = reactions.length ? reactions.reduce((a, b) => a + b, 0) / reactions.length : null;
    const pct = recs.length ? (hits.length / recs.length) * 100 : 0;
    this.result = {
      datetime: new Date(),
      course: this.course.name,
      type: 'popup',
      complete: true,
      time: (this.lastT - this.startT) / 1000,
      reaction: avg,
      fastest: reactions.length ? Math.min(...reactions) : null,
      targets: recs.length,
      targetsHit: hits.length,
      shots: this.shots,
      hits: hits.length,
      points: this.points,
      counts: { Miss: this.misses },
      passed: pct >= this.course.passPct,
      splits: [],
      early: 0,
      notes: `${hits.length}/${recs.length} targets hit; ${recs.length - hits.length} got away`,
    };
    this.state = State.Done;
    this.emit();
  }

  timerHTML() {
    const head = `<b class="title">POP-UPS</b>`;
    if (this.state === State.Running) {
      const hit = this.records.filter(r => r.hitAt != null).length;
      const last = [...this.records].reverse().find(r => r.reaction != null);
      return head + `<span class="go">LIVE</span>\nTarget ${Math.max(1, this.done)} of ${this.course.exposures}\n` +
        `Hit: ${hit}   Rounds: ${this.shots}\nLast reaction: ${last ? f2(last.reaction) + 's' : '--'}`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      return head + (r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>') +
        `\nHit: ${r.targetsHit}/${r.targets}\nAvg reaction: ${f2(r.reaction)}s\n<span class="muted small">[Space] run again</span>`;
    }
    return head + `Press [Space] to start\nHit each target before it drops.`;
  }

  panelHTML() {
    const c = this.course;
    const head = `<b class="title">DRILL · ${c.category.toUpperCase()}</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    const up = Array.isArray(c.upTime) ? `${c.upTime[0]}s → ${c.upTime[1]}s up` : `${c.upTime}s up`;
    if (this.state === State.Done) {
      const r = this.result;
      return head + `<b>${c.name}</b> — ${r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>'}\n` +
        `Targets hit: ${r.targetsHit}/${r.targets}  (need ${c.passPct}%)\n` +
        `Avg reaction: ${f2(r.reaction)}s   Fastest: ${f2(r.fastest)}s\n` +
        `Rounds: ${r.shots}   Points: ${r.points}\n` + footer;
    }
    return head + `<b>${c.name}</b>\n<span class="muted">${c.desc}</span>\n` +
      `${c.exposures} exposures${c.together > 1 ? ` of ${c.together}` : ''} · ${up}\n` + footer;
  }
}
