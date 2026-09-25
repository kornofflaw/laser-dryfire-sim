// flipdrill.js — courses on the flip-tile grid (fliptiles.js).
// ---------------------------------------------------------------------------
// mode 'flash'   plates spin to an orange target face for a short time; hit
//                them before they spin back (like pop-ups). Reaction per plate.
// mode 'order'   at the beep every plate spins to a number (shuffled); shoot
//                them in order 1..N. A hit on the wrong number is a penalty.
// mode 'called'  plates show shuffled numbers; a voice calls one; shoot it.
//                After each correct hit every plate spins and re-shuffles.
// mode 'shape'   plates show coloured shapes (every plate different); a voice
//                calls a colour ("Blue"), a shape ("Star") or both ("Red
//                triangle"); shoot any plate that matches. Re-shuffles like
//                'called'.
//
// Setup "Flip speed" (board.speed) shortens the spins and the pauses between
// plates or calls; "Variable timing" (board.vary) varies each time up and pause.
//
// judge() turns a hit on the wrong plate into a miss before it counts, so the
// score and sounds agree with the drill.
//
// Course fields: mode, and for 'flash': exposures, together, upTime, gap,
// passPct, failOnMiss (a plate that spins back unhit ends the run as a FAIL);
// for 'order': parTime; for 'called' and 'shape': calls, gap, callPar; for
// 'shape': callKinds (any of 'color', 'shape', 'both').

