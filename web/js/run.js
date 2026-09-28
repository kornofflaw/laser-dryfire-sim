// run.js — shot timer + timed drills (was ShotTimer.cs + DrillRunner.cs).
// ---------------------------------------------------------------------------
// Range-style timer: random delay -> start beep -> par beep. The selected
// drill (courses.js) decides when the run ends and what counts as a pass.
//
//   * Shots during the random delay are counted as EARLY (jumped the beep).
//   * requiredShots > 0: ends after that many rounds.
//   * requiredHits > 0: ends after that many hits, or at maxShots (fail).
//   * requiredShots 0 and no requiredHits (Free Run): ends at the par beep.
//   * Anything unfinished ends incompleteGrace seconds after par (fail).
//
// Every runner (this, dots.js, scenario.js) has the same shape:
//   state, busy, start(now), cancel(), update(now), onShot(score),
//   timerHTML(now), panelHTML(now), onComplete(fn), result

import { CONFIG } from './config.js';
import { startBeep, parBeep, say } from './audio.js';

export const State = { Idle: 'Idle', Delay: 'Delay', Running: 'Running', Done: 'Done' };

export const isHit = zone => zone !== 'Miss' && zone !== 'NS';
export const f2 = v => (v == null ? '--' : v.toFixed(2));

export class Runner {
  constructor() {
    this.state = State.Idle;
    this.result = null;
    this.listeners = new Set();
    this.course = null;
  }
  onComplete(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(this.result); }
  get busy() { return this.state === State.Delay || this.state === State.Running; }
  setCourse(course) {
    if (this.busy) return;
    this.course = course;
    this.result = null;
    this.state = State.Idle;
  }
  cancel() {
    if (!this.busy) return;
    this.state = State.Idle;
  }
}

export class DrillRunner extends Runner {
  constructor() {
    super();
    this.clearRun();
  }

  get usesCriteria() {
    const d = this.course;
    return !!(d.minAHits || d.minBodyHits || d.minHeadHits || d.perTargetMin || d.order || d.sequence || d.evenSplits);
  }

  clearRun() {
    this.beepAt = 0;
    this.runStart = 0;
    this.parPlayed = false;
    this.shotTimes = [];     // seconds from the beep
    this.shotZones = [];     // what each shot hit (A, C, D, Head, Steel, Miss...)
    this.slots = [];         // bay slot of each hit, in order
    this.early = 0;
    this.backs = 0;          // dueling tree: hits that swung a paddle back
    this.points = 0;
    this.counts = { A: 0, C: 0, D: 0, Head: 0, Steel: 0, Dot: 0, NS: 0, Miss: 0 };
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    const T = CONFIG.timer, C = T.commands;
    // Range officer (Setup): "Make ready" ... "Are you ready?" ... "Standby",
    // then the random delay to the beep, as at a match.
    this.calls = [];
    let t = nowMs;
    if (C.on) {
      for (const [text, gap] of C.say) { this.calls.push({ at: t, text }); t += gap * 1000; }
    }
    this.standbyAt = t; // shots before this don't count (still making ready)
    this.beepAt = t + (T.minDelay + Math.random() * (T.maxDelay - T.minDelay)) * 1000;
    this.state = State.Delay;
  }

  cancel() { super.cancel(); this.clearRun(); this.calls = []; }

  // After the run (Setup -> RO commands): "If you are finished, unload and
  // show clear" ... "Range is clear", as at a match.
  closingCalls() {
    const C = CONFIG.timer.commands;
    this.calls = [];
    if (!C.on) return;
    let t = performance.now() + C.afterPause * 1000;
    for (const [text, gap] of C.after) { this.calls.push({ at: t, text }); t += gap * 1000; }
  }

  stopCalls() { this.calls = []; }

  // This session's runs of each course (in memory): for the line under the
  // shot timer's review - how many, best and average (time for a drill,
  // hit factor for a stage), and how many passed.
  remember(r) {
    const all = (DrillRunner.history ??= {});
    (all[r.course] ??= []).push({ complete: r.complete, time: r.time, hf: r.hitFactor, passed: r.passed });
    // Personal best (kept in this browser by main.js: DrillRunner.bests,
    // DrillRunner.saveBests): the best hit factor on a stage, the best time on
    // a timed drill or Steel Challenge (complete runs that didn't fail).
    const B = DrillRunner.bests;
    if (!B || !r.complete || r.passed === false && this.course.type !== 'strings') return;
    const byHF = this.byHitFactor, v = byHF ? r.hitFactor : r.time;
    if (!(v > 0)) return;
    const old = B[r.course];
    if (old == null || (byHF ? v > old : v < old)) {
      r.newBest = old != null; // (the first run just sets it)
      B[r.course] = v;
      DrillRunner.saveBests?.(B);
    }
  }

