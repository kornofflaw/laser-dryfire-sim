// stage.js — StageRunner: a USPSA-style stage of paper, no-shoots and steel.
// ---------------------------------------------------------------------------
// Timed like a drill (random delay, beep, par beep). The run ends by itself
// when every paper has CONFIG.stage.perPaper hits and all steel is down, or at
// maxShots, or incompleteGrace seconds after par.
//
// Stage score (USPSA): the best `perPaper` hits on each paper count; each
// missing hit and each steel left standing is a miss (missPenalty); each
// no-shoot hit is CONFIG.points.NS. Floored at zero. Hit factor = points /
// time (beep to last shot). This is the run's RESULT, worked out from the
// shots that went through Game.registerScoredShot (which keeps the session
// score, shot by shot, as for every course).
//
// Target ids come from stageTargets() (courses.js): P1.. paper, NS1..
// no-shoots, S1.. steel; range3d.js gives each hit the same id.

import { CONFIG } from './config.js';
import { DrillRunner, State, isHit, f2 } from './run.js';
import { stageTargets } from './courses.js';
import { startBeep, parBeep } from './audio.js';

export class StageRunner extends DrillRunner {
  setCourse(course) {
    super.setCourse(course);
    const items = stageTargets(this.course.stage);
    this.papers = items.filter(i => i.type === 'paper').map(i => i.id);
    this.steel = items.filter(i => i.steel).map(i => i.id);
  }

  clearRun() {
    super.clearRun();
    this.paperHits = {};        // id -> [points, ...]
    this.down = new Set();      // steel ids down
    this.nsHits = 0;
  }

  update(nowMs) {
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;
    const e = this.elapsed(nowMs);
    if (!this.parPlayed && e >= this.course.parTime) { this.parPlayed = true; parBeep(); }
    if (e >= this.course.parTime + CONFIG.timer.incompleteGrace) this.finish(false);
  }

  onShot(score) {
    super.onShot(score); // timing, counts, early shots
    if (this.state !== State.Running) return;
    const id = score.targetId;
    if (score.zone === 'NS') this.nsHits++;
    else if (score.zone === 'Steel' && id) this.down.add(id);
    else if (isHit(score.zone) && this.papers.includes(id)) (this.paperHits[id] ??= []).push(score.points);
    if (this.engaged) this.finish(true);
    else if (this.course.maxShots && this.shots >= this.course.maxShots) this.finish(false);
  }

  get perPaper() { return this.course.stage.perPaper ?? CONFIG.stage.perPaper; }
  get engaged() {
    return this.steel.every(id => this.down.has(id)) &&
      this.papers.every(id => (this.paperHits[id]?.length || 0) >= this.perPaper);
  }

  // Stage points and the misses they include.
  tally() {
    const S = CONFIG.stage;
    let points = 0, mikes = 0;
    for (const id of this.papers) {
      const best = [...(this.paperHits[id] || [])].sort((a, b) => b - a).slice(0, this.perPaper);
      points += best.reduce((a, b) => a + b, 0);
      mikes += this.perPaper - best.length;
    }
    points += this.down.size * CONFIG.points.Steel;
    mikes += this.steel.length - this.down.size;
    points += mikes * S.missPenalty + this.nsHits * CONFIG.points.NS;
    return { points: Math.max(0, points), mikes };
  }

  finish(complete) {
    const d = this.course;
    const s = this.shotTimes;
    const time = s.length ? s[s.length - 1] : 0;
    const { points, mikes } = this.tally();
    const madePar = complete && s.length > 0 && time <= d.parTime;
    const problems = [];
    if (mikes) problems.push(`${mikes} miss${mikes > 1 ? 'es' : ''} (-${mikes * -CONFIG.stage.missPenalty})`);
    if (this.nsHits) problems.push(`${this.nsHits} no-shoot${this.nsHits > 1 ? 's' : ''} (${this.nsHits * CONFIG.points.NS})`);
    this.result = {
      datetime: new Date(),
      course: d.name,
      type: 'stage',
      parTime: d.parTime,
      complete,
      time,
      firstShot: this.firstShot,
      splits: s.slice(1).map((t, i) => t - s[i]),
      shots: s.length,
      hits: this.hits,
      points,
      counts: { ...this.counts, Miss: mikes, NS: this.nsHits },
      steelDown: this.down.size,
      steelTotal: this.steel.length,
      hitFactor: time > 0.0001 ? points / time : 0,
      madePar,
      problems,
      passed: complete && madePar && mikes === 0 && this.nsHits === 0,
      early: this.early,
      notes: problems.join('; '),
    };
    this.state = State.Done;
    this.emit();
  }

  panelHTML() {
    const d = this.course;
    const head = `<b class="title">STAGE · ${d.category.toUpperCase()}</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    const need = [this.papers.length ? `${this.papers.length} paper × ${this.perPaper}` : '', this.steel.length ? `${this.steel.length} steel` : '']
      .filter(Boolean).join(' + ');
    if (this.busy) {
      const paperDone = this.papers.filter(id => (this.paperHits[id]?.length || 0) >= this.perPaper).length;
      return head + `<span class="go">${d.name}</span>\n` +
        (this.papers.length ? `Paper done: ${paperDone} / ${this.papers.length}\n` : '') +
        (this.steel.length ? `Steel down: ${this.down.size} / ${this.steel.length}\n` : '') +
        `Rounds: ${this.shots}` + (this.nsHits ? `   <span class="bad">No-shoots: ${this.nsHits}</span>` : '');
    }
    const r = this.result;
    if (r && r.course === d.name) {
      const verdict = r.passed ? '<span class="go">CLEAN</span>' : r.complete ? '<span class="bad">PENALTIES</span>' : '<span class="bad">INCOMPLETE</span>';
      const lines = [`<b>${d.name}</b> — ${verdict}`,
        `Time: ${f2(r.time)}s   ${r.madePar ? '<span class="go">made par</span>' : '<span class="bad">over par</span>'}`,
        `Points: ${r.points}   Hit factor: <b>${f2(r.hitFactor)}</b>`,
        `A: ${r.counts.A}  C: ${r.counts.C}  D: ${r.counts.D}  M: ${r.counts.Miss}  NS: ${r.counts.NS}` +
          (r.steelTotal ? `   Steel: ${r.steelDown}/${r.steelTotal}` : '')];
      for (const p of r.problems) lines.push(`<span class="bad">✗ ${p}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${d.name}</b>\n<span class="muted">${d.desc}</span>\n${need}  ·  par ${d.parTime.toFixed(1)}s\n` + footer;
  }
}