import { CONFIG } from './config.js';
import { Runner, State, f2 } from './run.js';
import { startBeep, say } from './audio.js';
import { shapePath } from './fliptiles.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const cap = w => w[0].toUpperCase() + w.slice(1);
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export class FlipRunner extends Runner {
  constructor(range) {
    super();
    this.range = range;
    this.clearRun();
  }

  get board() { return this.range.flip; }
  get n() { return CONFIG.flip.cols * CONFIG.flip.rows; }

  clearRun() {
    this.shots = 0;
    this.wrong = 0;
    this.misses = 0;
    this.points = 0;
    this.startMs = 0;
    this.revealMs = 0;
    this.nextAt = 0;
    // flash
    this.done = 0;
    this.current = [];
    this.records = [];
    this.gotAway = false;
    // order
    this.next = 1;
    this.splits = [];
    // called
    this.call = null;
    this.callAt = 0;
    this.calls = [];
    this.reshuffleAt = null;
  }

  start(nowMs) {
    if (this.busy) return;
    this.clearRun();
    this.result = null;
    this.range.reset();
    this.startMs = nowMs;
    // Stand-by before anything turns: the plate turn (or the beep) is the start signal.
    this.nextAt = nowMs + rand(1.5, 3.5) * 1000;
    this.state = this.course.mode === 'flash' ? State.Running : State.Delay;
  }

  cancel() {
    super.cancel();
    this.range.reset();
    this.clearRun();
  }

  // Show shuffled numbers 1..n on every plate (or, in 'shape' mode, a
  // different colour + shape combination on every plate).
  showNumbers(nowSec) {
    if (this.course.mode === 'shape') {
      const { colors, shapes } = CONFIG.flip;
      const combos = shuffle(Object.keys(colors).flatMap(c => shapes.map(sh => `${c}:${sh}`)));
      this.board.flipAll(combos.slice(0, this.n).map(num => ({ face: 'shape', num })), nowSec);
      return;
    }
    const nums = shuffle(Array.from({ length: this.n }, (_, i) => i + 1));
    this.board.flipAll(nums.map(num => ({ face: 'number', num })), nowSec);
  }

  // A shape-mode call, built from one of the plates showing so it always has
  // at least one match.
  makeShapeCall() {
    const faces = this.board.tiles.filter(t => t.face === 'shape').map(t => t.num);
    const [color, shape] = pick(faces).split(':');
    const kind = pick(this.course.callKinds || ['color', 'shape', 'both']);
    const text = kind === 'color' ? cap(color) : kind === 'shape' ? cap(shape) : `${cap(color)} ${shape}`;
    return { kind, color: kind === 'shape' ? null : color, shape: kind === 'color' ? null : shape, text };
  }

  matches(num) {
    const call = this.call;
    if (!call || typeof num !== 'string') return false;
    const [color, shape] = num.split(':');
    return (!call.color || call.color === color) && (!call.shape || call.shape === shape);
  }

  update(nowMs) {
    const now = nowMs / 1000;
    const c = this.course;

    if (this.state === State.Delay && nowMs >= this.nextAt) {
      startBeep();
      this.showNumbers(now);
      this.revealMs = nowMs + this.board.spinTime * 1000 * 0.5; // plates face-on halfway through the spin
      this.state = State.Running;
      if (c.mode === 'called' || c.mode === 'shape') this.nextAt = nowMs + 500 + this.board.spinTime * 1000; // first call once they've turned
      return;
    }
    if (this.state !== State.Running) return;

    if (c.mode === 'flash') {
      if (c.failOnMiss && this.current.some(r => r.expired)) {
        this.gotAway = true;
        return this.finish(nowMs);
      }
      if (this.current.length && this.current.every(r => r.hitAt != null || r.expired)) {
        this.current = [];
        if (this.done >= c.exposures) return this.finish(nowMs);
        this.nextAt = nowMs + this.gap(c) * 1000;
      }
      if (!this.current.length && nowMs >= this.nextAt && this.done < c.exposures && !this.board.anyFaceUp) {
        const tiles = shuffle(this.board.blankTiles()).slice(0, c.together);
        const up = this.board.vary(c.upTime); // a pair stays up together
        this.current = tiles.map(i => this.board.expose(i, up, now)).filter(Boolean);
        this.records.push(...this.current);
        this.done++;
      }
    } else if (c.mode === 'called' || c.mode === 'shape') {
      if (this.reshuffleAt != null && nowMs >= this.reshuffleAt) {
        this.reshuffleAt = null;
        this.showNumbers(now);
      }
      if (!this.call && this.reshuffleAt == null && nowMs >= this.nextAt) {
        if (this.calls.length >= c.calls) return this.finish(nowMs);
        this.call = c.mode === 'shape' ? this.makeShapeCall() : 1 + Math.floor(Math.random() * this.n);
        this.callAt = nowMs;
        say(c.mode === 'shape' ? this.call.text : this.call);
      }
    }
  }

  // Is this plate hit the right one? Wrong plates become misses.
  judge(score) {
    if (score.kind !== 'tile' || this.state !== State.Running) return score;
    if (score.face === 'blank') return score; // bare plate: already a plain miss
    const c = this.course;
    let good = false;
    if (c.mode === 'flash') good = score.face === 'target';
    else if (c.mode === 'order') good = score.face === 'number' && score.num === this.next;
    else if (c.mode === 'called') good = score.face === 'number' && this.call != null && score.num === this.call;
    else if (c.mode === 'shape') good = score.face === 'shape' && this.matches(score.num);
    return good ? score : { ...score, zone: 'Miss', points: 0, wrongTile: true };
  }

  onShot(score) {
    if (this.state === State.Delay) { this.shots++; this.wrong++; return; } // fired before the start
    if (this.state !== State.Running) return;
    this.shots++;
    this.points += score.points;
    const now = score.t / 1000;
    const c = this.course;
    if (score.kind !== 'tile' || score.face === 'blank') { this.misses++; return; }
    this.board.mark(score.tile, score.u, score.v, !score.wrongTile);
    if (score.wrongTile) { this.wrong++; return; }

    if (c.mode === 'flash') {
      const t = this.board.tiles[score.tile];
      if (t.exposure && t.exposure.hitAt == null) {
        t.exposure.hitAt = now;
        t.exposure.reaction = now - t.exposure.raisedAt;
      }
      t.until = null;
      t.exposure = null;
      this.board.flip(score.tile, 'blank', null, now);
    } else if (c.mode === 'order') {
      this.splits.push((score.t - this.revealMs) / 1000);
      this.board.flip(score.tile, 'blank', null, now);
      this.next++;
      if (this.next > this.n) this.finish(score.t);
    } else {
      this.calls.push((score.t - this.callAt) / 1000);
      this.call = null;
      this.nextAt = score.t + this.gap(c) * 1000;
      if (this.calls.length < c.calls) this.reshuffleAt = score.t + 250; // plates spin to new numbers
    }
  }

  // Pause before the next plate / call: faster at higher flip speed, varied
  // if variable timing is on.
  gap(c) { return this.board.vary(rand(...c.gap)) / this.board.speed; }

  finish(endMs) {
    const c = this.course;
    let result;
    if (c.mode === 'flash') {
      const hits = this.records.filter(r => r.hitAt != null);
      const reactions = hits.map(r => r.reaction);
      const pct = this.records.length ? (hits.length / this.records.length) * 100 : 0;
      result = {
        reaction: reactions.length ? reactions.reduce((a, b) => a + b, 0) / reactions.length : null,
        fastest: reactions.length ? Math.min(...reactions) : null,
        targets: this.records.length, targetsHit: hits.length,
        hits: hits.length,
        passed: pct >= c.passPct && this.wrong === 0 && !this.gotAway,
        gotAway: !!this.gotAway,
        notes: `${hits.length}/${this.records.length} plates; ${this.wrong} wrong` + (this.gotAway ? '; a plate got away (run ended)' : ''),
      };
    } else if (c.mode === 'order') {
      const time = (endMs - this.revealMs) / 1000;
      result = {
        time, hits: this.n, splits: this.splits,
        passed: time <= c.parTime && this.wrong === 0,
        madePar: time <= c.parTime,
        notes: `${this.wrong} wrong plate(s)`,
      };
    } else {
      const avg = this.calls.reduce((a, b) => a + b, 0) / (this.calls.length || 1);
      result = {
        reaction: avg, fastest: this.calls.length ? Math.min(...this.calls) : null,
        hits: this.calls.length, calls: this.calls,
        passed: this.wrong === 0 && avg <= c.callPar,
        notes: `avg ${avg.toFixed(2)}s per call; ${this.wrong} wrong`,
      };
    }
    this.result = {
      datetime: new Date(), course: c.name, type: 'flip', complete: true,
      shots: this.shots, points: this.points, counts: { Miss: this.misses + this.wrong },
      wrong: this.wrong, splits: [], early: 0, time: null,
      ...result,
    };
    this.state = State.Done;
    this.emit();
  }

  // Big call-out at the top of the screen in 'called' / 'shape' mode.
  drawOverlay(g, W, H) {
    const mode = this.course?.mode;
    if ((mode !== 'called' && mode !== 'shape') || this.state !== State.Running || this.call == null) return;
    const bh = H * 0.11, y = H * 0.015;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (mode === 'called') {
      const bw = bh * 1.45;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(W / 2 - bw / 2, y, bw, bh);
      g.fillStyle = '#ffd34d';
      g.font = `800 ${Math.round(bh * 0.7)}px system-ui, sans-serif`;
      g.fillText(String(this.call), W / 2, y + bh * 0.52);
      return;
    }
    // Shape call: the icon (in its colour, or white if any colour goes) and the words.
    const call = this.call, col = call.color ? CONFIG.flip.colors[call.color] : '#f4f4f4';
    g.font = `800 ${Math.round(bh * 0.5)}px system-ui, sans-serif`;
    const tw = g.measureText(call.text.toUpperCase()).width;
    const bw = tw + bh * 1.4;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(W / 2 - bw / 2, y, bw, bh);
    const ix = W / 2 - bw / 2 + bh * 0.6, iy = y + bh / 2;
    g.save();
    g.translate(ix, iy);
    if (call.shape) shapePath(g, call.shape, bh * 0.3);
    else { g.beginPath(); g.rect(-bh * 0.3, -bh * 0.3, bh * 0.6, bh * 0.6); } // colour swatch
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
    g.fillStyle = call.color ? col : '#f4f4f4';
    g.textAlign = 'left';
    g.fillText(call.text.toUpperCase(), ix + bh * 0.5, y + bh * 0.53);
  }

  timerHTML(now) {
    const head = `<b class="title">FLIP GRID</b>`;
    const c = this.course;
    if (this.state === State.Delay) return head + `<span class="wait">STAND BY…</span>\nwatch the plates`;
    if (this.state === State.Running) {
      if (c.mode === 'flash') {
        const hit = this.records.filter(r => r.hitAt != null).length;
        const last = [...this.records].reverse().find(r => r.reaction != null);
        return head + `<span class="go">LIVE</span>\nPlate ${Math.max(1, this.done)} of ${c.exposures}\n` +
          `Hit: ${hit}   Wrong: ${this.wrong}\nLast reaction: ${last ? f2(last.reaction) + 's' : '--'}`;
      }
      if (c.mode === 'order') {
        return head + `<span class="go">GO!</span>\nNext: <b>${this.next}</b> of ${this.n}\n` +
          `Time: ${((now - this.revealMs) / 1000).toFixed(2)}s\nWrong: ${this.wrong}`;
      }
      return head + `<span class="go">LIVE</span>\nCall ${Math.min(c.calls, this.calls.length + 1)} of ${c.calls}\n` +
        `Last: ${this.calls.length ? f2(this.calls[this.calls.length - 1]) + 's' : '--'}\nWrong: ${this.wrong}`;
    }
    if (this.state === State.Done) {
      const r = this.result;
      const line = c.mode === 'order' ? `Time: ${f2(r.time)}s` : `Avg: ${f2(r.reaction)}s`;
      return head + (r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>') +
        `\n${line}\nWrong: ${r.wrong}\n<span class="muted small">[Space] run again</span>`;
    }
    return head + `Press [Space] to start`;
  }

  panelHTML() {
    const c = this.course;
    const head = `<b class="title">DRILL · ${c.category.toUpperCase()}</b>`;
    const footer = `<span class="muted small">[D] courses  ·  [Tab] next  ·  [Space] run</span>`;
    if (this.state === State.Done) {
      const r = this.result;
      const lines = [`<b>${c.name}</b> — ${r.passed ? '<span class="go">PASS</span>' : '<span class="bad">FAIL</span>'}`];
      if (c.mode === 'flash') {
        lines.push(`Plates hit: ${r.targetsHit}/${r.targets}  (${c.failOnMiss ? 'need every plate' : `need ${c.passPct}%`})`);
        if (r.gotAway) lines.push(`<span class="bad">✗ A plate spun back before you hit it — run over</span>`);
        lines.push(`Avg reaction: ${f2(r.reaction)}s   Fastest: ${f2(r.fastest)}s`);
      } else if (c.mode === 'order') {
        lines.push(`Time 1→${this.n}: ${f2(r.time)}s  (par ${c.parTime}s)`);
      } else {
        lines.push(`Avg per call: ${f2(r.reaction)}s  (par ${c.callPar}s)   Fastest: ${f2(r.fastest)}s`);
      }
      lines.push(`Wrong plates: ${r.wrong}   Rounds: ${r.shots}`);
      return head + lines.join('\n') + '\n' + footer;
    }
    const up = c.mode === 'flash'
      ? `${c.exposures} flashes${c.together > 1 ? ` of ${c.together}` : ''} · <b>${c.upTime.toFixed(1)}s up</b>  <span class="muted small">[ ] to change</span>\n`
      : '';
    return head + `<b>${c.name}</b>\n<span class="muted">${c.desc}</span>\n` + up + footer;
  }
}
