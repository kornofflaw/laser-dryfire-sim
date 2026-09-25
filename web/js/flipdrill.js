// flipdrill.js — courses on the flip-tile grid (fliptiles.js).
// ---------------------------------------------------------------------------
// mode 'flash'   plates spin to an orange target face for a short time; hit
//                them before they spin back (like pop-ups). Reaction per plate.
// mode 'order'   at the beep every plate spins to a number (shuffled); shoot
//                them in order 1..N. A hit on the wrong number is a penalty.
// mode 'called'  plates show shuffled numbers; a voice calls one; shoot it.
//                After each correct hit every plate spins and re-shuffles.
//
// judge() turns a hit on the wrong plate into a miss before it counts, so the
// score and sounds agree with the drill.
//
// Course fields: mode, and for 'flash': exposures, together, upTime, gap,
// passPct; for 'order': parTime; for 'called': calls, gap, callPar.

import { CONFIG } from './config.js';
import { Runner, State, f2 } from './run.js';
import { startBeep, say } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
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

  // Show shuffled numbers 1..n on every plate.
  showNumbers(nowSec) {
    const nums = shuffle(Array.from({ length: this.n }, (_, i) => i + 1));
    this.board.flipAll(nums.map(num => ({ face: 'number', num })), nowSec);
  }

  update(nowMs) {
    const now = nowMs / 1000;
    const c = this.course;

    if (this.state === State.Delay && nowMs >= this.nextAt) {
      startBeep();
      this.showNumbers(now);
      this.revealMs = nowMs + CONFIG.flip.flipTime * 1000 * 0.5; // plates face-on halfway through the spin
      this.state = State.Running;
      if (c.mode === 'called') this.nextAt = nowMs + 700; // first call once they've turned
      return;
    }
    if (this.state !== State.Running) return;

    if (c.mode === 'flash') {
      if (this.current.length && this.current.every(r => r.hitAt != null || r.expired)) {
        this.current = [];
        if (this.done >= c.exposures) return this.finish(nowMs);
        this.nextAt = nowMs + rand(...c.gap) * 1000;
      }
      if (!this.current.length && nowMs >= this.nextAt && this.done < c.exposures && !this.board.anyFaceUp) {
        const tiles = shuffle(this.board.blankTiles()).slice(0, c.together);
        this.current = tiles.map(i => this.board.expose(i, c.upTime, now)).filter(Boolean);
        this.records.push(...this.current);
        this.done++;
      }
    } else if (c.mode === 'called') {
      if (this.reshuffleAt != null && nowMs >= this.reshuffleAt) {
        this.reshuffleAt = null;
        this.showNumbers(now);
      }
      if (!this.call && this.reshuffleAt == null && nowMs >= this.nextAt) {
        if (this.calls.length >= c.calls) return this.finish(nowMs);
        this.call = 1 + Math.floor(Math.random() * this.n);
        this.callAt = nowMs;
        say(this.call);
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
    } else if (c.mode === 'called') {
      this.calls.push((score.t - this.callAt) / 1000);
      this.call = null;
      this.nextAt = score.t + rand(...c.gap) * 1000;
      if (this.calls.length < c.calls) this.reshuffleAt = score.t + 250; // plates spin to new numbers
    }
  }

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
        passed: pct >= c.passPct && this.wrong === 0,
        notes: `${hits.length}/${this.records.length} plates; ${this.wrong} wrong`,
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

  // Big call-out number at the top of the screen in 'called' mode.
  drawOverlay(g, W, H) {
    if (this.course?.mode !== 'called' || this.state !== State.Running || this.call == null) return;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    const bw = H * 0.16;
    g.fillRect(W / 2 - bw / 2, H * 0.015, bw, bw * 0.7);
    g.fillStyle = '#ffd34d';
    g.font = `800 ${Math.round(bw * 0.5)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(this.call), W / 2, H * 0.015 + bw * 0.36);
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
        lines.push(`Plates hit: ${r.targetsHit}/${r.targets}  (need ${c.passPct}%)`);
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
