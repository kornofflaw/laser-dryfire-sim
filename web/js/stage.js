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
    this.items = items;
    this.positions = this.course.stage.positions || null;
  }

  // A disappearing paper: was it activated, and has it turned away (ms)?
  activated(v) { return this.downAt[v.by] != null; }
  gone(v, nowMs) { return this.activated(v) && nowMs - this.downAt[v.by] >= (R().activateDelay + v.window) * 1000; }

  clearRun() {
    super.clearRun();
    this.paperHits = {};        // id -> [{ zone, points }, ...]
    this.down = new Set();      // steel ids down
    this.downAt = {};           // steel id -> when it went down (ms)
    this.station = 0;           // shooting position (stages with positions)
    this.stationTimes = [];     // when each position's array was finished (s from the beep)
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
    // Array done at this position: run to the next one (the view moves).
    if (this.positions && this.station < this.positions.length - 1 && this.arrayDone(this.station)) {
      this.stationTimes.push(this.elapsed(score.t));
      this.wantsMove = ++this.station;
    }
    if (this.engaged) this.finish(true);
    else if (this.course.maxShots && this.shots >= this.course.maxShots) this.finish(false);
  }

  get perPaper() { return this.course.stage.perPaper ?? CONFIG.stage.perPaper; }
  // Every paper and steel shot from position k (item pos, default 0) engaged?
  arrayDone(k) {
    return this.items.filter(i => (i.pos ?? 0) === k && i.type !== 'noshoot').every(i =>
      i.steel ? this.down.has(i.id) : (this.paperHits[i.id]?.length || 0) >= this.perPaper);
  }
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
    const st = this.steelScore();
    sheet.push(...st.sheet);
    points += st.points;
    mikes += st.mikes;
    // Virginia Count: exactly the round count; every extra shot is a procedural.
    const procedurals = this.virginia ? Math.max(0, this.shots - this.roundCount) : 0;
    points += mikes * S.missPenalty + this.nsHits * P.NS + procedurals * S.procedural;
    return { points: Math.max(0, points), mikes, sheet, counted, procedurals };
  }

  // The steel's rows on the score sheet, its points and misses.
  steelScore() {
    const S = CONFIG.stage, P = CONFIG.points, sheet = [];
    for (const id of this.steel) {
      const down = this.down.has(id);
      sheet.push({ id, marks: [down ? 'down' : 'M'], points: down ? P.Steel : S.missPenalty });
    }
    return { sheet, points: this.down.size * P.Steel, mikes: this.steel.length - this.down.size };
  }
  // Stage time (beep to last shot) and whether it made par.
  stageTime() { const s = this.shotTimes; return s.length ? s[s.length - 1] : 0; }
  withinPar(time) { return time <= this.course.parTime; }
  extraResult() { return {}; }

  get virginia() { return this.course.stage.scoring === 'virginia'; }
  // Rounds the stage needs: the hits per paper plus one per steel.
  get roundCount() { return this.papers.length * this.perPaper + this.steel.length; }

  finish(complete) {
    const d = this.course;
    const s = this.shotTimes;
    const time = this.stageTime();
    const { points, mikes, sheet, counted, procedurals } = this.tally();
    const madePar = complete && s.length > 0 && this.withinPar(time);
    const problems = [];
    if (procedurals) problems.push(`${procedurals} extra shot${procedurals > 1 ? 's' : ''}: procedural${procedurals > 1 ? 's' : ''} (${procedurals * CONFIG.stage.procedural})`);
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
      passed: complete && madePar && mikes === 0 && this.nsHits === 0 && !procedurals,
      early: this.early,
      notes: problems.join('; '),
      ...(this.positions ? { stations: [...this.stationTimes, time] } : {}),
      ...(this.benchmark() ? { benchmark: this.benchmark() } : {}),
      maxPoints: this.papers.length * this.perPaper * CONFIG.points.A + this.steel.length * CONFIG.points.Steel, // (a clean all-A run)
      ...this.extraResult(),
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
      return head + `<span class="go">${d.name}</span>\n` + (this.positions ? `Position ${this.station + 1} of ${this.positions.length}\n` : '') +
        (this.papers.length ? `Paper done: ${paperDone} / ${this.papers.length}\n` : '') +
        (this.steel.length ? `Steel down: ${this.down.size} / ${this.steel.length}\n` : '') +
        `Rounds: ${this.shots}${this.virginia ? ` / ${this.roundCount}` : ''}` + (this.nsHits ? `   <span class="bad">No-shoots: ${this.nsHits}</span>` : '');
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
      if (r.benchmark) lines.push(`<span class="small">Benchmark HF ${f2(r.benchmark)} (an estimated top-shooter run) · you <b>${Math.round((100 * r.hitFactor) / r.benchmark)}%</b></span>`);
      // Stages with positions: when each array was done, and the time spent at / getting to each.
      if (r.stations?.length > 1) lines.push(`<span class="small">Positions: ${r.stations.map((t, i) => `${i + 1} ${f2(t)}s (+${f2(t - (r.stations[i - 1] || 0))})`).join(' · ')}</span>`);
      for (const p of r.problems) lines.push(`<span class="bad">✗ ${p}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }
    return head + `<b>${d.name}</b>\n<span class="muted">${d.desc}</span>\n` + this.briefing() + '\n' + footer;
  }

  // Benchmark hit factor (CONFIG.stage.benchmark): a clean top-shooter run
  // estimated from the layout. Plain Comstock stages only (not strings,
  // classifiers, Virginia Count or stages with disappearing targets).
  benchmark() {
    if (this.course.type !== 'stage' || this.virginia || this.vanish.length) return 0;
    const B = CONFIG.stage.benchmark, P = CONFIG.points, S = CONFIG.range3d.stances;
    let t = B.draw, pts = 0;
    for (const it of this.items) {
      if (it.type === 'noshoot') continue;
      t += (it.steel ? B.steel : B.paper) + it.yd * B.perYd;
      if (it.steel) pts += P.Steel;
      else { t += (this.perPaper - 1) * B.split; pts += this.perPaper * P.A; }
    }
    (this.positions || []).forEach((p, k, all) => {
      if (!k) return;
      const q = all[k - 1], d = Math.hypot((p.x || 0) - (q.x || 0), ((p.yd || 0) - (q.yd || 0)) * 0.9144);
      t += Math.max(p.onMove ? 0 : d / B.runSpeed, p.stance !== q.stance ? Math.max(S[p.stance]?.time || 0, S[q.stance]?.time || 0) : 0);
    });
    return pts / t;
  }

  // The written stage briefing, as posted at a match: round count, scoring,
  // targets, start position, par.
  briefing() {
    const st = this.course.stage, n = t => this.items.filter(i => i.type === t).length;
    const steel = this.steel.length, ns = n('noshoot'), act = this.items.filter(i => i.swing || i.turn || i.run || i.bob || i.pop).length;
    const targets = [`${this.papers.length} paper`, ns ? `${ns} no-shoot${ns > 1 ? 's' : ''}` : '', steel ? `${steel} steel` : '', act ? `${act} activated` : '']
      .filter(Boolean).join(', ');
    const strings = st.strings?.length || 1, per = this.perString ?? this.perPaper;
    const min = (this.papers.length * per + steel) * strings;
    const scoring = this.virginia ? `Virginia Count: exactly ${this.roundCount} rounds` : `Comstock · minimum ${min} rounds`;
    const lines = [
      `<b>Scoring</b> ${scoring}${strings > 1 ? ` (${strings} strings)` : ''}`,
      `<b>Targets</b> ${targets} · ${per} per paper`,
      `<b>Start</b> ${st.start || CONFIG.stage.start}${this.positions ? ` · ${this.positions.length} positions` : ''}`,
      ...(this.positions?.some(P => P.stance || P.onMove) ? [`<b>Positions</b> ${this.positions.map((P, k) => `${k + 1} ${P.onMove ? 'walk there shooting' : P.stance === 'kneel' ? 'kneeling' : P.stance === 'prone' ? 'prone' : 'standing'}`).join(' · ')}`] : []),
      `<b>Par</b> ${this.course.parTime.toFixed(1)}s${strings > 1 ? ' per string' : ''}${this.benchmark() ? ` · <b>Benchmark</b> HF ${this.benchmark().toFixed(2)}` : ''}`,
    ];
    return `<span class="small">${lines.join('\n')}</span>`;
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

// ---- Classifier style: several strings on one stage (course type 'classifier') ----
// stage.strings: [{ name, say? }, ...] - e.g. freestyle, strong hand only,
// weak hand only. Each string: the RO calls it, "Are you ready? Standby",
// beep; it ends when every paper has perPaper hits from this string and the
// steel is down (or par + incompleteGrace passes). The paper is scored once
// at the end (holes from all strings count: the best perPaper x strings per
// paper), each steel once per string (it's reset between strings). Stage
// time = the strings' times added up; hit factor = points / that time.
export class ClassifierRunner extends StageRunner {
  setCourse(course) {
    super.setCourse(course);
    this.defs = this.course.stage.strings || [{ name: 'Freestyle' }];
  }

  get perPaper() { return (this.course.stage.perPaper ?? CONFIG.stage.perPaper) * (this.defs?.length || 1); }
  get perString() { return this.course.stage.perPaper ?? CONFIG.stage.perPaper; }
  shotZero() { return this.runStart; }

  clearRun() {
    super.clearRun();
    this.stringTimes = [];
    this.steelDown = []; // per finished string: how many steel went down
    this.cur = {};       // paper id -> hits this string
  }

  start(nowMs) {
    if (this.busy) return;
    super.start(nowMs);
    // The RO names the first string before "Make ready".
    if (!CONFIG.timer.commands.on) return;
    const gap = 2400;
    for (const c of this.calls) c.at += gap;
    this.standbyAt += gap;
    this.beepAt += gap;
    this.calls.unshift({ at: nowMs, text: this.stringCall(0) });
  }

  timerHTML(now) {
    const head = `<b class="title">SHOT TIMER</b>`, k = this.stringTimes.length, N = this.defs.length;
    if (this.state === State.Delay) return head + `String ${k + 1} of ${N}: ${this.defs[k].name}\n` + super.timerHTML(now).slice(head.length);
    if (this.state === State.Running) return head + `String ${k + 1} of ${N}: ${this.defs[k].name}\n` + super.timerHTML(now).slice(head.length);
    if (this.state !== State.Done || !this.result?.strings) return super.timerHTML(now);
    const r = this.result;
    const rows = r.strings.map((st, i) => `<tr${st.complete ? '' : ' class="bad"'}><td>${i + 1}</td><td>${st.name}</td><td>${f2(st.time)}</td></tr>`).join('');
    return head + `<span class="bigtime">${f2(r.time)}</span>total of ${r.strings.length} strings · par ${r.parTime.toFixed(2)} each\n` +
      `<table class="shots"><tr><th>#</th><th>string</th><th>time</th></tr>${rows}</table>` +
      this.sessionLine() + `<span class="muted small">[Space] run again</span>`;
  }

  stringCall(k) { const d = this.defs[k]; return d.say || `String ${k + 1}: ${d.name}.`; }

  update(nowMs) {
    this.speakCalls(nowMs);
    if (this.state === State.Delay && this.resetAt != null && nowMs >= this.resetAt) { this.resetAt = null; this.wantsSteelReset = true; }
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.stringShots = 0;
      this.parPlayed = false;
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;
    const e = this.elapsed(nowMs);
    if (!this.parPlayed && e >= this.course.parTime) { this.parPlayed = true; parBeep(); }
    if (e >= this.course.parTime + CONFIG.timer.incompleteGrace) this.endString(this.lastShotAt ?? nowMs, false);
  }

  onShot(score) {
    DrillRunner.prototype.onShot.call(this, score); // timing, counts, early shots
    if (this.state !== State.Running) return;
    this.lastShotAt = score.t;
    const id = score.targetId;
    if (score.zone === 'NS') this.nsHits++;
    else if (score.zone === 'Steel' && id) this.down.add(id);
    else if (isHit(score.zone) && this.papers.includes(id)) {
      (this.paperHits[id] ??= []).push({ zone: score.zone, points: score.points });
      this.cur[id] = (this.cur[id] || 0) + 1;
    }
    const done = this.steel.every(s => this.down.has(s)) && this.papers.every(p => (this.cur[p] || 0) >= this.perString);
    if (done) this.endString(score.t, true);
  }

  endString(tMs, complete) {
    this.stringTimes.push({ time: Math.max(0, (tMs - this.runStart) / 1000), complete });
    this.steelDown.push(this.down.size);
    this.lastShotAt = null;
    if (this.stringTimes.length >= this.defs.length) return this.finish(this.stringTimes.every(s => s.complete));
    // Next string: steel reset, the RO calls it, then "Are you ready? Standby".
    const now = performance.now();
    this.down = new Set();
    this.cur = {};
    this.resetAt = now + SC().resetAfter * 1000;
    this.calls = [];
    let t = this.resetAt + SC().readyAfter * 1000;
    if (CONFIG.timer.commands.on) {
      for (const [text, gap] of [[this.stringCall(this.stringTimes.length), 2.4], ...SC().say]) { this.calls.push({ at: t, text }); t += gap * 1000; }
    } else t += 2000;
    this.standbyAt = t;
    this.beepAt = t + (CONFIG.timer.minDelay + Math.random() * (CONFIG.timer.maxDelay - CONFIG.timer.minDelay)) * 1000;
    this.state = State.Delay;
  }

  // Steel once per string (it's reset between strings).
  steelScore() {
    const S = CONFIG.stage, P = CONFIG.points, n = this.steelDown.length, total = this.steel.length * n;
    const down = this.steelDown.reduce((a, k) => a + k, 0);
    const sheet = this.steelDown.map((k, i) => ({ id: `String ${i + 1} steel`, marks: [`${k}/${this.steel.length} down`], points: k * P.Steel + (this.steel.length - k) * S.missPenalty }));
    return { sheet, points: down * P.Steel, mikes: total - down };
  }

  stageTime() { return this.stringTimes.reduce((a, s) => a + s.time, 0); }
  withinPar() { return this.stringTimes.every(s => s.time <= this.course.parTime); }
  extraResult() { return { type: 'classifier', strings: this.stringTimes.map((s, k) => ({ ...s, name: this.defs[k].name })) }; }

  finish(complete) {
    if (this.state === State.Running && this.stringTimes.length < this.defs.length) {
      this.stringTimes.push({ time: this.elapsed(performance.now()), complete: false });
      this.steelDown.push(this.down.size);
    }
    super.finish(complete && this.stringTimes.length >= this.defs.length);
  }
}
