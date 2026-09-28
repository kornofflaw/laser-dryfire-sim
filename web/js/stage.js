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
//
// Disappearing targets (a drop turner: paper with turn: { by }, an
// activated mover: run: { by, to }, or a bobber: bob: { by }): once its
// activator steel is down it shows for a while, then turns away (runs
// behind cover, sinks for good). Its missing
// hits aren't penalised if it was activated (USPSA); if its activator was
// never hit, they're misses as usual. The run counts it as engaged once it
// has turned away.

import { CONFIG } from './config.js';

const R = () => CONFIG.range3d;
// How long a disappearing target can be seen once released (s).
function showWindow(it) {
  if (it.turn) return 2 * R().turner.time + (it.turn.show ?? R().turner.show);
  if (it.bob) { const B = R().bobber; return (it.bob.times ?? B.times) * (2 * B.rise + B.up + B.down) - B.down; }
  const speed = it.run.speed ?? R().trolley.speed;
  return Math.abs(it.run.to - it.x) / speed + R().trolley.accel / 2;
}
import { DrillRunner, State, isHit, f2 } from './run.js';
import { stageTargets } from './courses.js';
import { startBeep, parBeep } from './audio.js';

export class StageRunner extends DrillRunner {
  setCourse(course) {
    super.setCourse(course);
    const items = stageTargets(this.course.stage);
    this.papers = items.filter(i => i.type === 'paper').map(i => i.id);
    this.steel = items.filter(i => i.steel).map(i => i.id);
    this.vanish = items.filter(i => i.turn || i.run || i.bob).map(i => ({ id: i.id, by: (i.turn || i.run || i.bob).by, window: showWindow(i) }));
  }

  // A disappearing paper: was it activated, and has it turned away (ms)?
  activated(v) { return this.downAt[v.by] != null; }
  gone(v, nowMs) { return this.activated(v) && nowMs - this.downAt[v.by] >= (R().activateDelay + v.window) * 1000; }

  clearRun() {
    super.clearRun();
    this.paperHits = {};        // id -> [{ zone, points }, ...]
    this.down = new Set();      // steel ids down
    this.downAt = {};           // steel id -> when it went down (ms)
    this.nsHits = 0;
  }

  update(nowMs) {
    this.speakCalls(nowMs);
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;
    const e = this.elapsed(nowMs);
    if (!this.parPlayed && e >= this.course.parTime) { this.parPlayed = true; parBeep(); }
    if (e >= this.course.parTime + CONFIG.timer.incompleteGrace) this.finish(false);
    else if (this.vanish.length && this.engaged) this.finish(true); // the last turner just turned away
  }

  onShot(score) {
    super.onShot(score); // timing, counts, early shots
    if (this.state !== State.Running) return;
    const id = score.targetId;
    if (score.zone === 'NS') this.nsHits++;
    else if (score.zone === 'Steel' && id) { this.down.add(id); this.downAt[id] ??= score.t; }
    else if (isHit(score.zone) && this.papers.includes(id)) (this.paperHits[id] ??= []).push({ zone: score.zone, points: score.points });
    if (this.engaged) this.finish(true);
    else if (this.course.maxShots && this.shots >= this.course.maxShots) this.finish(false);
  }

  get perPaper() { return this.course.stage.perPaper ?? CONFIG.stage.perPaper; }
  get engaged() {
    const now = performance.now();
    return this.steel.every(id => this.down.has(id)) &&
      this.papers.every(id => (this.paperHits[id]?.length || 0) >= this.perPaper || this.vanish.some(v => v.id === id && this.gone(v, now)));
  }

  // Stage points and the misses they include, and the score sheet: one row
  // per target (its best `perPaper` hits as letters, or steel down / miss),
  // and the A / C / D totals of the hits that count.
  tally() {
    const S = CONFIG.stage, P = CONFIG.points;
    const letter = z => (z === 'Head' ? 'A' : z); // a head hit scores as an A
    let points = 0, mikes = 0;
    const counted = { A: 0, C: 0, D: 0 }, sheet = [];
    for (const id of this.papers) {
      const best = [...(this.paperHits[id] || [])].sort((a, b) => b.points - a.points).slice(0, this.perPaper);
      const v = this.vanish.find(v => v.id === id);
      const free = v && this.activated(v); // disappeared: no miss penalty
      const miss = this.perPaper - best.length;
      const pts = best.reduce((a, b) => a + b.points, 0);
      for (const b of best) counted[letter(b.zone)] = (counted[letter(b.zone)] || 0) + 1;
      sheet.push({ id, marks: [...best.map(b => letter(b.zone)), ...Array(miss).fill(free ? '–' : 'M')], points: pts + (free ? 0 : miss * S.missPenalty) });
      points += pts;
      if (!free) mikes += miss;
    }
    for (const id of this.steel) {
      const down = this.down.has(id);
      sheet.push({ id, marks: [down ? 'down' : 'M'], points: down ? P.Steel : S.missPenalty });
    }
    points += this.down.size * P.Steel;
    mikes += this.steel.length - this.down.size;
    points += mikes * S.missPenalty + this.nsHits * P.NS;
    return { points: Math.max(0, points), mikes, sheet, counted };
  }