  get byHitFactor() { return this.course.type === 'stage' || this.course.type === 'classifier'; }

  sessionLine() {
    const runs = (DrillRunner.history?.[this.course.name] || []).filter(r => r.complete);
    const pb = DrillRunner.bests?.[this.course.name];
    const pbLine = pb != null ? `<span class="muted small">Personal best: ${this.byHitFactor ? 'HF ' : ''}${f2(pb)}${this.byHitFactor ? '' : ' s'}${this.result?.newBest ? ' <span class="go">NEW!</span>' : ''}</span>\n` : '';
    if (runs.length < 2) return pbLine;
    const stage = this.byHitFactor;
    const vals = runs.map(r => (stage ? r.hf : r.time));
    const best = stage ? Math.max(...vals) : Math.min(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const passed = runs.filter(r => r.passed).length;
    return pbLine + `<span class="muted small">This session: ${runs.length} runs · ${stage ? 'HF' : ''} best ${f2(best)} · avg ${f2(avg)}${runs.some(r => r.passed != null) ? ` · passed ${passed}/${runs.length}` : ''}</span>\n`;
  }

  // Speak the RO's calls that are due (before the beep and after the run).
  speakCalls(nowMs) {
    if (this.state === State.Running) return;
    while (this.calls?.length && nowMs >= this.calls[0].at) say(this.calls.shift().text, { rate: 1.0 });
  }

  update(nowMs) {
    this.speakCalls(nowMs);
    if (this.state === State.Delay && nowMs >= this.beepAt) {
      startBeep();
      this.runStart = nowMs;
      this.state = State.Running;
    }
    if (this.state !== State.Running) return;

    const elapsed = this.elapsed(nowMs);
    const d = this.course;
    if (!this.parPlayed && elapsed >= d.parTime) {
      this.parPlayed = true;
      parBeep();
      if (!d.requiredShots && !d.requiredHits) this.finish(true);
    }
    if (this.state === State.Running && (d.requiredShots || d.requiredHits) &&
        elapsed >= d.parTime + CONFIG.timer.incompleteGrace) {
      this.finish(false);
    }
  }

  elapsed(nowMs) { return (nowMs - this.runStart) / 1000; }
  parRemaining(nowMs) {
    return this.state === State.Running ? Math.max(0, this.course.parTime - this.elapsed(nowMs)) : 0;
  }

  onShot(score) {
    if (this.state === State.Delay) { if (score.t >= this.standbyAt) this.early++; return; }
    if (this.state !== State.Running) return;

    // A camera frame can be captured a hair before the beep frame; clamp to 0.
    this.shotTimes.push(Math.max(0, (score.t - this.runStart) / 1000));
    this.shotZones.push(score.zone);
    this.points += score.points;
    this.counts[score.zone] = (this.counts[score.zone] || 0) + 1;
    if (isHit(score.zone) && score.slot != null) this.slots.push(score.slot);
    if (score.back) this.backs++;

    const d = this.course;
    if (d.clearSteel) {
      // Done when the steel is cleared (dueling tree: every paddle over).
      if (score.clears) this.finish(true);
      else if (d.maxShots && this.shots >= d.maxShots) this.finish(false);
    } else if (d.requiredShots && this.shots >= d.requiredShots) this.finish(true);
    else if (d.requiredHits && this.hits >= d.requiredHits) this.finish(true);
    else if (d.requiredHits && d.maxShots && this.shots >= d.maxShots) this.finish(false);
  }

  get shots() { return this.shotTimes.length; }
  get hits() { return this.shots - this.counts.Miss - this.counts.NS; }
  get bodyHits() { return this.counts.A + this.counts.C + this.counts.D; }
  get firstShot() { return this.shotTimes.length ? this.shotTimes[0] : null; }
  get lastSplit() {
    const s = this.shotTimes;
    return s.length >= 2 ? s[s.length - 1] - s[s.length - 2] : null;
  }

  // Per-target and order checks for bay drills. Returns a list of problems.
  criteriaProblems() {
    const d = this.course;
    const out = [];
    if (d.minAHits && this.counts.A < d.minAHits) out.push(`A hits ${this.counts.A}/${d.minAHits}`);
    if (d.minBodyHits && this.bodyHits < d.minBodyHits) out.push(`body hits ${this.bodyHits}/${d.minBodyHits}`);
    if (d.minHeadHits && this.counts.Head < d.minHeadHits) out.push(`head hits ${this.counts.Head}/${d.minHeadHits}`);
    if (d.perTargetMin) {
      const per = [0, 0, 0];
      for (const s of this.slots) per[s]++;
      const low = per.map((n, i) => (n < d.perTargetMin ? ['left', 'centre', 'right'][i] : null)).filter(Boolean);
      if (low.length) out.push(`needs ${d.perTargetMin}+ on ${low.join(', ')}`);
    }
    if (d.sequence) {
      const ok = { Head: z => z === 'Head', A: z => z === 'A', body: z => z === 'A' || z === 'C' || z === 'D' };
      const name = { Head: 'head', A: 'A zone', body: 'body' };
      const bad = d.sequence.findIndex((want, i) => !ok[want](this.shotZones[i]));
      if (bad >= 0) out.push(`shot ${bad + 1} should be ${name[d.sequence[bad]]} (got ${this.shotZones[bad] || 'none'})`);
    }
    if (d.evenSplits && this.shotTimes.length > 2) {
      const s = this.shotTimes, splits = s.slice(1).map((t, i) => t - s[i]);
      const spread = Math.max(...splits) - Math.min(...splits);
      if (spread > d.evenSplits) out.push(`splits uneven: ${f2(Math.min(...splits))}–${f2(Math.max(...splits))} s (spread ${f2(spread)} > ${f2(d.evenSplits)})`);
    }
    if (d.order === 'ltr' && this.slots.some((s, i) => i > 0 && s < this.slots[i - 1])) {
      out.push('out of order (go left to right)');
    }
    return out;
  }

  finish(complete) {
    const d = this.course;
    const s = this.shotTimes;
    const time = s.length ? s[s.length - 1] : 0; // beep -> last shot
    const splits = s.slice(1).map((t, i) => t - s[i]);
    const problems = this.criteriaProblems();
    const madePar = complete && s.length > 0 && time <= d.parTime;
    const timed = !!(d.requiredShots || d.requiredHits);

    this.result = {
      datetime: new Date(),
      course: d.name,
      type: 'drill',
      parTime: d.parTime,
      complete,
      time,
      firstShot: this.firstShot,
      splits,
      zones: [...this.shotZones],
      shots: s.length,
      hits: this.hits,
      points: this.points,
      counts: { ...this.counts },
      bodyHits: this.bodyHits,
      hitFactor: time > 0.0001 ? this.points / time : 0,
      madePar,
      hasCriteria: this.usesCriteria,
      problems,
      // Free Run has no pass/fail; drills need par (+ criteria if defined).
      passed: timed ? complete && madePar && problems.length === 0 : null,
      early: this.early,
      notes: problems.join('; '),
    };
    this.state = State.Done;
    if (timed) this.closingCalls();
    this.remember(this.result);
    this.emit();
  }

  timerHTML(now) {
    const head = `<b class="title">SHOT TIMER</b>`;
    const d = this.course;
    switch (this.state) {
      case State.Idle:
        return head + `Press [Space] to start\nPar: ${d.parTime.toFixed(1)}s`;
      case State.Delay:
        if (performance.now() < this.standbyAt) return head + `<span class="wait">MAKE READY…</span>\nlisten for "Standby"`;
        return head + `<span class="wait">STAND BY…</span>\nwait for the beep` +
          (this.early ? `\n<span class="bad">Early shot! (${this.early})</span>` : '');
      case State.Running:
        return head + `<span class="go">GO!</span>\n` +
          `Par in: ${this.parRemaining(now).toFixed(2)}s\n` +
          `First shot: ${this.firstShot == null ? '--' : f2(this.firstShot) + 's'}\n` +
          `Split: ${this.lastSplit == null ? '--' : f2(this.lastSplit) + 's'}\n` +
          `Shots: ${this.shots}   Hits: ${this.hits}` +
          (this.early ? `\n<span class="bad">Jumped the beep (${this.early})</span>` : '');
      case State.Done: {
        // Like a shot timer's review: the last shot's time big, then every
        // shot with its time from the beep, the split and what it hit.
        const r = this.result, s = this.shotTimes;
        const letter = z => ({ Head: 'H', Steel: 'S', Miss: 'M', NS: 'NS', Tile: 'S', Dot: 'X' }[z] || z || '');
        const max = CONFIG.timer.reviewRows;
        const from = Math.max(0, s.length - max);
        const rows = s.slice(from).map((t, k) => {
          const i = from + k, z = this.shotZones[i];
          const cls = z === 'Miss' || z === 'NS' ? ' class="bad"' : '';
          return `<tr${cls}><td>${i + 1}</td><td>${f2(t)}</td><td>${i ? f2(t - s[i - 1]) : '—'}</td><td>${letter(z)}</td></tr>`;
        }).join('');
        return head + `<span class="bigtime">${s.length ? f2(s[s.length - 1]) : '--'}</span>` +
          `${r.shots} shot${r.shots === 1 ? '' : 's'} · 1st ${r.firstShot == null ? '--' : f2(r.firstShot)} · par ${d.parTime.toFixed(2)}\n` +
          (s.length ? `<table class="shots"><tr><th>#</th><th>time</th><th>split</th><th>hit</th></tr>${rows}</table>` +
            (from ? `<span class="muted small">(first ${from} not shown)</span>\n` : '') : '') +
          (r.early ? `<span class="bad">Jumped the beep (${r.early})</span>\n` : '') +
          this.sessionLine() +
          `<span class="muted small">[Space] run again</span>`;
      }
    }
    return head;
  }

  // Steel still to go: down (or, on a dueling tree, paddles over: a hit that
  // swung one back takes one off).
  steelLine(steel, backs, sep) {
    const d = this.course;
    return d.clearSteel ? `Paddles over: ${steel - backs}${sep}${d.requiredHits}` : `Steel down: ${steel}${sep}${d.requiredHits}`;
  }

  panelHTML() {
    const d = this.course;
    const head = `<b class="title">DRILL · ${d.category.toUpperCase()}</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    let goal = 'any number of rounds';
    if (d.requiredShots) goal = `${d.requiredShots} rounds`;
    if (d.requiredHits) goal = `${d.clearSteel ? `clear all ${d.requiredHits}` : `${d.requiredHits} hits`}${d.maxShots ? `, ${d.maxShots} rounds max` : ''}`;

    if (this.busy) {
      let counts = `Points: ${this.points}   A: ${this.counts.A}`;
      if (d.minBodyHits || d.minHeadHits) counts = `Body: ${this.bodyHits}   Head: ${this.counts.Head}`;
      if (d.category === 'Steel') counts = this.steelLine(this.counts.Steel, this.backs, ' / ');
      const progress = d.requiredHits ? `Hits: ${this.hits} / ${d.requiredHits}` :
        `Shots: ${this.shots}${d.requiredShots ? ' / ' + d.requiredShots : ''}`;
      return head + `<span class="go">${d.name}</span>\n${progress}\n${counts}`;
    }

    const r = this.result;
    if (r && r.course === d.name) {
      const parTag = r.madePar ? '<span class="go">made par</span>' : '<span class="bad">over par</span>';
      let verdict = 'done';
      if (r.passed === true) verdict = '<span class="go">PASS</span>';
      else if (r.passed === false) verdict = '<span class="bad">FAIL</span>';
      const lines = [`<b>${d.name}</b> — ${verdict}`];
      if (!r.complete) lines.push(`<span class="bad">Incomplete: ${d.requiredHits ? r.hits + '/' + d.requiredHits + ' hits' : r.shots + '/' + d.requiredShots + ' rounds'}</span>`);
      lines.push(`Time: ${f2(r.time)}s` + (d.requiredShots || d.requiredHits ? `   ${parTag}` : ''));
      if (d.category === 'Steel') lines.push(`${this.steelLine(r.counts.Steel, this.backs, '/')}   Rounds: ${r.shots}`);
      else if (d.minBodyHits || d.minHeadHits) lines.push(`Body: ${r.bodyHits}   Head: ${r.counts.Head}   A: ${r.counts.A}`);
      else lines.push(`Points: ${r.points}   A: ${r.counts.A}  C: ${r.counts.C}  D: ${r.counts.D}  M: ${r.counts.Miss}`);
      lines.push(`Hit factor: ${f2(r.hitFactor)}`);
      for (const p of r.problems) lines.push(`<span class="bad">✗ ${p}</span>`);
      return head + lines.join('\n') + '\n' + footer;
    }

    return head + `<b>${d.name}</b>\n<span class="muted">${d.desc}</span>\n${goal}  ·  par ${d.parTime.toFixed(1)}s\n` + footer;
  }
}
