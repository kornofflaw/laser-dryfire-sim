// dots.js — Dot Torture: 50 rounds on 10 small dots, stage by stage, untimed.
// ---------------------------------------------------------------------------
// Each round has one correct dot (the sequence comes from DOT_TORTURE in
// courses.js). A round counts only if it lands in THAT dot. judge() turns a
// hit on the wrong dot into a miss before it's registered, so the session
// score and the sounds agree with the drill.

import { DOT_TORTURE } from './courses.js';
import { Runner, State, f2 } from './run.js';
import { startBeep } from './audio.js';

// Expand the stages into one entry per round.
function expand() {
  const seq = [];
  DOT_TORTURE.forEach((st, si) => {
    for (let draw = 0; draw < st.draws; draw++) {
      st.dots.forEach((dot, k) => {
        for (let r = 0; r < st.rounds[k]; r++) seq.push({ stage: si, draw, dot });
      });
    }
  });
  return seq;
}

export class DotTortureRunner extends Runner {
  constructor(range) {
    super();
    this.range = range;
    this.seq = expand();
    this.clearRun();
  }

  clearRun() {
    this.idx = 0;
    this.hits = 0;
    this.stageHits = DOT_TORTURE.map(() => 0);
    this.startT = 0;
    this.lastT = 0;
  }

  get expected() { return this.seq[this.idx] || null; }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    this.range.reset();
    this.startT = nowMs;
    this.state = State.Running;
    startBeep();
    this.syncHighlight();
  }

  cancel() {
    super.cancel();
    this.range.highlightDot = null;
  }

  update() { /* untimed */ }

  syncHighlight() {
    this.range.highlightDot = this.busy && this.expected ? this.expected.dot : null;
  }

  // Before registering: a hit on the wrong dot is a miss.
  judge(score) {
    if (this.state !== State.Running || !this.expected) return score;
    if (score.zone === 'Dot' && score.dot !== this.expected.dot) return { ...score, zone: 'Miss', points: 0, wrongDot: true };
    return score;
  }

  onShot(score) {
    if (this.state !== State.Running) return;
    const exp = this.expected;
    if (score.zone === 'Dot' && score.dot === exp.dot) {
      this.hits++;
      this.stageHits[exp.stage]++;
    }
    this.lastT = score.t;
    this.idx++;
    if (this.idx >= this.seq.length) this.finish();
    this.syncHighlight();
  }

  finish() {
    const total = this.seq.length;
    const time = (this.lastT - this.startT) / 1000;
    const dropped = DOT_TORTURE.map((st, i) => {
      const n = st.draws * st.rounds.reduce((a, b) => a + b, 0);
      return this.stageHits[i] < n ? `stage ${i + 1} ${this.stageHits[i]}/${n}` : null;
    }).filter(Boolean);
    this.result = {
      datetime: new Date(),
      course: this.course.name,
      type: 'dots',
      complete: true,
      time,
      shots: total,
      hits: this.hits,
      points: this.hits,
      counts: { Dot: this.hits, Miss: total - this.hits },
      passed: this.hits === total,
      splits: [],
      early: 0,
      notes: dropped.join('; '),
    };
    this.state = State.Done;
    this.range.highlightDot = null;
    this.emit();
  }

  timerHTML(now) {
    const head = `<b class="title">DOT TORTURE</b>`;
    if (this.state === State.Running) {
      return head + `Round ${this.idx + 1} / ${this.seq.length}\nClean: ${this.hits}\n` +
        `Time: ${((now - this.startT) / 1000).toFixed(1)}s`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      return head + `<b>${r.hits} / ${r.shots}</b>` + (r.passed ? '  <span class="go">CLEAN</span>' : '') +
        `\nTime: ${f2(r.time)}s\n<span class="muted small">[Space] run again</span>`;
    }
    return head + `Press [Space] to start\nUntimed, 50 rounds`;
  }

  panelHTML() {
    const head = `<b class="title">PRECISION</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (this.state === State.Running && this.expected) {
      const e = this.expected;
      const st = DOT_TORTURE[e.stage];
      return head + `<span class="go">Stage ${e.stage + 1} of ${DOT_TORTURE.length}</span>\n${st.note}\n` +
        (st.draws > 1 ? `Draw ${e.draw + 1} of ${st.draws}\n` : '') +
        `Next round: <b>dot #${e.dot}</b>`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      const lines = [`<b>Dot Torture</b> — ${r.passed ? '<span class="go">CLEAN 50/50</span>' : `<span class="bad">${r.hits}/50</span>`}`];
      if (r.notes) lines.push(`<span class="bad">Dropped: ${r.notes}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>Dot Torture</b>\n<span class="muted">${this.course.desc}</span>\n` +
      `Holster between draws. The blue ring shows the next dot.\n` + footer;
  }
}