  finish(complete) {
    const d = this.course;
    const s = this.shotTimes;
    const time = s.length ? s[s.length - 1] : 0;
    const { points, mikes, sheet, counted } = this.tally();
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
      counts: { ...this.counts, ...counted, Miss: mikes, NS: this.nsHits },
      sheet,
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
    this.closingCalls();
    this.remember(this.result);
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
      // Score sheet, as the RO fills it in: each target, then the totals.
      const rows = (r.sheet || []).map(t => `<tr${t.marks.includes('M') ? ' class="bad"' : ''}><td>${t.id}</td><td>${t.marks.join(' ')}</td><td>${t.points}</td></tr>`).join('');
      const lines = [`<b>${d.name}</b> — ${verdict}`,
        `<table class="shots sheet"><tr><th>target</th><th>hits</th><th>pts</th></tr>${rows}</table>` +
        `A ${r.counts.A}  C ${r.counts.C}  D ${r.counts.D}  M ${r.counts.Miss}  NS ${r.counts.NS}`,
        `Points <b>${r.points}</b> <span class="muted small">${CONFIG.points.C === CONFIG.powerFactor.major.C ? 'major' : 'minor'}</span> · time <b>${f2(r.time)}</b> · hit factor <b>${f2(r.hitFactor)}</b>`,
        r.madePar ? '<span class="go">made par</span>' : '<span class="bad">over par</span>'];
      for (const p of r.problems) lines.push(`<span class="bad">✗ ${p}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${d.name}</b>\n<span class="muted">${d.desc}</span>\n${need}  ·  par ${d.parTime.toFixed(1)}s\n` + footer;
  }
}

// ---- Steel Challenge style (course type 'strings') ------------------------------
// Plates plus a stop plate (a stage item with stop: true, marked by a red
// pole). Each string runs from the beep to the hit on the stop plate; any
// plate still up then costs platePenalty s. No stop plate within maxString s:
// the string counts as maxString. The steel is reset between strings, the
// slowest of the `strings` strings is thrown out and the rest added up (a
// lower total is better; par is the goal for that total).
const SC = () => CONFIG.steelChallenge;

export class StringsRunner extends StageRunner {
  setCourse(course) {
    super.setCourse(course);
    this.stopId = stageTargets(this.course.stage).find(i => i.stop)?.id;
    this.strings = [];
  }

  get nStrings() { return this.course.strings ?? SC().strings; }
  shotZero() { return this.runStart; } // the review times each string from its own beep
  get plates() { return this.steel.filter(id => id !== this.stopId); }

  start(nowMs) {
    if (this.busy) return;
    this.strings = [];
    super.start(nowMs);
  }

  update(nowMs) {
    this.speakCalls(nowMs);
    if (this.state === State.Delay && this.resetAt != null && nowMs >= this.resetAt) { this.resetAt = null; this.wantsReset = true; }
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.state = State.Running;
    }
    if (this.state === State.Running && this.elapsed(nowMs) >= SC().maxString) this.endString(nowMs);
  }

  onShot(score) {
    DrillRunner.prototype.onShot.call(this, score); // timing, counts, early shots
    if (this.state !== State.Running || score.zone !== 'Steel' || !score.targetId) return;
    this.down.add(score.targetId);
    if (score.targetId === this.stopId) this.endString(score.t);
  }

  endString(tMs) {
    const stopped = this.down.has(this.stopId);
    const up = this.plates.filter(id => !this.down.has(id)).length;
    const time = stopped ? Math.max(0, (tMs - this.runStart) / 1000) : SC().maxString;
    const penalty = stopped ? up * SC().platePenalty : 0;
    this.strings.push({ time, penalty, total: Math.min(SC().maxString, time + penalty), up: stopped ? up : null, shots: this.shots, firstShot: this.firstShot });
    if (this.strings.length >= this.nStrings) return this.finish(true);
    // The next string: the RO resets the steel, then "Are you ready?" ... "Standby".
    const now = performance.now(), early = this.early;
    this.clearRun();
    this.early = early;
    this.resetAt = now + SC().resetAfter * 1000;
    this.calls = [];
    let t = this.resetAt + SC().readyAfter * 1000;
    if (CONFIG.timer.commands.on) for (const [text, gap] of SC().say) { this.calls.push({ at: t, text }); t += gap * 1000; }
    this.standbyAt = t;
    this.beepAt = t + (CONFIG.timer.minDelay + Math.random() * (CONFIG.timer.maxDelay - CONFIG.timer.minDelay)) * 1000;
    this.state = State.Delay;
  }

  finish(complete) {
    if (this.state === State.Running && this.strings.length < this.nStrings) this.endString(performance.now()); // stopped mid-string
    if (this.state === State.Done) return;
    const all = this.strings, d = this.course;
    const worst = all.length > 1 ? all.reduce((w, s, i) => (s.total > all[w].total ? i : w), 0) : -1;
    const total = all.reduce((a, s, i) => a + (i === worst ? 0 : s.total), 0);
    const plateHits = all.reduce((a, s) => a + (this.plates.length - (s.up ?? this.plates.length)), 0);
    const penalties = all.reduce((a, s) => a + (s.up || 0), 0);
    complete = complete && all.length >= this.nStrings;
    const problems = [];
    if (penalties) problems.push(`${penalties} plate${penalties > 1 ? 's' : ''} left up (+${penalties * SC().platePenalty} s)`);
    if (all.some(s => s.up == null)) problems.push(`a string timed out (${SC().maxString} s)`);
    this.result = {
      datetime: new Date(), course: d.name, type: 'strings', parTime: d.parTime, complete,
      time: total, firstShot: all[0]?.firstShot ?? null, splits: [],
      strings: all.map(s => ({ ...s })), worst,
      shots: all.reduce((a, s) => a + s.shots, 0), hits: plateHits + all.filter(s => s.up != null).length,
      points: 0, counts: { ...this.counts }, sheet: [], hitFactor: 0,
      madePar: complete && total <= d.parTime, problems,
      passed: complete ? total <= d.parTime : false,
      early: this.early, notes: problems.join('; '),
    };
    this.state = State.Done;
    this.closingCalls();
    this.remember(this.result);
    this.emit();
  }

  timerHTML(now) {
    const head = `<b class="title">SHOT TIMER</b>`, k = this.strings.length + 1, N = this.nStrings;
    switch (this.state) {
      case State.Idle:
        return head + `Press [Space] to start\n${N} strings · goal ${this.course.parTime.toFixed(1)}s`;
      case State.Delay:
        return head + `String ${k} of ${N}\n` + (performance.now() < this.standbyAt ? `<span class="wait">RESET · MAKE READY…</span>` : `<span class="wait">STAND BY…</span>\nwait for the beep`);
      case State.Running:
        return head + `<span class="go">GO!</span>  String ${k} of ${N}\n<span class="bigtime">${f2(this.elapsed(now))}</span>` +
          `Plates down: ${this.plates.filter(id => this.down.has(id)).length} / ${this.plates.length}`;
      case State.Done: {
        const r = this.result;
        const rows = r.strings.map((s, i) => `<tr${i === r.worst ? ' class="muted"' : s.penalty || s.up == null ? ' class="bad"' : ''}><td>${i + 1}</td><td>${f2(s.time)}</td><td>${s.penalty ? '+' + s.penalty : s.up == null ? 'max' : ''}</td><td>${f2(s.total)}${i === r.worst ? ' ✗' : ''}</td></tr>`).join('');
        return head + `<span class="bigtime">${f2(r.time)}</span>` +
          `total of the best ${Math.max(1, r.strings.length - 1)} · goal ${r.parTime.toFixed(2)}\n` +
          `<table class="shots"><tr><th>#</th><th>time</th><th>pen</th><th>total</th></tr>${rows}</table>` +
          `<span class="muted small">✗ slowest string, thrown out</span>\n` +
          this.sessionLine() + `<span class="muted small">[Space] run again</span>`;
      }
    }
    return head;
  }

  panelHTML() {
    const d = this.course;
    const head = `<b class="title">STEEL CHALLENGE STYLE</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (this.busy) {
      return head + `<span class="go">${d.name}</span>\nString ${Math.min(this.nStrings, this.strings.length + 1)} of ${this.nStrings}\n` +
        this.strings.map((s, i) => `  ${i + 1}: ${f2(s.total)}${s.penalty ? ` (+${s.penalty})` : ''}`).join('\n');
    }
    const r = this.result;
    if (r && r.course === d.name) {
      const verdict = r.passed ? '<span class="go">UNDER GOAL</span>' : r.complete ? '<span class="bad">OVER GOAL</span>' : '<span class="bad">INCOMPLETE</span>';
      const lines = [`<b>${d.name}</b> — ${verdict}`, `Total <b>${f2(r.time)}</b> s (best ${Math.max(1, r.strings.length - 1)} of ${r.strings.length} strings)`];
      for (const p of r.problems) lines.push(`<span class="bad">✗ ${p}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${d.name}</b>\n<span class="muted">${d.desc}</span>\n${this.plates.length} plates + stop plate · ${this.nStrings} strings, slowest thrown out · goal ${d.parTime.toFixed(1)}s\n` + footer;
  }
}
